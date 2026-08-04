/**
 * ui.js
 * ---------------------------------------------------------------------
 * Toutes les manipulations du DOM qui ne concernent pas directement
 * l'orchestration de la génération (ça, c'est app.js) : panneaux
 * latéraux, onglets, toasts, progression, coloration syntaxique légère,
 * rendu de l'historique.
 * ---------------------------------------------------------------------
 */

const UI = (() => {

  // -----------------------------------------------------------------
  // Panneaux latéraux (Historique / Paramètres)
  // -----------------------------------------------------------------
  const overlay = () => document.getElementById("overlay");

  function openPanel(id) {
    document.getElementById(id).classList.add("is-open");
    document.getElementById(id).setAttribute("aria-hidden", "false");
    overlay().classList.add("is-visible");
  }

  function closePanel(id) {
    document.getElementById(id).classList.remove("is-open");
    document.getElementById(id).setAttribute("aria-hidden", "true");
    overlay().classList.remove("is-visible");
  }

  function closeAllPanels() {
    ["panel-history", "panel-settings"].forEach(closePanel);
  }

  function bindPanels() {
    document.getElementById("btn-history").addEventListener("click", () => openPanel("panel-history"));
    document.getElementById("btn-settings").addEventListener("click", () => openPanel("panel-settings"));
    document.querySelectorAll("[data-close]").forEach((btn) => {
      btn.addEventListener("click", () => closePanel(btn.dataset.close));
    });
    overlay().addEventListener("click", closeAllPanels);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { closeAllPanels(); closeModal(); }
    });
  }

  // -----------------------------------------------------------------
  // Onglets du résultat
  // -----------------------------------------------------------------
  function bindTabs() {
    document.querySelectorAll(".tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach((t) => { t.classList.remove("is-active"); t.setAttribute("aria-selected", "false"); });
        document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("is-active"));
        tab.classList.add("is-active");
        tab.setAttribute("aria-selected", "true");
        document.getElementById(`panel-${tab.dataset.tab}`).classList.add("is-active");
      });
    });
  }

  function resetTabs() {
    document.querySelectorAll(".tab").forEach((t, i) => {
      t.classList.toggle("is-active", i === 0);
      t.setAttribute("aria-selected", i === 0 ? "true" : "false");
    });
    document.querySelectorAll(".tab-panel").forEach((p, i) => p.classList.toggle("is-active", i === 0));
  }

  // -----------------------------------------------------------------
  // Toasts
  // -----------------------------------------------------------------
  const ICONS = {
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>`,
    error: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>`,
    info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 16v-5M12 8h.01"/></svg>`,
  };

  function toast(type, message, duration = 4200) {
    const stack = document.getElementById("toast-stack");
    const el = document.createElement("div");
    el.className = `toast toast--${type}`;
    el.innerHTML = `<span class="toast__icon">${ICONS[type] || ICONS.info}</span><span>${escapeHTML(message)}</span>`;
    stack.appendChild(el);
    setTimeout(() => {
      el.classList.add("is-leaving");
      setTimeout(() => el.remove(), 260);
    }, duration);
  }

  // -----------------------------------------------------------------
  // Zone de progression
  // -----------------------------------------------------------------
  function showProgressZone() {
    document.getElementById("progress-zone").hidden = false;
    document.getElementById("result-zone").hidden = true;
    setProgress(0, "Initialisation…", "Préparation de la requête multi-IA");
    document.querySelectorAll(".step").forEach((s) => s.classList.remove("is-active", "is-done"));
    document.getElementById("engine-status").innerHTML = "";
  }

  function hideProgressZone() {
    document.getElementById("progress-zone").hidden = true;
  }

  function setProgress(percent, title, subtitle) {
    document.getElementById("progress-bar-fill").style.width = `${percent}%`;
    document.getElementById("progress-percent").textContent = `${Math.round(percent)}%`;
    if (title) document.getElementById("progress-title").textContent = title;
    if (subtitle) document.getElementById("progress-subtitle").textContent = subtitle;
  }

  function setStepState(stepKey, stateName) {
    const el = document.querySelector(`.step[data-step="${stepKey}"]`);
    if (!el) return;
    el.classList.remove("is-active", "is-done");
    if (stateName) el.classList.add(stateName);
  }

  function initEngineStatus(engines) {
    const container = document.getElementById("engine-status");
    container.innerHTML = "";
    engines.forEach((engine) => {
      const item = document.createElement("div");
      item.className = "engine-status-item state-pending";
      item.dataset.engineId = engine.id;
      item.innerHTML = `<span class="engine-status-item__dot"></span><span>${engine.label}</span>`;
      container.appendChild(item);
    });
  }

  function setEngineStatus(engineId, stateName, note) {
    const item = document.querySelector(`.engine-status-item[data-engine-id="${engineId}"]`);
    if (!item) return;
    item.className = `engine-status-item state-${stateName}`;
    item.querySelector("span:last-child").textContent = note || item.querySelector("span:last-child").textContent;
  }

  // -----------------------------------------------------------------
  // Résultat — onglets
  // -----------------------------------------------------------------
  function renderResult(result) {
    document.getElementById("result-zone").hidden = false;
    resetTabs();

    renderReponsePanel(result);
    renderCodePanel(result);
    renderExplicationsPanel(result);
    renderFichiersPanel(result);
    renderLogsPanel(result);
  }

  function renderReponsePanel(result) {
    const el = document.getElementById("panel-reponse");
    el.innerHTML = `<div class="result-text"></div>`;
    el.querySelector(".result-text").textContent = result.finalText;
  }

  function renderCodePanel(result) {
    const el = document.getElementById("panel-code");
    el.innerHTML = "";
    if (!result.codeBlocks || result.codeBlocks.length === 0) {
      el.innerHTML = `<p class="result-empty">Aucun bloc de code détecté dans la fusion des réponses.</p>`;
      return;
    }
    result.codeBlocks.forEach((block) => {
      const wrap = document.createElement("div");
      wrap.className = "code-block";
      wrap.innerHTML = `
        <div class="code-block__head">
          <span>${escapeHTML(block.language || "texte")}</span>
          <button class="code-block__copy">Copier</button>
        </div>
        <pre><code>${highlight(block.code, block.language)}</code></pre>
      `;
      wrap.querySelector(".code-block__copy").addEventListener("click", (e) => {
        navigator.clipboard.writeText(block.code).then(() => {
          e.target.textContent = "Copié !";
          setTimeout(() => (e.target.textContent = "Copier"), 1500);
        });
      });
      el.appendChild(wrap);
    });
  }

  function renderExplicationsPanel(result) {
    const el = document.getElementById("panel-explications");
    el.innerHTML = `<div class="result-text"></div>`;
    el.querySelector(".result-text").textContent = result.explanation;
  }

  function renderFichiersPanel(result) {
    const el = document.getElementById("panel-fichiers");
    el.innerHTML = "";
    if (!result.files || result.files.length === 0) {
      el.innerHTML = `<p class="result-empty">Aucun fichier généré pour cette demande. <strong>La génération de fichiers réels (ZIP, projet complet) arrivera dans une prochaine version.</strong></p>`;
      return;
    }
    result.files.forEach((file) => {
      const card = document.createElement("div");
      card.className = "file-card";
      card.innerHTML = `<span class="file-card__name">${escapeHTML(file.name)}</span><span class="file-card__meta">${file.size}</span>`;
      el.appendChild(card);
    });
  }

  function renderLogsPanel(result) {
    const el = document.getElementById("panel-logs");
    el.innerHTML = "";
    result.logs.forEach((log) => {
      const line = document.createElement("div");
      line.className = `log-line log-line--${log.level}`;
      line.innerHTML = `<span class="log-line__time">${log.time}</span><span class="log-line__msg">${escapeHTML(log.message)}</span>`;
      el.appendChild(line);
    });
  }

  // -----------------------------------------------------------------
  // Coloration syntaxique légère (sans dépendance externe)
  // -----------------------------------------------------------------
  function highlight(code, language = "") {
    let escaped = escapeHTML(code);
    const lang = (language || "").toLowerCase();

    if (lang.includes("html") || lang.includes("xml")) {
      escaped = escaped
        .replace(/(&lt;\/?[a-zA-Z0-9-]+)/g, '<span class="tok-tag">$1</span>')
        .replace(/([a-zA-Z-]+)(=)(&quot;.*?&quot;)/g, '<span class="tok-attr">$1</span>$2<span class="tok-str">$3</span>');
      return escaped;
    }

    if (lang.includes("css")) {
      escaped = escaped
        .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="tok-com">$1</span>')
        .replace(/([.#]?[a-zA-Z0-9_-]+)(\s*\{)/g, '<span class="tok-fn">$1</span>$2')
        .replace(/(#[0-9a-fA-F]{3,8}\b)/g, '<span class="tok-num">$1</span>');
      return escaped;
    }

    if (lang.includes("py") || lang.includes("python")) {
      escaped = escaped
        .replace(/(#.*$)/gm, '<span class="tok-com">$1</span>')
        .replace(/\b(def|class|import|from|return|if|elif|else|for|while|in|as|try|except|with|pass|None|True|False)\b/g, '<span class="tok-kw">$1</span>')
        .replace(/(&quot;.*?&quot;|'.*?')/g, '<span class="tok-str">$1</span>')
        .replace(/\b(\d+)\b/g, '<span class="tok-num">$1</span>');
      return escaped;
    }

    // JS / TS / JSON par défaut
    escaped = escaped
      .replace(/(\/\/.*$)/gm, '<span class="tok-com">$1</span>')
      .replace(/\b(const|let|var|function|return|if|else|for|while|class|import|export|from|new|async|await|try|catch|switch|case|break|default|extends|typeof|null|undefined|true|false)\b/g, '<span class="tok-kw">$1</span>')
      .replace(/(&quot;.*?&quot;|'.*?'|`.*?`)/g, '<span class="tok-str">$1</span>')
      .replace(/\b(\d+)\b/g, '<span class="tok-num">$1</span>')
      .replace(/([a-zA-Z0-9_]+)(\()/g, '<span class="tok-fn">$1</span>$2');

    return escaped;
  }

  // -----------------------------------------------------------------
  // Historique
  // -----------------------------------------------------------------
  function renderHistoryList(entries, handlers) {
    const list = document.getElementById("history-list");
    const empty = document.getElementById("history-empty");
    list.innerHTML = "";

    if (!entries || entries.length === 0) {
      empty.style.display = "block";
      return;
    }
    empty.style.display = "none";

    entries.forEach((entry) => {
      const li = document.createElement("li");
      li.className = "history-item";
      const date = new Date(entry.createdAt);
      li.innerHTML = `
        <p class="history-item__title">${escapeHTML(entry.prompt)}</p>
        <div class="history-item__meta">
          <span>${date.toLocaleDateString("fr-FR")} ${date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
          <span>${entry.enginesUsed.length} IA</span>
        </div>
      `;
      li.addEventListener("click", () => handlers.onOpen(entry));
      list.appendChild(li);
    });
  }

  // -----------------------------------------------------------------
  // Modale (détail historique)
  // -----------------------------------------------------------------
  function openModal(entry, handlers) {
    document.getElementById("history-modal").hidden = false;
    document.getElementById("history-modal-title").textContent = "Projet";
    document.getElementById("history-modal-body").innerHTML = `
      <p><strong>Demande :</strong></p>
      <p class="result-text">${escapeHTML(entry.prompt)}</p>
      <p><strong>IA utilisées :</strong> ${entry.enginesUsed.map(escapeHTML).join(", ") || "—"}</p>
    `;
    document.getElementById("history-modal-delete").onclick = () => handlers.onDelete(entry);
    document.getElementById("history-modal-relaunch").onclick = () => handlers.onRelaunch(entry);
  }

  function closeModal() {
    document.getElementById("history-modal").hidden = true;
  }

  function bindModal() {
    document.querySelectorAll("[data-close-modal]").forEach((el) => el.addEventListener("click", closeModal));
  }

  // -----------------------------------------------------------------
  // Utilitaires
  // -----------------------------------------------------------------
  function escapeHTML(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function init() {
    bindPanels();
    bindTabs();
    bindModal();
  }

  return {
    init,
    toast,
    showProgressZone,
    hideProgressZone,
    setProgress,
    setStepState,
    initEngineStatus,
    setEngineStatus,
    renderResult,
    renderHistoryList,
    openModal,
    closeModal,
    closePanel,
    escapeHTML,
  };
})();
