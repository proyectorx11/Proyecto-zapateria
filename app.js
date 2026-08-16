// ---------- Firebase ----------
const firebaseConfig = {
  apiKey: "AIzaSyBxqjYu_OHJmuZXvBmt8_jz5NL4ecwSlqk",
  authDomain: "produccion-zapateria.firebaseapp.com",
  projectId: "produccion-zapateria",
  storageBucket: "produccion-zapateria.firebasestorage.app",
  messagingSenderId: "926168524750",
  appId: "1:926168524750:web:8d79ff296d159e10aced9f",
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

const colInsumos = db.collection("insumos");
const colTrabajadores = db.collection("trabajadores");
const colTareas = db.collection("tareas");
const colNotificaciones = db.collection("notificaciones");

// ---------- Estado local ----------
const today = () => new Date().toISOString().slice(0, 10);

let insumos = [];
let trabajadores = [];
let tareas = [];
let notificaciones = [];
let currentTab = "insumos";
let showForm = false;

let role = localStorage.getItem("role"); // "owner" | "worker"
let workerId = localStorage.getItem("workerId") || "";
let workerName = localStorage.getItem("workerName") || "";

const ESTADOS = [
  { key: "pendiente", label: "Pendiente" },
  { key: "proceso", label: "En proceso" },
  { key: "completado", label: "Completado" },
];

function esc(s) {
  const d = document.createElement("div");
  d.textContent = s ?? "";
  return d.innerHTML;
}

// ---------- Suscripciones en tiempo real ----------
function startListeners() {
  colInsumos.onSnapshot((snap) => {
    insumos = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  });
  colTrabajadores.onSnapshot((snap) => {
    trabajadores = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (role === null) renderRoleScreen();
    render();
  });
  colTareas.onSnapshot((snap) => {
    tareas = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    tareas.sort((a, b) => (b.creado || "").localeCompare(a.creado || ""));
    render();
  });
  colNotificaciones.onSnapshot((snap) => {
    notificaciones = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((n) => !n.leido);
    render();
  });
}

// ---------- Pantalla de selección de rol ----------
function renderRoleScreen() {
  const list = document.getElementById("workerList");
  list.innerHTML = trabajadores.length
    ? trabajadores.map((w) => `<button class="worker-pick-btn" data-wid="${w.id}" data-wname="${esc(w.nombre)}">${esc(w.nombre)} · ${esc(w.especialidad)}</button>`).join("")
    : `<p style="color:#C9B79C;font-size:13px;">Aún no hay personas registradas. Pide a la encargada que te agregue primero.</p>`;

  list.querySelectorAll("[data-wid]").forEach((btn) => {
    btn.onclick = () => {
      role = "worker";
      workerId = btn.dataset.wid;
      workerName = btn.dataset.wname;
      localStorage.setItem("role", "worker");
      localStorage.setItem("workerId", workerId);
      localStorage.setItem("workerName", workerName);
      enterApp();
    };
  });
}

document.getElementById("btn-owner").onclick = () => {
  role = "owner";
  localStorage.setItem("role", "owner");
  enterApp();
};
document.getElementById("btn-worker").onclick = () => {
  document.getElementById("workerPicker").classList.remove("hidden");
};
document.getElementById("btn-switch").onclick = () => {
  localStorage.removeItem("role");
  localStorage.removeItem("workerId");
  localStorage.removeItem("workerName");
  location.reload();
};

function enterApp() {
  document.getElementById("roleScreen").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  if (role === "worker") {
    document.getElementById("appSub").textContent = "Hola, " + workerName;
    document.getElementById("tabs").classList.add("hidden");
  }
  render();
}

// ---------- Navegación de pestañas (solo encargada) ----------
document.getElementById("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  currentTab = btn.dataset.tab;
  showForm = false;
  render();
});

// ---------- Alertas ----------
function renderAlert() {
  const bar = document.getElementById("alertBar");
  if (role === "owner") {
    if (notificaciones.length === 0) { bar.classList.add("hidden"); return; }
    bar.classList.remove("hidden");
    bar.innerHTML = `✅ ${notificaciones.map((n) => `<b>${esc(n.trabajadorNombre)}</b> terminó "${esc(n.modelo)}"`).join(" · ")} <button id="clear-notif" style="margin-left:8px;background:none;border:1px solid #8A2E1B;color:#8A2E1B;border-radius:3px;padding:2px 6px;font-size:11px;">Marcar visto</button>`;
    const btn = document.getElementById("clear-notif");
    if (btn) btn.onclick = async () => {
      await Promise.all(notificaciones.map((n) => colNotificaciones.doc(n.id).update({ leido: true })));
    };
  } else {
    const bajos = insumos.filter((i) => Number(i.cantidad) <= Number(i.stockMinimo));
    if (bajos.length === 0) { bar.classList.add("hidden"); return; }
    bar.classList.remove("hidden");
    bar.innerHTML = `⚠️ Insumos con stock bajo: ${bajos.map((b) => esc(b.nombre)).join(", ")}`;
  }
}

// ---------- Render principal ----------
function render() {
  if (!role) return;
  renderAlert();
  const c = document.getElementById("content");
  if (role === "worker") {
    c.innerHTML = renderMisTareas();
  } else if (currentTab === "insumos") {
    c.innerHTML = renderInsumos();
  } else if (currentTab === "tareas") {
    c.innerHTML = renderTareas();
  } else {
    c.innerHTML = renderEquipo();
  }
  attachHandlers();
}

// ---------- VISTA FORRADOR: Mis tareas ----------
function renderMisTareas() {
  const mias = tareas.filter((t) => t.trabajadorId === workerId);
  if (mias.length === 0) return `<p class="empty-msg">Todavía no tienes tareas asignadas.</p>`;

  return mias.map((t) => `
    <div class="card">
      <div class="card-row">
        <div>
          <div class="item-name">${esc(t.modelo)}</div>
          <div class="item-sub">Talla ${esc(t.talla) || "—"} · ${t.cantidadPares} pares</div>
        </div>
        <span class="ficha" style="color:${estadoColor(t.estado)}">${estadoLabel(t.estado)}</span>
      </div>
      ${t.notas ? `<div class="stitch-divider"></div><div class="task-notes"><b>Instrucciones:</b> ${esc(t.notas)}</div>` : ""}
      ${t.fechaEntrega ? `<div class="task-meta" style="margin-top:6px;"><span>Entrega: ${t.fechaEntrega}</span></div>` : ""}
      <div class="status-row">
        ${ESTADOS.map((e) => `<button class="status-btn ${t.estado === e.key ? "active-" + e.key : ""}" data-act="estado-worker" data-id="${t.id}" data-estado="${e.key}">${e.label}</button>`).join("")}
      </div>
    </div>`).join("");
}

// ---------- INSUMOS (encargada) ----------
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

// ---------- TAREAS (encargada) ----------
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
      <textarea id="f-notas" rows="2" placeholder="Instrucciones para quien la reciba (opcional)"></textarea>
      <button class="btn-save" id="save-tarea">Crear y enviar tarea</button>
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
            <button class="icon-btn" data-act="del-tarea" data-id="${t.id}" style="margin-left:auto;">🗑 Eliminar</button>
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

// ---------- EQUIPO (encargada) ----------
function renderEquipo() {
  const formHtml = showForm ? `
    <div class="form-card">
      <input id="f-nombretrab" placeholder="Nombre completo" />
      <select id="f-especialidad">
        ${["Corte","Costura","Armado","Suela","Acabado","Empaque","Forrado"].map(e=>`<option>${e}</option>`).join("")}
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
  if (saveInsumo) saveInsumo.onclick = async () => {
    const nombre = document.getElementById("f-nombre").value.trim();
    const cantidad = document.getElementById("f-cantidad").value;
    if (!nombre || cantidad === "") return;
    await colInsumos.add({
      nombre,
      categoria: document.getElementById("f-categoria").value,
      cantidad: Number(cantidad),
      unidad: document.getElementById("f-unidad").value,
      stockMinimo: Number(document.getElementById("f-stockmin").value || 0),
    });
    showForm = false;
    render();
  };

  const saveTarea = document.getElementById("save-tarea");
  if (saveTarea) saveTarea.onclick = async () => {
    const modelo = document.getElementById("f-modelo").value.trim();
    const pares = document.getElementById("f-pares").value;
    if (!modelo || !pares) return;
    await colTareas.add({
      modelo,
      talla: document.getElementById("f-talla").value.trim(),
      cantidadPares: Number(pares),
      trabajadorId: document.getElementById("f-trabajador").value,
      fechaEntrega: document.getElementById("f-entrega").value,
      notas: document.getElementById("f-notas").value.trim(),
      estado: "pendiente",
      creado: new Date().toISOString(),
    });
    showForm = false;
    render();
  };

  const saveTrabajador = document.getElementById("save-trabajador");
  if (saveTrabajador) saveTrabajador.onclick = async () => {
    const nombre = document.getElementById("f-nombretrab").value.trim();
    if (!nombre) return;
    await colTrabajadores.add({ nombre, especialidad: document.getElementById("f-especialidad").value });
    showForm = false;
    render();
  };

  document.querySelectorAll("[data-act]").forEach((el) => {
    el.onclick = async () => {
      const act = el.dataset.act;
      const id = el.dataset.id;
      if (act === "inc" || act === "dec") {
        const i = insumos.find((x) => x.id === id);
        const nueva = Math.max(0, Number(i.cantidad) + (act === "inc" ? 1 : -1));
        await colInsumos.doc(id).update({ cantidad: nueva });
      } else if (act === "del-insumo") {
        await colInsumos.doc(id).delete();
      } else if (act === "del-tarea") {
        await colTareas.doc(id).delete();
      } else if (act === "del-trabajador") {
        await colTrabajadores.doc(id).delete();
      } else if (act === "estado-worker") {
        const nuevoEstado = el.dataset.estado;
        await colTareas.doc(id).update({ estado: nuevoEstado });
        if (nuevoEstado === "completado") {
          const t = tareas.find((x) => x.id === id);
          await colNotificaciones.add({
            tareaId: id,
            trabajadorNombre: workerName,
            modelo: t ? t.modelo : "",
            fecha: today(),
            leido: false,
          });
        }
      }
    };
  });
}

// ---------- Arranque ----------
startListeners();
if (role === "owner") {
  enterApp();
} else if (role === "worker" && workerId) {
  enterApp();
}
