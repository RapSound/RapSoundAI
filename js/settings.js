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
    roles: { architect: "auto", structure: "auto", design: "auto", logic: "auto", review: "auto" },
    studio: { mode: "studio", type: "auto", style: "auto", effects: ["reveal", "glass", "aurora"], single: false, pwa: true, review: true },
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
      roles: { ...DEFAULTS.roles, ...(stored.roles || {}) },
      studio: { ...DEFAULTS.studio, ...(stored.studio || {}) },
    };
    // Complète les champs ajoutés par les nouvelles versions (ex. baseUrl).
    Object.keys(merged.engines).forEach((id) => { merged.engines[id] = { ...(DEFAULTS.engines[id] || {}), ...merged.engines[id] }; });
    // Retire les moteurs qui n'existent plus dans le registre.
    Object.keys(merged.engines).forEach((id) => { if (!AIManager.getById(id)) delete merged.engines[id]; });
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

  function updateStudio(partial) {
    state.studio = { ...state.studio, ...partial };
    persist();
  }

  function updateRole(role, engineId) {
    state.roles[role] = engineId;
    persist();
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

      const ready = AIManager.isReady(engine, cfg);
      card.innerHTML = `
        <div class="engine-card__head">
          <span class="engine-card__name">
            <span class="engine-card__dot" style="background:${engine.color}"></span>${engine.label}
            <span class="engine-card__state ${ready ? "is-ready" : ""}">${ready ? "prête" : engine.keyless ? "inactive" : "clé requise"}</span>
          </span>
          <label class="switch">
            <input type="checkbox" class="engine-toggle" ${cfg.active ? "checked" : ""}>
            <span class="switch__track"><span class="switch__thumb"></span></span>
          </label>
        </div>
        <div class="engine-card__body">
          ${engine.keyless && !engine.editableBaseUrl ? `<span class="engine-card__key-name">Aucune clé nécessaire.</span>` : `
          <div class="field">
            <label>Clé API${engine.keyless ? " (optionnelle)" : " (locale uniquement)"}</label>
            <input type="password" class="engine-api-key" autocomplete="off" placeholder="Non renseignée" value="${escapeAttr(cfg.apiKey)}">
            <span class="engine-card__key-name">GitHub Secret recommandé : ${engine.secretName} · <a href="${engine.docsUrl}" target="_blank" rel="noopener">obtenir une clé</a></span>
          </div>`}
          ${engine.editableBaseUrl ? `<div class="field"><label>URL de l'endpoint</label><input type="text" class="engine-base-url" value="${escapeAttr(cfg.baseUrl)}"></div>` : ""}
          <div class="field">
            <label>Modèle</label>
            <div class="model-row">
              <input type="text" class="engine-model" list="models-${engine.id}" value="${escapeAttr(cfg.model)}">
              <button type="button" class="btn btn--ghost btn--small engine-refresh" title="Charger la liste réelle des modèles du fournisseur">↻</button>
            </div>
            <datalist id="models-${engine.id}">
              ${engine.modelOptions.map((m) => `<option value="${escapeAttr(m)}"></option>`).join("")}
            </datalist>
          </div>
        </div>
      `;

      card.querySelector(".engine-toggle").addEventListener("change", (e) => {
        updateEngine(engine.id, { active: e.target.checked });
        card.classList.toggle("is-active", e.target.checked);
        refreshCardState(card, engine);
      });
      const keyInput = card.querySelector(".engine-api-key");
      if (keyInput) keyInput.addEventListener("input", (e) => {
        const hasKey = !!e.target.value.trim();
        const patch = { apiKey: e.target.value };
        // Saisir une clé active automatiquement le moteur.
        if (hasKey && !state.engines[engine.id].active) { patch.active = true; card.querySelector(".engine-toggle").checked = true; card.classList.add("is-active"); }
        updateEngine(engine.id, patch);
        refreshCardState(card, engine);
      });
      const urlInput = card.querySelector(".engine-base-url");
      if (urlInput) urlInput.addEventListener("change", (e) => updateEngine(engine.id, { baseUrl: e.target.value.trim() || engine.baseUrl }));
      card.querySelector(".engine-model").addEventListener("change", (e) => {
        updateEngine(engine.id, { model: e.target.value || engine.defaultModel });
      });
      card.querySelector(".engine-refresh").addEventListener("click", async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          const models = await Api.listModels(engine, state.engines[engine.id]);
          if (!models.length) throw new Error("Liste vide");
          card.querySelector(`#models-${engine.id}`).innerHTML = models.slice(0, 300).map((m) => `<option value="${escapeAttr(m)}"></option>`).join("");
          UI.toast("success", `${engine.label} : ${models.length} modèle(s) disponible(s) — cliquez dans le champ pour choisir.`);
        } catch (err) {
          UI.toast("error", `${engine.label} : ${err.message || "liste indisponible"}`);
        } finally { btn.disabled = false; }
      });

      container.appendChild(card);
    });
  }

  function refreshCardState(card, engine) {
    const ready = AIManager.isReady(engine, state.engines[engine.id]);
    const el = card.querySelector(".engine-card__state");
    el.className = "engine-card__state" + (ready ? " is-ready" : "");
    el.textContent = ready ? "prête" : engine.keyless ? "inactive" : "clé requise";
    renderRoleSettings();
  }

  function renderRoleSettings() {
    const box = document.getElementById("role-settings");
    if (!box) return;
    const labels = { architect: "Architecte (plan)", structure: "Structure HTML", design: "Design & effets", logic: "Logique JS", review: "Relecture" };
    const ready = AIManager.getAll().filter((e) => AIManager.isReady(e, state.engines[e.id]));
    box.innerHTML = "";
    Object.keys(labels).forEach((role) => {
      const cur = state.roles[role] || "auto";
      const row = document.createElement("div");
      row.className = "field field--row";
      row.innerHTML = `<label>${labels[role]}</label><select data-role="${role}"><option value="auto">Auto</option>${ready.map((e) => `<option value="${e.id}" ${cur === e.id ? "selected" : ""}>${e.label}</option>`).join("")}</select>`;
      row.querySelector("select").addEventListener("change", (ev) => updateRole(role, ev.target.value));
      box.appendChild(row);
    });
  }

  function renderEngineChips() {
    const container = document.getElementById("active-engines-preview");
    if (!container) return;
    container.innerHTML = "";

    AIManager.getAll().forEach((engine) => {
      const active = AIManager.isReady(engine, state.engines[engine.id]);
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
      renderRoleSettings();
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
      a.download = "rapsoundai-settings.json";
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
    renderRoleSettings();
    bindGlobalControls();
  }

  return {
    init,
    get,
    update,
    updateEngine,
    getActiveEngines,
    updateStudio,
    renderEngineChips,
    renderRoleSettings,
  };
})();
