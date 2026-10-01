/* =========================================================
   Cafetería Aurora — cancelar una reserva desde el enlace del correo
   El enlace trae ?codigo=AUR-XXXXX&token=<uuid secreto de la reserva>
   ========================================================= */

const CONFIG = window.AURORA_CONFIG || {};
const box = document.getElementById("cancelBox");
const params = new URLSearchParams(location.search);
const codigo = (params.get("codigo") || "").trim().toUpperCase();
const token = (params.get("token") || "").trim();
const TELEFONO = "(555) 010 1987";

// Mismo acceso a la base de datos que en script.js
async function rpc(fn, body) {
  const headers = { "Content-Type": "application/json", apikey: CONFIG.supabaseKey };
  if (CONFIG.supabaseKey.startsWith("eyJ")) headers.Authorization = `Bearer ${CONFIG.supabaseKey}`;
  const res = await fetch(`${CONFIG.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.message) || `HTTP ${res.status}`);
  return data;
}

const escapeHTML = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// "inicio" es hora local de la cafetería, sin zona horaria
function cuando(inicio) {
  const [fecha, hora] = inicio.split("T");
  const [y, m, d] = fecha.split("-").map(Number);
  const dia = new Date(y, m - 1, d).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
  return { dia, hora: hora.slice(0, 5) };
}

function mostrar(titulo, mensaje, extra = "") {
  box.innerHTML = `<h1>${titulo}</h1><p>${mensaje}</p>${extra}`;
}

const volver = `<p class="cancel__actions"><a class="btn btn--dark" href="./#reservas">Hacer otra reserva</a> <a class="btn btn--line" href="./">Ir al inicio</a></p>`;

function detalles(r) {
  const { dia, hora } = cuando(r.inicio);
  return `<dl class="cancel__details">
    <dt>Código</dt><dd>${escapeHTML(r.codigo)}</dd>
    <dt>Día</dt><dd>${escapeHTML(dia)}</dd>
    <dt>Hora</dt><dd>${hora} h</dd>
    <dt>Personas</dt><dd>${r.personas}</dd>
    <dt>Mesa</dt><dd>${r.mesa}, ${escapeHTML(r.zona.toLowerCase())}</dd>
  </dl>`;
}

const ERRORES = {
  NO_ENCONTRADA: ["No encontramos esa reserva", "El enlace no es válido. Revisa que lo hayas abierto completo desde el correo."],
  YA_CANCELADA: ["Esta reserva ya estaba cancelada", "No tienes que hacer nada más."],
  YA_PASO: ["Esta reserva ya no se puede cancelar", `La hora de la reserva ya pasó. Si necesitas algo, llámanos al ${TELEFONO}.`],
};

async function cancelar(r) {
  const boton = document.getElementById("confirmCancel");
  boton.disabled = true;
  boton.textContent = "Cancelando…";
  try {
    await rpc("cancelar_reserva", { p_codigo: codigo, p_token: token });
    mostrar(
      "Reserva cancelada",
      `Listo, ${escapeHTML(r.nombre)}. Liberamos la mesa y te enviamos un correo de confirmación. ¡Gracias por avisarnos!`,
      volver,
    );
  } catch (err) {
    console.error("Cancelación:", err);
    const key = Object.keys(ERRORES).find((k) => err.message.includes(k));
    if (key) mostrar(...ERRORES[key], volver);
    else {
      boton.disabled = false;
      boton.textContent = "Sí, cancelar mi reserva";
      document.getElementById("cancelError").textContent = `No pudimos cancelar. Inténtalo de nuevo o llámanos al ${TELEFONO}.`;
    }
  }
}

async function iniciar() {
  if (!CONFIG.supabaseUrl || !CONFIG.supabaseKey) {
    mostrar("Cancelación no disponible", `Para cancelar, llámanos al ${TELEFONO}.`, volver);
    return;
  }
  if (!codigo || !/^[0-9a-f-]{36}$/i.test(token)) {
    mostrar(...ERRORES.NO_ENCONTRADA, volver);
    return;
  }

  let r;
  try {
    r = await rpc("ver_reserva", { p_codigo: codigo, p_token: token });
  } catch (err) {
    console.error("Reserva:", err);
    mostrar("No pudimos consultar tu reserva", `Revisa tu conexión e inténtalo de nuevo, o llámanos al ${TELEFONO}.`);
    return;
  }

  if (!r) return mostrar(...ERRORES.NO_ENCONTRADA, volver);
  if (r.estado === "cancelada") return mostrar(...ERRORES.YA_CANCELADA, detalles(r) + volver);
  if (r.estado !== "confirmada" || r.ya_paso) return mostrar(...ERRORES.YA_PASO, detalles(r) + volver);

  box.innerHTML = `
    <h1>¿Cancelar tu reserva?</h1>
    <p>Hola ${escapeHTML(r.nombre)}. Si ya no puedes venir, cancélala aquí y la mesa quedará libre para otra familia.</p>
    ${detalles(r)}
    <p class="form__error" id="cancelError" role="alert"></p>
    <p class="cancel__actions">
      <button class="btn btn--dark" id="confirmCancel" type="button">Sí, cancelar mi reserva</button>
      <a class="btn btn--line" href="./">No, conservarla</a>
    </p>`;
  document.getElementById("confirmCancel").addEventListener("click", () => cancelar(r));
}

iniciar();
