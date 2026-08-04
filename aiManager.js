/**
 * aiManager.js
 * ---------------------------------------------------------------------
 * Registre central des moteurs IA disponibles.
 *
 * ⚠️ V1 : ce module décrit l'ARCHITECTURE des moteurs (métadonnées,
 * activation, nom de clé) mais n'exécute aucun appel réseau réel.
 * Les appels effectifs seront implémentés dans api.js lors d'une
 * prochaine version.
 *
 * Pour ajouter une nouvelle IA :
 *   1. Ajouter une entrée à ENGINE_DEFINITIONS ci-dessous.
 *   2. Ne JAMAIS coder une clé API en dur : utiliser `secretName`,
 *      qui correspond au nom du GitHub Secret / variable d'environnement
 *      (ex. "GEMINI_SECRET_KEY"), et laisser l'utilisateur renseigner
 *      sa propre clé dans les Paramètres si besoin en local.
 *   3. C'est tout : les paramètres, l'UI et le pipeline de génération
 *      s'adaptent automatiquement à la liste ci-dessous.
 * ---------------------------------------------------------------------
 */

const AIManager = (() => {

  /**
   * Définition statique de chaque moteur IA pris en charge.
   *
   * id           identifiant technique stable (utilisé dans le storage)
   * label        nom affiché dans l'interface
   * secretName   nom de la variable/secret attendu (jamais la clé elle-même)
   * docsUrl      lien vers la doc officielle du fournisseur (aide utilisateur)
   * defaultModel modèle par défaut proposé
   * modelOptions liste de modèles suggérés (l'utilisateur peut saisir un autre nom)
   * color        couleur d'accent pour l'identification visuelle dans l'UI
   * defaultActive état d'activation par défaut
   */
  const ENGINE_DEFINITIONS = [
    {
      id: "gemini",
      label: "Gemini",
      secretName: "GEMINI_SECRET_KEY",
      docsUrl: "https://ai.google.dev/",
      defaultModel: "gemini-1.5-flash",
      modelOptions: ["gemini-1.5-flash", "gemini-1.5-pro"],
      color: "#4d8bff",
      defaultActive: true,
    },
    {
      id: "openrouter",
      label: "OpenRouter",
      secretName: "OPENROUTER_SECRET_KEY",
      docsUrl: "https://openrouter.ai/docs",
      defaultModel: "meta-llama/llama-3.1-8b-instruct:free",
      modelOptions: ["meta-llama/llama-3.1-8b-instruct:free", "mistralai/mistral-7b-instruct:free"],
      color: "#7c2ae8",
      defaultActive: true,
    },
    {
      id: "groq",
      label: "Groq",
      secretName: "GROQ_SECRET_KEY",
      docsUrl: "https://console.groq.com/docs",
      defaultModel: "llama-3.1-8b-instant",
      modelOptions: ["llama-3.1-8b-instant", "llama-3.3-70b-versatile"],
      color: "#ff9f1c",
      defaultActive: true,
    },
    {
      id: "huggingface",
      label: "Hugging Face",
      secretName: "HUGGINGFACE_SECRET_KEY",
      docsUrl: "https://huggingface.co/docs/api-inference",
      defaultModel: "HuggingFaceH4/zephyr-7b-beta",
      modelOptions: ["HuggingFaceH4/zephyr-7b-beta", "mistralai/Mistral-7B-Instruct-v0.2"],
      color: "#ffd21e",
      defaultActive: false,
    },
    {
      id: "mistral",
      label: "Mistral",
      secretName: "MISTRAL_SECRET_KEY",
      docsUrl: "https://docs.mistral.ai/",
      defaultModel: "mistral-small-latest",
      modelOptions: ["mistral-small-latest", "open-mistral-nemo"],
      color: "#ff6b4d",
      defaultActive: false,
    },
    {
      id: "cloudflare",
      label: "Cloudflare AI",
      secretName: "CLOUDFLARE_SECRET_KEY",
      docsUrl: "https://developers.cloudflare.com/workers-ai/",
      defaultModel: "@cf/meta/llama-3.1-8b-instruct",
      modelOptions: ["@cf/meta/llama-3.1-8b-instruct", "@cf/mistral/mistral-7b-instruct-v0.1"],
      color: "#f6821f",
      defaultActive: false,
    },
  ];

  function getAll() {
    return ENGINE_DEFINITIONS;
  }

  function getById(id) {
    return ENGINE_DEFINITIONS.find((engine) => engine.id === id) || null;
  }

  /** Construit la configuration par défaut à insérer dans les paramètres. */
  function buildDefaultEngineSettings() {
    const config = {};
    ENGINE_DEFINITIONS.forEach((engine) => {
      config[engine.id] = {
        active: engine.defaultActive,
        apiKey: "",           // renseignée par l'utilisateur en local (jamais commit)
        model: engine.defaultModel,
      };
    });
    return config;
  }

  return {
    getAll,
    getById,
    buildDefaultEngineSettings,
  };
})();
