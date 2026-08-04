/**
 * settings.js
 * ---------------------------------------------------------------------
 * Gère l'état des paramètres (persisté via storage.js), le rendu du
 * panneau "Paramètres" et sa synchronisation bidirectionnelle avec
 * l'interface. Toute modification est enregistrée automatiquement.
 * ---------------------------------------------------------------------
 */

const Settings = (() => {

  const DEFAULTS = {
    theme: "dark",
    temperature: 0.7,
    maxTokens: 4096,
    engines: AIManager.buildDefaultEngineSettings(),
  };

  let state = null;

  function load() {
    const stored = Storage.getSettings(null);
    state = mergeWithDefaults(stored);
    return state;
  }

  /** Fusionne les paramètres stockés avec les valeurs par défaut,
   *  pour rester compatible si de nouveaux moteurs sont ajoutés plus tard. */
  function mergeWithDefaults(stored) {
    if (!stored) return structuredClone(DEFAULTS);

    const merged = {
      ...structuredClone(DEFAULTS),
      ...stored,
      engines: { ...structuredClone(DEFAULTS.engines), ...(stored.engines || {}) },
    };
    return merged;
  }

  function get() {
    return state;
  }

  function persist() {
    Storage.saveSettings(state);
  }

  function update(partial) {
    state = { ...state, ...partial };
    persist();
  }

  function updateEngine(engineId, partial) {
    state.engines[engineId] = { ...state.engines[engineId], ...partial };
    persist();
    renderEngineChips();
  }

  function getActiveEngines() {
    return AIManager.getAll().filter((engine) => state.engines[engine.id]?.active);
  }

  // -----------------------------------------------------------------
  // Rendu UI — panneau Paramètres
  // -----------------------------------------------------------------
  function renderSettingsPanel() {
    const container = document.getElementById("engine-settings-list");
    if (!container) return;
    container.innerHTML = "";

    AIManager.getAll().forEach((engine) => {
      const cfg = state.engines[engine.id];
      const card = document.createElement("div");
      card.className = "engine-card" + (cfg.active ? " is-active" : "");
      card.dataset.engineId = engine.id;

      card.innerHTML = `
        <div class="engine-card__head">
          <span class="engine-card__name">
            <span class="engine-card__dot"></span>${engine.label}
          </span>
          <label class="switch">
            <input type="checkbox" class="engine-toggle" ${cfg.active ? "checked" : ""}>
            <span class="switch__track"><span class="switch__thumb"></span></span>
          </label>
        </div>
        <div class="engine-card__body">
          <div class="field">
            <label>Clé API (locale uniquement)</label>
            <input type="password" class="engine-api-key" placeholder="Non renseignée" value="${escapeAttr(cfg.apiKey)}">
            <span class="engine-card__key-name">GitHub Secret recommandé : ${engine.secretName}</span>
          </div>
          <div class="field">
            <label>Modèle</label>
            <input type="text" class="engine-model" list="models-${engine.id}" value="${escapeAttr(cfg.model)}">
            <datalist id="models-${engine.id}">
              ${engine.modelOptions.map((m) => `<option value="${escapeAttr(m)}"></option>`).join("")}
            </datalist>
          </div>
        </div>
      `;

      card.querySelector(".engine-toggle").addEventListener("change", (e) => {
        updateEngine(engine.id, { active: e.target.checked });
        card.classList.toggle("is-active", e.target.checked);
      });
      card.querySelector(".engine-api-key").addEventListener("input", (e) => {
        updateEngine(engine.id, { apiKey: e.target.value });
      });
      card.querySelector(".engine-model").addEventListener("change", (e) => {
        updateEngine(engine.id, { model: e.target.value || engine.defaultModel });
      });

      container.appendChild(card);
    });
  }

  function renderEngineChips() {
    const container = document.getElementById("active-engines-preview");
    if (!container) return;
    container.innerHTML = "";

    AIManager.getAll().forEach((engine) => {
      const active = !!state.engines[engine.id]?.active;
      const chip = document.createElement("span");
      chip.className = "engine-chip" + (active ? " is-on" : "");
      chip.innerHTML = `<span class="engine-chip__dot"></span>${engine.label}`;
      container.appendChild(chip);
    });
  }

  function bindGlobalControls() {
    const tempInput = document.getElementById("setting-temperature");
    const tempValue = document.getElementById("temperature-value");
    tempInput.value = state.temperature;
    tempValue.textContent = state.temperature.toFixed(2);
    tempInput.addEventListener("input", (e) => {
      const val = parseFloat(e.target.value);
      tempValue.textContent = val.toFixed(2);
      update({ temperature: val });
    });

    const maxTokensInput = document.getElementById("setting-max-tokens");
    maxTokensInput.value = state.maxTokens;
    maxTokensInput.addEventListener("change", (e) => {
      const val = Math.max(256, parseInt(e.target.value, 10) || DEFAULTS.maxTokens);
      e.target.value = val;
      update({ maxTokens: val });
    });

    const themeToggle = document.getElementById("theme-toggle");
    themeToggle.checked = state.theme === "light";
    applyTheme(state.theme);
    themeToggle.addEventListener("change", (e) => {
      const theme = e.target.checked ? "light" : "dark";
      applyTheme(theme);
      update({ theme });
    });

    document.getElementById("btn-reset-settings").addEventListener("click", () => {
      if (!confirm("Réinitialiser tous les paramètres (clés API incluses) ?")) return;
      state = structuredClone(DEFAULTS);
      persist();
      renderSettingsPanel();
      renderEngineChips();
      bindGlobalControls();
      UI.toast("success", "Paramètres réinitialisés.");
    });

    document.getElementById("btn-export-settings").addEventListener("click", () => {
      const exportable = structuredClone(state);
      // On n'exporte jamais les clés API en clair dans un fichier partageable.
      Object.keys(exportable.engines).forEach((id) => {
        exportable.engines[id].apiKey = exportable.engines[id].apiKey ? "•••• (non exportée)" : "";
      });
      const blob = new Blob([JSON.stringify(exportable, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "ai-builder-settings.json";
      a.click();
      URL.revokeObjectURL(url);
      UI.toast("info", "Paramètres exportés (clés API exclues).");
    });
  }

  function applyTheme(theme) {
    if (theme === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }

  function escapeAttr(value) {
    return String(value ?? "").replace(/"/g, "&quot;");
  }

  function init() {
    load();
    renderSettingsPanel();
    renderEngineChips();
    bindGlobalControls();
  }

  return {
    init,
    get,
    update,
    updateEngine,
    getActiveEngines,
    renderEngineChips,
  };
})();
