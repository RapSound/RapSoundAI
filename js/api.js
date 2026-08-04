/**
 * api.js
 * ---------------------------------------------------------------------
 * Couche d'appel aux API des différentes IA.
 *
 * V2 (mise à jour) : Gemini, OpenRouter et Mistral sont désormais
 * appelés RÉELLEMENT, directement depuis le navigateur, avec la clé
 * saisie dans les Paramètres. Les autres moteurs (Groq, Hugging Face,
 * Cloudflare AI) restent simulés (`mockEngineCall`) jusqu'à leur
 * branchement, afin que le pipeline continue de fonctionner pour tous.
 *
 * ⚠️ Sécurité : un appel fait directement depuis le navigateur expose
 * la clé API dans le code client (visible dans l'onglet Réseau des
 * outils de développement). C'est acceptable pour un usage personnel/
 * prototype, mais pour un déploiement public, préférez un petit relais
 * serveur (ex. GitHub Actions / Cloudflare Worker) qui garde la clé
 * côté serveur et n'expose que le résultat.
 *
 * ⚠️ CORS : chaque fournisseur choisit d'autoriser ou non les appels
 * depuis un navigateur (origine différente du sien). Si un moteur
 * échoue systématiquement avec une erreur réseau alors que la clé est
 * correcte, c'est le signe le plus probable d'un blocage CORS côté
 * fournisseur — la solution est alors de passer par un relais serveur.
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
    [ErrorType.MISSING_KEY]: "Clé API absente ou invalide. Vérifiez-la dans les Paramètres.",
    [ErrorType.QUOTA_EXCEEDED]: "Quota dépassé pour ce moteur. Réessayez plus tard.",
    [ErrorType.NETWORK_ERROR]: "Connexion impossible à ce moteur (réseau ou blocage CORS).",
    [ErrorType.EMPTY_RESPONSE]: "Réponse vide reçue de ce moteur.",
    [ErrorType.TIMEOUT]: "Le moteur n'a pas répondu à temps.",
    [ErrorType.UNKNOWN]: "Erreur inconnue.",
  };

  function messageFor(type) {
    return ERROR_MESSAGES[type] || ERROR_MESSAGES[ErrorType.UNKNOWN];
  }

  /** Traduit un code HTTP en type d'erreur normalisé. */
  function classifyHttpStatus(status) {
    if (status === 401 || status === 403) return ErrorType.MISSING_KEY;
    if (status === 429 || status === 402) return ErrorType.QUOTA_EXCEEDED;
    return ErrorType.UNKNOWN;
  }

  /**
   * Requête fetch générique avec timeout + classification d'erreurs.
   * Utilisée par tous les appels IA réels (Gemini, OpenRouter, Mistral).
   */
  async function requestJSON(url, options = {}, engineId, timeoutMs = 30000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
      if (err.name === "AbortError") {
        throw new ApiError(ErrorType.TIMEOUT, messageFor(ErrorType.TIMEOUT), engineId);
      }
      // Un TypeError "Failed to fetch" recouvre aussi bien une vraie coupure
      // réseau qu'un blocage CORS côté fournisseur.
      throw new ApiError(ErrorType.NETWORK_ERROR, messageFor(ErrorType.NETWORK_ERROR), engineId);
    } finally {
      clearTimeout(timer);
    }

    let payload = null;
    try {
      payload = await response.json();
    } catch (_) {
      payload = null;
    }

    if (!response.ok) {
      const type = classifyHttpStatus(response.status);
      const providerMessage = payload?.error?.message || payload?.message || "";
      const detail = providerMessage ? ` (${providerMessage})` : ` (HTTP ${response.status})`;
      throw new ApiError(type, messageFor(type) + detail, engineId);
    }

    return payload;
  }

  function ensureApiKey(engine, cfg) {
    if (!cfg || !cfg.apiKey || !cfg.apiKey.trim()) {
      throw new ApiError(
        ErrorType.MISSING_KEY,
        `${messageFor(ErrorType.MISSING_KEY)} (variable attendue : ${engine.secretName})`,
        engine.id
      );
    }
  }

  function ensureNonEmptyText(text, engineId) {
    if (!text || !text.trim()) {
      throw new ApiError(ErrorType.EMPTY_RESPONSE, messageFor(ErrorType.EMPTY_RESPONSE), engineId);
    }
    return text;
  }

  // -----------------------------------------------------------------
  // Gemini (Google AI Studio) — appel réel
  // -----------------------------------------------------------------
  async function callGemini(engine, cfg, prompt, genParams) {
    ensureApiKey(engine, cfg);
    const model = (cfg.model || engine.defaultModel).trim();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: genParams.temperature,
        maxOutputTokens: genParams.maxTokens,
      },
    };

    const data = await requestJSON(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": cfg.apiKey,
      },
      body: JSON.stringify(body),
    }, engine.id);

    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    ensureNonEmptyText(text, engine.id);

    return {
      engineId: engine.id,
      model,
      text,
      usage: {
        promptTokens: data?.usageMetadata?.promptTokenCount ?? null,
        completionTokens: data?.usageMetadata?.candidatesTokenCount ?? null,
      },
    };
  }

  // -----------------------------------------------------------------
  // Fournisseurs compatibles OpenAI (OpenRouter, Mistral) — appel réel
  // -----------------------------------------------------------------
  async function callOpenAICompatible(baseUrl, engine, cfg, prompt, genParams, extraHeaders = {}) {
    ensureApiKey(engine, cfg);
    const model = (cfg.model || engine.defaultModel).trim();

    const body = {
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: genParams.temperature,
      max_tokens: genParams.maxTokens,
    };

    const data = await requestJSON(baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${cfg.apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    }, engine.id);

    const text = data?.choices?.[0]?.message?.content || "";
    ensureNonEmptyText(text, engine.id);

    return {
      engineId: engine.id,
      model,
      text,
      usage: {
        promptTokens: data?.usage?.prompt_tokens ?? null,
        completionTokens: data?.usage?.completion_tokens ?? null,
      },
    };
  }

  function callOpenRouter(engine, cfg, prompt, genParams) {
    return callOpenAICompatible(
      "https://openrouter.ai/api/v1/chat/completions",
      engine, cfg, prompt, genParams,
      {
        // Recommandé par OpenRouter pour identifier l'app appelante
        // (n'a aucune influence sur la clé ni la facturation).
        "HTTP-Referer": window.location.origin,
        "X-Title": "AI Builder",
      }
    );
  }

  function callMistral(engine, cfg, prompt, genParams) {
    return callOpenAICompatible(
      "https://api.mistral.ai/v1/chat/completions",
      engine, cfg, prompt, genParams
    );
  }

  // -----------------------------------------------------------------
  // Simulation (moteurs non encore branchés : Groq, Hugging Face, Cloudflare AI)
  // -----------------------------------------------------------------
  function mockEngineCall(engine, cfg, prompt) {
    return new Promise((resolve, reject) => {
      if (!cfg || !cfg.apiKey || !cfg.apiKey.trim()) {
        reject(new ApiError(
          ErrorType.MISSING_KEY,
          `${messageFor(ErrorType.MISSING_KEY)} (variable attendue : ${engine.secretName})`,
          engine.id
        ));
        return;
      }

      const latency = 900 + Math.random() * 1800;
      setTimeout(() => {
        resolve({
          engineId: engine.id,
          model: cfg.model || engine.defaultModel,
          text: buildMockAnswer(engine, prompt),
          usage: { promptTokens: Math.round(prompt.length / 4), completionTokens: 180 },
        });
      }, latency);
    });
  }

  function buildMockAnswer(engine, prompt) {
    const topic = prompt.trim().slice(0, 80) || "votre projet";
    return (
      `[Simulation ${engine.label} — moteur pas encore branché en V2]\n\n` +
      `Voici une proposition de structure pour : "${topic}".\n` +
      `1. Analyse du besoin\n2. Architecture proposée\n3. Points d'attention\n\n` +
      `Cette réponse est un espace réservé généré localement. ${engine.label} sera ` +
      `branché à une vraie API dans une prochaine mise à jour.`
    );
  }

  // -----------------------------------------------------------------
  // Point d'entrée public utilisé par l'orchestrateur (app.js).
  // Aiguille vers un vrai fournisseur si disponible, sinon simule.
  // -----------------------------------------------------------------
  async function callEngine(engine, cfg, prompt) {
    const settings = Settings.get();
    const genParams = { temperature: settings.temperature, maxTokens: settings.maxTokens };

    switch (engine.id) {
      case "gemini":
        return callGemini(engine, cfg, prompt, genParams);
      case "openrouter":
        return callOpenRouter(engine, cfg, prompt, genParams);
      case "mistral":
        return callMistral(engine, cfg, prompt, genParams);
      default:
        return mockEngineCall(engine, cfg, prompt);
    }
  }

  return {
    ErrorType,
    ApiError,
    messageFor,
    callEngine,
  };
})();
