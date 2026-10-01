/* =========================================================
   Cafetería Aurora — panel del personal
   · Inicio de sesión con Supabase Auth (cuentas creadas por la administración).
   · Solo entra quien está en la tabla "personal" (ver supabase/04-…sql).
   · Permite ver las reservas de un día, marcar llegada / no llegó,
     cancelar (el cliente recibe un correo) y bloquear mesas.
   ========================================================= */

const CONFIG = window.AURORA_CONFIG || {};
const db = window.supabase.createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey);

const $ = (id) => document.getElementById(id);
const views = { login: $("loginView"), panel: $("panelView"), denied: $("deniedView") };
const dayInput = $("day");
const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const escapeHTML = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const ESTADOS = {
  confirmada: "Confirmada",
  llego: "Llegó",
  no_llego: "No llegó",
  cancelada: "Cancelada",
};

let mesas = [];
let refreshTimer = null;

function show(view) {
  Object.entries(views).forEach(([k, el]) => (el.hidden = k !== view));
  $("session").hidden = view === "login";
}

/* ---------- Sesión ---------- */
async function checkSession() {
  const { data } = await db.auth.getSession();
  if (!data.session) return show("login");

  const { data: yo, error } = await db.from("personal").select("nombre").eq("user_id", data.session.user.id).maybeSingle();
  if (error || !yo) {
    $("staffName").textContent = data.session.user.email;
    return show("denied");
  }
  $("staffName").textContent = yo.nombre;
  show("panel");
  if (!dayInput.value) dayInput.value = toISO(new Date());
  await Promise.all([loadDay(), loadTables()]);
  clearInterval(refreshTimer);
  refreshTimer = setInterval(loadDay, 60_000); // se actualiza solo cada minuto
}

$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = e.target.querySelector("button");
  btn.disabled = true;
  $("loginError").textContent = "";
  const { error } = await db.auth.signInWithPassword({
    email: $("loginEmail").value.trim(),
    password: $("loginPassword").value,
  });
  btn.disabled = false;
  if (error) {
    $("loginError").textContent = "Correo o contraseña incorrectos.";
    return;
  }
  $("loginPassword").value = "";
  checkSession();
});

async function logout() {
  clearInterval(refreshTimer);
  await db.auth.signOut();
  show("login");
}
$("logout").addEventListener("click", logout);
$("deniedLogout").addEventListener("click", logout);

/* ---------- Reservas del día ---------- */
function formatDay(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const txt = new Date(y, m - 1, d).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function nextDay(iso, delta) {
  const [y, m, d] = iso.split("-").map(Number);
  return toISO(new Date(y, m - 1, d + delta));
}

const telLegible = (t) => (t.length === 10 ? `${t.slice(0, 3)} ${t.slice(3, 6)} ${t.slice(6)}` : t);

async function loadDay() {
  const day = dayInput.value;
  if (!day) return;
  $("dayTitle").textContent = formatDay(day);
  $("panelError").textContent = "";

  const { data, error } = await db
    .from("reservas")
    .select("id, codigo, mesa_id, inicio, fin, personas, nombre, telefono, correo, notas, estado, cancelada_en")
    .gte("inicio", `${day}T00:00:00`)
    .lt("inicio", `${nextDay(day, 1)}T00:00:00`)
    .order("inicio")
    .order("mesa_id");

  if (error) {
    console.error(error);
    $("panelError").textContent = "No pudimos cargar las reservas. Revisa la conexión y vuelve a intentarlo.";
    return;
  }
  renderDay(data);
  $("updated").textContent = `Actualizado a las ${new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`;
}

function renderDay(rows) {
  const activas = rows.filter((r) => r.estado !== "cancelada");
  const stats = [
    [activas.length, activas.length === 1 ? "reserva" : "reservas"],
    [activas.reduce((s, r) => s + r.personas, 0), "personas"],
    [rows.filter((r) => r.estado === "llego").length, "llegaron"],
    [rows.filter((r) => r.estado === "cancelada").length, "canceladas"],
  ];
  $("stats").innerHTML = stats.map(([n, t]) => `<li><strong>${n}</strong> ${t}</li>`).join("");

  if (!rows.length) {
    $("list").innerHTML = `<p class="staff__empty">No hay reservas para este día.</p>`;
    return;
  }

  $("list").innerHTML = rows
    .map((r) => {
      const hora = r.inicio.slice(11, 16);
      const fin = r.fin.slice(11, 16);
      const acciones =
        r.estado === "confirmada"
          ? `<button class="btn btn--dark" data-act="llego" data-id="${r.id}">Llegó</button>
             <button class="btn btn--line" data-act="no_llego" data-id="${r.id}">No llegó</button>
             <button class="btn btn--line staff__danger" data-act="cancelada" data-id="${r.id}">Cancelar</button>`
          : r.estado === "cancelada"
          ? `<span class="staff__note">${r.cancelada_en ? "Canceló el cliente" : "Cancelada por la cafetería"}</span>`
          : `<button class="btn btn--line" data-act="confirmada" data-id="${r.id}">Deshacer</button>`;
      return `
        <article class="booking is-${r.estado}">
          <div class="booking__time"><strong>${hora}</strong><span>hasta ${fin}</span></div>
          <div class="booking__main">
            <p class="booking__name">${escapeHTML(r.nombre)} <span class="booking__badge">${ESTADOS[r.estado]}</span></p>
            <p class="booking__meta">Mesa ${r.mesa_id} · ${r.personas} ${r.personas === 1 ? "persona" : "personas"} · ${escapeHTML(r.codigo)}</p>
            <p class="booking__contact">
              <a href="tel:${escapeHTML(r.telefono)}">${escapeHTML(telLegible(r.telefono))}</a>
              <a href="mailto:${escapeHTML(r.correo)}">${escapeHTML(r.correo)}</a>
            </p>
            ${r.notas ? `<p class="booking__notes">“${escapeHTML(r.notas)}”</p>` : ""}
          </div>
          <div class="booking__actions">${acciones}</div>
        </article>`;
    })
    .join("");
}

$("list").addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;
  const estado = btn.dataset.act;
  if (estado === "cancelada" && !confirm("¿Cancelar esta reserva? El cliente recibirá un correo avisándole y la mesa quedará libre.")) return;

  btn.closest(".booking__actions").querySelectorAll("button").forEach((b) => (b.disabled = true));
  const { error } = await db.from("reservas").update({ estado }).eq("id", btn.dataset.id);
  if (error) {
    console.error(error);
    // Deshacer una cancelación puede chocar con otra reserva posterior en la misma mesa
    $("panelError").textContent = error.message.includes("reservas_sin_solapamiento")
      ? "No se puede: la mesa ya tiene otra reserva en ese horario."
      : "No pudimos guardar el cambio. Inténtalo de nuevo.";
  }
  loadDay();
});

/* ---------- Mesas ---------- */
async function loadTables() {
  const { data, error } = await db.from("mesas").select("id, capacidad, zona, reservable").order("id");
  if (error) return console.error(error);
  mesas = data;
  $("tables").innerHTML = mesas
    .map(
      (m) => `
      <li>
        <label class="switch">
          <input type="checkbox" data-mesa="${m.id}" ${m.reservable ? "checked" : ""} />
          <span class="switch__track" aria-hidden="true"></span>
          <span><strong>Mesa ${m.id}</strong> · ${m.capacidad} pers. · ${escapeHTML(m.zona)}</span>
        </label>
      </li>`,
    )
    .join("");
}

$("tables").addEventListener("change", async (e) => {
  const input = e.target.closest("input[data-mesa]");
  if (!input) return;
  input.disabled = true;
  const { error } = await db.from("mesas").update({ reservable: input.checked }).eq("id", Number(input.dataset.mesa));
  input.disabled = false;
  if (error) {
    console.error(error);
    input.checked = !input.checked;
    $("panelError").textContent = "No pudimos cambiar la mesa. Inténtalo de nuevo.";
  }
});

/* ---------- Navegación por días ---------- */
dayInput.addEventListener("change", loadDay);
$("prevDay").addEventListener("click", () => { dayInput.value = nextDay(dayInput.value, -1); loadDay(); });
$("nextDay").addEventListener("click", () => { dayInput.value = nextDay(dayInput.value, 1); loadDay(); });
$("today").addEventListener("click", () => { dayInput.value = toISO(new Date()); loadDay(); });
window.addEventListener("focus", () => views.panel.hidden || loadDay());

db.auth.onAuthStateChange((event) => {
  if (event === "SIGNED_OUT") show("login");
});

checkSession();
