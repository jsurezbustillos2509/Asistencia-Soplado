/* ==========================================================================
   CAPA DE DATOS Y SINCRONIZACIÓN CON GOOGLE SHEETS (CON CACHÉ LOCAL)
   ========================================================================== */

const ApiService = {
  /**
   * Recupera instantáneamente los últimos datos guardados en el dispositivo
   */
  cargarCacheLocal() {
    try {
      const personal = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.CACHE_PERSONAL) || "[]");
      const personalTodos = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.CACHE_TODOS) || "[]");
      const historial = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEYS.CACHE_HISTORIAL) || "[]");
      return { personal, personalTodos, historial, tieneCache: personal.length > 0 };
    } catch (e) {
      return { personal: [], personalTodos: [], historial: [], tieneCache: false };
    }
  },

  /**
   * Persiste una copia fresca de la base de datos en LocalStorage
   */
  guardarCacheLocal({ personal, personalTodos, historial }) {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEYS.CACHE_PERSONAL, JSON.stringify(personal));
      localStorage.setItem(CONFIG.STORAGE_KEYS.CACHE_TODOS, JSON.stringify(personalTodos));
      localStorage.setItem(CONFIG.STORAGE_KEYS.CACHE_HISTORIAL, JSON.stringify(historial));
    } catch (e) {
      console.warn("No se pudo actualizar caché local:", e);
    }
  },

  /**
   * Consulta inicial a Google Apps Script y normalización de fechas
   */
  async fetchInit() {
    const res = await fetch(`${CONFIG.API_URL}?action=init`, { cache: "no-store" });
    const data = await res.json();

    if (data.status !== "ok") {
      throw new Error(data.message || "Error al leer Google Sheets");
    }

    const personal = (data.personal || []).map(p => ({
      ...p,
      ci: String(p.ci).trim(),
      nombre: String(p.nombre).trim()
    }));

    const personalTodos = (data.personalTodos || personal).map(p => ({
      ...p,
      ci: String(p.ci).trim(),
      nombre: String(p.nombre).trim()
    }));

    const historial = (data.historial || []).map(h => ({
      ...h,
      fecha: Utils.normalizarFecha(h.fecha),
      ci: String(h.ci).trim(),
      nombre: String(h.nombre).trim()
    }));

    const payloadNormalizado = { personal, personalTodos, historial };
    this.guardarCacheLocal(payloadNormalizado);
    return payloadNormalizado;
  },

  /**
   * Envía operaciones de escritura (asistencia, alta, baja) sin preflight CORS
   */
  async postAction(payload) {
    const res = await fetch(CONFIG.API_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return await res.json();
  }
};