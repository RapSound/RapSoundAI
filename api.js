/**
 * api.js
 * ---------------------------------------------------------------------
 * Couche d'appel aux API des différentes IA.
 *
 * ⚠️ V1 — IMPORTANT
 * Ce fichier NE contacte aucune vraie API pour le moment. Chaque appel
 * est simulé (`mockEngineCall`) afin que tout le pipeline (envoi,
 * attente, comparaison, fusion, affichage, gestion d'erreurs) soit
 * fonctionnel et démontrable dès la V1, sans clé API réelle.
 *
 * La V2 remplacera uniquement `callEngine()` par de vrais appels
 * `fetch(...)` vers chaque fournisseur (Gemini, OpenRouter, Groq,
 * Hugging Face, Mistral, Cloudflare AI...), en réutilisant :
 *   - ApiError pour la classification des erreurs,
 *   - requestWithTimeout() comme squelette de requête réseau,
 *   - la configuration exposée par aiManager.js / settings.js.
 * ---------------------------------------------------------------------
 */

const Api = (() => {

  /** Types d'erreurs normalisés, utilisés partout dans l'application. */
  const ErrorType = {
    MISSING_KEY: "MISSING_KEY",
    QUOTA_EXCEEDED: "QUOTA_EXCEEDED",
    NETWORK_ERROR: "NETWORK_ERROR",
    EMPTY_RESPONSE: "EMPTY_RESPONSE",
    TIMEOUT: "TIMEOUT",
    UNKNOWN: "UNKNOWN",
  };

  /** Erreur applicative normalisée pour tous les moteurs IA. */
  class ApiError extends Error {
    constructor(type, message, engineId) {
      super(message);
      this.name = "ApiError";
      this.type = type;
      this.engineId = engineId;
    }
  }

  /** Messages lisibles associés à chaque type d'erreur (affichés dans l'UI). */
  const ERROR_MESSAGES = {
    [ErrorType.MISSING_KEY]: "Clé API absente. Renseignez-la dans les Paramètres.",
    [ErrorType.QUOTA_EXCEEDED]: "Quota dépassé pour ce moteur. Réessayez plus tard.",
    [ErrorType.NETWORK_ERROR]: "Connexion impossible à ce moteur.",
    [ErrorType.EMPTY_RESPONSE]: "Réponse vide reçue de ce moteur.",
    [ErrorType.TIMEOUT]: "Le moteur n'a pas répondu à temps.",
    [ErrorType.UNKNOWN]: "Erreur inconnue.",
  };

  function messageFor(type) {
    return ERROR_MESSAGES[type] || ERROR_MESSAGES[ErrorType.UNKNOWN];
  }

  /**
   * Squelette générique de requête réseau avec timeout, prêt pour la V2.
   * Non utilisé en V1 (conservé pour que l'architecture soit déjà en place).
   */
  async function requestWithTimeout(url, options = {}, timeoutMs = 30000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new ApiError(ErrorType.MISSING_KEY, messageFor(ErrorType.MISSING_KEY));
        }
        if (response.status === 429) {
          throw new ApiError(ErrorType.QUOTA_EXCEEDED, messageFor(ErrorType.QUOTA_EXCEEDED));
        }
        throw new ApiError(ErrorType.UNKNOWN, `Erreur HTTP ${response.status}`);
      }
      const data = await response.json();
      return data;
    } catch (err) {
      if (err.name === "AbortError") {
        throw new ApiError(ErrorType.TIMEOUT, messageFor(ErrorType.TIMEOUT));
      }
      if (err instanceof ApiError) throw err;
      throw new ApiError(ErrorType.NETWORK_ERROR, messageFor(ErrorType.NETWORK_ERROR));
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Simulation d'un appel à un moteur IA (V1).
   * Reproduit fidèlement les cas réels : clé absente, latence variable,
   * échec réseau occasionnel — pour que le reste du pipeline (comparaison,
   * fusion, gestion d'erreurs, logs) puisse être développé et testé
   * dès maintenant.
   */
  function mockEngineCall(engine, engineSettings, prompt) {
    return new Promise((resolve, reject) => {
      // Cas 1 : clé API absente → erreur immédiate, comme en conditions réelles.
      if (!engineSettings || !engineSettings.apiKey || !engineSettings.apiKey.trim()) {
        reject(new ApiError(
          ErrorType.MISSING_KEY,
          `${messageFor(ErrorType.MISSING_KEY)} (variable attendue : ${engine.secretName})`,
          engine.id
        ));
        return;
      }

      const latency = 900 + Math.random() * 1800;

      setTimeout(() => {
        // Cas 2 : simulation occasionnelle d'une panne réseau (V1 uniquement).
        if (Math.random() < 0.05) {
          reject(new ApiError(ErrorType.NETWORK_ERROR, messageFor(ErrorType.NETWORK_ERROR), engine.id));
          return;
        }

        resolve({
          engineId: engine.id,
          model: engineSettings.model || engine.defaultModel,
          text: buildMockAnswer(engine, prompt),
          usage: {
            promptTokens: Math.round(prompt.length / 4),
            completionTokens: 180 + Math.round(Math.random() * 220),
          },
        });
      }, latency);
    });
  }

  /** Génère un texte de démonstration cohérent avec la demande, sans appel réel. */
  function buildMockAnswer(engine, prompt) {
    const topic = prompt.trim().slice(0, 80) || "votre projet";
    return (
      `[Simulation ${engine.label} — V1, aucun appel réel effectué]\n\n` +
      `Voici une proposition de structure pour : "${topic}".\n` +
      `1. Analyse du besoin\n2. Architecture proposée\n3. Points d'attention\n\n` +
      `Cette réponse est un espace réservé généré localement afin de valider ` +
      `le pipeline complet (envoi, comparaison, fusion, affichage) avant le ` +
      `branchement des vraies API en V2.`
    );
  }

  /**
   * Point d'entrée public utilisé par l'orchestrateur (app.js).
   * En V1, délègue systématiquement à la simulation.
   * En V2, ce sera ici que l'on aiguillera vers le bon fournisseur
   * (switch sur engine.id → fetch spécifique à chaque API).
   */
  async function callEngine(engine, engineSettings, prompt) {
    return mockEngineCall(engine, engineSettings, prompt);
  }

  return {
    ErrorType,
    ApiError,
    messageFor,
    requestWithTimeout,
    callEngine,
  };
})();
