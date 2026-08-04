/**
 * app.js
 * ---------------------------------------------------------------------
 * Point d'entrée de l'application. Orchestre le pipeline complet :
 *   1. Lire la demande
 *   2. Envoyer aux IA actives
 *   3. Attendre les réponses (le système continue même si une IA échoue)
 *   4. Comparer les réponses
 *   5. Fusionner les meilleures parties
 *   6. Générer un résultat final
 *   7. Afficher le résultat + sauvegarder dans l'historique
 *
 * ⚠️ V1 : les étapes 2 et 3 s'appuient sur des appels simulés (api.js).
 * Les étapes 4/5 (comparaison / fusion) utilisent une heuristique simple
 * de démonstration ; l'intégration d'une vraie logique de scoring des
 * réponses IA est prévue pour une version ultérieure.
 * ---------------------------------------------------------------------
 */

const App = (() => {

  let isGenerating = false;

  // -----------------------------------------------------------------
  // Pipeline principal
  // -----------------------------------------------------------------
  async function generate(prompt) {
    if (isGenerating) return;
    const trimmed = prompt.trim();
    if (!trimmed) {
      UI.toast("error", "Écrivez une demande avant de lancer la génération.");
      return;
    }

    const activeEngines = Settings.getActiveEngines();
    if (activeEngines.length === 0) {
      UI.toast("error", "Aucune IA active. Activez-en au moins une dans les Paramètres.");
      return;
    }

    isGenerating = true;
    setGenerateButtonState(true);

    const logs = [];
    const log = (level, message) => logs.push({ level, message, time: new Date().toLocaleTimeString("fr-FR") });

    UI.showProgressZone();
    UI.initEngineStatus(activeEngines);

    try {
      // ---- Étape 1 : lecture de la demande ----
      UI.setStepState("read", "is-active");
      UI.setProgress(5, "Lecture de la demande", "Analyse du texte saisi");
      log("info", `Demande reçue (${trimmed.length} caractères).`);
      await wait(300);
      UI.setStepState("read", "is-done");

      // ---- Étape 2 : envoi aux IA actives ----
      UI.setStepState("dispatch", "is-active");
      UI.setProgress(15, "Envoi aux IA actives", `${activeEngines.length} moteur(s) sollicité(s)`);
      log("info", `Envoi simultané à : ${activeEngines.map((e) => e.label).join(", ")}.`);

      const settings = Settings.get();
      const callPromises = activeEngines.map((engine) =>
        Api.callEngine(engine, settings.engines[engine.id], trimmed)
          .then((res) => {
            UI.setEngineStatus(engine.id, "ok", `${engine.label} · réussi`);
            log("ok", `${engine.label} a répondu avec succès.`);
            return { status: "fulfilled", engine, value: res };
          })
          .catch((err) => {
            const message = err instanceof Api.ApiError ? err.message : "Erreur inattendue.";
            UI.setEngineStatus(engine.id, "error", `${engine.label} · échec`);
            log("error", `${engine.label} : ${message}`);
            return { status: "rejected", engine, reason: err };
          })
      );

      activeEngines.forEach((engine) => UI.setEngineStatus(engine.id, "loading", `${engine.label} · en cours…`));
      UI.setStepState("dispatch", "is-done");

      // ---- Étape 3 : attente des réponses (le système continue malgré les échecs) ----
      UI.setStepState("wait", "is-active");
      UI.setProgress(45, "Attente des réponses", "Les IA indisponibles n'interrompent pas la génération");
      const outcomes = await Promise.all(callPromises);
      UI.setStepState("wait", "is-done");

      const successes = outcomes.filter((o) => o.status === "fulfilled");
      const failures = outcomes.filter((o) => o.status === "rejected");

      if (successes.length === 0) {
        log("error", "Aucune IA n'a pu répondre. Génération interrompue.");
        UI.setProgress(100, "Échec de la génération", "Toutes les IA actives ont échoué");
        UI.toast("error", "Toutes les IA actives ont échoué. Vérifiez vos clés API dans les Paramètres.");
        finalizeFailure(logs);
        return;
      }

      if (failures.length > 0) {
        UI.toast("info", `${failures.length} IA indisponible(s), poursuite avec les ${successes.length} réponse(s) obtenue(s).`);
      }

      // ---- Étape 4 : comparaison des réponses ----
      UI.setStepState("compare", "is-active");
      UI.setProgress(65, "Comparaison des réponses", `${successes.length} réponse(s) à comparer`);
      log("info", `Comparaison de ${successes.length} réponse(s) reçue(s).`);
      await wait(400);
      const ranked = rankResponses(successes);
      UI.setStepState("compare", "is-done");

      // ---- Étape 5 : fusion des meilleures parties ----
      UI.setStepState("merge", "is-active");
      UI.setProgress(85, "Fusion des meilleures parties", "Assemblage du résultat final");
      log("info", "Fusion des meilleurs extraits en cours.");
      await wait(400);
      const merged = mergeResponses(ranked, trimmed);
      UI.setStepState("merge", "is-done");

      // ---- Étape 6 : génération du résultat final ----
      UI.setStepState("finalize", "is-active");
      UI.setProgress(97, "Génération du résultat final", "Mise en forme de la réponse");
      await wait(300);
      merged.logs = logs.concat({ level: "ok", message: "Résultat final généré.", time: new Date().toLocaleTimeString("fr-FR") });
      UI.setStepState("finalize", "is-done");
      UI.setProgress(100, "Terminé", "Résultat prêt");

      // ---- Étape 7 : affichage + historique ----
      await wait(250);
      UI.hideProgressZone();
      UI.renderResult(merged);

      const entry = {
        id: crypto.randomUUID(),
        prompt: trimmed,
        createdAt: Date.now(),
        enginesUsed: successes.map((o) => o.engine.label),
        result: merged,
      };
      History.save(entry);

      UI.toast("success", "Génération terminée.");
    } catch (err) {
      console.error(err);
      UI.toast("error", "Une erreur inattendue est survenue pendant la génération.");
      UI.hideProgressZone();
    } finally {
      isGenerating = false;
      setGenerateButtonState(false);
    }
  }

  function finalizeFailure(logs) {
    UI.renderResult({
      finalText: "Aucune réponse n'a pu être générée. Vérifiez la configuration de vos IA dans les Paramètres (clé API, quota, connexion).",
      explanation: "Toutes les IA actives ont retourné une erreur pour cette demande.",
      codeBlocks: [],
      files: [],
      logs,
    });
    isGenerating = false;
    setGenerateButtonState(false);
  }

  // -----------------------------------------------------------------
  // Comparaison / fusion (heuristique de démonstration — V1)
  // -----------------------------------------------------------------
  function rankResponses(successes) {
    // Heuristique simple : on privilégie les réponses les plus longues,
    // en supposant (pour la démo) qu'elles sont plus détaillées.
    // À remplacer en V2 par un scoring réel (pertinence, cohérence, etc.).
    return [...successes].sort((a, b) => b.value.text.length - a.value.text.length);
  }

  function mergeResponses(ranked, prompt) {
    const best = ranked[0];
    const contributors = ranked.map((r) => r.engine.label);

    const finalText =
      `Résultat fusionné à partir de ${ranked.length} réponse(s) IA (${contributors.join(", ")}).\n\n` +
      `Demande initiale : "${prompt}"\n\n` +
      `${best.value.text}`;

    const explanation =
      `Cette réponse combine les contributions de ${contributors.join(", ")}. ` +
      `En V1, la fusion retient la réponse la plus détaillée comme base ` +
      `et signale les autres comme sources complémentaires. Un algorithme ` +
      `de comparaison plus fin (cohérence du code, exactitude, style) sera ` +
      `introduit dans une prochaine version.`;

    const codeBlocks = [
      {
        language: "javascript",
        code:
`// Exemple de structure générée (placeholder V1)
function initProject(name) {
  console.log("Initialisation du projet :", name);
  return { name, createdAt: Date.now() };
}`,
      },
    ];

    const files = [
      { name: "README.md", size: "1 Ko" },
      { name: "index.html", size: "2 Ko" },
    ];

    return { finalText, explanation, codeBlocks, files, contributors };
  }

  // -----------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------
  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

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

  function init() {
    UI.init();
    Settings.init();
    bindComposer();
    History.refresh();
  }

  return { init, generate };
})();

document.addEventListener("DOMContentLoaded", App.init);
