/* ==========================================================================
   MÓDULO DE CALENDARIO INTERACTIVO Y AUDITORÍA DE AUSENTISMO (MES RR.HH.)
   ========================================================================== */

const CalendarModule = {
  mesActual: "",          // Formato YYYY-MM
  fechaSeleccionada: "",  // Formato YYYY-MM-DD
  filtroTurno: "TODOS",   // "TODOS" | "Turno 1" | "Turno 2" | "Turno 3"

  MESES_ES: [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
  ],

  init(fechaHoy) {
    this.fechaSeleccionada = fechaHoy;
    this.mesActual = fechaHoy.slice(0, 7);
    const picker = document.getElementById("filtroMes");
    if (picker) picker.value = this.mesActual;
  },

  cambiarMes(delta) {
    const [yearStr, monthStr] = this.mesActual.split("-");
    const dateObj = new Date(Number(yearStr), Number(monthStr) - 1 + delta, 1);
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, "0");
    this.mesActual = `${y}-${m}`;

    const picker = document.getElementById("filtroMes");
    if (picker) picker.value = this.mesActual;

    // Si cambiamos de mes, seleccionamos el día 01 (o hoy si volvemos al mes actual)
    if (App.state.fechaHoy.startsWith(this.mesActual)) {
      this.fechaSeleccionada = App.state.fechaHoy;
    } else {
      this.fechaSeleccionada = `${this.mesActual}-01`;
    }

    this.render();
  },

  seleccionarMesInput(ym) {
    if (!ym) return;
    this.mesActual = ym;
    this.fechaSeleccionada = App.state.fechaHoy.startsWith(ym)
      ? App.state.fechaHoy
      : `${ym}-01`;
    this.render();
  },

  seleccionarDia(fechaISO) {
    this.fechaSeleccionada = fechaISO;
    this.renderCalendario();
    this.renderDetalleDia();
  },

  setFiltroTurno(turno, btnEl) {
    this.filtroTurno = turno;
    document.querySelectorAll("#calShiftTabs .tab-pill").forEach(b => b.classList.remove("active"));
    if (btnEl) btnEl.classList.add("active");
    this.renderDetalleDia();
  },

  render() {
    this.renderCalendario();
    this.renderDetalleDia();
  },

  renderCalendario() {
    const grid = document.getElementById("calGrid");
    const titulo = document.getElementById("calMesTitulo");
    if (!grid || !titulo) return;

    const [yearStr, monthStr] = this.mesActual.split("-");
    const year = Number(yearStr);
    const monthIdx = Number(monthStr) - 1;

    titulo.textContent = `${this.MESES_ES[monthIdx]} ${year}`;

    // Indexar eventos del mes para pintar indicadores visuales en cada día
    const resumenPorDia = {};
    App.state.historialDatos.forEach(h => {
      if (!h.fecha.startsWith(this.mesActual)) return;
      if (!resumenPorDia[h.fecha]) {
        resumenPorDia[h.fecha] = { tieneRegistros: false, tieneFaltas: false };
      }
      resumenPorDia[h.fecha].tieneRegistros = true;
      if (h.estado === "Faltó") {
        resumenPorDia[h.fecha].tieneFaltas = true;
      }
    });

    // Calcular día de la semana del día 1 (0=Lunes ... 6=Domingo)
    const primerDiaSemana = (new Date(year, monthIdx, 1).getDay() + 6) % 7;
    const diasEnMes = new Date(year, monthIdx + 1, 0).getDate();

    let html = "";

    // Celdas vacías iniciales
    for (let i = 0; i < primerDiaSemana; i++) {
      html += `<div class="cal-day empty"></div>`;
    }

    // Días del mes
    for (let dia = 1; dia <= diasEnMes; dia++) {
      const diaPad = String(dia).padStart(2, "0");
      const fechaISO = `${this.mesActual}-${diaPad}`;
      const info = resumenPorDia[fechaISO];

      const clases = ["cal-day"];
      if (fechaISO === App.state.fechaHoy) clases.push("today");
      if (fechaISO === this.fechaSeleccionada) clases.push("active");

      let dotsHtml = "";
      if (info) {
        if (info.tieneRegistros) dotsHtml += `<span class="dot ok"></span>`;
        if (info.tieneFaltas) dotsHtml += `<span class="dot fail"></span>`;
      }

      html += `
        <button type="button" class="${clases.join(" ")}" onclick="CalendarModule.seleccionarDia('${fechaISO}')">
          <span>${dia}</span>
          <div class="cal-dots">${dotsHtml}</div>
        </button>
      `;
    }

    grid.innerHTML = html;
  },

  renderDetalleDia() {
    const cont = document.getElementById("listaDetalleDia");
    const tituloFecha = document.getElementById("fechaSeleccionadaTitulo");
    const pillsCont = document.getElementById("resumenDiaPills");
    if (!cont || !tituloFecha) return;

    tituloFecha.textContent = this.fechaSeleccionada;

    // 1. Filtrar registros de Google Sheets correspondientes al día seleccionado
    let registrosDia = App.state.historialDatos.filter(h => h.fecha === this.fechaSeleccionada);
    if (this.filtroTurno !== "TODOS") {
      registrosDia = registrosDia.filter(h => h.turno === this.filtroTurno);
    }

    // 2. Construir lista consolidada: registros existentes + personal activo "Sin registro"
    const filas = registrosDia.map(r => ({
      ci: r.ci,
      nombre: r.nombre,
      tipo: r.tipo,
      turno: r.turno,
      estado: r.estado,
      comentario: r.comentario || ""
    }));

    const cisRegistrados = new Set(registrosDia.map(r => r.ci));

    App.state.personalActivo.forEach(op => {
      if (!cisRegistrados.has(op.ci)) {
        filas.push({
          ci: op.ci,
          nombre: op.nombre,
          tipo: op.tipo,
          turno: this.filtroTurno === "TODOS" ? "Sin turno" : this.filtroTurno,
          estado: "Sin registro",
          comentario: ""
        });
      }
    });

    // 3. Calcular contadores reales del día/filtro de turno antes de buscar por texto
    const totalAsistio = filas.filter(f => f.estado === "Asistió").length;
    const totalFalto = filas.filter(f => f.estado === "Faltó").length;
    const totalSinReg = filas.filter(f => f.estado === "Sin registro").length;

    if (pillsCont) {
      pillsCont.innerHTML = `
        <span class="badge-mini badge-ok">✔ ${totalAsistio}</span>
        <span class="badge-mini badge-fail">✖ ${totalFalto}</span>
        <span class="badge-mini badge-warn">⚠️ ${totalSinReg}</span>
      `;
    }

    // 4. Aplicar búsqueda de texto y filtro de estado ("Faltó", "Asistió", "Sin registro")
    const query = (document.getElementById("buscarHistorial")?.value || "").trim().toLowerCase();
    const filtroEstado = document.getElementById("filtroEstadoDia")?.value || "TODOS";

    const prioridadEstado = { "Faltó": 1, "Asistió": 2, "Sin registro": 3 };

    const filtradas = filas
      .filter(f => {
        const coincideTexto = !query || f.nombre.toLowerCase().includes(query) || f.ci.includes(query);
        const coincideEstado = filtroEstado === "TODOS" || f.estado === filtroEstado;
        return coincideTexto && coincideEstado;
      })
      .sort((a, b) => {
        const pDiff = (prioridadEstado[a.estado] || 9) - (prioridadEstado[b.estado] || 9);
        if (pDiff !== 0) return pDiff;
        return a.nombre.localeCompare(b.nombre, "es");
      });

    if (filtradas.length === 0) {
      cont.innerHTML = `<div class="status-banner">No hay operadores que coincidan con el filtro aplicado.</div>`;
      return;
    }

    cont.innerHTML = filtradas.map(item => {
      let rowClass = "is-unrecorded";
      let badgeClass = "badge-warn";
      let icon = "⚠️";

      if (item.estado === "Asistió") {
        rowClass = "is-present";
        badgeClass = "badge-ok";
        icon = "✔";
      } else if (item.estado === "Faltó") {
        rowClass = "is-absent";
        badgeClass = "badge-fail";
        icon = "✖";
      }

      return `
        <div class="audit-row ${rowClass}">
          <div>
            <div class="audit-person-name">${Utils.escapeHTML(item.nombre)}</div>
            <div class="audit-person-meta">CI: ${Utils.escapeHTML(item.ci)} • ${Utils.escapeHTML(item.tipo)} • <strong>${Utils.escapeHTML(item.turno)}</strong></div>
            ${item.comentario ? `<div class="audit-comment">“${Utils.escapeHTML(item.comentario)}”</div>` : ""}
          </div>
          <div class="audit-badges">
            <span class="badge-mini ${badgeClass}">${icon} ${item.estado}</span>
          </div>
        </div>
      `;
    }).join("");
  }
};