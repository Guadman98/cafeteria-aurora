// =========================================================
// Cafetería Aurora — Edge Function "enviar-correos"
//
// La llama un Database Webhook de Supabase cada vez que se crea o
// se modifica una fila de la tabla "reservas".
//
// · Reserva nueva  → confirmación al cliente + aviso a la cafetería.
// · Reserva cancelada → aviso al cliente (+ a la cafetería si canceló
//   el propio cliente desde el enlace del correo).
//
// Por seguridad no confía en el contenido del webhook: solo toma el
// id, vuelve a leer la reserva en la base de datos y usa columnas de
// control (correos_enviados_en, aviso_cancelacion_en) para que cada
// correo salga una sola vez.
//
// Secretos que se configuran en Supabase (Edge Functions → Secrets):
//   GMAIL_USER          cuenta de Gmail que envía
//   GMAIL_APP_PASSWORD  contraseña de aplicación de esa cuenta
//   AVISOS_EMAIL        correo que recibe los avisos de la cafetería
//   SITIO_URL           dirección pública de la página (GitHub Pages)
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase solo.
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const env = (k: string) => Deno.env.get(k) ?? "";

const supabase = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), {
  auth: { persistSession: false },
});

const GMAIL_USER = env("GMAIL_USER");
const AVISOS = env("AVISOS_EMAIL") || GMAIL_USER;
const SITIO = env("SITIO_URL").replace(/\/$/, "");
const REMITENTE = `"Cafetería Aurora" <${GMAIL_USER}>`;

// Datos de contacto que aparecen al pie de los correos (de ejemplo, igual que en la página)
const DIRECCION = "Calle de los Almendros 24, Barrio del Parque";
const TELEFONO = "(555) 010 1987";

// Gmail por SMTPS (465): Supabase bloquea los puertos 25 y 587 en las Edge Functions
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: { user: GMAIL_USER, pass: env("GMAIL_APP_PASSWORD") },
});

type Reserva = {
  id: string;
  codigo: string;
  mesa_id: number;
  inicio: string;
  personas: number;
  nombre: string;
  telefono: string;
  correo: string;
  notas: string | null;
  estado: string;
  token_cancelacion: string;
  correos_enviados_en: string | null;
  cancelada_en: string | null;
  aviso_cancelacion_en: string | null;
  mesas: { zona: string } | null;
};

/* ---------- Utilidades ---------- */
const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

// "inicio" es hora local de la cafetería sin zona: se formatea tal cual, sin conversiones
function cuando(inicio: string) {
  const [fecha, hora] = inicio.split("T");
  const [y, m, d] = fecha.split("-").map(Number);
  const dia = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
  return { dia, hora: hora.slice(0, 5) };
}

const telefonoLegible = (t: string) =>
  t.length === 10 ? `${t.slice(0, 3)} ${t.slice(3, 6)} ${t.slice(6)}` : t;

const primerNombre = (n: string) => n.trim().split(/\s+/)[0];

/* ---------- Plantilla HTML (estilos en línea para que se vea bien en Gmail y Outlook) ---------- */
function plantilla(titulo: string, cuerpo: string) {
  const logo = SITIO
    ? `<img src="${SITIO}/assets/web/logo.png" width="84" alt="Cafetería Aurora" style="display:block;margin:0 auto 8px;border:0;height:auto;">`
    : `<p style="margin:0;font:600 20px Georgia,serif;color:#381406;">Cafetería Aurora</p>`;
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(titulo)}</title></head>
<body style="margin:0;padding:0;background:#efe7dd;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#efe7dd;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#f5efe8;border-radius:6px;overflow:hidden;">
        <tr><td style="padding:28px 28px 8px;text-align:center;">${logo}</td></tr>
        <tr><td style="padding:8px 28px 28px;font:16px/1.6 Arial,Helvetica,sans-serif;color:#2b1a12;">
          <h1 style="margin:0 0 16px;font:500 26px/1.25 Georgia,'Times New Roman',serif;color:#381406;">${escape(titulo)}</h1>
          ${cuerpo}
        </td></tr>
        <tr><td style="padding:18px 28px;background:#381406;font:13px/1.6 Arial,Helvetica,sans-serif;color:#e9dccd;text-align:center;">
          Cafetería Aurora · ${escape(DIRECCION)}<br>${escape(TELEFONO)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function tablaDatos(filas: [string, string][]) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:18px 0;border-top:1px solid #dccdbb;">
    ${filas
      .map(
        ([k, v]) =>
          `<tr><td style="padding:9px 0;border-bottom:1px solid #dccdbb;color:#5e4a3e;width:38%;">${escape(k)}</td>` +
          `<td style="padding:9px 0;border-bottom:1px solid #dccdbb;font-weight:bold;">${v}</td></tr>`,
      )
      .join("")}
  </table>`;
}

const boton = (texto: string, url: string) =>
  `<p style="margin:22px 0 6px;"><a href="${url}" style="display:inline-block;padding:12px 22px;background:#381406;color:#f5efe8;text-decoration:none;border-radius:2px;font:bold 14px Arial,sans-serif;letter-spacing:.04em;">${escape(texto)}</a></p>`;

/* ---------- Correos ---------- */
function correoConfirmacion(r: Reserva) {
  const { dia, hora } = cuando(r.inicio);
  const enlace = `${SITIO}/cancelar.html?codigo=${encodeURIComponent(r.codigo)}&token=${r.token_cancelacion}`;
  const zona = r.mesas?.zona ?? "";
  const html = plantilla(
    "Tu mesa está apartada",
    `<p style="margin:0 0 6px;">Hola ${escape(primerNombre(r.nombre))}, te esperamos con el café listo.</p>
     <p style="margin:0;color:#5e4a3e;">Tu código de reserva es <strong style="color:#381406;font-size:18px;letter-spacing:.06em;">${r.codigo}</strong></p>
     ${tablaDatos([
       ["Día", escape(dia)],
       ["Hora", `${hora} h`],
       ["Personas", String(r.personas)],
       ["Mesa", `${r.mesa_id}${zona ? ` · ${escape(zona)}` : ""}`],
     ])}
     <p style="margin:0;color:#5e4a3e;">Guardamos la mesa 15 minutos después de la hora. Si no puedes venir, cancélala para que otra familia la aproveche:</p>
     ${SITIO ? boton("Cancelar mi reserva", enlace) : ""}`,
  );
  const texto = `Hola ${primerNombre(r.nombre)}, tu mesa en Cafetería Aurora está apartada.
Código: ${r.codigo}
Día: ${dia}
Hora: ${hora} h
Personas: ${r.personas}
Mesa: ${r.mesa_id}${zona ? ` (${zona})` : ""}

Guardamos la mesa 15 minutos después de la hora.
${SITIO ? `Para cancelar: ${enlace}\n` : ""}
Cafetería Aurora · ${DIRECCION} · ${TELEFONO}`;
  return {
    from: REMITENTE,
    to: r.correo,
    subject: `Tu mesa está apartada · ${dia}, ${hora} h · ${r.codigo}`,
    html,
    text: texto,
  };
}

function correoAvisoNueva(r: Reserva) {
  const { dia, hora } = cuando(r.inicio);
  const tel = telefonoLegible(r.telefono);
  const html = plantilla(
    "Nueva reserva",
    `<p style="margin:0;">${escape(r.nombre)} reservó desde la página.</p>
     ${tablaDatos([
       ["Código", r.codigo],
       ["Día", escape(dia)],
       ["Hora", `${hora} h`],
       ["Mesa", `${r.mesa_id}${r.mesas?.zona ? ` · ${escape(r.mesas.zona)}` : ""}`],
       ["Personas", String(r.personas)],
       ["Nombre", escape(r.nombre)],
       ["Teléfono", `<a href="tel:${r.telefono}" style="color:#381406;">${escape(tel)}</a>`],
       ["Correo", `<a href="mailto:${escape(r.correo)}" style="color:#381406;">${escape(r.correo)}</a>`],
       ["Notas", r.notas ? escape(r.notas) : "—"],
     ])}
     <p style="margin:0;color:#5e4a3e;font-size:14px;">Puedes responder a este correo para escribirle directamente al cliente.</p>`,
  );
  return {
    from: REMITENTE,
    to: AVISOS,
    replyTo: r.correo,
    subject: `Nueva reserva · ${dia}, ${hora} h · Mesa ${r.mesa_id} · ${r.personas} pers.`,
    html,
    text: `Nueva reserva ${r.codigo}
${dia}, ${hora} h · Mesa ${r.mesa_id} · ${r.personas} personas
Nombre: ${r.nombre}
Teléfono: ${tel}
Correo: ${r.correo}
Notas: ${r.notas ?? "—"}`,
  };
}

function correoCancelacionCliente(r: Reserva) {
  const { dia, hora } = cuando(r.inicio);
  const porCliente = Boolean(r.cancelada_en);
  const intro = porCliente
    ? `Hola ${escape(primerNombre(r.nombre))}, cancelamos tu reserva como pediste. Gracias por avisarnos.`
    : `Hola ${escape(primerNombre(r.nombre))}, tu reserva quedó cancelada. Si crees que es un error, llámanos al ${escape(TELEFONO)}.`;
  return {
    from: REMITENTE,
    to: r.correo,
    subject: `Reserva cancelada · ${dia}, ${hora} h · ${r.codigo}`,
    html: plantilla(
      "Reserva cancelada",
      `<p style="margin:0;">${intro}</p>
       ${tablaDatos([
         ["Código", r.codigo],
         ["Día", escape(dia)],
         ["Hora", `${hora} h`],
       ])}
       ${SITIO ? boton("Hacer otra reserva", `${SITIO}/#reservas`) : ""}`,
    ),
    text: `Tu reserva ${r.codigo} (${dia}, ${hora} h) en Cafetería Aurora quedó cancelada.`,
  };
}

function correoAvisoCancelacion(r: Reserva) {
  const { dia, hora } = cuando(r.inicio);
  return {
    from: REMITENTE,
    to: AVISOS,
    replyTo: r.correo,
    subject: `Reserva cancelada por el cliente · ${dia}, ${hora} h · Mesa ${r.mesa_id}`,
    html: plantilla(
      "Reserva cancelada",
      `<p style="margin:0;">${escape(r.nombre)} canceló su reserva desde el enlace del correo. La mesa ya aparece libre en la página.</p>
       ${tablaDatos([
         ["Código", r.codigo],
         ["Día", escape(dia)],
         ["Hora", `${hora} h`],
         ["Mesa", String(r.mesa_id)],
         ["Personas", String(r.personas)],
       ])}`,
    ),
    text: `${r.nombre} canceló la reserva ${r.codigo}: ${dia}, ${hora} h, mesa ${r.mesa_id}.`,
  };
}

/* ---------- Envío una sola vez ---------- */
// Marca la columna solo si estaba vacía; si otra llamada ya la marcó, devuelve false
async function reclamar(id: string, columna: string) {
  const { data, error } = await supabase
    .from("reservas")
    .update({ [columna]: new Date().toISOString() })
    .eq("id", id)
    .is(columna, null)
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}

async function soltar(id: string, columna: string) {
  await supabase.from("reservas").update({ [columna]: null }).eq("id", id);
}

async function enviarUnaVez(id: string, columna: string, correos: Record<string, unknown>[]) {
  if (!(await reclamar(id, columna))) return false;
  try {
    await Promise.all(correos.map((c) => transporter.sendMail(c)));
    return true;
  } catch (e) {
    await soltar(id, columna); // permite reintentar si Gmail falló
    throw e;
  }
}

const respuesta = (status: number, mensaje: string) =>
  new Response(JSON.stringify({ mensaje }), { status, headers: { "Content-Type": "application/json" } });

/* ---------- Entrada ---------- */
Deno.serve(async (req) => {
  if (req.method !== "POST") return respuesta(405, "Método no permitido");

  const payload = await req.json().catch(() => null);
  const id = payload?.record?.id;
  if (typeof id !== "string") return respuesta(400, "Falta el id de la reserva");

  const { data: r, error } = await supabase
    .from("reservas")
    .select("*, mesas(zona)")
    .eq("id", id)
    .maybeSingle<Reserva>();
  if (error) return respuesta(500, error.message);
  if (!r) return respuesta(404, "Reserva no encontrada");

  try {
    if (r.estado === "confirmada" && !r.correos_enviados_en) {
      const enviado = await enviarUnaVez(r.id, "correos_enviados_en", [correoConfirmacion(r), correoAvisoNueva(r)]);
      return respuesta(200, enviado ? "Confirmación y aviso enviados" : "Ya se habían enviado");
    }

    if (r.estado === "cancelada" && !r.aviso_cancelacion_en) {
      const correos = [correoCancelacionCliente(r)];
      if (r.cancelada_en) correos.push(correoAvisoCancelacion(r)); // la cafetería solo se entera si canceló el cliente
      const enviado = await enviarUnaVez(r.id, "aviso_cancelacion_en", correos);
      return respuesta(200, enviado ? "Avisos de cancelación enviados" : "Ya se habían enviado");
    }

    return respuesta(200, "Nada que enviar");
  } catch (e) {
    console.error("Error enviando correos:", e);
    return respuesta(500, e instanceof Error ? e.message : String(e));
  }
});
