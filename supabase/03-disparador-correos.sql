-- =========================================================
-- Cafetería Aurora — 03: disparador de correos (alternativa al Database Webhook)
--
-- Úsalo solo si NO creaste el webhook "correos-reservas" desde el panel
-- (si existen los dos, la función se llamaría dos veces; no se duplican
-- correos, pero no tiene sentido tener ambos).
--
-- Antes de ejecutarlo: en Edge Functions → enviar-correos, desactiva
-- "Enforce JWT verification" (o "Verify JWT"). Es seguro: la función no
-- confía en lo que recibe, vuelve a leer la reserva por su id y envía
-- cada correo una sola vez.
--
-- Ejecutar en "SQL Editor" → "Run".
-- =========================================================

-- Extensión de Supabase para hacer peticiones HTTP desde la base de datos
create extension if not exists pg_net with schema extensions;

create or replace function public.notificar_correos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Petición asíncrona: no frena ni puede hacer fallar la reserva
  perform net.http_post(
    url := 'https://ihnbptnlcaqvustnzlop.supabase.co/functions/v1/enviar-correos',
    body := jsonb_build_object('type', tg_op, 'record', jsonb_build_object('id', new.id)),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000
  );
  return new;
end;
$$;

-- Al crear una reserva y cuando cambia su estado (p. ej. a "cancelada").
-- Las marcas que escribe la propia función (correos_enviados_en…) no lo vuelven a disparar.
drop trigger if exists reservas_correos on public.reservas;
create trigger reservas_correos
after insert or update of estado on public.reservas
for each row
execute function public.notificar_correos();
