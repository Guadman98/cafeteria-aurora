-- =========================================================
-- Cafetería Aurora — 04: autorización de datos (Ley 1581 de 2012),
-- reservas solo a través del servidor (captcha) y panel del personal.
--
-- Ejecutar después de 02 (y de 03 si lo usaste), en "SQL Editor" → "Run".
--
-- OJO, orden de instalación: al ejecutar este script, la página publicada
-- deja de poder reservar hasta que se publique la nueva versión del sitio
-- y la función "crear-reserva" (son unos minutos).
-- =========================================================

-- ---------- Colombia ----------
update public.ajustes set zona_horaria = 'America/Bogota';

-- ---------- Prueba de la autorización de tratamiento de datos ----------
-- Decreto 1377 de 2013: el responsable debe conservar prueba de la autorización.
alter table public.reservas
  add column autorizacion_datos_en timestamptz,
  add column politica_version text;

-- ---------- Crear reservas: ahora solo desde la Edge Function "crear-reserva" ----------
-- La función verifica el captcha (Cloudflare Turnstile) y luego llama a esta.
-- Con la clave pública ya no se puede llamar directamente.
drop function if exists public.crear_reserva(smallint, date, time, smallint, text, text, text, text);

create or replace function public.crear_reserva(
  p_mesa smallint,
  p_fecha date,
  p_hora time,
  p_personas smallint,
  p_nombre text,
  p_telefono text,
  p_correo text,
  p_notas text,
  p_acepta_politica boolean,
  p_politica_version text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  a ajustes;
  h horarios;
  m mesas;
  v_inicio timestamp := p_fecha + p_hora;
  v_ahora timestamp;
  v_tel text := regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g');
  v_correo text := lower(trim(coalesce(p_correo, '')));
  v_codigo text;
  v_activas int;
begin
  if p_acepta_politica is not true or coalesce(trim(p_politica_version), '') = '' then
    raise exception 'SIN_AUTORIZACION';
  end if;

  select * into a from ajustes;
  v_ahora := now() at time zone a.zona_horaria;

  select * into m from mesas where id = p_mesa;
  if not found or not m.reservable then
    raise exception 'MESA_NO_DISPONIBLE';
  end if;
  if p_personas is null or p_personas < 1 or p_personas > m.capacidad then
    raise exception 'CAPACIDAD';
  end if;

  if v_inicio < v_ahora + a.anticipacion or p_fecha > v_ahora::date + a.dias_maximos then
    raise exception 'FECHA_FUERA_DE_RANGO';
  end if;

  select * into h from horarios where dia = extract(dow from p_fecha);
  if not found or p_hora < h.abre or p_hora > h.ultima_reserva
     or extract(minute from p_hora)::int % 30 <> 0 or extract(second from p_hora) <> 0 then
    raise exception 'FUERA_DE_HORARIO';
  end if;

  if char_length(trim(coalesce(p_nombre, ''))) < 3
     or char_length(v_tel) < 8
     or v_correo !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'DATOS_INVALIDOS';
  end if;

  select count(*) into v_activas
  from reservas
  where telefono = v_tel and estado = 'confirmada' and inicio >= v_ahora;
  if v_activas >= a.max_reservas_por_telefono then
    raise exception 'LIMITE_RESERVAS';
  end if;

  loop
    v_codigo := 'AUR-' || (
      select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
      from generate_series(1, 5)
    );
    exit when not exists (select 1 from reservas where codigo = v_codigo);
  end loop;

  begin
    insert into reservas (codigo, mesa_id, inicio, fin, personas, nombre, telefono, correo, notas,
                          autorizacion_datos_en, politica_version)
    values (v_codigo, p_mesa, v_inicio, v_inicio + a.duracion, p_personas,
            trim(p_nombre), v_tel, v_correo, nullif(trim(coalesce(p_notas, '')), ''),
            now(), trim(p_politica_version));
  exception
    when exclusion_violation then raise exception 'MESA_OCUPADA';
    when check_violation then raise exception 'DATOS_INVALIDOS';
  end;

  return json_build_object('codigo', v_codigo, 'inicio', v_inicio, 'fin', v_inicio + a.duracion);
end;
$$;

revoke all on function public.crear_reserva(smallint, date, time, smallint, text, text, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.crear_reserva(smallint, date, time, smallint, text, text, text, text, boolean, text) to service_role;

-- ---------- Personal autorizado para el panel ----------
-- Las cuentas se crean en Authentication → Users; aquí se marca quién es personal.
create table public.personal (
  user_id uuid primary key references auth.users (id) on delete cascade,
  nombre text not null,
  creado_en timestamptz not null default now()
);
alter table public.personal enable row level security;
create policy "Cada persona ve su propia fila" on public.personal
  for select to authenticated using (user_id = auth.uid());

create or replace function public.es_personal()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from personal where user_id = auth.uid());
$$;
revoke all on function public.es_personal() from public, anon;
grant execute on function public.es_personal() to authenticated;

-- El personal lee las reservas y solo puede cambiar su estado
create policy "Personal lee reservas" on public.reservas
  for select to authenticated using (public.es_personal());
create policy "Personal cambia el estado de las reservas" on public.reservas
  for update to authenticated using (public.es_personal()) with check (public.es_personal());

-- El personal puede marcar mesas como no reservables en línea (para quien llega sin reserva)
create policy "Personal bloquea mesas" on public.mesas
  for update to authenticated using (public.es_personal()) with check (public.es_personal());

-- Permisos por columna: aunque las políticas dejen actualizar la fila,
-- solo se pueden tocar estas columnas. El token de cancelación no se expone.
revoke all on public.reservas from anon, authenticated;
grant select (id, codigo, mesa_id, inicio, fin, personas, nombre, telefono, correo, notas,
              estado, creada_en, cancelada_en)
  on public.reservas to authenticated;
grant update (estado) on public.reservas to authenticated;

revoke insert, update, delete on public.mesas from anon, authenticated;
grant update (reservable) on public.mesas to authenticated;

-- ---------- Conservación de datos (12 meses, según la política) ----------
-- Borra las reservas de hace más de 12 meses. Se puede ejecutar a mano
-- o programar con Integrations → Cron (ver instrucciones al final).
create or replace function public.depurar_reservas_antiguas()
returns int
language sql
security definer
set search_path = public
as $$
  with borradas as (
    delete from reservas
    where inicio < (now() at time zone (select zona_horaria from ajustes)) - interval '12 months'
    returning 1
  )
  select count(*)::int from borradas;
$$;
revoke all on function public.depurar_reservas_antiguas() from public, anon, authenticated;

-- Para programarla cada mes (requiere activar la integración "Cron" en el panel):
--   select cron.schedule('depurar-reservas', '0 4 1 * *', 'select public.depurar_reservas_antiguas()');
