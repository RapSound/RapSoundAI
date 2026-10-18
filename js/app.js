/**
 * app.js  (V3)
 * ---------------------------------------------------------------------
 * Point d'entrée. Lit les options de l'interface, lance le Studio
 * (projet complet) ou la Fusion (réponse multi-IA), affiche le résultat
 * (aperçu, code, fichiers, ZIP) et alimente l'historique.
 * La logique d'orchestration vit dans studio.js.
 * ---------------------------------------------------------------------
 */

const App = (() => {

  let isGenerating = false;
  let currentResult = null;

  const STUDIO_STEPS = { read: "Plan (architecte)", dispatch: "Structure HTML", wait: "Design & logique en parallèle", compare: "Contrôle qualité & relecture", merge: "Assemblage (effets, PWA, README)", finalize: "Aperçu & ZIP" };
  const FUSION_STEPS = { read: "Lecture de la demande", dispatch: "Envoi à toutes les IA", wait: "Attente des réponses", compare: "Comparaison", merge: "Fusion par une IA", finalize: "Résultat final" };

  const now = () => new Date().toLocaleTimeString("fr-FR");

  function makeHooks(logs) {
    return {
      step: (k, st) => UI.setStepState(k, st),
      progress: (p, t, sub) => UI.setProgress(p, t, sub),
      engine: (id, st, note) => UI.setEngineStatus(id, st, note),
      engines: (list) => UI.initEngineStatus(list),
      log: (level, message) => logs.push({ level, message, time: now() }),
    };
  }

  function readOptions() {
    const st = Settings.get().studio;
    return {
      mode: st.mode, type: st.type, style: st.style, effects: [...st.effects],
      single: !!st.single, pwa: !!st.pwa, review: !!st.review,
    };
  }

  // -----------------------------------------------------------------
  // Génération
  // -----------------------------------------------------------------
  async function generate(prompt) {
    if (isGenerating) return;
    const trimmed = prompt.trim();
    if (!trimmed) { UI.toast("error", "Écrivez une demande avant de lancer la génération."); return; }

    const options = readOptions();
    if (Studio.readyEngines().length === 0) {
      UI.toast("error", "Aucune IA prête. Activez un moteur (Pollinations est gratuit, sans clé) dans les Paramètres.");
      return;
    }

    isGenerating = true;
    setGenerateButtonState(true);
    const logs = [];
    UI.showProgressZone();
    UI.setStepLabels(options.mode === "fusion" ? FUSION_STEPS : STUDIO_STEPS);
    const hooks = makeHooks(logs);

    try {
      const result = options.mode === "fusion"
        ? await Studio.fusion({ prompt: trimmed, hooks })
        : await Studio.run({ prompt: trimmed, options, hooks });
      result.logs = logs.concat({ level: "ok", message: "Résultat final généré.", time: now() });
      await wait(250);
      finish(result, trimmed);
      UI.toast("success", options.mode === "fusion" ? "Fusion terminée." : "Projet généré.");
    } catch (err) {
      console.error(err);
      logs.push({ level: "error", message: err.message || String(err), time: now() });
      UI.setProgress(100, "Échec de la génération", err.message || "Erreur inattendue");
      UI.toast("error", err.message || "Une erreur inattendue est survenue.");
      currentResult = null;
      UI.renderResult({
        mode: "error", finalText: `La génération a échoué : ${err.message || "erreur inconnue"}\n\nVérifiez vos clés API, vos quotas et la connexion (un blocage CORS peut aussi empêcher certains moteurs de répondre depuis le navigateur). Consultez l'onglet Logs.`,
        explanation: "Aucun résultat exploitable.", codeBlocks: [], files: [], logs,
      });
      UI.hideProgressZone();
    } finally {
      isGenerating = false;
      setGenerateButtonState(false);
    }
  }

  function finish(result, prompt) {
    currentResult = result;
    UI.hideProgressZone();
    UI.renderResult(result);
    History.save({
      id: crypto.randomUUID(), prompt, createdAt: Date.now(),
      enginesUsed: result.contributors || [],
      result: Studio.compact({ ...result, logs: result.logs }),
    });
    document.getElementById("result-zone").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function refine() {
    if (isGenerating || !currentResult || currentResult.mode !== "studio") return;
    const input = document.getElementById("refine-input");
    const instruction = input.value.trim();
    if (!instruction) { UI.toast("error", "Décrivez la modification souhaitée."); return; }

    isGenerating = true;
    const btn = document.getElementById("btn-refine");
    btn.disabled = true; btn.textContent = "Modification…";
    const logs = [];
    try {
      const result = await Studio.refine({ instruction, previous: currentResult, hooks: makeHooks(logs) });
      result.logs = (currentResult.logs || []).concat(logs);
      result.prompt = currentResult.prompt;
      input.value = "";
      currentResult = result;
      UI.renderResult(result);
      History.save({ id: crypto.randomUUID(), prompt: `${currentResult.prompt} → ${instruction}`, createdAt: Date.now(), enginesUsed: result.contributors || [], result: Studio.compact(result) });
      UI.toast("success", "Projet mis à jour.");
    } catch (err) {
      UI.toast("error", err.message || "Modification impossible.");
    } finally {
      isGenerating = false;
      btn.disabled = false; btn.textContent = "Appliquer";
    }
  }

  // -----------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------
  function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  function setGenerateButtonState(loading) {
    const btn = document.getElementById("btn-generate");
    btn.disabled = loading;
    btn.querySelector(".btn__label").textContent = loading ? "Génération…" : "Générer";
  }

  // -----------------------------------------------------------------
  // Historique — intégration UI
  // -----------------------------------------------------------------
  const History = (() => {
    function refresh() {
      const entries = Storage.getHistory();
      UI.renderHistoryList(entries, {
        onOpen: (entry) => UI.openModal(entry, {
          onDelete: (e) => { Storage.deleteHistoryEntry(e.id); refresh(); UI.closeModal(); UI.toast("info", "Projet supprimé."); },
          onRelaunch: (e) => { UI.closeModal(); UI.closePanel("panel-history"); document.getElementById("prompt-input").value = e.prompt; generate(e.prompt); },
          onOpenResult: (e) => {
            UI.closeModal(); UI.closePanel("panel-history");
            currentResult = Studio.rehydrate(e.result);
            document.getElementById("prompt-input").value = e.prompt;
            UI.renderResult(currentResult);
            document.getElementById("result-zone").scrollIntoView({ behavior: "smooth", block: "start" });
          },
        }),
      });
    }

    function save(entry) {
      Storage.addHistoryEntry(entry);
      refresh();
    }

    return { refresh, save };
  })();

  // -----------------------------------------------------------------
  // Initialisation
  // -----------------------------------------------------------------
  function bindComposer() {
    const textarea = document.getElementById("prompt-input");

    document.getElementById("btn-generate").addEventListener("click", () => generate(textarea.value));
    document.getElementById("btn-clear").addEventListener("click", () => {
      textarea.value = "";
      textarea.focus();
    });

    textarea.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        generate(textarea.value);
      }
    });
  }

  // -----------------------------------------------------------------
  // Options du Studio (mode, type, style, effets, bascules)
  // -----------------------------------------------------------------
  function bindStudioOptions() {
    const st = () => Settings.get().studio;
    const fill = (id, items, current, onChange) => {
      const sel = document.getElementById(id);
      sel.innerHTML = items.map((i) => `<option value="${i.id}">${i.label}</option>`).join("");
      sel.value = current;
      sel.addEventListener("change", () => onChange(sel.value));
    };
    fill("opt-type", StudioAssets.PROJECT_TYPES, st().type, (v) => Settings.updateStudio({ type: v }));
    fill("opt-style", StudioAssets.STYLES, st().style, (v) => Settings.updateStudio({ style: v }));

    const chips = document.getElementById("opt-effects");
    chips.innerHTML = StudioAssets.EFFECTS.map((e) => `<button type="button" class="chip${st().effects.includes(e.id) ? " is-on" : ""}" data-fx="${e.id}">${e.label}</button>`).join("");
    chips.addEventListener("click", (ev) => {
      const b = ev.target.closest(".chip"); if (!b) return;
      const set = new Set(st().effects);
      set.has(b.dataset.fx) ? set.delete(b.dataset.fx) : set.add(b.dataset.fx);
      b.classList.toggle("is-on", set.has(b.dataset.fx));
      Settings.updateStudio({ effects: [...set] });
    });

    [["opt-single", "single"], ["opt-pwa", "pwa"], ["opt-review", "review"]].forEach(([id, key]) => {
      const el = document.getElementById(id);
      el.checked = !!st()[key];
      el.addEventListener("change", () => Settings.updateStudio({ [key]: el.checked }));
    });

    const applyMode = (mode) => {
      document.querySelectorAll(".seg__btn").forEach((b) => b.classList.toggle("is-active", b.dataset.mode === mode));
      document.getElementById("studio-only").hidden = mode !== "studio";
    };
    document.querySelectorAll(".seg__btn").forEach((b) => b.addEventListener("click", () => { Settings.updateStudio({ mode: b.dataset.mode }); applyMode(b.dataset.mode); }));
    applyMode(st().mode);

    document.getElementById("btn-refine").addEventListener("click", refine);
    document.getElementById("refine-bar").hidden = true;
  }

  function init() {
    UI.init();
    Settings.init();
    bindComposer();
    bindStudioOptions();
    History.refresh();
  }

  return { init, generate };
})();

document.addEventListener("DOMContentLoaded", App.init);
