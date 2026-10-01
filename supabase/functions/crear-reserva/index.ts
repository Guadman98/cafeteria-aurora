// =========================================================
// Cafetería Aurora — Edge Function "crear-reserva"
//
// La página envía aquí el formulario de reserva. La función:
//   1. verifica el captcha de Cloudflare Turnstile (si está configurado),
//   2. llama a crear_reserva() en la base de datos, que valida todo lo demás
//      (horario, capacidad, solapamientos, autorización de datos…).
// La base de datos ya no acepta reservas directas con la clave pública,
// así que un bot no puede saltarse el captcha.
//
// Se despliega con "Verify JWT" DESACTIVADO: es un endpoint público.
//
// Secretos (Edge Functions → Secrets):
//   TURNSTILE_SECRET_KEY  clave secreta del widget de Turnstile
//   SITIO_URL             dirección pública (ya creada para los correos)
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const env = (k: string) => Deno.env.get(k) ?? "";

const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const TURNSTILE_SECRET = env("TURNSTILE_SECRET_KEY");

// Orígenes desde los que se puede reservar: el sitio publicado y el servidor local de pruebas
const ORIGENES = new Set(
  [env("SITIO_URL"), "http://localhost:5510", "http://127.0.0.1:5510"]
    .filter(Boolean)
    .map((u) => new URL(u).origin),
);

function cors(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGENES.has(origin) ? origin : [...ORIGENES][0] ?? "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

const json = (req: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });

async function captchaValido(token: unknown, ip: string | null) {
  if (!TURNSTILE_SECRET) return true; // sin configurar: la página sigue funcionando, sin protección
  if (typeof token !== "string" || !token) return false;
  const form = new FormData();
  form.append("secret", TURNSTILE_SECRET);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  const data = await res.json().catch(() => ({ success: false }));
  return data.success === true;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { message: "Método no permitido" });

  const b = await req.json().catch(() => null);
  if (!b) return json(req, 400, { message: "DATOS_INVALIDOS" });

  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  if (!(await captchaValido(b.captcha, ip))) return json(req, 400, { message: "CAPTCHA" });

  const { data, error } = await supabase.rpc("crear_reserva", {
    p_mesa: b.mesa,
    p_fecha: b.fecha,
    p_hora: b.hora,
    p_personas: b.personas,
    p_nombre: b.nombre,
    p_telefono: b.telefono,
    p_correo: b.correo,
    p_notas: b.notas ?? null,
    p_acepta_politica: b.acepta_politica === true,
    p_politica_version: typeof b.politica_version === "string" ? b.politica_version : "",
  });

  if (error) {
    // Los errores de negocio (MESA_OCUPADA, CAPACIDAD…) vienen de raise exception con código P0001
    const conocido = error.code === "P0001";
    if (!conocido) console.error("crear_reserva:", error);
    return json(req, conocido ? 400 : 500, { message: conocido ? error.message : "ERROR_SERVIDOR" });
  }
  return json(req, 200, data);
});
