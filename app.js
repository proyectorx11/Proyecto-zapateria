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
const colCuentas = db.collection("cuentas");
const colMateriales = db.collection("materiales");
const colSolicitudes = db.collection("solicitudes");

const PRECIO_PAR = 1650; // pesos colombianos por par
const TIEMPO_FACIL_DEFAULT = 9; // minutos, punto de partida hasta tener historial propio
const TIEMPO_DIFICIL_DEFAULT = 10;
const RAMPA_TOPE_PARES = 15;

// ---------- Estado local ----------
const today = () => new Date().toISOString().slice(0, 10);

let insumos = [];
let trabajadores = [];
let tareas = [];
let notificaciones = [];
let materiales = [];
let solicitudes = [];
let currentTab = "insumos";
let showForm = false;
let verEstadisticasDe = null; // id del trabajador cuando la encargada entra al detalle
let verEstadisticasGrupal = false;
let showMateriales = false;

let role = null; // "owner" | "worker"
let workerId = "";
let workerName = "";
let currentAccount = null; // { usuario, ... }
let authMode = "login"; // login | signup | forgot1 | forgot2

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
  colMateriales.onSnapshot((snap) => {
    materiales = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  });
  colSolicitudes.onSnapshot((snap) => {
    solicitudes = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((s) => !s.atendida);
    render();
  });
}

// ---------- Utilidad: hash simple de contraseñas (SHA-256) ----------
async function hash(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- Sesión local (recordar en este dispositivo) ----------
function guardarSesion(usuario) { localStorage.setItem("sesionUsuario", usuario); }
function borrarSesion() { localStorage.removeItem("sesionUsuario"); }

// ---------- Render de la pantalla de autenticación ----------
function renderAuth() {
  const c = document.getElementById("authContent");
  if (authMode === "login") {
    c.innerHTML = `
      <p class="role-sub">Inicia sesión para continuar</p>
      <div id="authErr"></div>
      <input id="a-usuario" class="auth-input" placeholder="Usuario" autocapitalize="none" />
      <input id="a-pass" type="password" class="auth-input" placeholder="Contraseña" />
      <button class="btn-primary" id="a-btn-login">Iniciar sesión</button>
      <button class="btn-save" id="a-btn-goSignup">Crear cuenta nueva</button>
      <button class="link-btn" id="a-btn-goForgot">¿Olvidaste tu contraseña?</button>
    `;
    document.getElementById("a-btn-login").onclick = doLogin;
    document.getElementById("a-btn-goSignup").onclick = () => { authMode = "signup"; renderAuth(); };
    document.getElementById("a-btn-goForgot").onclick = () => { authMode = "forgot1"; renderAuth(); };
  } else if (authMode === "signup") {
    c.innerHTML = `
      <p class="role-sub">Crea tu cuenta</p>
      <div id="authErr"></div>
      <input id="a-usuario" class="auth-input" placeholder="Elige un usuario" autocapitalize="none" />
      <input id="a-pass" type="password" class="auth-input" placeholder="Elige una contraseña" />
      <input id="a-pass2" type="password" class="auth-input" placeholder="Repite la contraseña" />
      <input id="a-pregunta" class="auth-input" placeholder="Pregunta secreta (ej. ¿Nombre de mi mascota?)" />
      <input id="a-respuesta" class="auth-input" placeholder="Respuesta secreta" />
      <button class="btn-primary" id="a-btn-signup">Crear cuenta</button>
      <button class="link-btn" id="a-btn-goLogin">Ya tengo cuenta</button>
    `;
    document.getElementById("a-btn-signup").onclick = doSignup;
    document.getElementById("a-btn-goLogin").onclick = () => { authMode = "login"; renderAuth(); };
  } else if (authMode === "forgot1") {
    c.innerHTML = `
      <p class="role-sub">Recuperar contraseña</p>
      <div id="authErr"></div>
      <input id="a-usuario" class="auth-input" placeholder="Tu usuario" autocapitalize="none" />
      <button class="btn-primary" id="a-btn-buscar">Continuar</button>
      <button class="link-btn" id="a-btn-goLogin">Volver</button>
    `;
    document.getElementById("a-btn-buscar").onclick = doForgotStep1;
    document.getElementById("a-btn-goLogin").onclick = () => { authMode = "login"; renderAuth(); };
  } else if (authMode === "forgot2") {
    c.innerHTML = `
      <p class="role-sub">${esc(window._preguntaSecreta || "Responde tu pregunta secreta")}</p>
      <div id="authErr"></div>
      <input id="a-respuesta" class="auth-input" placeholder="Tu respuesta" />
      <input id="a-nueva" type="password" class="auth-input" placeholder="Nueva contraseña" />
      <button class="btn-primary" id="a-btn-reset">Cambiar contraseña</button>
      <button class="link-btn" id="a-btn-goLogin">Volver</button>
    `;
    document.getElementById("a-btn-reset").onclick = doForgotStep2;
    document.getElementById("a-btn-goLogin").onclick = () => { authMode = "login"; renderAuth(); };
  }
}

function authErr(msg) {
  const box = document.getElementById("authErr");
  if (box) box.innerHTML = `<p class="auth-error">${esc(msg)}</p>`;
}

async function doLogin() {
  const usuario = document.getElementById("a-usuario").value.trim().toLowerCase();
  const pass = document.getElementById("a-pass").value;
  if (!usuario || !pass) return authErr("Escribe tu usuario y contraseña.");
  const doc = await colCuentas.doc(usuario).get();
  if (!doc.exists) return authErr("No existe ese usuario.");
  const data = doc.data();
  const passHash = await hash(pass);
  if (data.password !== passHash) return authErr("Contraseña incorrecta.");
  guardarSesion(usuario);
  await entrarConCuenta(usuario, data);
}

async function doSignup() {
  const usuario = document.getElementById("a-usuario").value.trim().toLowerCase();
  const pass = document.getElementById("a-pass").value;
  const pass2 = document.getElementById("a-pass2").value;
  const pregunta = document.getElementById("a-pregunta").value.trim();
  const respuesta = document.getElementById("a-respuesta").value.trim().toLowerCase();
  if (!usuario || !pass || !pregunta || !respuesta) return authErr("Completa todos los campos.");
  if (usuario.length < 3) return authErr("El usuario debe tener al menos 3 caracteres.");
  if (pass.length < 4) return authErr("La contraseña debe tener al menos 4 caracteres.");
  if (pass !== pass2) return authErr("Las contraseñas no coinciden.");
  const existente = await colCuentas.doc(usuario).get();
  if (existente.exists) return authErr("Ese usuario ya existe, elige otro.");
  const data = {
    password: await hash(pass),
    pregunta,
    respuesta: await hash(respuesta),
    role: null,
    workerId: "",
    workerName: "",
  };
  await colCuentas.doc(usuario).set(data);
  guardarSesion(usuario);
  await entrarConCuenta(usuario, data);
}

async function doForgotStep1() {
  const usuario = document.getElementById("a-usuario").value.trim().toLowerCase();
  if (!usuario) return authErr("Escribe tu usuario.");
  const doc = await colCuentas.doc(usuario).get();
  if (!doc.exists) return authErr("No existe ese usuario.");
  window._preguntaSecreta = doc.data().pregunta;
  window._usuarioRecuperando = usuario;
  authMode = "forgot2";
  renderAuth();
}

async function doForgotStep2() {
  const usuario = window._usuarioRecuperando;
  const respuesta = document.getElementById("a-respuesta").value.trim().toLowerCase();
  const nueva = document.getElementById("a-nueva").value;
  if (!respuesta || !nueva) return authErr("Completa ambos campos.");
  if (nueva.length < 4) return authErr("La nueva contraseña debe tener al menos 4 caracteres.");
  const doc = await colCuentas.doc(usuario).get();
  const data = doc.data();
  const respHash = await hash(respuesta);
  if (data.respuesta !== respHash) return authErr("Respuesta incorrecta.");
  await colCuentas.doc(usuario).update({ password: await hash(nueva) });
  authMode = "login";
  renderAuth();
  authErr("Contraseña actualizada. Ya puedes iniciar sesión.");
}

async function entrarConCuenta(usuario, data) {
  currentAccount = usuario;
  document.getElementById("authScreen").classList.add("hidden");
  if (data.role) {
    role = data.role;
    workerId = data.workerId || "";
    workerName = data.workerName || "";
    enterApp();
  } else {
    document.getElementById("roleScreen").classList.remove("hidden");
  }
}

document.getElementById("btn-switch").onclick = () => {
  borrarSesion();
  location.reload();
};

// ---------- Auto-inicio si ya había sesión guardada en este dispositivo ----------
async function intentarSesionGuardada() {
  const usuario = localStorage.getItem("sesionUsuario");
  if (!usuario) { renderAuth(); return; }
  const doc = await colCuentas.doc(usuario).get();
  if (doc.exists) {
    await entrarConCuenta(usuario, doc.data());
  } else {
    borrarSesion();
    renderAuth();
  }
}

// ==================================================================
// MOTOR DE REPARTO AUTOMÁTICO
// ==================================================================

function diasEntre(fechaISO) {
  if (!fechaISO) return 0;
  const ms = Date.now() - new Date(fechaISO).getTime();
  return Math.floor(ms / 86400000);
}

// Fase de "rampa" de un forrador nuevo: solo_facil | dificil_tope | normal
function faseDe(w) {
  if (w.graduado) return "normal";
  if (!w.fechaRegistro) return "normal"; // forrador creado antes de esta función, se asume ya establecido
  if (w.rampaExtendidaHasta && today() < w.rampaExtendidaHasta) return "dificil_tope";
  const dias = diasEntre(w.fechaRegistro);
  if (w.experiencia) {
    return dias < 5 ? "dificil_tope" : "normal";
  }
  return dias < 4 ? "solo_facil" : dias < 10 ? "dificil_tope" : "normal";
}

function elegibleParaDificil(w, cantidadPares) {
  const fase = faseDe(w);
  if (fase === "solo_facil") return false;
  if (fase === "dificil_tope") return cantidadPares <= RAMPA_TOPE_PARES;
  return true;
}

function estaAusenteHoy(w) {
  if (!w.fechaRegistro) return false;
  if (w.fechaRegistro === today()) return false; // día de ingreso, no cuenta
  return w.ultimaActividadFecha !== today();
}

// Tiempo promedio personal (minutos por par), con historial propio o el valor genérico
function tiempoPromedioPersonal(w, dificultad) {
  const arr = dificultad === "dificil" ? (w.duracionesDificil || []) : (w.duracionesFacil || []);
  if (arr.length >= 3) {
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }
  return dificultad === "dificil" ? TIEMPO_DIFICIL_DEFAULT : TIEMPO_FACIL_DEFAULT;
}

// Carga pendiente de un forrador, en minutos estimados
function cargaPendienteMinutos(w) {
  const propias = tareas.filter((t) => t.trabajadorId === w.id && t.estado !== "completado");
  return propias.reduce((sum, t) => sum + Number(t.cantidadPares) * tiempoPromedioPersonal(w, t.dificultad), 0);
}

// % de pares difíciles respecto al total, contado solo desde que el forrador se graduó de la rampa
function porcentajeDificilEquidad(w) {
  const desde = w.equidadInicio || "0000-01-01";
  const completadas = tareas.filter((t) => t.trabajadorId === w.id && t.estado === "completado" && (t.creado || "") >= desde);
  const totalPares = completadas.reduce((s, t) => s + Number(t.cantidadPares), 0);
  if (totalPares === 0) return 0;
  const dificilPares = completadas.filter((t) => t.dificultad === "dificil").reduce((s, t) => s + Number(t.cantidadPares), 0);
  return dificilPares / totalPares;
}

// Elige automáticamente a quién asignar una tarea nueva
function elegirAsignadoAutomatico(cantidadPares, dificultad, urgente) {
  let candidatos = trabajadores.filter((w) => !estaAusenteHoy(w));
  if (candidatos.length === 0) candidatos = trabajadores.slice();
  if (candidatos.length === 0) return null;

  if (dificultad === "dificil") {
    const elegibles = candidatos.filter((w) => elegibleParaDificil(w, cantidadPares));
    if (elegibles.length > 0) candidatos = elegibles;
    // si nadie es elegible (todos en fase solo_facil o tope superado), se deja el pool completo como respaldo
  }

  if (urgente) {
    candidatos.sort((a, b) => cargaPendienteMinutos(a) - cargaPendienteMinutos(b));
    return candidatos[0];
  }

  if (dificultad === "dificil") {
    const sinConsecutiva = candidatos.filter((w) => w.lastDificultadAsignada !== "dificil");
    const pool = sinConsecutiva.length > 0 ? sinConsecutiva : candidatos;
    pool.sort((a, b) => {
      const pa = porcentajeDificilEquidad(a), pb = porcentajeDificilEquidad(b);
      if (Math.abs(pa - pb) > 0.0001) return pa - pb;
      return cargaPendienteMinutos(a) - cargaPendienteMinutos(b);
    });
    return pool[0];
  }

  candidatos.sort((a, b) => cargaPendienteMinutos(a) - cargaPendienteMinutos(b));
  return candidatos[0];
}

// ==================================================================

// ---------- Pantalla de selección de rol ----------
function renderRoleScreen() {
  const list = document.getElementById("workerList");
  list.innerHTML = trabajadores.length
    ? trabajadores.map((w) => `<button class="worker-pick-btn" data-wid="${w.id}" data-wname="${esc(w.nombre)}">${esc(w.nombre)} · ${esc(w.especialidad)}</button>`).join("")
    : `<p style="color:#C9B79C;font-size:13px;">Aún no hay personas registradas. Pide a la encargada que te agregue primero.</p>`;

  list.querySelectorAll("[data-wid]").forEach((btn) => {
    btn.onclick = async () => {
      role = "worker";
      workerId = btn.dataset.wid;
      workerName = btn.dataset.wname;
      await colCuentas.doc(currentAccount).update({ role, workerId, workerName });
      enterApp();
    };
  });
}

document.getElementById("btn-owner").onclick = async () => {
  role = "owner";
  await colCuentas.doc(currentAccount).update({ role });
  enterApp();
};
document.getElementById("btn-worker").onclick = () => {
  document.getElementById("workerPicker").classList.remove("hidden");
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
  verEstadisticasDe = null;
  verEstadisticasGrupal = false;
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
  } else if (verEstadisticasDe) {
    c.innerHTML = renderEstadisticasIndividual(verEstadisticasDe);
  } else if (verEstadisticasGrupal) {
    c.innerHTML = renderEstadisticasGrupales();
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
  const completadas = mias.filter((t) => t.estado === "completado");
  const totalPares = completadas.reduce((s, t) => s + Number(t.cantidadPares), 0);
  const totalDinero = totalPares * PRECIO_PAR;

  const inicioSemana = (() => {
    const d = new Date();
    const dia = d.getDay();
    const diff = d.getDate() - dia + (dia === 0 ? -6 : 1);
    const lunes = new Date(d.setDate(diff));
    return lunes.toISOString().slice(0, 10);
  })();
  const paresSemana = completadas.filter((t) => (t.finProceso || t.creado || "") >= inicioSemana).reduce((s, t) => s + Number(t.cantidadPares), 0);
  const dineroSemana = paresSemana * PRECIO_PAR;

  const yaSolicito = solicitudes.some((s) => s.trabajadorId === workerId);

  const earnings = `
    <div class="earnings-card">
      <div class="earnings-label">Ganado esta semana</div>
      <div class="earnings-value">$${dineroSemana.toLocaleString("es-CO")}</div>
      <div class="earnings-sub">${paresSemana} pares completados · $${PRECIO_PAR.toLocaleString("es-CO")} c/u</div>
      <div class="earnings-sub" style="margin-top:6px;">Acumulado total: $${totalDinero.toLocaleString("es-CO")} (${totalPares} pares)</div>
    </div>`;

  const activas = mias.filter((t) => t.estado !== "completado" || !t.entregado);
  if (activas.length === 0 && mias.length === 0) {
    return earnings + `<p class="empty-msg">Todavía no tienes tareas asignadas.</p>` + solicitarBtn(yaSolicito);
  }

  const TALLAS_RANGO = [32, 33, 34, 35, 36, 37, 38, 39, 40, 41];

  const cards = mias.map((t) => {
    const tallasVale = t.tallas || {};
    const filaTallas = TALLAS_RANGO.map((n) => `<td>${Number(tallasVale[n]) > 0 ? tallasVale[n] : "&nbsp;"}</td>`).join("");

    let accionRow;
    if (t.estado === "pendiente") {
      accionRow = `
        <div class="accion-row">
          <button class="btn-accion activo" data-act="estado-worker" data-id="${t.id}" data-estado="proceso"><span class="ico">▶️</span>Comenzar</button>
          <button class="btn-accion inactivo" disabled><span class="ico">✅</span>Terminado</button>
        </div>`;
    } else if (t.estado === "proceso") {
      accionRow = `
        <div class="accion-row">
          <button class="btn-accion inactivo" disabled><span class="ico">▶️</span>Comenzar</button>
          <button class="btn-accion activo" data-act="estado-worker" data-id="${t.id}" data-estado="completado"><span class="ico">✅</span>Terminado</button>
        </div>`;
    } else {
      accionRow = `
        <div class="accion-row">
          <button class="btn-accion hecho" disabled><span class="ico">✅</span>Tarea terminada</button>
        </div>`;
    }

    return `
    <div class="task-box card">
      ${t.urgente ? `<div class="task-urgent-tag">🔴 URGENTE</div>` : ""}
      <div class="item-name">${esc(t.cliente || t.modelo || "Sin cliente")}</div>
      <div class="item-sub">${t.cantidadPares} pares${t.colorDetalle ? " · " + esc(t.colorDetalle) : ""}</div>

      <div class="vale-real">
        <div class="vale-real-titulo">FORRADO PLANTA</div>
        ${t.referencia ? `<div class="vale-real-linea"><b>REF.</b> ${esc(t.referencia)}</div>` : ""}
        ${t.colorDetalle ? `<div class="vale-real-linea"><b>COLOR</b> ${esc(t.colorDetalle)}</div>` : ""}
        ${t.cliente ? `<div class="vale-real-linea"><b>CLIENTE</b> ${esc(t.cliente)}</div>` : ""}
        <table class="vale-tallas-tabla">
          <tr>${TALLAS_RANGO.map((n) => `<th>${n}</th>`).join("")}</tr>
          <tr>${filaTallas}</tr>
        </table>
        ${t.numeroOrden ? `<div class="vale-real-orden">ORDEN No. ${esc(t.numeroOrden)}</div>` : ""}
      </div>

      ${t.notas ? `<div class="task-notes"><b>Instrucciones:</b> ${esc(t.notas)}</div>` : ""}
      ${t.fechaEntrega ? `<div class="task-meta" style="margin-top:6px;"><span>Entrega: ${t.fechaEntrega}</span></div>` : ""}
      <div class="task-price">Vale por esta tarea: $${(Number(t.cantidadPares) * PRECIO_PAR).toLocaleString("es-CO")}</div>
      ${accionRow}
    </div>`;
  }).join("");

  return earnings + cards + solicitarBtn(yaSolicito);
}

function solicitarBtn(yaSolicito) {
  if (yaSolicito) {
    return `<div class="solicitud-card"><div class="solicitud-text">Ya avisaste que necesitas tu próxima tarea. La encargada la está preparando.</div></div>`;
  }
  return `
    <div class="solicitar-card">
      <div class="solicitar-text">¿Ya vas avanzando? Pide tu próxima tarea<br>para que la encargada la vaya preparando.</div>
      <button class="btn-solicitar" id="btn-solicitar-tarea">📦 Solicitar nueva tarea</button>
    </div>`;
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
  const tipMaterial = materiales.length === 0
    ? `<p class="tip-msg">Consejo: agrega materiales abajo (marcando si son difíciles o fáciles) para poder crear tareas.</p>` : "";

  const preAsignado = window._preAsignarTrabajador || "";

  const TALLAS_RANGO = [32, 33, 34, 35, 36, 37, 38, 39, 40, 41];

  const formHtml = showForm ? `
    <div class="form-card">
      <button type="button" class="btn-leer-vale" id="btn-leer-vale">📸 Leer vale (foto)</button>
      <input type="file" id="f-foto-vale" accept="image/*" capture="environment" class="hidden" />
      <div id="ocr-status" class="ocr-status hidden"></div>

      <input id="f-orden" placeholder="N° de orden (ej. 14427)" />
      <input id="f-referencia" placeholder="Referencia (ej. PS368 NE)" />
      <input id="f-colordetalle" placeholder="Color (ej. Champán 516 5/2 Vidr)" />
      <input id="f-cliente" placeholder="Cliente (ej. Teresa Arias Betancur, La Dorada)" />

      <select id="f-material">
        <option value="">¿Este material es difícil o fácil?</option>
        ${materiales.map((m) => `<option value="${m.id}">${esc(m.nombre)} (${m.dificultad === "dificil" ? "difícil" : "fácil"})</option>`).join("")}
      </select>

      <p style="font-size:12px;color:#5C4A38;margin-bottom:6px;">Pares por talla:</p>
      <div class="tallas-grid">
        ${TALLAS_RANGO.map((t) => `
          <div class="talla-box">
            <label>${t}</label>
            <input type="number" min="0" class="f-talla-input" data-talla="${t}" value="" />
          </div>`).join("")}
      </div>
      <p style="font-size:12px;color:#8A7255;margin:6px 0 12px;">Total pares: <b id="total-pares-preview">0</b></p>

      <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#8A2E1B;margin-bottom:10px;">
        <input type="checkbox" id="f-urgente" style="width:auto;margin:0;" /> 🔴 Marcar como urgente
      </label>
      <select id="f-trabajador">
        <option value="">🤖 Reparto automático (recomendado)</option>
        ${trabajadores.map((w) => `<option value="${w.id}" ${w.id === preAsignado ? "selected" : ""}>Asignar manualmente a ${esc(w.nombre)}</option>`).join("")}
      </select>
      <input id="f-entrega" type="date" />
      <textarea id="f-notas" rows="2" placeholder="Instrucciones para quien la reciba (opcional)"></textarea>
      <button class="btn-save" id="save-tarea">Crear y enviar tarea</button>
    </div>` : "";

  const solicitudesHtml = solicitudes.map((s) => `
    <div class="solicitud-card">
      <div class="solicitud-tag">🙋 Solicitud de tarea</div>
      <div class="item-name">${esc(s.trabajadorNombre)} pidió su próxima tarea</div>
      <button class="btn-preparar" data-act="atender-solicitud" data-trabid="${s.trabajadorId}" data-solid="${s.id}">+ Preparar y asignar</button>
    </div>`).join("");

  const list = tareas.length === 0 && !showForm
    ? `<p class="empty-msg">Sin tareas registradas todavía.</p>`
    : tareas.map((t) => {
        const trabajador = trabajadores.find((w) => w.id === t.trabajadorId);
        const entregado = t.entregado;
        const puedeEntregar = t.estado === "completado" && !entregado;
        return `
        <div class="card ${entregado ? "entregado" : ""}">
          <div class="card-row">
            <div>
              <div class="item-name">${t.urgente ? "🔴 " : ""}${esc(t.cliente || t.modelo || "Sin cliente")}</div>
              <div class="item-sub">${t.numeroOrden ? "Orden #" + esc(t.numeroOrden) + " · " : ""}${esc(t.referencia || "")} ${t.colorDetalle ? "· " + esc(t.colorDetalle) : ""}</div>
              <div class="item-sub">${t.cantidadPares} pares ${t.dificultad ? "· " + (t.dificultad === "dificil" ? "Difícil" : "Fácil") : ""}${t.tallas ? " · " + tallasResumen(t.tallas) : ""}</div>
            </div>
            <span class="ficha" style="color:${estadoColor(entregado ? "entregado" : t.estado)}">${entregado ? "Entregado" : estadoLabel(t.estado)}</span>
          </div>
          <div class="stitch-divider"></div>
          <div class="task-meta">
            <span>👤 ${esc(trabajador ? trabajador.nombre : "Sin asignar")}</span>
            ${t.fechaEntrega ? `<span>Entrega: ${t.fechaEntrega}</span>` : ""}
          </div>
          ${t.notas ? `<div class="task-notes">${esc(t.notas)}</div>` : ""}
          ${entregado ? `<div class="entregado-badge">✔ Entregado ${t.fechaEntregado ? new Date(t.fechaEntregado).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</div>` : ""}
          <div class="status-row">
            ${puedeEntregar ? `<button class="status-btn" data-act="marcar-entregado" data-id="${t.id}" style="flex:1;background:#DCE7D6;color:#4C6B4F;border-color:#4C6B4F;">✔ Marcar entregado</button>` : ""}
            <button class="icon-btn" data-act="del-tarea" data-id="${t.id}" style="margin-left:auto;">🗑 Eliminar</button>
          </div>
        </div>`;
      }).join("");

  return `
    <button class="btn-primary" id="toggle-form">${showForm ? "✕ Cancelar" : "+ Nueva tarea"}</button>
    <button class="status-btn" id="toggle-materiales" style="width:100%;margin-bottom:12px;">${showMateriales ? "✕ Ocultar materiales" : "🧵 Ver/editar catálogo de materiales"}</button>
    ${showMateriales ? renderMaterialesForm() : ""}
    ${tip}${tipMaterial}
    ${formHtml}
    ${solicitudesHtml}
    ${list}
  `;
}

function estadoLabel(key) { return (ESTADOS.find((e) => e.key === key) || ESTADOS[0]).label; }
function estadoColor(key) {
  return key === "entregado" ? "#4C6B4F" : key === "completado" ? "#4C6B4F" : key === "proceso" ? "#8A5A2B" : "#B8793E";
}
function tallasResumen(tallas) {
  return Object.entries(tallas).filter(([, v]) => Number(v) > 0).map(([t, v]) => `${t}:${v}`).join(", ");
}

// ---------- MATERIALES (encargada) ----------
function renderMaterialesForm() {
  return `
    <div class="form-card">
      <input id="f-nombremat" placeholder="Nombre del material (ej. Cuero grueso café)" />
      <select id="f-dificultadmat">
        <option value="facil">Fácil</option>
        <option value="dificil">Difícil</option>
      </select>
      <button class="btn-save" id="save-material">Guardar material</button>
    </div>
    ${materiales.map((m) => `
      <div class="card" style="padding:10px 12px;">
        <div class="card-row">
          <span style="font-size:13px;">${esc(m.nombre)}</span>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="ficha" style="color:${m.dificultad === "dificil" ? "#A23B2E" : "#4C6B4F"}">${m.dificultad === "dificil" ? "Difícil" : "Fácil"}</span>
            <button class="icon-btn" data-act="del-material" data-id="${m.id}">🗑</button>
          </div>
        </div>
      </div>`).join("")}
  `;
}

// ---------- EQUIPO (encargada) ----------
function renderEquipo() {
  const formHtml = showForm ? `
    <div class="form-card">
      <input id="f-nombretrab" placeholder="Nombre completo" />
      <select id="f-especialidad">
        ${["Corte","Costura","Armado","Suela","Acabado","Empaque","Forrado"].map(e=>`<option>${e}</option>`).join("")}
      </select>
      <p style="font-size:13px;color:#5C4A38;margin-bottom:6px;">¿Tiene experiencia previa en el oficio?</p>
      <select id="f-experiencia">
        <option value="no">No, es nuevo/a en esto</option>
        <option value="si">Sí, ya sabe hacer el trabajo</option>
      </select>
      <button class="btn-save" id="save-trabajador">Guardar</button>
    </div>` : "";

  const list = trabajadores.length === 0 && !showForm
    ? `<p class="empty-msg">Sin personas registradas todavía.</p>`
    : trabajadores.map((w) => {
        const propias = tareas.filter((t) => t.trabajadorId === w.id);
        const pendientes = propias.filter((t) => t.estado !== "completado").length;
        const fase = faseDe(w);
        const faseLabel = fase === "solo_facil" ? "🌱 Solo fáciles" : fase === "dificil_tope" ? `🌱 Difíciles (máx ${RAMPA_TOPE_PARES})` : "";
        const ausente = estaAusenteHoy(w) ? `<span class="ficha" style="color:#B8793E;margin-left:6px;">🏖️ sin actividad hoy</span>` : "";
        return `
        <div class="card">
          <div class="card-row">
            <div>
              <div class="item-name">${esc(w.nombre)} ${ausente}</div>
              <div class="item-sub">${esc(w.especialidad)} ${faseLabel ? "· " + faseLabel : ""}</div>
            </div>
            <div class="qty-controls">
              <span class="ficha" style="color:${pendientes > 0 ? "#B8793E" : "#4C6B4F"}">${pendientes > 0 ? pendientes + " pend." : "al día"}</span>
            </div>
          </div>
          <div style="display:flex;gap:6px;margin-top:8px;">
            <button class="status-btn" data-act="ver-stats" data-id="${w.id}" style="flex:1;">📊 Ver estadísticas</button>
            ${fase !== "normal" ? `<button class="status-btn" data-act="graduar" data-id="${w.id}" data-name="${esc(w.nombre)}" style="flex:1;">🎓 Graduar ya</button>` : ""}
          </div>
          <div style="display:flex;gap:6px;margin-top:6px;">
            <button class="status-btn" data-act="reset-pass" data-id="${w.id}" data-name="${esc(w.nombre)}" style="flex:1;">🔑 Restablecer clave</button>
            <button class="icon-btn" data-act="del-trabajador" data-id="${w.id}">🗑</button>
          </div>
        </div>`;
      }).join("");

  return `
    <button class="btn-primary" id="toggle-form">${showForm ? "✕ Cancelar" : "+ Agregar persona"}</button>
    ${formHtml}
    <button class="status-btn" data-act="ver-stats-grupal" style="width:100%;margin-bottom:12px;">📊 Comparar todo el equipo</button>
    ${list}
  `;
}

// ---------- ESTADÍSTICAS ----------
function ultimosNDias(n) {
  const dias = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dias.push(d.toISOString().slice(0, 10));
  }
  return dias;
}
function nombreDiaCorto(fechaISO) {
  return ["D", "L", "M", "M", "J", "V", "S"][new Date(fechaISO + "T12:00:00").getDay()];
}
function barChart(valores, labels, colorCss) {
  const max = Math.max(...valores, 1);
  return `<div class="bars">${valores.map((v, i) => `
    <div class="bar-col">
      <div class="bar" style="height:${Math.max(4, (v / max) * 100)}%;background:${colorCss};"></div>
      <div class="bar-label">${esc(labels[i])}</div>
    </div>`).join("")}</div>`;
}

function renderEstadisticasIndividual(id) {
  const w = trabajadores.find((x) => x.id === id);
  if (!w) { verEstadisticasDe = null; return renderEquipo(); }
  const completadas = tareas.filter((t) => t.trabajadorId === id && t.estado === "completado");
  const totalPares = completadas.reduce((s, t) => s + Number(t.cantidadPares), 0);
  const dias7 = ultimosNDias(7);
  const paresPorDia = dias7.map((f) => completadas.filter((t) => (t.finProceso || "").slice(0, 10) === f).reduce((s, t) => s + Number(t.cantidadPares), 0));

  const semanas = [];
  for (let i = 3; i >= 0; i--) {
    const fin = new Date(); fin.setDate(fin.getDate() - i * 7);
    const inicio = new Date(fin); inicio.setDate(inicio.getDate() - 6);
    const fIni = inicio.toISOString().slice(0, 10), fFin = fin.toISOString().slice(0, 10);
    const pares = completadas.filter((t) => { const f = (t.finProceso || "").slice(0, 10); return f >= fIni && f <= fFin; }).reduce((s, t) => s + Number(t.cantidadPares), 0);
    semanas.push(pares * PRECIO_PAR);
  }

  const pctDificil = Math.round(porcentajeDificilEquidad(w) * 100);
  const tPromFacil = tiempoPromedioPersonal(w, "facil").toFixed(1);
  const tPromDificil = tiempoPromedioPersonal(w, "dificil").toFixed(1);
  const inicial = w.nombre.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  const comparacion = trabajadores.map((x) => {
    const c = tareas.filter((t) => t.trabajadorId === x.id && t.estado === "completado" && (t.finProceso || "").slice(0, 10) >= ultimosNDias(7)[0]);
    return { nombre: x.nombre, pares: c.reduce((s, t) => s + Number(t.cantidadPares), 0) };
  });
  const maxComp = Math.max(...comparacion.map((c) => c.pares), 1);

  return `
    <div class="backrow" data-act="volver-equipo" style="cursor:pointer;">← Volver a Equipo</div>
    <div class="profile-card">
      <div class="avatar">${esc(inicial)}</div>
      <div>
        <div class="pname">${esc(w.nombre)}</div>
        <div class="pspec">${esc(w.especialidad)}</div>
      </div>
    </div>
    <div class="stat-grid">
      <div class="stat-box"><div class="stat-label">Pares totales</div><div class="stat-value">${totalPares}</div></div>
      <div class="stat-box"><div class="stat-label">Ganado total</div><div class="stat-value money">$${(totalPares * PRECIO_PAR).toLocaleString("es-CO")}</div></div>
      <div class="stat-box"><div class="stat-label">% tareas difíciles</div><div class="stat-value">${pctDificil}%</div></div>
      <div class="stat-box"><div class="stat-label">Min. por par (fácil/difícil)</div><div class="stat-value" style="font-size:16px;">${tPromFacil} / ${tPromDificil}</div></div>
    </div>
    <div class="chart-card">
      <div class="chart-title">📦 Pares completados (últimos 7 días)</div>
      ${barChart(paresPorDia, dias7.map(nombreDiaCorto), "#B8793E")}
    </div>
    <div class="chart-card">
      <div class="chart-title">💰 Dinero acumulado (últimas 4 semanas)</div>
      ${barChart(semanas, ["Sem 1", "Sem 2", "Sem 3", "Sem 4"], "#4C6B4F")}
    </div>
    <div class="chart-card">
      <div class="chart-title">⚖️ Comparación con el equipo (pares, 7 días)</div>
      ${comparacion.map((c) => `
        <div class="compare-row">
          <div class="compare-name">${esc(c.nombre)}</div>
          <div class="compare-track"><div class="compare-fill ${c.nombre === w.nombre ? "me" : ""}" style="width:${(c.pares / maxComp) * 100}%"></div></div>
          <div class="compare-val">${c.pares}</div>
        </div>`).join("")}
    </div>
  `;
}

function renderEstadisticasGrupales() {
  const dias7 = ultimosNDias(7);
  const filas = trabajadores.map((w) => {
    const completadas = tareas.filter((t) => t.trabajadorId === w.id && t.estado === "completado" && (t.finProceso || "").slice(0, 10) >= dias7[0]);
    const pares = completadas.reduce((s, t) => s + Number(t.cantidadPares), 0);
    return { nombre: w.nombre, pares, dinero: pares * PRECIO_PAR, pctDificil: Math.round(porcentajeDificilEquidad(w) * 100) };
  });
  const maxPares = Math.max(...filas.map((f) => f.pares), 1);

  return `
    <div class="backrow" data-act="volver-equipo" style="cursor:pointer;">← Volver a Equipo</div>
    <div class="chart-card">
      <div class="chart-title">📦 Pares completados esta semana</div>
      ${filas.map((f) => `
        <div class="compare-row">
          <div class="compare-name">${esc(f.nombre)}</div>
          <div class="compare-track"><div class="compare-fill" style="width:${(f.pares / maxPares) * 100}%"></div></div>
          <div class="compare-val">${f.pares}</div>
        </div>`).join("")}
    </div>
    <div class="chart-card">
      <div class="chart-title">💰 Dinero ganado esta semana</div>
      ${filas.map((f) => `
        <div class="compare-row">
          <div class="compare-name">${esc(f.nombre)}</div>
          <div class="compare-track"><div class="compare-fill" style="width:${(f.dinero / Math.max(...filas.map(x=>x.dinero),1)) * 100}%;background:#4C6B4F;"></div></div>
          <div class="compare-val">$${f.dinero.toLocaleString("es-CO")}</div>
        </div>`).join("")}
    </div>
    <div class="chart-card">
      <div class="chart-title">⚖️ % de tareas difíciles (equidad)</div>
      ${filas.map((f) => `
        <div class="compare-row">
          <div class="compare-name">${esc(f.nombre)}</div>
          <div class="compare-track"><div class="compare-fill" style="width:${f.pctDificil}%;background:#A23B2E;"></div></div>
          <div class="compare-val">${f.pctDificil}%</div>
        </div>`).join("")}
    </div>
  `;
}

// ---------- Lectura de vale por foto (OCR gratuito, sin cuenta) ----------
async function leerValePorFoto(file) {
  if (!file) return;
  const status = document.getElementById("ocr-status");
  status.classList.remove("hidden");
  status.textContent = "📸 Leyendo la imagen, un momento...";

  try {
    const { data } = await Tesseract.recognize(file, "spa", {
      logger: (m) => {
        if (m.status === "recognizing text") {
          status.textContent = `📸 Leyendo... ${Math.round(m.progress * 100)}%`;
        }
      },
    });
    const texto = data.text;

    const orden = texto.match(/ORDEN\s*No\.?\s*(\d+)/i);
    const ref = texto.match(/REF\.?\s*([A-Z0-9\-]+)/i);
    const color = texto.match(/COLOR\s+(.+)/i);
    const cliente = texto.match(/CLIENTE\s+(.+)/i);

    if (orden) document.getElementById("f-orden").value = orden[1];
    if (ref) document.getElementById("f-referencia").value = ref[1];
    if (color) document.getElementById("f-colordetalle").value = color[1].split("\n")[0].trim();
    if (cliente) document.getElementById("f-cliente").value = cliente[1].split("\n")[0].trim();

    status.innerHTML = `✅ Listo. Revisa que los datos queden correctos.<br>
      <span style="font-size:11px;">⚠️ La tabla de tallas no se pudo leer sola — complétala a mano abajo.</span>
      <details style="margin-top:6px;"><summary style="font-size:11px;cursor:pointer;">Ver texto leído completo</summary>
      <pre style="white-space:pre-wrap;font-size:10px;background:#F5F0E5;padding:6px;border-radius:4px;margin-top:4px;">${esc(texto)}</pre></details>`;
  } catch (e) {
    status.textContent = "❌ No se pudo leer la imagen. Completa los datos a mano.";
    console.error(e);
  }
}

// ---------- Manejadores de eventos ----------
function attachHandlers() {
  const toggle = document.getElementById("toggle-form");
  if (toggle) toggle.onclick = () => { showForm = !showForm; render(); };

  const toggleMat = document.getElementById("toggle-materiales");
  if (toggleMat) toggleMat.onclick = () => { showMateriales = !showMateriales; render(); };

  const btnLeerVale = document.getElementById("btn-leer-vale");
  const inputFotoVale = document.getElementById("f-foto-vale");
  if (btnLeerVale && inputFotoVale) {
    btnLeerVale.onclick = () => inputFotoVale.click();
    inputFotoVale.onchange = () => leerValePorFoto(inputFotoVale.files[0]);
  }

  document.querySelectorAll(".f-talla-input").forEach((inp) => {
    inp.oninput = () => {
      let total = 0;
      document.querySelectorAll(".f-talla-input").forEach((i) => { total += Number(i.value || 0); });
      const el = document.getElementById("total-pares-preview");
      if (el) el.textContent = total;
    };
  });

  const saveMaterial = document.getElementById("save-material");
  if (saveMaterial) saveMaterial.onclick = async () => {
    const nombre = document.getElementById("f-nombremat").value.trim();
    if (!nombre) return;
    await colMateriales.add({ nombre, dificultad: document.getElementById("f-dificultadmat").value });
    document.getElementById("f-nombremat").value = "";
  };

  const btnSolicitar = document.getElementById("btn-solicitar-tarea");
  if (btnSolicitar) btnSolicitar.onclick = async () => {
    await colSolicitudes.add({ trabajadorId: workerId, trabajadorNombre: workerName, fecha: today(), atendida: false });
    render();
  };

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
    const cliente = document.getElementById("f-cliente").value.trim();
    const referencia = document.getElementById("f-referencia").value.trim();
    const colorDetalle = document.getElementById("f-colordetalle").value.trim();
    const numeroOrden = document.getElementById("f-orden").value.trim();
    const materialId = document.getElementById("f-material").value;

    const tallas = {};
    let pares = 0;
    document.querySelectorAll(".f-talla-input").forEach((inp) => {
      const v = Number(inp.value || 0);
      if (v > 0) { tallas[inp.dataset.talla] = v; pares += v; }
    });

    if (!cliente || !referencia || pares === 0 || !materialId) {
      alert("Completa cliente, referencia, material y al menos una talla con pares.");
      return;
    }
    const material = materiales.find((m) => m.id === materialId);
    const dificultad = material ? material.dificultad : "facil";
    const urgente = document.getElementById("f-urgente").checked;
    const manualId = document.getElementById("f-trabajador").value;

    let asignadoId = manualId;
    let automatica = false;
    if (!manualId) {
      const elegido = elegirAsignadoAutomatico(pares, dificultad, urgente);
      if (!elegido) { alert("No hay forradores registrados todavía."); return; }
      asignadoId = elegido.id;
      automatica = true;
    }

    await colTareas.add({
      cliente,
      referencia,
      colorDetalle,
      numeroOrden,
      tallas,
      cantidadPares: pares,
      materialId,
      materialNombre: material ? material.nombre : "",
      dificultad,
      urgente,
      trabajadorId: asignadoId,
      fechaEntrega: document.getElementById("f-entrega").value,
      notas: document.getElementById("f-notas").value.trim(),
      estado: "pendiente",
      entregado: false,
      asignacionAutomatica: automatica,
      creado: new Date().toISOString(),
    });

    await colTrabajadores.doc(asignadoId).update({ lastDificultadAsignada: dificultad });

    if (window._solicitudAtenderId) {
      await colSolicitudes.doc(window._solicitudAtenderId).update({ atendida: true });
      window._solicitudAtenderId = null;
      window._preAsignarTrabajador = null;
    }

    showForm = false;
    render();
  };

  const saveTrabajador = document.getElementById("save-trabajador");
  if (saveTrabajador) saveTrabajador.onclick = async () => {
    const nombre = document.getElementById("f-nombretrab").value.trim();
    if (!nombre) return;
    await colTrabajadores.add({
      nombre,
      especialidad: document.getElementById("f-especialidad").value,
      experiencia: document.getElementById("f-experiencia").value === "si",
      fechaRegistro: today(),
      graduado: false,
      rampaExtendidaHasta: null,
      equidadInicio: null,
      lastDificultadAsignada: null,
      ultimaActividadFecha: null,
      duracionesFacil: [],
      duracionesDificil: [],
    });
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
      } else if (act === "del-material") {
        await colMateriales.doc(id).delete();
      } else if (act === "del-tarea") {
        await colTareas.doc(id).delete();
      } else if (act === "del-trabajador") {
        await colTrabajadores.doc(id).delete();
      } else if (act === "reset-pass") {
        const nombre = el.dataset.name;
        const snap = await colCuentas.where("workerId", "==", id).limit(1).get();
        if (snap.empty) {
          alert(nombre + " todavía no ha creado su cuenta en la app, así que no hay nada que restablecer.");
          return;
        }
        const nueva = prompt("Escribe la nueva contraseña para " + nombre + " (mínimo 4 caracteres):");
        if (!nueva) return;
        if (nueva.length < 4) { alert("Debe tener al menos 4 caracteres."); return; }
        const cuentaDoc = snap.docs[0];
        await colCuentas.doc(cuentaDoc.id).update({ password: await hash(nueva) });
        alert("Listo. Dile a " + nombre + " que su nueva contraseña es: " + nueva);
      } else if (act === "graduar") {
        const nombre = el.dataset.name;
        if (!confirm(nombre + " pasará a recibir tareas difíciles sin límite desde ahora. ¿Confirmas?")) return;
        await colTrabajadores.doc(id).update({ graduado: true, equidadInicio: today() });
      } else if (act === "ver-stats") {
        verEstadisticasDe = id;
        verEstadisticasGrupal = false;
        render();
      } else if (act === "ver-stats-grupal") {
        verEstadisticasGrupal = true;
        verEstadisticasDe = null;
        render();
      } else if (act === "volver-equipo") {
        verEstadisticasDe = null;
        verEstadisticasGrupal = false;
        render();
      } else if (act === "marcar-entregado") {
        await colTareas.doc(id).update({ entregado: true, fechaEntregado: new Date().toISOString() });
      } else if (act === "atender-solicitud") {
        const trabId = el.dataset.trabid;
        showForm = true;
        currentTab = "tareas";
        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        const tb = document.querySelector('.tab-btn[data-tab="tareas"]');
        if (tb) tb.classList.add("active");
        window._preAsignarTrabajador = trabId;
        window._solicitudAtenderId = el.dataset.solid;
        render();
      } else if (act === "estado-worker") {
        const nuevoEstado = el.dataset.estado;
        const t = tareas.find((x) => x.id === id);
        const updates = { estado: nuevoEstado };
        if (nuevoEstado === "proceso" && !t.inicioProceso) {
          updates.inicioProceso = new Date().toISOString();
        }
        if (nuevoEstado === "completado") {
          updates.finProceso = new Date().toISOString();
        }
        await colTareas.doc(id).update(updates);

        // Actualizar actividad del forrador
        await colTrabajadores.doc(workerId).update({ ultimaActividadFecha: today() });

        if (nuevoEstado === "completado") {
          await colNotificaciones.add({
            tareaId: id,
            trabajadorNombre: workerName,
            modelo: t ? (t.cliente || t.referencia || "") : "",
            fecha: today(),
            leido: false,
          });
          // Registrar duración real para afinar el promedio personal
          if (t && t.inicioProceso) {
            const minutos = (Date.now() - new Date(t.inicioProceso).getTime()) / 60000;
            const minPorPar = minutos / Number(t.cantidadPares || 1);
            if (minPorPar > 0 && minPorPar < 240) {
              const w = trabajadores.find((x) => x.id === workerId);
              if (w) {
                const campo = t.dificultad === "dificil" ? "duracionesDificil" : "duracionesFacil";
                const arr = (w[campo] || []).concat([minPorPar]).slice(-10);
                await colTrabajadores.doc(workerId).update({ [campo]: arr });
              }
            }
          }
        }
      }
    };
  });
}

// ---------- Arranque ----------
startListeners();
intentarSesionGuardada();
