// ---------- Estado y almacenamiento (localStorage, funciona offline) ----------
const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);

function load(key) {
  try { return JSON.parse(localStorage.getItem(key)) || []; } catch { return []; }
}
function save(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

let insumos = load("insumos");
let trabajadores = load("trabajadores");
let tareas = load("tareas");
let currentTab = "insumos";
let showForm = false;

const ESTADOS = [
  { key: "pendiente", label: "Pendiente" },
  { key: "proceso", label: "En proceso" },
  { key: "completado", label: "Completado" },
];

// ---------- Navegación de pestañas ----------
document.getElementById("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  currentTab = btn.dataset.tab;
  showForm = false;
  render();
});

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

function renderAlert() {
  const bar = document.getElementById("alertBar");
  const bajos = insumos.filter((i) => Number(i.cantidad) <= Number(i.stockMinimo));
  if (bajos.length === 0) { bar.classList.add("hidden"); return; }
  bar.classList.remove("hidden");
  bar.innerHTML = `⚠️ <b>${bajos.length}</b> insumo${bajos.length > 1 ? "s" : ""} con stock bajo: ${bajos.map((b) => esc(b.nombre)).join(", ")}`;
}

// ---------- Render principal ----------
function render() {
  renderAlert();
  const c = document.getElementById("content");
  if (currentTab === "insumos") c.innerHTML = renderInsumos();
  else if (currentTab === "tareas") c.innerHTML = renderTareas();
  else c.innerHTML = renderEquipo();
  attachHandlers();
}

// ---------- INSUMOS ----------
function renderInsumos() {
  const formHtml = showForm ? `
    <div class="form-card">
      <input id="f-nombre" placeholder="Nombre (ej. Cuero sintético negro)" />
      <select id="f-categoria">
        ${["Cuero","Suela","Hilo","Pegamento","Plantilla","Herrajes","Otro"].map(c=>`<option>${c}</option>`).join("")}
      </select>
      <div class="form-row">
        <input id="f-cantidad" type="number" placeholder="Cantidad" />
        <select id="f-unidad">
          ${["unid","m","kg","par","rollo"].map(u=>`<option>${u}</option>`).join("")}
        </select>
        <input id="f-stockmin" type="number" placeholder="Stock mín." />
      </div>
      <button class="btn-save" id="save-insumo">Guardar insumo</button>
    </div>` : "";

  const list = insumos.length === 0 && !showForm
    ? `<p class="empty-msg">Sin insumos registrados todavía.</p>`
    : insumos.map((i) => {
        const low = Number(i.cantidad) <= Number(i.stockMinimo);
        return `
        <div class="card">
          <div class="card-row">
            <div>
              <div class="item-name">${esc(i.nombre)}</div>
              <div class="item-sub">${esc(i.categoria)} · mín. ${i.stockMinimo} ${esc(i.unidad)}</div>
            </div>
            <div class="qty-controls">
              <button class="qty-btn" data-act="dec" data-id="${i.id}">−</button>
              <span class="qty-val ${low ? "low" : ""}">${i.cantidad}</span>
              <button class="qty-btn" data-act="inc" data-id="${i.id}">+</button>
              <button class="icon-btn" data-act="del-insumo" data-id="${i.id}">🗑</button>
            </div>
          </div>
        </div>`;
      }).join("");

  return `
    <button class="btn-primary" id="toggle-form">${showForm ? "✕ Cancelar" : "+ Agregar insumo"}</button>
    ${formHtml}
    ${list}
  `;
}

// ---------- TAREAS ----------
function renderTareas() {
  const tip = trabajadores.length === 0
    ? `<p class="tip-msg">Consejo: agrega personas en la pestaña "Equipo" para poder asignarles tareas.</p>` : "";

  const formHtml = showForm ? `
    <div class="form-card">
      <input id="f-modelo" placeholder="Modelo (ej. Sandalia Valentina)" />
      <div class="form-row">
        <input id="f-talla" placeholder="Talla(s)" />
        <input id="f-pares" type="number" placeholder="Pares" />
      </div>
      <select id="f-trabajador">
        <option value="">Asignar a...</option>
        ${trabajadores.map((w) => `<option value="${w.id}">${esc(w.nombre)}</option>`).join("")}
      </select>
      <input id="f-entrega" type="date" />
      <textarea id="f-notas" rows="2" placeholder="Notas (opcional)"></textarea>
      <button class="btn-save" id="save-tarea">Crear tarea</button>
    </div>` : "";

  const list = tareas.length === 0 && !showForm
    ? `<p class="empty-msg">Sin tareas registradas todavía.</p>`
    : tareas.map((t) => {
        const trabajador = trabajadores.find((w) => w.id === t.trabajadorId);
        return `
        <div class="card">
          <div class="card-row">
            <div>
              <div class="item-name">${esc(t.modelo)}</div>
              <div class="item-sub">Talla ${esc(t.talla) || "—"} · ${t.cantidadPares} pares</div>
            </div>
            <span class="ficha" style="color:${estadoColor(t.estado)}">${estadoLabel(t.estado)}</span>
          </div>
          <div class="stitch-divider"></div>
          <div class="task-meta">
            <span>👤 ${esc(trabajador ? trabajador.nombre : "Sin asignar")}</span>
            ${t.fechaEntrega ? `<span>Entrega: ${t.fechaEntrega}</span>` : ""}
          </div>
          ${t.notas ? `<div class="task-notes">${esc(t.notas)}</div>` : ""}
          <div class="status-row">
            ${ESTADOS.map((e) => `<button class="status-btn ${t.estado === e.key ? "active-" + e.key : ""}" data-act="estado" data-id="${t.id}" data-estado="${e.key}">${e.label}</button>`).join("")}
            <button class="icon-btn" data-act="del-tarea" data-id="${t.id}">🗑</button>
          </div>
        </div>`;
      }).join("");

  return `
    <button class="btn-primary" id="toggle-form">${showForm ? "✕ Cancelar" : "+ Nueva tarea"}</button>
    ${tip}
    ${formHtml}
    ${list}
  `;
}

function estadoLabel(key) { return (ESTADOS.find((e) => e.key === key) || ESTADOS[0]).label; }
function estadoColor(key) {
  return key === "completado" ? "#4C6B4F" : key === "proceso" ? "#8A5A2B" : "#B8793E";
}

// ---------- EQUIPO ----------
function renderEquipo() {
  const formHtml = showForm ? `
    <div class="form-card">
      <input id="f-nombretrab" placeholder="Nombre completo" />
      <select id="f-especialidad">
        ${["Corte","Costura","Armado","Suela","Acabado","Empaque"].map(e=>`<option>${e}</option>`).join("")}
      </select>
      <button class="btn-save" id="save-trabajador">Guardar</button>
    </div>` : "";

  const list = trabajadores.length === 0 && !showForm
    ? `<p class="empty-msg">Sin personas registradas todavía.</p>`
    : trabajadores.map((w) => {
        const propias = tareas.filter((t) => t.trabajadorId === w.id);
        const pendientes = propias.filter((t) => t.estado !== "completado").length;
        return `
        <div class="card">
          <div class="card-row">
            <div>
              <div class="item-name">${esc(w.nombre)}</div>
              <div class="item-sub">${esc(w.especialidad)}</div>
            </div>
            <div class="qty-controls">
              <span class="ficha" style="color:${pendientes > 0 ? "#B8793E" : "#4C6B4F"}">${pendientes > 0 ? pendientes + " pend." : "al día"}</span>
              <button class="icon-btn" data-act="del-trabajador" data-id="${w.id}">🗑</button>
            </div>
          </div>
        </div>`;
      }).join("");

  return `
    <button class="btn-primary" id="toggle-form">${showForm ? "✕ Cancelar" : "+ Agregar persona"}</button>
    ${formHtml}
    ${list}
  `;
}

// ---------- Manejadores de eventos ----------
function attachHandlers() {
  const toggle = document.getElementById("toggle-form");
  if (toggle) toggle.onclick = () => { showForm = !showForm; render(); };

  const saveInsumo = document.getElementById("save-insumo");
  if (saveInsumo) saveInsumo.onclick = () => {
    const nombre = document.getElementById("f-nombre").value.trim();
    const cantidad = document.getElementById("f-cantidad").value;
    if (!nombre || cantidad === "") return;
    insumos.push({
      id: uid(),
      nombre,
      categoria: document.getElementById("f-categoria").value,
      cantidad: Number(cantidad),
      unidad: document.getElementById("f-unidad").value,
      stockMinimo: Number(document.getElementById("f-stockmin").value || 0),
    });
    save("insumos", insumos);
    showForm = false;
    render();
  };

  const saveTarea = document.getElementById("save-tarea");
  if (saveTarea) saveTarea.onclick = () => {
    const modelo = document.getElementById("f-modelo").value.trim();
    const pares = document.getElementById("f-pares").value;
    if (!modelo || !pares) return;
    tareas.unshift({
      id: uid(),
      modelo,
      talla: document.getElementById("f-talla").value.trim(),
      cantidadPares: Number(pares),
      trabajadorId: document.getElementById("f-trabajador").value,
      fechaEntrega: document.getElementById("f-entrega").value,
      notas: document.getElementById("f-notas").value.trim(),
      estado: "pendiente",
      fechaAsignacion: today(),
    });
    save("tareas", tareas);
    showForm = false;
    render();
  };

  const saveTrabajador = document.getElementById("save-trabajador");
  if (saveTrabajador) saveTrabajador.onclick = () => {
    const nombre = document.getElementById("f-nombretrab").value.trim();
    if (!nombre) return;
    trabajadores.push({ id: uid(), nombre, especialidad: document.getElementById("f-especialidad").value });
    save("trabajadores", trabajadores);
    showForm = false;
    render();
  };

  document.querySelectorAll("[data-act]").forEach((el) => {
    el.onclick = () => {
      const act = el.dataset.act;
      const id = el.dataset.id;
      if (act === "inc" || act === "dec") {
        insumos = insumos.map((i) => i.id === id ? { ...i, cantidad: Math.max(0, Number(i.cantidad) + (act === "inc" ? 1 : -1)) } : i);
        save("insumos", insumos);
      } else if (act === "del-insumo") {
        insumos = insumos.filter((i) => i.id !== id);
        save("insumos", insumos);
      } else if (act === "estado") {
        tareas = tareas.map((t) => t.id === id ? { ...t, estado: el.dataset.estado } : t);
        save("tareas", tareas);
      } else if (act === "del-tarea") {
        tareas = tareas.filter((t) => t.id !== id);
        save("tareas", tareas);
      } else if (act === "del-trabajador") {
        trabajadores = trabajadores.filter((w) => w.id !== id);
        save("trabajadores", trabajadores);
      }
      render();
    };
  });
}

render();
