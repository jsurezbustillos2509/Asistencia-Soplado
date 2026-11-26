/* ==========================================================================
   CONFIGURACIÓN GLOBAL Y UTILIDADES DE INGENIERÍA
   ========================================================================== */

const CONFIG = {
  API_URL: "https://script.google.com/macros/s/AKfycbxs90vAT61uyqx7-p_WKWCUrRlbhihsevGnUDPKU52f6abd1aU8WfS-N7d8RznLvb8d/exec",
  TURNOS: ["Turno 1", "Turno 2", "Turno 3"],
  STORAGE_KEYS: {
    THEME: "planta_app_theme_v2",
    CACHE_PERSONAL: "planta_cache_personal_v2",
    CACHE_TODOS: "planta_cache_todos_v2",
    CACHE_HISTORIAL: "planta_cache_historial_v2",
    PA_PREFIX: "planta_pa_checked_",
    DRAFT_PREFIX: "planta_draft_v2_"
  }
};

const Utils = {
  /**
   * Devuelve la fecha local exacta del dispositivo en formato YYYY-MM-DD
   */
  obtenerFechaLocal() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  },

  /**
   * Normaliza cualquier formato de fecha proveniente de Sheets (YYYY-MM-DD o DD/MM/YYYY)
   */
  normalizarFecha(raw) {
    if (!raw) return "";
    const str = String(raw).trim();
    const dmy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) {
      return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    }
    return str.slice(0, 10);
  },

  /**
   * Escapa caracteres especiales para evitar rupturas en atributos HTML
   */
  escapeHTML(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },

  /**
   * Muestra notificaciones flotantes no intrusivas (reemplaza alert() nativo)
   */
  mostrarToast(mensaje, tipo = "info") {
    const container = document.getElementById("toastContainer");
    if (!container) return;

    const toast = document.createElement("div");
    toast.className = `toast ${tipo}`;
    toast.textContent = mensaje;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-8px)";
      toast.style.transition = "all 0.2s ease";
      setTimeout(() => toast.remove(), 220);
    }, 3200);
  }
};