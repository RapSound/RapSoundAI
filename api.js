/**
 * api.js  (V3)
 * ---------------------------------------------------------------------
 * Appels RÉELS vers tous les moteurs, directement depuis le navigateur :
 *   - "openai"    : tout fournisseur compatible OpenAI (ChatGPT, DeepSeek,
 *                   Groq, Mistral, xAI, OpenRouter, Together, HF, Ollama…)
 *   - "anthropic" : Claude (en-tête navigateur officiel)
 *   - "gemini"    : Google AI Studio
 * Plus de simulation : un moteur sans clé échoue proprement (MISSING_KEY).
 *
 * ⚠️ Sécurité : une clé saisie ici reste dans votre navigateur
 * (localStorage) mais est visible dans l'onglet Réseau. Usage perso
 * uniquement ; en public, passez par un relais serveur.
 * ⚠️ CORS : si un moteur échoue avec une erreur réseau alors que la clé
 * est bonne, le fournisseur bloque probablement les appels navigateur.
 * ---------------------------------------------------------------------
 */
const Api = (() => {

  const ErrorType = {
    MISSING_KEY: "MISSING_KEY", QUOTA_EXCEEDED: "QUOTA_EXCEEDED", NETWORK_ERROR: "NETWORK_ERROR",
    EMPTY_RESPONSE: "EMPTY_RESPONSE", TIMEOUT: "TIMEOUT", UNKNOWN: "UNKNOWN",
  };

  class ApiError extends Error {
    constructor(type, message, engineId) {
      super(message);
      this.name = "ApiError";
      this.type = type;
      this.engineId = engineId;
    }
  }

  const ERROR_MESSAGES = {
    [ErrorType.MISSING_KEY]: "Clé API absente ou invalide. Vérifiez-la dans les Paramètres.",
    [ErrorType.QUOTA_EXCEEDED]: "Quota dépassé pour ce moteur. Réessayez plus tard.",
    [ErrorType.NETWORK_ERROR]: "Connexion impossible à ce moteur (réseau ou blocage CORS).",
    [ErrorType.EMPTY_RESPONSE]: "Réponse vide reçue de ce moteur.",
    [ErrorType.TIMEOUT]: "Le moteur n'a pas répondu à temps.",
    [ErrorType.UNKNOWN]: "Erreur inconnue.",
  };
  const messageFor = (type) => ERROR_MESSAGES[type] || ERROR_MESSAGES.UNKNOWN;

  function classifyHttpStatus(status) {
    if (status === 401 || status === 403) return ErrorType.MISSING_KEY;
    if (status === 429 || status === 402) return ErrorType.QUOTA_EXCEEDED;
    return ErrorType.UNKNOWN;
  }

  async function requestJSON(url, options = {}, engineId, timeoutMs = 120000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
      if (err.name === "AbortError") throw new ApiError(ErrorType.TIMEOUT, messageFor(ErrorType.TIMEOUT), engineId);
      throw new ApiError(ErrorType.NETWORK_ERROR, messageFor(ErrorType.NETWORK_ERROR), engineId);
    } finally {
      clearTimeout(timer);
    }

    let payload = null;
    try { payload = await response.json(); } catch (_) { payload = null; }

    if (!response.ok) {
      const type = classifyHttpStatus(response.status);
      const providerMessage = (typeof payload?.error === "string" ? payload.error : payload?.error?.message) || payload?.message || "";
      const detail = providerMessage ? ` (${String(providerMessage).slice(0, 200)})` : ` (HTTP ${response.status})`;
      throw new ApiError(type, messageFor(type) + detail, engineId);
    }
    return payload;
  }

  function endpointOf(engine, cfg) {
    return ((engine.editableBaseUrl ? cfg?.baseUrl : null) || engine.baseUrl).trim();
  }

  function ensureApiKey(engine, cfg) {
    if (engine.keyless) return;
    if (!cfg || !cfg.apiKey || !cfg.apiKey.trim()) {
      throw new ApiError(ErrorType.MISSING_KEY,
        `${messageFor(ErrorType.MISSING_KEY)} (variable attendue : ${engine.secretName})`, engine.id);
    }
  }

  function ensureText(text, engineId) {
    if (!text || !text.trim()) throw new ApiError(ErrorType.EMPTY_RESPONSE, messageFor(ErrorType.EMPTY_RESPONSE), engineId);
    return text;
  }

  const result = (engine, model, text, p, c) => ({
    engineId: engine.id, model, text, usage: { promptTokens: p ?? null, completionTokens: c ?? null },
  });

  // ---------------- Gemini ----------------
  async function callGemini(engine, cfg, prompt, o) {
    const model = (cfg.model || engine.defaultModel).trim();
    const body = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: o.temperature, maxOutputTokens: o.maxTokens },
    };
    if (o.system) body.systemInstruction = { parts: [{ text: o.system }] };
    const data = await requestJSON(`${engine.baseUrl}/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey },
      body: JSON.stringify(body),
    }, engine.id, o.timeoutMs);
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
    ensureText(text, engine.id);
    return result(engine, model, text, data?.usageMetadata?.promptTokenCount, data?.usageMetadata?.candidatesTokenCount);
  }

  // ---------------- Claude (Anthropic) ----------------
  async function callAnthropic(engine, cfg, prompt, o) {
    const model = (cfg.model || engine.defaultModel).trim();
    const body = { model, max_tokens: o.maxTokens, temperature: Math.min(o.temperature, 1), messages: [{ role: "user", content: prompt }] };
    if (o.system) body.system = o.system;
    const data = await requestJSON(endpointOf(engine, cfg), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": cfg.apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    }, engine.id, o.timeoutMs);
    const text = (data?.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
    ensureText(text, engine.id);
    return result(engine, model, text, data?.usage?.input_tokens, data?.usage?.output_tokens);
  }

  // ---------------- Compatible OpenAI ----------------
  async function callOpenAICompatible(engine, cfg, prompt, o) {
    const model = (cfg.model || engine.defaultModel).trim();
    const messages = [];
    if (o.system) messages.push({ role: "system", content: o.system });
    messages.push({ role: "user", content: prompt });

    const body = { model, messages };
    // Modèles de raisonnement OpenAI (o*, gpt-5*) : pas de température, max_completion_tokens.
    const reasoning = engine.id === "openai" && /^(o\d|gpt-5)/i.test(model);
    if (engine.id === "openai") body.max_completion_tokens = o.maxTokens; else body.max_tokens = o.maxTokens;
    if (!reasoning) body.temperature = o.temperature;
    if (engine.id === "pollinations") { body.private = true; body.referrer = "rapsoundai"; }

    const headers = { "Content-Type": "application/json" };
    if (cfg.apiKey && cfg.apiKey.trim()) headers.Authorization = `Bearer ${cfg.apiKey.trim()}`;
    if (engine.id === "openrouter") { headers["HTTP-Referer"] = window.location.origin; headers["X-Title"] = "RapSoundAI"; }

    const data = await requestJSON(endpointOf(engine, cfg), { method: "POST", headers, body: JSON.stringify(body) }, engine.id, o.timeoutMs);
    const text = data?.choices?.[0]?.message?.content || "";
    ensureText(text, engine.id);
    return result(engine, model, text, data?.usage?.prompt_tokens, data?.usage?.completion_tokens);
  }

  /**
   * Point d'entrée : callEngine(engine, cfg, prompt, { system, maxTokens, temperature, timeoutMs })
   */
  async function callEngine(engine, cfg, prompt, opts = {}) {
    ensureApiKey(engine, cfg);
    const s = Settings.get();
    const o = {
      system: opts.system || "",
      temperature: opts.temperature ?? s.temperature,
      maxTokens: opts.maxTokens ?? s.maxTokens,
      timeoutMs: opts.timeoutMs ?? 120000,
    };
    if (engine.kind === "gemini") return callGemini(engine, cfg, prompt, o);
    if (engine.kind === "anthropic") return callAnthropic(engine, cfg, prompt, o);
    return callOpenAICompatible(engine, cfg, prompt, o);
  }

  /** Liste les modèles réellement disponibles chez le fournisseur (catalogue à jour). */
  async function listModels(engine, cfg) {
    ensureApiKey(engine, cfg);
    if (engine.kind === "gemini") {
      const d = await requestJSON(engine.baseUrl + "?pageSize=200", { headers: { "x-goog-api-key": cfg.apiKey } }, engine.id, 20000);
      return (d.models || []).filter((m) => (m.supportedGenerationMethods || []).includes("generateContent"))
        .map((m) => m.name.replace(/^models\//, ""));
    }
    if (engine.kind === "anthropic") {
      const d = await requestJSON("https://api.anthropic.com/v1/models?limit=100", {
        headers: { "x-api-key": cfg.apiKey, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
      }, engine.id, 20000);
      return (d.data || []).map((m) => m.id);
    }
    const base = endpointOf(engine, cfg).replace(/\/chat\/completions\/?$/, "");
    const url = engine.id === "pollinations" ? "https://text.pollinations.ai/models" : base + "/models";
    const headers = {};
    if (cfg.apiKey && cfg.apiKey.trim()) headers.Authorization = `Bearer ${cfg.apiKey.trim()}`;
    const d = await requestJSON(url, { headers }, engine.id, 20000);
    const arr = Array.isArray(d) ? d : (d.data || d.models || []);
    return arr.map((m) => (typeof m === "string" ? m : m.id || m.name)).filter(Boolean);
  }

  return { ErrorType, ApiError, messageFor, callEngine, listModels };
})();
