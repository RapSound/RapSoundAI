/**
 * aiManager.js  (V3)
 * ---------------------------------------------------------------------
 * Registre central des moteurs IA. Ajouter une IA = ajouter une entrée
 * dans ENGINE_DEFINITIONS : paramètres, UI et orchestrateur s'adaptent.
 *
 *  kind         "openai" (API compatible OpenAI) | "anthropic" | "gemini"
 *  baseUrl      endpoint de génération (chat/completions, messages…)
 *  keyless      true = fonctionne sans clé (ex. Pollinations)
 *  skills       compétences 0-10 par rôle (design, logic, reason, write) :
 *               sert à l'AUTO-affectation des rôles. Réglable à la main
 *               dans Paramètres > Orchestrateur.
 *  secretName   nom du GitHub Secret / variable (jamais la clé elle-même)
 * ---------------------------------------------------------------------
 */
const AIManager = (() => {

  const ENGINE_DEFINITIONS = [
    {
      id: "pollinations", label: "Pollinations (gratuit)", kind: "openai", keyless: true,
      baseUrl: "https://text.pollinations.ai/openai",
      secretName: "—", docsUrl: "https://pollinations.ai/",
      defaultModel: "openai", modelOptions: ["openai", "openai-large", "deepseek", "qwen-coder", "mistral", "gemini"],
      color: "#9be564", defaultActive: true,
      skills: { design: 6, logic: 6, reason: 6, write: 6 },
    },
    {
      id: "anthropic", label: "Claude", kind: "anthropic",
      baseUrl: "https://api.anthropic.com/v1/messages",
      secretName: "ANTHROPIC_SECRET_KEY", docsUrl: "https://docs.claude.com/",
      defaultModel: "claude-sonnet-5-5", modelOptions: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"],
      color: "#d97757", defaultActive: false,
      skills: { design: 9, logic: 9, reason: 9, write: 9 },
    },
    {
      id: "openai", label: "ChatGPT (OpenAI)", kind: "openai",
      baseUrl: "https://api.openai.com/v1/chat/completions",
      secretName: "OPENAI_SECRET_KEY", docsUrl: "https://platform.openai.com/docs",
      defaultModel: "gpt-4o-mini", modelOptions: ["gpt-4o-mini", "gpt-4o", "gpt-4.1"],
      color: "#10a37f", defaultActive: false,
      skills: { design: 8, logic: 8, reason: 8, write: 8 },
    },
    {
      id: "gemini", label: "Gemini", kind: "gemini",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/models",
      secretName: "GEMINI_SECRET_KEY", docsUrl: "https://ai.google.dev/",
      defaultModel: "gemini-2.5-flash", modelOptions: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3.5-flash", "gemini-3.6-flash"],
      color: "#4d8bff", defaultActive: false,
      skills: { design: 8, logic: 8, reason: 8, write: 8 },
    },
    {
      id: "deepseek", label: "DeepSeek", kind: "openai",
      baseUrl: "https://api.deepseek.com/chat/completions",
      secretName: "DEEPSEEK_SECRET_KEY", docsUrl: "https://api-docs.deepseek.com/",
      defaultModel: "deepseek-chat", modelOptions: ["deepseek-chat", "deepseek-reasoner"],
      color: "#4f6bff", defaultActive: false,
      skills: { design: 6, logic: 9, reason: 9, write: 6 },
    },
    {
      id: "groq", label: "Groq (ultra rapide)", kind: "openai",
      baseUrl: "https://api.groq.com/openai/v1/chat/completions",
      secretName: "GROQ_SECRET_KEY", docsUrl: "https://console.groq.com/docs",
      defaultModel: "llama-3.3-70b-versatile", modelOptions: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
      color: "#ff9f1c", defaultActive: false,
      skills: { design: 6, logic: 7, reason: 6, write: 6 },
    },
    {
      id: "mistral", label: "Mistral / Codestral", kind: "openai",
      baseUrl: "https://api.mistral.ai/v1/chat/completions",
      secretName: "MISTRAL_SECRET_KEY", docsUrl: "https://docs.mistral.ai/",
      defaultModel: "mistral-large-latest", modelOptions: ["mistral-large-latest", "mistral-small-latest", "codestral-latest"],
      color: "#ff6b4d", defaultActive: false,
      skills: { design: 6, logic: 7, reason: 6, write: 7 },
    },
    {
      id: "xai", label: "Grok (xAI)", kind: "openai",
      baseUrl: "https://api.x.ai/v1/chat/completions",
      secretName: "XAI_SECRET_KEY", docsUrl: "https://docs.x.ai/",
      defaultModel: "grok-3-mini", modelOptions: ["grok-3-mini", "grok-3"],
      color: "#c9c9d1", defaultActive: false,
      skills: { design: 7, logic: 7, reason: 8, write: 7 },
    },
    {
      id: "openrouter", label: "OpenRouter (centaines de modèles)", kind: "openai",
      baseUrl: "https://openrouter.ai/api/v1/chat/completions",
      secretName: "OPENROUTER_SECRET_KEY", docsUrl: "https://openrouter.ai/models?order=top-weekly",
      // Le catalogue change vite : utilisez « Actualiser les modèles » dans les Paramètres.
      defaultModel: "openrouter/auto", modelOptions: ["openrouter/auto", "meta-llama/llama-3.3-70b-instruct:free"],
      color: "#7c2ae8", defaultActive: false,
      skills: { design: 7, logic: 7, reason: 7, write: 7 },
    },
    {
      id: "together", label: "Together AI", kind: "openai",
      baseUrl: "https://api.together.xyz/v1/chat/completions",
      secretName: "TOGETHER_SECRET_KEY", docsUrl: "https://docs.together.ai/",
      defaultModel: "Qwen/Qwen2.5-Coder-32B-Instruct", modelOptions: ["Qwen/Qwen2.5-Coder-32B-Instruct", "deepseek-ai/DeepSeek-V3"],
      color: "#0f6fff", defaultActive: false,
      skills: { design: 6, logic: 8, reason: 6, write: 6 },
    },
    {
      id: "huggingface", label: "Hugging Face", kind: "openai",
      baseUrl: "https://router.huggingface.co/v1/chat/completions",
      secretName: "HUGGINGFACE_SECRET_KEY", docsUrl: "https://huggingface.co/docs/inference-providers",
      defaultModel: "Qwen/Qwen2.5-Coder-32B-Instruct", modelOptions: ["Qwen/Qwen2.5-Coder-32B-Instruct", "meta-llama/Llama-3.3-70B-Instruct"],
      color: "#ffd21e", defaultActive: false,
      skills: { design: 5, logic: 6, reason: 5, write: 5 },
    },
    {
      id: "custom", label: "Endpoint perso (Ollama, LM Studio…)", kind: "openai", keyless: true, editableBaseUrl: true,
      baseUrl: "http://localhost:11434/v1/chat/completions",
      secretName: "CUSTOM_SECRET_KEY", docsUrl: "https://ollama.com/blog/openai-compatibility",
      defaultModel: "qwen2.5-coder", modelOptions: ["qwen2.5-coder", "llama3.1"],
      color: "#8a8a99", defaultActive: false,
      skills: { design: 5, logic: 5, reason: 5, write: 5 },
    },
  ];

  const getAll = () => ENGINE_DEFINITIONS;
  const getById = (id) => ENGINE_DEFINITIONS.find((e) => e.id === id) || null;

  function buildDefaultEngineSettings() {
    const config = {};
    ENGINE_DEFINITIONS.forEach((e) => {
      config[e.id] = { active: e.defaultActive, apiKey: "", model: e.defaultModel, baseUrl: e.baseUrl };
    });
    return config;
  }

  /** Un moteur est « prêt » s'il est actif ET (sans clé requise OU clé saisie). */
  function isReady(engine, cfg) {
    if (!cfg || !cfg.active) return false;
    return !!engine.keyless || !!(cfg.apiKey && cfg.apiKey.trim());
  }

  return { getAll, getById, buildDefaultEngineSettings, isReady };
})();
