/* =========================================================
   Cafetería Aurora
   - Carta con diagrama de capas para cada café
   - Horario del día
   - Plano interactivo de mesas y reservas (localStorage)
   ========================================================= */

/* ---------- Horario ---------- */
// día de la semana (0 = domingo) → [apertura, cierre] en minutos
const HOURS = {
  0: [8 * 60, 22 * 60],
  1: [7 * 60, 21 * 60],
  2: [7 * 60, 21 * 60],
  3: [7 * 60, 21 * 60],
  4: [7 * 60, 21 * 60],
  5: [7 * 60, 21 * 60],
  6: [8 * 60, 22 * 60],
};
const fmtMin = (m) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;

(function showToday() {
  const now = new Date();
  const day = now.getDay();
  const [open, close] = HOURS[day];
  const mins = now.getHours() * 60 + now.getMinutes();
  const msg =
    mins < open ? `Hoy abrimos a las ${fmtMin(open)}`
    : mins < close ? `Abierto ahora · hasta las ${fmtMin(close)}`
    : `Mañana abrimos a las ${fmtMin(HOURS[(day + 1) % 7][0])}`;
  document.getElementById("todayHours").textContent = msg;
  // El punto verde solo cuando de verdad está abierto
  document.querySelector(".hero__status .dot")?.classList.toggle("is-closed", !(mins >= open && mins < close));
  document.querySelector(`#hoursTable tr[data-day="${day}"]`)?.classList.add("is-today");
})();

/* ---------- Carta ---------- */
// Capas del café de abajo hacia arriba: [ingrediente, fracción de la taza]
// Precios de ejemplo en pesos colombianos (COP)
const COFFEES = [
  { name: "Tinto", price: 3000, desc: "El de toda la vida: café filtrado, negro y recién colado.", layers: [["filtrado", 0.7]] },
  { name: "Tinto campesino", price: 4000, desc: "La receta de doña Aurora: con panela y canela.", layers: [["panela", 0.18], ["filtrado", 0.6]] },
  { name: "Perico", price: 4500, desc: "Café con un chorrito de leche, como se pide en la esquina.", layers: [["espresso", 0.35], ["leche", 0.3]] },
  { name: "Espresso", price: 4500, desc: "Un shot corto e intenso del tueste de la semana.", layers: [["espresso", 0.3]] },
  { name: "Americano", price: 5000, desc: "Espresso alargado con agua caliente.", layers: [["espresso", 0.3], ["agua", 0.55]] },
  { name: "Capuccino", price: 7500, desc: "Tercios iguales: espresso, leche y espuma. Con canela.", layers: [["espresso", 0.28], ["leche", 0.28], ["espuma", 0.3]] },
  { name: "Latte", price: 7500, desc: "Mucha leche, una capa delgada de espuma.", layers: [["espresso", 0.22], ["leche", 0.55], ["espuma", 0.1]] },
  { name: "Mocca", price: 9000, desc: "Chocolate de mesa en el fondo, espresso y leche.", layers: [["choco", 0.18], ["espresso", 0.22], ["leche", 0.36], ["espuma", 0.1]] },
  { name: "Macchiato de caramelo", price: 9500, desc: "Leche con vainilla, espresso encima y caramelo de la casa.", layers: [["leche", 0.5], ["espresso", 0.22], ["espuma", 0.08], ["caramelo", 0.06]] },
  { name: "Cold brew", price: 8500, desc: "Infusionado en frío 18 horas, servido con hielo.", layers: [["espresso", 0.35], ["hielo", 0.4]] },
];

const SALADOS = [
  { name: "Pandebono", price: 3500, desc: "Recién salido del horno, con queso costeño.", tags: ["veg", "kids"] },
  { name: "Almojábana", price: 3500, desc: "Suave y esponjosa, de queso y cuajada.", tags: ["veg"] },
  { name: "Arepa de choclo", price: 9000, desc: "Dulce, a la plancha y con quesito fresco.", tags: ["veg", "kids"] },
  { name: "Empanadas de carne", price: 7500, desc: "Tres empanadas crocantes con ají de la casa." },
  { name: "Huevos pericos con arepa", price: 11000, desc: "Con tomate y cebolla larga, arepa y queso.", tags: ["veg"] },
  { name: "Arepa rellena", price: 12000, desc: "Pollo desmechado, queso y hogao." },
  { name: "Sándwich de la casa", price: 10500, desc: "Pan artesanal, jamón, queso y vegetales.", tags: ["kids"] },
  { name: "Croissant de jamón y queso", price: 9500, desc: "Hojaldre de mantequilla, recién horneado." },
];

const POSTRES = [
  { name: "Torta de zanahoria", price: 9500, desc: "Con nueces, especias y crema de queso.", tags: ["veg"], signature: "La receta de doña Aurora, desde 1987" },
  { name: "Buñuelos", price: 4500, desc: "Tres buñuelos crocantes por fuera y suaves por dentro.", tags: ["veg", "kids"] },
  { name: "Postre de natas", price: 8500, desc: "El clásico de la abuela, con un toque de canela.", tags: ["veg"] },
  { name: "Tres leches", price: 9000, desc: "Bizcocho bañado en tres leches y merengue.", tags: ["veg"] },
  { name: "Brevas con arequipe", price: 9500, desc: "Brevas caladas con arequipe y queso fresco.", tags: ["veg"] },
  { name: "Torta de chocolate", price: 10000, desc: "Tibia, con helado de vainilla.", tags: ["veg", "kids"] },
  { name: "Galleta de avena", price: 4000, desc: "Con chispas de chocolate.", tags: ["veg", "kids"] },
];

const OTRAS = [
  { name: "Chocolate con queso", price: 8500, desc: "Chocolate de mesa batido, con queso y almojábana.", tags: ["kids"] },
  { name: "Aguapanela con limón", price: 4000, desc: "Caliente o fría, endulzada solo con panela.", tags: ["kids"] },
  { name: "Aromática de frutas", price: 4500, desc: "Frutas frescas en infusión, sin azúcar añadida." },
  { name: "Jugo natural", price: 7000, desc: "Lulo, mora o maracuyá, en agua o en leche.", tags: ["kids"] },
  { name: "Limonada de coco", price: 9500, desc: "Cremosa y bien fría." },
  { name: "Avena fría de la casa", price: 6000, desc: "Con canela, para los más pequeños.", tags: ["kids"] },
];

// Formato colombiano: punto como separador de miles ($4.500). Se hace a mano porque
// algunos navegadores no agrupan los números de 4 cifras en español.
const money = (n) => "$" + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const TAGS = {
  veg: `<span class="tag" title="Vegetariano">veg</span>`,
  kids: `<span class="tag" title="Favorito de los niños">niños</span>`,
};

function itemHTML(d) {
  // Las etiquetas van juntas: si no caben, bajan en grupo y nunca queda una sola
  const tags = d.tags ? `<span class="item__tags">${d.tags.map((t) => TAGS[t]).join("")}</span>` : "";
  return `
    <div class="item__line">
      <span class="item__name">${d.name}${tags}</span>
      <span class="item__dots" aria-hidden="true"></span>
      <span class="item__price">${money(d.price)}</span>
    </div>
    <p class="item__desc">${d.desc}</p>`;
}

// Taza de vidrio: 44×56, interior de y=52 (fondo) a y=6 (borde)
function cupSVG(layers, i) {
  const bottom = 52, height = 46;
  let y = bottom;
  const bands = layers
    .map(([kind, frac]) => {
      const h = frac * height;
      y -= h;
      return `<rect x="0" y="${y.toFixed(1)}" width="44" height="${h.toFixed(1)}" fill="var(--l-${kind})"/>`;
    })
    .join("");
  const label = layers.map(([k]) => k).join(", ");
  return `
    <svg viewBox="0 0 44 56" role="img" aria-label="Lleva: ${label}">
      <clipPath id="cup${i}"><path d="M5 6h34l-4 46h-26z"/></clipPath>
      <g clip-path="url(#cup${i})"><rect width="44" height="56" class="cup-glass"/>${bands}</g>
      <path class="cup-outline" d="M5 6h34l-4 46h-26z"/>
    </svg>`;
}

document.getElementById("coffeeList").innerHTML = COFFEES.map(
  (c, i) => `<li class="drink">${cupSVG(c.layers, i)}<div>${itemHTML(c)}</div></li>`
).join("");

[["saladosList", SALADOS], ["postresList", POSTRES], ["otrasList", OTRAS]].forEach(([id, items]) => {
  document.getElementById(id).innerHTML = items
    .map((d) =>
      d.signature
        ? `<li class="signature"><p class="signature__note">${d.signature}</p>${itemHTML(d)}</li>`
        : `<li>${itemHTML(d)}</li>`
    )
    .join("");
});

/* ---------- Navegación ---------- */
const navToggle = document.querySelector(".nav__toggle");
const navLinks = document.getElementById("navLinks");
navToggle.addEventListener("click", () => {
  const open = navLinks.classList.toggle("is-open");
  navToggle.setAttribute("aria-expanded", open);
});
navLinks.addEventListener("click", (e) => {
  if (e.target.tagName === "A") {
    navLinks.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
  }
});

/* ---------- Plano ---------- */
const TABLES = [
  { id: 1, cap: 2, shape: "round", x: 85, y: 90, zone: "Ventana" },
  { id: 2, cap: 2, shape: "round", x: 175, y: 90, zone: "Ventana" },
  { id: 3, cap: 4, shape: "square", x: 280, y: 95, zone: "Ventana" },
  { id: 4, cap: 4, shape: "square", x: 385, y: 95, zone: "Centro" },
  { id: 5, cap: 2, shape: "round", x: 85, y: 205, zone: "Ventana" },
  { id: 6, cap: 6, shape: "long", x: 215, y: 210, zone: "Centro" },
  { id: 7, cap: 4, shape: "square", x: 365, y: 215, zone: "Centro" },
  { id: 8, cap: 4, shape: "square", x: 90, y: 325, zone: "Rincón tranquilo" },
  { id: 9, cap: 2, shape: "round", x: 190, y: 330, zone: "Rincón tranquilo" },
  { id: 10, cap: 8, shape: "long", x: 370, y: 330, zone: "Junto al rincón infantil", w: 110 },
];

const SVG_NS = "http://www.w3.org/2000/svg";
const svg = document.getElementById("floorMap");

function el(tag, attrs = {}, parent = svg) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  parent.appendChild(node);
  return node;
}
function text(str, attrs, parent) {
  el("text", attrs, parent).textContent = str;
}

function drawRoom() {
  // Rayado para mesas ocupadas (también lo usa la leyenda)
  const defs = el("defs");
  const pat = el("pattern", { id: "hatch", width: 7, height: 7, patternUnits: "userSpaceOnUse", patternTransform: "rotate(45)" }, defs);
  el("rect", { width: 7, height: 7, fill: "#fbf8f4" }, pat);
  el("line", { x1: 0, y1: 0, x2: 0, y2: 7, stroke: "#cbbba9", "stroke-width": 2 }, pat);

  el("rect", { x: 20, y: 20, width: 560, height: 380, rx: 10, class: "map-wall" });
  // Cuadrícula de plano
  for (let x = 60; x < 580; x += 40) el("line", { x1: x, y1: 23, x2: x, y2: 397, class: "map-grid" });
  for (let y = 60; y < 400; y += 40) el("line", { x1: 23, y1: y, x2: 577, y2: y, class: "map-grid" });

  el("line", { x1: 50, y1: 20, x2: 330, y2: 20, class: "map-window" });
  el("line", { x1: 20, y1: 60, x2: 20, y2: 250, class: "map-window" });
  text("VENTANAL A LA PLAZA", { x: 190, y: 12, "text-anchor": "middle", class: "map-label" });

  el("rect", { x: 460, y: 40, width: 100, height: 160, rx: 6, class: "map-counter" });
  text("BARRA", { x: 510, y: 125, "text-anchor": "middle", class: "map-counter-text" });

  el("rect", { x: 460, y: 255, width: 100, height: 125, rx: 10, class: "map-play" });
  text("RINCÓN", { x: 510, y: 312, "text-anchor": "middle", class: "map-play-text" });
  text("INFANTIL", { x: 510, y: 330, "text-anchor": "middle", class: "map-play-text" });

  // Puerta con su arco de apertura
  el("rect", { x: 250, y: 396, width: 80, height: 8, class: "map-door" });
  el("path", { d: "M330 400 L330 340 A60 60 0 0 0 270 400", class: "map-swing" });
  text("ENTRADA", { x: 290, y: 416, "text-anchor": "middle", class: "map-label" });
}

function drawTable(t) {
  const g = el("g", { class: "table", tabindex: 0, role: "button", "data-id": t.id });

  const chairs = [];
  if (t.shape === "round") {
    chairs.push([t.x - 34, t.y], [t.x + 34, t.y]);
  } else if (t.shape === "square") {
    chairs.push([t.x, t.y - 36], [t.x, t.y + 36], [t.x - 36, t.y], [t.x + 36, t.y]);
  } else {
    const w = t.w || 100;
    const perSide = Math.ceil((t.cap - 2) / 2);
    for (let i = 0; i < perSide; i++) {
      const cx = t.x - w / 2 + (w / (perSide + 1)) * (i + 1);
      chairs.push([cx, t.y - 32], [cx, t.y + 32]);
    }
    chairs.push([t.x - w / 2 - 16, t.y], [t.x + w / 2 + 16, t.y]);
  }
  chairs.forEach(([cx, cy]) => el("circle", { cx, cy, r: 8, class: "chair" }, g));

  if (t.shape === "round") {
    el("circle", { cx: t.x, cy: t.y, r: 24, class: "top" }, g);
  } else if (t.shape === "square") {
    el("rect", { x: t.x - 25, y: t.y - 25, width: 50, height: 50, rx: 8, class: "top" }, g);
  } else {
    const w = t.w || 100;
    el("rect", { x: t.x - w / 2, y: t.y - 22, width: w, height: 44, rx: 10, class: "top" }, g);
  }

  text(`M${t.id}`, { x: t.x, y: t.y + 1, "text-anchor": "middle" }, g);
  text(`${t.cap} pers.`, { x: t.x, y: t.y + 14, "text-anchor": "middle", class: "cap" }, g);
  el("title", {}, g).textContent = `Mesa ${t.id} · ${t.cap} personas · ${t.zone}`;

  g.addEventListener("click", () => selectTable(t.id));
  g.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectTable(t.id);
    }
  });
}

drawRoom();
TABLES.forEach(drawTable);

/* ---------- Disponibilidad ---------- */
const CONFIG = window.AURORA_CONFIG || {};
// Sin datos de Supabase (config.js) la página funciona en modo demostración
const DEMO = !CONFIG.supabaseUrl || !CONFIG.supabaseKey;

// Llama a una función de la base de datos (supabase/schema.sql) a través de la API de Supabase
async function rpc(fn, params) {
  const headers = { "Content-Type": "application/json", apikey: CONFIG.supabaseKey };
  // Las claves "anon" heredadas son JWT y también van en Authorization; las nuevas "publishable" no
  if (CONFIG.supabaseKey.startsWith("eyJ")) headers.Authorization = `Bearer ${CONFIG.supabaseKey}`;
  const res = await fetch(`${CONFIG.supabaseUrl.replace(/\/$/, "")}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers,
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.message) || `HTTP ${res.status}`);
  return data;
}

// Llama a una Edge Function (supabase/functions/…)
async function callFunction(name, body) {
  const headers = { "Content-Type": "application/json", apikey: CONFIG.supabaseKey };
  if (CONFIG.supabaseKey.startsWith("eyJ")) headers.Authorization = `Bearer ${CONFIG.supabaseKey}`;
  const res = await fetch(`${CONFIG.supabaseUrl.replace(/\/$/, "")}/functions/v1/${name}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.message) || `HTTP ${res.status}`);
  return data;
}

// Versión de la política que acepta el cliente (debe coincidir con privacidad.html)
const POLITICA_VERSION = "1.0 (2026-09-30)";

/* --- Captcha (Cloudflare Turnstile): solo si hay Site Key en config.js --- */
let captchaToken = null;
let captchaWidget = null;

function initCaptcha() {
  if (DEMO || !CONFIG.turnstileSiteKey) return;
  window.onTurnstileLoad = () => {
    captchaWidget = window.turnstile.render("#captcha", {
      sitekey: CONFIG.turnstileSiteKey,
      language: "es",
      appearance: "interaction-only", // solo se muestra si Cloudflare necesita que la persona confirme
      callback: (token) => (captchaToken = token),
      "expired-callback": () => (captchaToken = null),
      "error-callback": () => (captchaToken = null),
    });
  };
  const s = document.createElement("script");
  s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad";
  s.async = true;
  document.head.appendChild(s);
}

function resetCaptcha() {
  captchaToken = null;
  if (captchaWidget !== null && window.turnstile) window.turnstile.reset(captchaWidget);
}

// Mesas ocupadas para la fecha y hora elegidas (se recarga al cambiarlas)
let busyTables = new Set();
let availabilityFailed = false;
let availabilityRequest = 0;

async function fetchBusyTables(date, time) {
  if (DEMO) {
    return TABLES.filter((t) => isBusyDemo(t.id, date, time)).map((t) => t.id);
  }
  return rpc("mesas_ocupadas", { p_fecha: date, p_hora: time });
}

const isBusy = (tableId) => availabilityFailed || busyTables.has(tableId);

/* --- Modo demostración: ocupación simulada y reservas en este navegador --- */
const STORAGE_KEY = "aurora-reservas";

function loadReservations() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}
function saveReservation(r) {
  const all = loadReservations();
  all.push(r);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* almacenamiento no disponible: la reserva solo vive en esta sesión */
  }
}

// Simula la ocupación de otros clientes de forma estable por fecha/hora/mesa
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Mezcla final para que cada mesa tenga un resultado independiente
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

function isBusyDemo(tableId, date, time) {
  if (!date || !time) return false;
  const hour = parseInt(time, 10);
  // Más ocupación a la hora del desayuno y de la merienda
  const peak = (hour >= 7 && hour <= 10) || (hour >= 17 && hour <= 19);
  const simulated = hash(`${date}|${time}|${tableId}`) < (peak ? 0.5 : 0.28);
  const booked = loadReservations().some(
    (r) => r.table === tableId && r.date === date && r.time === time
  );
  return simulated || booked;
}

/* ---------- Formulario ---------- */
const form = document.getElementById("reserveForm");
const dateInput = document.getElementById("date");
const timeSelect = document.getElementById("time");
const guestsSelect = document.getElementById("guests");
const tableSelect = document.getElementById("table");
const floorWhen = document.getElementById("floorWhen");
const formError = document.getElementById("formError");

let selectedTable = null;

const pad = (n) => String(n).padStart(2, "0");
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function initDate() {
  const today = new Date();
  const max = new Date();
  max.setDate(max.getDate() + 60);
  dateInput.min = toISO(today);
  dateInput.max = toISO(max);
  dateInput.value = toISO(today);
}

// Turnos cada 30 min desde la apertura; última reserva 1 h antes del cierre
function buildTimeSlots() {
  const previous = timeSelect.value;
  const [y, m, d] = dateInput.value.split("-").map(Number);
  const [open, close] = HOURS[new Date(y, m - 1, d).getDay()];

  const now = new Date();
  const isToday = dateInput.value === toISO(now);
  const earliest = now.getHours() * 60 + now.getMinutes() + 30; // 30 min de anticipación

  const slots = [];
  for (let t = open; t <= close - 60; t += 30) {
    if (isToday && t < earliest) continue;
    slots.push(`${pad(Math.floor(t / 60))}:${pad(t % 60)}`);
  }

  timeSelect.innerHTML = slots.length
    ? slots.map((s) => `<option value="${s}">${s}</option>`).join("")
    : `<option value="">Sin horarios este día</option>`;
  if (slots.includes(previous)) timeSelect.value = previous;
}

function formatDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
}

const plan = document.querySelector(".plan");
const AVAILABILITY_ERROR = "No pudimos consultar las mesas libres. Revisa tu conexión e inténtalo de nuevo.";

// Pide la ocupación al servidor y vuelve a pintar el plano
async function refreshAvailability() {
  const date = dateInput.value;
  const time = timeSelect.value;
  const request = ++availabilityRequest;

  if (!date || !time) {
    busyTables = new Set();
    renderFloor();
    return;
  }

  plan.classList.add("is-loading");
  floorWhen.textContent = "Consultando mesas libres…";
  try {
    const busy = await fetchBusyTables(date, time);
    if (request !== availabilityRequest) return; // llegó una respuesta vieja: la ignoramos
    busyTables = new Set(busy.map(Number));
    availabilityFailed = false;
    if (formError.textContent === AVAILABILITY_ERROR) formError.textContent = "";
  } catch (err) {
    if (request !== availabilityRequest) return;
    console.error("Disponibilidad:", err);
    availabilityFailed = true;
    formError.textContent = AVAILABILITY_ERROR;
  } finally {
    if (request === availabilityRequest) plan.classList.remove("is-loading");
  }
  renderFloor();
}

// Pinta el plano con la ocupación ya cargada (sin ir al servidor)
function renderFloor() {
  const date = dateInput.value;
  const time = timeSelect.value;
  const guests = Number(guestsSelect.value);

  floorWhen.textContent = date && time ? `${formatDate(date)}, ${time} h` : "Selecciona fecha y hora";

  if (selectedTable) {
    const t = TABLES.find((x) => x.id === selectedTable);
    if (isBusy(t.id) || t.cap < guests) selectedTable = null;
  }

  const options = [`<option value="">Elige en el plano</option>`];
  let freeCount = 0;

  TABLES.forEach((t) => {
    const g = svg.querySelector(`.table[data-id="${t.id}"]`);
    const busy = !time || isBusy(t.id);
    const small = t.cap < guests;
    g.classList.remove("is-free", "is-busy", "is-small", "is-selected");

    let status;
    if (busy) {
      g.classList.add("is-busy");
      status = "ocupada";
    } else if (small) {
      g.classList.add("is-small");
      status = "pequeña para tu grupo";
    } else {
      const sel = t.id === selectedTable;
      g.classList.add(sel ? "is-selected" : "is-free");
      status = sel ? "seleccionada" : "libre";
      freeCount++;
      options.push(`<option value="${t.id}">Mesa ${t.id} · ${t.cap} pers. · ${t.zone}</option>`);
    }
    g.setAttribute("aria-label", `Mesa ${t.id}, ${t.cap} personas, ${t.zone}: ${status}`);
    g.setAttribute("aria-disabled", busy || small);
  });

  tableSelect.innerHTML = options.join("");
  tableSelect.value = selectedTable || "";

  if (time && freeCount === 0 && !availabilityFailed) {
    formError.textContent = "No quedan mesas para ese horario y tamaño de grupo. Prueba otra hora.";
  } else if (formError.textContent.startsWith("No quedan")) {
    formError.textContent = "";
  }
}

function selectTable(id) {
  const t = TABLES.find((x) => x.id === id);
  const guests = Number(guestsSelect.value);
  if (!timeSelect.value) return;
  if (isBusy(id)) {
    formError.textContent = `La mesa ${id} está ocupada a esa hora. Elige una de las libres.`;
    return;
  }
  if (t.cap < guests) {
    formError.textContent = `La mesa ${id} es para ${t.cap} personas y tu grupo es de ${guests}.`;
    return;
  }
  formError.textContent = "";
  selectedTable = selectedTable === id ? null : id;
  renderFloor();
}

// Cambiar fecha u hora consulta al servidor; personas y mesa solo vuelven a pintar
dateInput.addEventListener("change", () => {
  if (!dateInput.value || dateInput.value < dateInput.min) dateInput.value = dateInput.min;
  buildTimeSlots();
  refreshAvailability();
});
timeSelect.addEventListener("change", refreshAvailability);
guestsSelect.addEventListener("change", renderFloor);
tableSelect.addEventListener("change", () => {
  selectedTable = tableSelect.value ? Number(tableSelect.value) : null;
  renderFloor();
});

form.addEventListener("input", (e) => e.target.classList.remove("is-invalid"));

// Mensajes para los errores que devuelve crear_reserva() en supabase/schema.sql
const SERVER_ERRORS = {
  MESA_OCUPADA: "Alguien acaba de apartar esa mesa. Ya actualizamos el plano: elige otra.",
  MESA_NO_DISPONIBLE: "Esa mesa no se puede reservar en línea. Elige otra.",
  CAPACIDAD: "Esa mesa no alcanza para tu grupo. Elige una más grande.",
  FECHA_FUERA_DE_RANGO: "Ese horario ya no está disponible para reservar. Elige otra hora.",
  FUERA_DE_HORARIO: "Ese horario está fuera de nuestro horario de reservas.",
  DATOS_INVALIDOS: "Revisa tu nombre, teléfono y correo.",
  LIMITE_RESERVAS: "Ya tienes varias reservas activas con este teléfono. Si necesitas cambiar alguna, llámanos.",
  SIN_AUTORIZACION: "Para reservar necesitamos tu autorización para tratar tus datos.",
  CAPTCHA: "No pudimos comprobar que no eres un robot. Espera unos segundos e inténtalo de nuevo.",
};

const submitButton = form.querySelector('button[type="submit"]');

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (submitButton.disabled) return;
  const fields = {
    name: document.getElementById("name"),
    phone: document.getElementById("phone"),
    email: document.getElementById("email"),
  };
  Object.values(fields).forEach((f) => f.classList.remove("is-invalid"));

  const errors = [];
  if (!timeSelect.value) errors.push("elige una hora");
  if (!selectedTable) errors.push("elige una mesa en el plano");
  if (fields.name.value.trim().length < 3) {
    errors.push("escribe tu nombre");
    fields.name.classList.add("is-invalid");
  }
  if (fields.phone.value.replace(/\D/g, "").length < 8) {
    errors.push("revisa tu teléfono");
    fields.phone.classList.add("is-invalid");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.value.trim())) {
    errors.push("revisa tu correo");
    fields.email.classList.add("is-invalid");
  }
  const consent = document.getElementById("consent");
  if (!consent.checked) errors.push("acepta la política de tratamiento de datos");

  if (errors.length) {
    formError.textContent = "Falta poco: " + errors.join(", ") + ".";
    return;
  }

  const reservation = {
    date: dateInput.value,
    time: timeSelect.value,
    guests: Number(guestsSelect.value),
    table: selectedTable,
    name: fields.name.value.trim(),
    phone: fields.phone.value.trim(),
    email: fields.email.value.trim(),
    notes: document.getElementById("notes").value.trim(),
  };

  submitButton.disabled = true;
  submitButton.textContent = "Reservando…";
  formError.textContent = "";

  try {
    if (DEMO) {
      reservation.code = "AUR-" + Math.random().toString(36).slice(2, 7).toUpperCase();
      saveReservation(reservation);
    } else {
      if (CONFIG.turnstileSiteKey && !captchaToken) throw new Error("CAPTCHA");
      const result = await callFunction("crear-reserva", {
        mesa: reservation.table,
        fecha: reservation.date,
        hora: reservation.time,
        personas: reservation.guests,
        nombre: reservation.name,
        telefono: reservation.phone,
        correo: reservation.email,
        notas: reservation.notes || null,
        acepta_politica: consent.checked,
        politica_version: POLITICA_VERSION,
        captcha: captchaToken,
      });
      reservation.code = result.codigo;
    }
  } catch (err) {
    resetCaptcha(); // cada token de Turnstile sirve una sola vez
    console.error("Reserva:", err);
    const key = Object.keys(SERVER_ERRORS).find((k) => err.message.includes(k));
    formError.textContent = key
      ? SERVER_ERRORS[key]
      : "No pudimos guardar tu reserva. Revisa tu conexión e inténtalo de nuevo, o llámanos al +57 310 555 0198.";
    if (key === "MESA_OCUPADA") {
      selectedTable = null;
      refreshAvailability();
    }
    return;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Confirmar reserva";
  }

  showConfirmation(reservation);
  resetCaptcha();

  form.reset();
  formError.textContent = "";
  selectedTable = null;
  initDate();
  buildTimeSlots();
  refreshAvailability();
});

/* ---------- Confirmación ---------- */
const modal = document.getElementById("modal");
const modalBody = document.getElementById("modalBody");
const modalClose = document.getElementById("modalClose");

function escapeHTML(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function showConfirmation(r) {
  const t = TABLES.find((x) => x.id === r.table);
  modalBody.innerHTML = `
    <p>Gracias, ${escapeHTML(r.name.split(" ")[0])}. Te esperamos con el café listo.</p>
    <p class="code">${r.code}</p>
    <dl>
      <dt>Día</dt><dd>${formatDate(r.date)}</dd>
      <dt>Hora</dt><dd>${r.time} h</dd>
      <dt>Personas</dt><dd>${r.guests}</dd>
      <dt>Mesa</dt><dd>${t.id}, ${t.zone.toLowerCase()}</dd>
    </dl>
    ${DEMO ? "" : `<p class="modal__note">Te enviamos la confirmación a <strong>${escapeHTML(r.email)}</strong>, con un enlace por si necesitas cancelar.</p>`}`;
  modal.hidden = false;
  modalClose.focus();
}

const closeModal = () => (modal.hidden = true);
modalClose.addEventListener("click", closeModal);
modal.addEventListener("click", (e) => e.target === modal && closeModal());
document.addEventListener("keydown", (e) => e.key === "Escape" && !modal.hidden && closeModal());

/* ---------- Arranque ---------- */
initDate();
buildTimeSlots();
if (!timeSelect.value) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  dateInput.value = toISO(tomorrow);
  buildTimeSlots();
}
refreshAvailability();
initCaptcha();
