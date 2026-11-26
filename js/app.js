/* ==========================================================================
   CONTROLADOR PRINCIPAL DE PLANTA Y MOTOR DE EFECTOS NAVIDEÑOS
   ========================================================================== */

const SnowEngine = {
  canvas: null,
  ctx: null,
  flakes: [],
  animId: null,
  active: false,

  init() {
    this.canvas = document.getElementById("snowCanvas");
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext("2d");
    this.resize();
    window.addEventListener("resize", () => this.resize());
  },

  resize() {
    if (!this.canvas) return;
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  },

  start() {
    if (this.active || !this.canvas) return;
    this.active = true;
    this.resize();
    const count = window.innerWidth < 768 ? 42 : 75;
    this.flakes = Array.from({ length: count }, () => ({
      x: Math.random() * this.canvas.width,
      y: Math.random() * this.canvas.height,
      r: Math.random() * 2.6 + 1.1,
      speedY: Math.random() * 0.9 + 0.45,
      drift: Math.random() * Math.PI * 2,
      opacity: Math.random() * 0.55 + 0.3
    }));
    this.loop();
  },

  stop() {
    this.active = false;
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    if (this.ctx && this.canvas) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  },

  loop() {
    if (!this.active) return;
    const { ctx, canvas, flakes } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < flakes.length; i++) {
      const f = flakes[i];
      f.y += f.speedY;
      f.drift += 0.015;
      f.x += Math.sin(f.drift) * 0.45;

      if (f.y > canvas.height + 6) {
        f.y = -6;
        f.x = Math.random() * canvas.width;
      }
      if (f.x > canvas.width) f.x = 0;
      if (f.x < 0) f.x = canvas.width;

      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${f.opacity})`;
      ctx.fill();
    }

    this.animId = requestAnimationFrame(() => this.loop());
  }
};

const App = {
  state: {
    fechaHoy: Utils.obtenerFechaLocal(),
    turnoIdx: 0,
    filtroTipo: "Fijo",
    personalActivo: [],
    personalTodos: [],
    historialDatos: [],
    asistenciaHoy: {},
    cambiosSinGuardar: false
  },

  init() {
    SnowEngine.init();
    this.state.fechaHoy = Utils.obtenerFechaLocal();

    document.getElementById("fechaAuto").value = this.state.fechaHoy;
    document.getElementById("newFechaIngreso").value = this.state.fechaHoy;

    // Restaurar tema guardado (solo industrial o navidad)
    let savedTheme = localStorage.getItem(CONFIG.STORAGE_KEYS.THEME) || "industrial";
    if (savedTheme !== "industrial" && savedTheme !== "navidad") {
      savedTheme = "industrial";
    }
    this.cambiarTema(savedTheme, true);

    CalendarModule.init(this.state.fechaHoy);

    // 1. Carga instantánea desde caché local (0 ms de espera en planta)
    const cached = ApiService.cargarCacheLocal();
    if (cached.tieneCache) {
      this.state.personalActivo = cached.personal;
      this.state.personalTodos = cached.personalTodos;
      this.state.historialDatos = cached.historial;
      this.sincronizarAsistenciaDelTurno();
      this.renderTodo();
    }

    // 2. Sincronización en vivo con Google Sheets
    this.cargarDatosDesdeSheets();
  },

  cambiarTema(tema, silencioso = false) {
    document.body.setAttribute("data-theme", tema);
    localStorage.setItem(CONFIG.STORAGE_KEYS.THEME, tema);

    const select = document.getElementById("themeSelect");
    if (select) select.value = tema;

    if (tema === "navidad") {
      SnowEngine.start();
      if (!silencioso) Utils.mostrarToast("🎄 Modo Navidad activado", "ok");
    } else {
      SnowEngine.stop();
    }
  },

  getTurnoActual() {
    return CONFIG.TURNOS[this.state.turnoIdx];
  },

  getDraftStorageKey() {
    return `${CONFIG.STORAGE_KEYS.DRAFT_PREFIX}${this.state.fechaHoy}_${this.getTurnoActual()}`;
  },

  guardarBorradorLocal() {
    try {
      localStorage.setItem(this.getDraftStorageKey(), JSON.stringify(this.state.asistenciaHoy));
    } catch (e) {
      console.warn("No se pudo guardar borrador local:", e);
    }
  },

  cargarBorradorLocal() {
    try {
      return JSON.parse(localStorage.getItem(this.getDraftStorageKey()) || "{}");
    } catch (e) {
      return {};
    }
  },

  limpiarBorradorLocal() {
    localStorage.removeItem(this.getDraftStorageKey());
  },

  cambiarFecha(nuevaFecha) {
    if (!nuevaFecha) return;
    this.state.fechaHoy = nuevaFecha;
    this.sincronizarAsistenciaDelTurno();
    this.renderLista();
    this.renderEspejoPA();
  },

  sincronizarAsistenciaDelTurno() {
    this.state.asistenciaHoy = {};
    this.state.cambiosSinGuardar = false;
    const turno = this.getTurnoActual();
    const paNubeMap = {};

    // 1. Cargar registros oficiales guardados en Google Sheets
    this.state.historialDatos.forEach(h => {
      if (h.fecha === this.state.fechaHoy && h.turno === turno) {
        const estadoReal = h.estado === "Sin marcar" ? "" : h.estado;
        this.state.asistenciaHoy[h.ci] = {
          estado: estadoReal,
          comentario: h.comentario || "",
          sincronizadoPA: Boolean(h.sincronizadoPA),
          enNube: Boolean(estadoReal)
        };
        if (h.sincronizadoPA) {
          paNubeMap[h.ci] = true;
        }
      }
    });

    // Sincroniza Espejo PA local con lo que ya existe en Sheets para ese día y turno
    if (Object.keys(paNubeMap).length > 0) {
      const paLocal = this.getPACheckedMap();
      localStorage.setItem(this.getPAStorageKey(), JSON.stringify({ ...paLocal, ...paNubeMap }));
    }

    // 2. Superponer borrador local si quedó trabajo pendiente sin subir a Sheets
    const borrador = this.cargarBorradorLocal();
    Object.keys(borrador).forEach(ci => {
      const item = borrador[ci];
      if (item && (item.estado || item.comentario)) {
        this.state.asistenciaHoy[ci] = {
          estado: item.estado || "",
          comentario: item.comentario || "",
          sincronizadoPA: this.state.asistenciaHoy[ci]?.sincronizadoPA || false,
          enNube: false
        };
        this.state.cambiosSinGuardar = true;
      }
    });
  },

  ciclarTurno() {
    if (this.state.cambiosSinGuardar) {
      Utils.mostrarToast("💾 Borrador guardado localmente en el turno anterior", "info");
    }
    this.state.turnoIdx = (this.state.turnoIdx + 1) % CONFIG.TURNOS.length;
    document.getElementById("textoTurno").textContent = this.getTurnoActual();
    this.sincronizarAsistenciaDelTurno();
    this.renderLista();
    this.renderEspejoPA();
  },

  filtrarTipo(tipo) {
    this.state.filtroTipo = tipo;
    document.getElementById("btnFijos").classList.toggle("active", tipo === "Fijo");
    document.getElementById("btnEventuales").classList.toggle("active", tipo === "Eventual");
    this.renderLista();
  },

  cambiarVista(vista, btn) {
    document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    document.getElementById(`view-${vista}`).classList.add("active");
    if (btn) btn.classList.add("active");

    document.getElementById("headerControls").style.display = vista === "lista" ? "grid" : "none";
    document.getElementById("saveBar").style.display = vista === "lista" ? "block" : "none";

    if (vista === "espejo") this.renderEspejoPA();
    if (vista === "historial") CalendarModule.render();
  },

  async cargarDatosDesdeSheets() {
    const statusEl = document.getElementById("syncStatus");
    if (statusEl) statusEl.textContent = "⏳ Sincronizando...";

    try {
      const data = await ApiService.fetchInit();
      this.state.personalActivo = data.personal;
      this.state.personalTodos = data.personalTodos;
      this.state.historialDatos = data.historial;

      this.sincronizarAsistenciaDelTurno();
      if (statusEl) statusEl.textContent = "● Sincronizado";
      this.renderTodo();
    } catch (e) {
      if (statusEl) statusEl.textContent = "⚠️ Modo offline (caché)";
      Utils.mostrarToast("Sin conexión a Sheets. Usando copia local.", "fail");
    }
  },

  renderTodo() {
    this.renderLista();
    this.renderEspejoPA();
    CalendarModule.render();
  },

  actualizarKPIs(filtradosTipo) {
    const total = filtradosTipo.length;
    let asistio = 0;
    let falto = 0;

    filtradosTipo.forEach(op => {
      const reg = this.state.asistenciaHoy[op.ci];
      if (reg?.estado === "Asistió") asistio++;
      if (reg?.estado === "Faltó") falto++;
    });

    const marcados = asistio + falto;
    const pendientes = total - marcados;
    const pct = total > 0 ? Math.round((marcados / total) * 100) : 0;

    document.getElementById("kpiTotal").textContent = total;
    document.getElementById("kpiAsistio").textContent = asistio;
    document.getElementById("kpiFalto").textContent = falto;
    document.getElementById("kpiPendiente").textContent = pendientes;
    document.getElementById("kpiProgressBar").style.width = `${pct}%`;
  },

  renderLista() {
    const cont = document.getElementById("listaOperadores");
    const query = (document.getElementById("buscarOperador")?.value || "").trim().toLowerCase();

    const porContrato = this.state.personalActivo
      .filter(p => p.tipo === this.state.filtroTipo)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

    this.actualizarKPIs(porContrato);

    const visibles = porContrato.filter(op =>
      !query || op.nombre.toLowerCase().includes(query) || op.ci.includes(query)
    );

    document.getElementById("contadorVista").textContent =
      `${this.state.filtroTipo}s: ${visibles.length} de ${porContrato.length}`;

    if (visibles.length === 0) {
      cont.innerHTML = `<div class="status-banner">No se encontraron operadores en esta vista.</div>`;
      return;
    }

    cont.innerHTML = visibles.map(op => {
      const reg = this.state.asistenciaHoy[op.ci] || { estado: "", comentario: "", enNube: false };
      const cardState = reg.estado === "Asistió"
        ? "state-present"
        : (reg.estado === "Faltó" ? "state-absent" : "");
      const hasCommentClass = (reg.comentario || "").trim().length > 0 ? "has-comment" : "";

      let syncBadge = "";
      if (reg.estado) {
        syncBadge = reg.enNube
          ? `<span class="cloud-tag saved">☁ Guardado</span>`
          : `<span class="cloud-tag draft">● Sin subir</span>`;
      }

      return `
        <div class="op-card ${cardState} ${hasCommentClass}">
          <div class="op-header">
            <div class="op-name">${Utils.escapeHTML(op.nombre)}</div>
            <div class="op-meta-right">
              <span class="op-ci">CI: ${Utils.escapeHTML(op.ci)}</span>
              ${syncBadge}
            </div>
          </div>
          <div class="check-row">
            <button type="button" class="chk-btn present ${reg.estado === "Asistió" ? "selected" : ""}"
              onclick="App.marcarAsistencia('${op.ci}', 'Asistió')">✔ Asistió</button>
            <button type="button" class="chk-btn absent ${reg.estado === "Faltó" ? "selected" : ""}"
              onclick="App.marcarAsistencia('${op.ci}', 'Faltó')">✖ Faltó</button>
          </div>
          <input type="text" class="comment-input"
            placeholder="Justificación / novedad (permiso, vacación, retraso...)"
            value="${Utils.escapeHTML(reg.comentario)}"
            oninput="App.guardarComentario('${op.ci}', this.value)" />
        </div>
      `;
    }).join("");
  },

  marcarAsistencia(ci, estado) {
    if (!this.state.asistenciaHoy[ci]) {
      this.state.asistenciaHoy[ci] = { estado: "", comentario: "", enNube: false };
    }
    this.state.asistenciaHoy[ci].estado =
      (this.state.asistenciaHoy[ci].estado === estado) ? "" : estado;
    this.state.asistenciaHoy[ci].enNube = false;
    this.state.cambiosSinGuardar = true;
    this.guardarBorradorLocal();
    this.renderLista();
  },

  guardarComentario(ci, texto) {
    if (!this.state.asistenciaHoy[ci]) {
      this.state.asistenciaHoy[ci] = { estado: "", comentario: "", enNube: false };
    }
    this.state.asistenciaHoy[ci].comentario = texto;
    this.state.asistenciaHoy[ci].enNube = false;
    this.state.cambiosSinGuardar = true;
    this.guardarBorradorLocal();
  },

  /* ========================================================================
     PANTALLA 2: MODO ESPEJO POWER APPS
     ======================================================================== */
  getPAStorageKey() {
    return `${CONFIG.STORAGE_KEYS.PA_PREFIX}${this.state.fechaHoy}_${this.getTurnoActual()}`;
  },

  getPACheckedMap() {
    try {
      return JSON.parse(localStorage.getItem(this.getPAStorageKey()) || "{}");
    } catch (e) {
      return {};
    }
  },

  async togglePAChecked(ci) {
    const map = this.getPACheckedMap();
    const nuevoEstadoPA = !map[ci];
    map[ci] = nuevoEstadoPA;
    localStorage.setItem(this.getPAStorageKey(), JSON.stringify(map));

    if (this.state.asistenciaHoy[ci]) {
      this.state.asistenciaHoy[ci].sincronizadoPA = nuevoEstadoPA;
    }
    this.renderEspejoPA();

    const op = this.state.personalActivo.find(p => p.ci === ci);
    if (!op) return;

    const reg = this.state.asistenciaHoy[ci] || { estado: "", comentario: "" };
    try {
      await ApiService.postAction({
        action: "sync_pa",
        fecha: this.state.fechaHoy,
        turno: this.getTurnoActual(),
        ci: op.ci,
        nombre: op.nombre,
        tipo: op.tipo,
        estado: reg.estado || "Sin marcar",
        comentario: (reg.comentario || "").trim(),
        sincronizadoPA: nuevoEstadoPA
      });
    } catch (e) {
      Utils.mostrarToast("⚠️ PA guardado solo local (sin red)", "fail");
    }
  },

  copiarCI(ci) {
    navigator.clipboard.writeText(ci);
    Utils.mostrarToast(`📋 CI ${ci} copiado al portapapeles`, "ok");
  },

  renderEspejoPA() {
    const cont = document.getElementById("listaEspejoPA");
    if (!cont) return;

    const paMap = this.getPACheckedMap();
    const query = (document.getElementById("buscarPA")?.value || "").trim().toLowerCase();
    const filtroEstado = document.getElementById("filtroEstadoPA")?.value || "TODOS";

    const todosAZ = [...this.state.personalActivo].sort((a, b) =>
      a.nombre.localeCompare(b.nombre, "es")
    );

    let cargados = 0;
    todosAZ.forEach(op => { if (paMap[op.ci]) cargados++; });

    const total = todosAZ.length;
    const pct = total > 0 ? Math.round((cargados / total) * 100) : 0;

    document.getElementById("contadorPA").textContent = `${cargados} / ${total}`;
    document.getElementById("paProgressBar").style.width = `${pct}%`;

    const filtrados = todosAZ.filter(op => {
      const isChecked = !!paMap[op.ci];
      const reg = this.state.asistenciaHoy[op.ci];
      const estado = reg?.estado || "";

      const matchQuery = !query || op.nombre.toLowerCase().includes(query) || op.ci.includes(query);
      if (!matchQuery) return false;

      if (filtroEstado === "PENDIENTES") return !isChecked;
      if (filtroEstado === "ASISTIO") return estado === "Asistió";
      if (filtroEstado === "FALTO") return estado === "Faltó";
      return true;
    });

    if (filtrados.length === 0) {
      cont.innerHTML = `<div class="status-banner">Sin operadores en este filtro de Espejo PA.</div>`;
      return;
    }

    cont.innerHTML = filtrados.map(op => {
      const isChecked = !!paMap[op.ci];
      const reg = this.state.asistenciaHoy[op.ci];
      const estado = reg?.estado || "Sin marcar";

      let badgeClass = "badge-warn";
      if (estado === "Asistió") badgeClass = "badge-ok";
      if (estado === "Faltó") badgeClass = "badge-fail";

      return `
        <div class="op-card ${isChecked ? "pa-checked" : ""}">
          <div class="pa-row">
            <div>
              <div class="op-name">${Utils.escapeHTML(op.nombre)}</div>
              <div class="pa-meta">
                <span class="op-ci">CI: ${Utils.escapeHTML(op.ci)}</span>
                <span class="badge-mini ${badgeClass}">${estado}</span>
              </div>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
              <button type="button" class="btn-copy" onclick="App.copiarCI('${op.ci}')">Copiar CI</button>
              <label class="pa-chk-label">
                <input type="checkbox" ${isChecked ? "checked" : ""} onchange="App.togglePAChecked('${op.ci}')" />
                PA
              </label>
            </div>
          </div>
        </div>
      `;
    }).join("");
  },

  /* ========================================================================
     GUARDADO EN GOOGLE SHEETS Y GESTIÓN DE ALTAS / BAJAS
     ======================================================================== */
  async registrarAsistencia() {
    const turno = this.getTurnoActual();
    const paMap = this.getPACheckedMap();
    const registros = [];

    this.state.personalActivo.forEach(op => {
      const reg = this.state.asistenciaHoy[op.ci];
      if (reg && reg.estado) {
        registros.push({
          ci: op.ci,
          nombre: op.nombre,
          tipo: op.tipo,
          estado: reg.estado,
          comentario: (reg.comentario || "").trim(),
          sincronizadoPA: Boolean(paMap[op.ci] || reg.sincronizadoPA)
        });
      }
    });

    if (registros.length === 0) {
      Utils.mostrarToast("Marca al menos un operador antes de guardar.", "fail");
      return;
    }

    const btn = document.getElementById("btnGuardarSheets");
    btn.textContent = "⏳ GUARDANDO EN SHEETS...";
    btn.disabled = true;

    try {
      const data = await ApiService.postAction({
        action: "registrar_asistencia",
        fecha: this.state.fechaHoy,
        turno: turno,
        registros: registros
      });

      if (data.status === "ok") {
        this.state.cambiosSinGuardar = false;
        this.limpiarBorradorLocal();
        Utils.mostrarToast(`✅ ${registros.length} registros guardados (${turno})`, "ok");
        await this.cargarDatosDesdeSheets();
      } else {
        Utils.mostrarToast(`Error: ${data.message}`, "fail");
      }
    } catch (e) {
      Utils.mostrarToast("Error de red al conectar con Google Sheets.", "fail");
    } finally {
      btn.textContent = "💾 REGISTRAR EN GOOGLE SHEETS";
      btn.disabled = false;
    }
  },

  abrirModal(modo) {
    document.getElementById("modalBackdrop").classList.add("open");
    document.getElementById("modalAddContent").style.display = modo === "add" ? "block" : "none";
    document.getElementById("modalDelContent").style.display = modo === "del" ? "block" : "none";

    if (modo === "add") {
      this.toggleFechaIngreso();
    } else {
      const sel = document.getElementById("selectBajaCI");
      sel.innerHTML = [...this.state.personalActivo]
        .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))
        .map(p => `<option value="${p.ci}">${Utils.escapeHTML(p.nombre)} (CI: ${p.ci} - ${p.tipo})</option>`)
        .join("");
    }
  },

  cerrarModal() {
    document.getElementById("modalBackdrop").classList.remove("open");
  },

  toggleFechaIngreso() {
    const tipo = document.getElementById("newTipo").value;
    document.getElementById("groupFechaIngreso").style.display = tipo === "Eventual" ? "block" : "none";
  },

  async guardarNuevoOperador() {
    const ci = document.getElementById("newCI").value.trim();
    const nombre = document.getElementById("newNombre").value.trim();
    const tipo = document.getElementById("newTipo").value;
    const fechaIngreso = document.getElementById("newFechaIngreso").value;

    if (!ci || !nombre) {
      Utils.mostrarToast("Completa el CI y el Nombre Completo.", "fail");
      return;
    }

    this.cerrarModal();
    Utils.mostrarToast("⏳ Registrando alta en Sheets...", "info");

    try {
      const res = await ApiService.postAction({
        action: "agregar_personal",
        ci,
        nombre,
        tipo,
        fechaIngreso
      });
      if (res.status === "ok") {
        document.getElementById("newCI").value = "";
        document.getElementById("newNombre").value = "";
        Utils.mostrarToast(`✅ ${res.message}`, "ok");
        await this.cargarDatosDesdeSheets();
      } else {
        Utils.mostrarToast(res.message || "No se pudo agregar", "fail");
      }
    } catch (e) {
      Utils.mostrarToast("Error de red al guardar operador.", "fail");
    }
  },

  async confirmarBaja() {
    const ci = document.getElementById("selectBajaCI").value;
    if (!ci) return;

    this.cerrarModal();
    Utils.mostrarToast("⏳ Procesando baja lógica...", "info");

    try {
      const res = await ApiService.postAction({ action: "baja_personal", ci });
      if (res.status === "ok") {
        Utils.mostrarToast("✅ Operador dado de baja (historial intacto)", "ok");
        await this.cargarDatosDesdeSheets();
      } else {
        Utils.mostrarToast(res.message || "Error al dar de baja", "fail");
      }
    } catch (e) {
      Utils.mostrarToast("Error de red al dar de baja.", "fail");
    }
  }
};

window.addEventListener("DOMContentLoaded", () => App.init());