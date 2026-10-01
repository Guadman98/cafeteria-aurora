-- =========================================================
-- Cafetería Aurora — base de datos de reservas (Supabase)
--
-- Cómo usarlo: en el panel de Supabase, abre "SQL Editor",
-- pega este archivo completo y pulsa "Run". Se puede ejecutar
-- una sola vez sobre un proyecto nuevo.
--
-- Seguridad:
--   · La página solo usa la clave pública (anon / publishable).
--   · Con esa clave NO se puede leer ni modificar la tabla de
--     reservas: solo se puede (1) consultar qué mesas están
--     ocupadas, sin datos personales, y (2) crear una reserva
--     a través de crear_reserva(), que valida todo.
--   · El personal ve las reservas desde el panel de Supabase
--     (Table Editor → reservas).
-- =========================================================

-- Necesaria para impedir que dos reservas de una misma mesa se solapen
create extension if not exists btree_gist;

-- ---------- Ajustes generales (una sola fila) ----------
create table public.ajustes (
  id boolean primary key default true check (id),
  zona_horaria text not null default 'America/Bogota',
  duracion interval not null default interval '90 minutes',   -- cuánto ocupa la mesa cada reserva
  anticipacion interval not null default interval '30 minutes', -- mínimo antes de la hora reservada
  dias_maximos int not null default 60,                        -- hasta cuántos días adelante se reserva
  max_reservas_por_telefono int not null default 3             -- reservas futuras activas por teléfono
);
insert into public.ajustes default values;

-- ---------- Horario (0 = domingo … 6 = sábado) ----------
create table public.horarios (
  dia smallint primary key check (dia between 0 and 6),
  abre time not null,
  cierra time not null,
  ultima_reserva time not null
);
insert into public.horarios (dia, abre, cierra, ultima_reserva) values
  (0, '08:00', '22:00', '21:00'),
  (1, '07:00', '21:00', '20:00'),
  (2, '07:00', '21:00', '20:00'),
  (3, '07:00', '21:00', '20:00'),
  (4, '07:00', '21:00', '20:00'),
  (5, '07:00', '21:00', '20:00'),
  (6, '08:00', '22:00', '21:00');

-- ---------- Mesas (deben coincidir con el plano de la página) ----------
create table public.mesas (
  id smallint primary key,
  capacidad smallint not null check (capacidad between 1 and 12),
  zona text not null,
  reservable boolean not null default true  -- false = la mesa se guarda para quien llega sin reserva
);
insert into public.mesas (id, capacidad, zona) values
  (1, 2, 'Ventana'),
  (2, 2, 'Ventana'),
  (3, 4, 'Ventana'),
  (4, 4, 'Centro'),
  (5, 2, 'Ventana'),
  (6, 6, 'Centro'),
  (7, 4, 'Centro'),
  (8, 4, 'Rincón tranquilo'),
  (9, 2, 'Rincón tranquilo'),
  (10, 8, 'Junto al rincón infantil');

-- ---------- Reservas ----------
create table public.reservas (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  mesa_id smallint not null references public.mesas (id),
  inicio timestamp not null,   -- hora local de la cafetería
  fin timestamp not null,
  personas smallint not null check (personas between 1 and 12),
  nombre text not null check (char_length(nombre) between 3 and 80),
  telefono text not null check (telefono ~ '^\d{8,15}$'),
  correo text not null check (char_length(correo) <= 120 and correo ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  notas text check (char_length(notas) <= 500),
  estado text not null default 'confirmada'
    check (estado in ('confirmada', 'llego', 'no_llego', 'cancelada')),
  creada_en timestamptz not null default now(),
  check (fin > inicio),
  -- Una misma mesa no puede tener dos reservas activas que se crucen en el tiempo.
  -- Esto es lo que evita las dobles reservas aunque dos personas reserven a la vez.
  constraint reservas_sin_solapamiento
    exclude using gist (mesa_id with =, tsrange(inicio, fin) with &&)
    where (estado <> 'cancelada')
);
create index reservas_inicio_idx on public.reservas (inicio);

-- ---------- Seguridad a nivel de fila ----------
alter table public.ajustes  enable row level security;
alter table public.horarios enable row level security;
alter table public.mesas    enable row level security;
alter table public.reservas enable row level security;

create policy "Mesas visibles para todos"    on public.mesas    for select to anon, authenticated using (true);
create policy "Horarios visibles para todos" on public.horarios for select to anon, authenticated using (true);
-- reservas y ajustes no tienen políticas: con la clave pública no se pueden leer ni escribir directamente.

-- ---------- Qué mesas están ocupadas (sin datos personales) ----------
create or replace function public.mesas_ocupadas(p_fecha date, p_hora time)
returns smallint[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(distinct id order by id), '{}')
  from (
    select r.mesa_id as id
    from reservas r, ajustes a
    where r.estado <> 'cancelada'
      and tsrange(r.inicio, r.fin) && tsrange(p_fecha + p_hora, p_fecha + p_hora + a.duracion)
    union
    select m.id from mesas m where not m.reservable
  ) ocupadas;
$$;

-- ---------- Crear una reserva (valida todo en el servidor) ----------
create or replace function public.crear_reserva(
  p_mesa smallint,
  p_fecha date,
  p_hora time,
  p_personas smallint,
  p_nombre text,
  p_telefono text,
  p_correo text,
  p_notas text default null
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

  -- Código legible, sin caracteres que se confundan (0/O, 1/I)
  loop
    v_codigo := 'AUR-' || (
      select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
      from generate_series(1, 5)
    );
    exit when not exists (select 1 from reservas where codigo = v_codigo);
  end loop;

  begin
    insert into reservas (codigo, mesa_id, inicio, fin, personas, nombre, telefono, correo, notas)
    values (v_codigo, p_mesa, v_inicio, v_inicio + a.duracion, p_personas,
            trim(p_nombre), v_tel, v_correo, nullif(trim(coalesce(p_notas, '')), ''));
  exception
    when exclusion_violation then raise exception 'MESA_OCUPADA';
    when check_violation then raise exception 'DATOS_INVALIDOS';
  end;

  return json_build_object('codigo', v_codigo, 'inicio', v_inicio, 'fin', v_inicio + a.duracion);
end;
$$;

-- Solo estas dos funciones quedan expuestas a la página
revoke all on function public.mesas_ocupadas(date, time) from public;
revoke all on function public.crear_reserva(smallint, date, time, smallint, text, text, text, text) from public;
grant execute on function public.mesas_ocupadas(date, time) to anon, authenticated;
grant execute on function public.crear_reserva(smallint, date, time, smallint, text, text, text, text) to anon, authenticated;
