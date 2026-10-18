/**
 * storage.js
 * ---------------------------------------------------------------------
 * Couche unique d'accès au localStorage. Aucun autre module ne doit
 * appeler `localStorage` directement : cela garde le format des données
 * centralisé et facile à faire évoluer (ex. migration future vers
 * IndexedDB pour de plus gros volumes de fichiers générés).
 * ---------------------------------------------------------------------
 */

const Storage = (() => {

  const KEYS = {
    SETTINGS: "aiBuilder.settings.v1",
    HISTORY: "aiBuilder.history.v1",
  };

  /** Lecture JSON sécurisée avec valeur de repli. */
  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (err) {
      console.warn(`[Storage] Lecture impossible pour "${key}", valeur par défaut utilisée.`, err);
      return fallback;
    }
  }

  /** Écriture JSON sécurisée (gère le quota dépassé). */
  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (err) {
      console.error(`[Storage] Écriture impossible pour "${key}".`, err);
      if (typeof UI !== "undefined") {
        UI.toast("error", "Stockage local plein ou indisponible. Certaines données ne seront pas sauvegardées.");
      }
      return false;
    }
  }

  // ---------------------------------------------------------------
  // Paramètres
  // ---------------------------------------------------------------
  function getSettings(defaults) {
    return readJSON(KEYS.SETTINGS, defaults);
  }

  function saveSettings(settings) {
    return writeJSON(KEYS.SETTINGS, settings);
  }

  // ---------------------------------------------------------------
  // Historique
  // ---------------------------------------------------------------
  function getHistory() {
    return readJSON(KEYS.HISTORY, []);
  }

  function saveHistory(list) {
    return writeJSON(KEYS.HISTORY, list);
  }

  function addHistoryEntry(entry) {
    const list = getHistory();
    list.unshift(entry);
    // On limite l'historique pour éviter de saturer le localStorage.
    const MAX_ENTRIES = 15;
    if (list.length > MAX_ENTRIES) list.length = MAX_ENTRIES;
    saveHistory(list);
    return list;
  }

  function deleteHistoryEntry(id) {
    const list = getHistory().filter((item) => item.id !== id);
    saveHistory(list);
    return list;
  }

  function getHistoryEntry(id) {
    return getHistory().find((item) => item.id === id) || null;
  }

  function clearAll() {
    localStorage.removeItem(KEYS.SETTINGS);
    localStorage.removeItem(KEYS.HISTORY);
  }

  return {
    KEYS,
    getSettings,
    saveSettings,
    getHistory,
    saveHistory,
    addHistoryEntry,
    deleteHistoryEntry,
    getHistoryEntry,
    clearAll,
  };
})();
