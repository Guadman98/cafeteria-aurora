-- =========================================================
-- Cafetería Aurora — 02: correos y cancelación de reservas
--
-- Ejecutar DESPUÉS de schema.sql, en "SQL Editor" → "Run".
--
-- Agrega a cada reserva:
--   · un token secreto para el enlace "Cancelar mi reserva"
--     (solo viaja en el correo del cliente; la página nunca lo ve)
--   · marcas de cuándo se enviaron los correos, para no enviarlos
--     dos veces aunque la función se llame más de una vez
-- y dos funciones públicas para la página cancelar.html.
-- =========================================================

alter table public.reservas
  add column token_cancelacion uuid not null default gen_random_uuid(),
  add column correos_enviados_en timestamptz,   -- confirmación al cliente + aviso a la cafetería
  add column cancelada_en timestamptz,          -- solo se llena cuando cancela el propio cliente
  add column aviso_cancelacion_en timestamptz;  -- correos de cancelación enviados

-- ---------- Ver una reserva desde el enlace del correo ----------
-- Devuelve lo mínimo para mostrarla (sin teléfono ni correo), o null si el enlace no es válido.
create or replace function public.ver_reserva(p_codigo text, p_token uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'codigo', r.codigo,
    'inicio', r.inicio,
    'personas', r.personas,
    'mesa', r.mesa_id,
    'zona', m.zona,
    'nombre', split_part(r.nombre, ' ', 1),
    'estado', r.estado,
    'ya_paso', r.inicio <= (select now() at time zone a.zona_horaria from ajustes a)
  )
  from reservas r
  join mesas m on m.id = r.mesa_id
  where r.codigo = upper(trim(p_codigo))
    and r.token_cancelacion = p_token;
$$;

-- ---------- Cancelar desde el enlace del correo ----------
create or replace function public.cancelar_reserva(p_codigo text, p_token uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  r reservas;
  v_ahora timestamp;
begin
  select now() at time zone zona_horaria into v_ahora from ajustes;

  select * into r
  from reservas
  where codigo = upper(trim(p_codigo)) and token_cancelacion = p_token
  for update;

  if not found then
    raise exception 'NO_ENCONTRADA';
  end if;
  if r.estado = 'cancelada' then
    raise exception 'YA_CANCELADA';
  end if;
  if r.estado <> 'confirmada' or r.inicio <= v_ahora then
    raise exception 'YA_PASO';
  end if;

  update reservas
  set estado = 'cancelada', cancelada_en = now()
  where id = r.id;

  return json_build_object('codigo', r.codigo, 'inicio', r.inicio);
end;
$$;

revoke all on function public.ver_reserva(text, uuid) from public;
revoke all on function public.cancelar_reserva(text, uuid) from public;
grant execute on function public.ver_reserva(text, uuid) to anon, authenticated;
grant execute on function public.cancelar_reserva(text, uuid) to anon, authenticated;
