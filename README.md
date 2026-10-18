# RapSoundAI Studio

Générateur de **sites et d'applications web complets** par une équipe d'IA — dans l'esprit de l'orchestrateur « Nexus Text AI » : un architecte planifie, plusieurs IA se partagent le travail, une dernière relit. Résultat : **aperçu instantané** + **projet ZIP** prêt pour GitHub Pages.

100 % statique (HTML/CSS/JS), sans build, sans serveur. Fonctionne hors-ligne une fois chargé.

## Les IA branchées

| Moteur | Clé | Remarque |
|---|---|---|
| **Pollinations** | aucune | gratuit, actif par défaut |
| **Claude** (Anthropic) | `ANTHROPIC_SECRET_KEY` | |
| **ChatGPT** (OpenAI) | `OPENAI_SECRET_KEY` | |
| **Gemini** (Google) | `GEMINI_SECRET_KEY` | |
| **DeepSeek** | `DEEPSEEK_SECRET_KEY` | `deepseek-reasoner` pour le raisonnement |
| **Groq** | `GROQ_SECRET_KEY` | très rapide |
| **Mistral / Codestral** | `MISTRAL_SECRET_KEY` | |
| **Grok** (xAI) | `XAI_SECRET_KEY` | |
| **OpenRouter** | `OPENROUTER_SECRET_KEY` | des centaines de modèles |
| **Together AI** | `TOGETHER_SECRET_KEY` | |
| **Hugging Face** | `HUGGINGFACE_SECRET_KEY` | Inference Providers |
| **Endpoint perso** | optionnelle | Ollama, LM Studio… (API compatible OpenAI) |

Saisir une clé dans **Paramètres** active automatiquement le moteur. Le bouton **↻** à côté du modèle charge la **liste réelle** des modèles du fournisseur (les catalogues changent vite : ne vous fiez pas à une liste figée).

## Comment ça travaille (mode Studio)

1. **Architecte** → plan JSON (titre, palette, polices, sections, fonctionnalités)
2. **Structure** → `index.html`
3. **Design ∥ Logique** *(en parallèle, sur deux IA différentes)* → `css/style.css` (styles, animations) et `js/app.js`
4. **Relecture** → cohérence ids/classes, syntaxe (auto-réparation du JS), fonctionnalités manquantes
5. **Assemblage** → pack d'effets, PWA, mode fichier unique, README, workflow GitHub Pages

Chaque rôle est attribué automatiquement à la meilleure IA prête, en répartissant la charge (réglable dans *Paramètres → Orchestrateur*). **Si une IA échoue** (quota, clé, CORS), la suivante prend le relais ; si tout échoue pour un rôle, un fichier de secours est généré et le projet est tout de même livré.

Le mode **Fusion** interroge toutes les IA prêtes sur la même demande puis demande à une IA de fusionner le meilleur de chaque réponse.

Après génération, la zone **Affiner** permet de demander des modifications ciblées (« ajoute une section tarifs », « thème clair »…) : seuls les fichiers concernés sont réécrits.

## Pack d'effets (inclus dans chaque projet)

Les animations de base ne sont pas « inventées » par les IA : elles utilisent un pack **testé** (`css/effects.css` + `js/effects.js`), ce qui garantit un rendu soigné même avec un modèle modeste.

`data-reveal="up|left|right|zoom"` · `data-tilt` · `data-particles` · `data-magnetic` · `data-parallax` · `data-count` · `data-cursor-glow` · `.glass` · `.aurora` · `.neon` · `.grad-text` · `.float` · `.shine` · `.marquee`

Tout respecte `prefers-reduced-motion`.

## Utilisation

Ouvrez `index.html` (ou `npx serve .`), puis *Paramètres* → collez au moins une clé (ou gardez Pollinations, sans clé) → décrivez votre projet → **Générer**.

### Déployer sur GitHub Pages
Poussez le dépôt sur `main`, puis *Settings → Pages → Source : GitHub Actions*. Le workflow `.github/workflows/pages.yml` publie le site.

## Sécurité — à lire

- Les clés saisies restent dans le `localStorage` de **votre** navigateur et ne sont jamais exportées. Elles sont toutefois visibles dans l'onglet *Réseau* : usage **personnel** uniquement. Pour un site public, passez par un relais serveur (GitHub Actions / Cloudflare Worker) et utilisez des *GitHub Secrets*.
- L'**aperçu** s'exécute dans un `iframe` isolé (`sandbox` sans `allow-same-origin`) : le code généré ne peut pas lire vos clés.
- **CORS** : si un moteur échoue alors que la clé est bonne, le fournisseur bloque probablement les appels depuis un navigateur — utilisez un relais ou un autre moteur (le relais automatique prend le relais).
- Les IA peuvent se tromper : relisez le code avant de le mettre en production.

## Architecture

```
index.html
css/style.css
js/storage.js        accès localStorage
js/aiManager.js      registre des moteurs (ajouter une IA = une entrée)
js/api.js            appels réels : OpenAI-compatible, Claude, Gemini
js/settings.js       paramètres, clés, rôles
js/studio-assets.js  pack d'effets, styles, types de projet
js/studio-core.js    parsing, assemblage, ZIP, contrôles qualité
js/studio.js         orchestrateur multi-IA (Studio, Fusion, Affinage)
js/ui.js             rendu (aperçu, fichiers, historique)
js/app.js            point d'entrée
```

### Ajouter une IA
Ajoutez une entrée à `ENGINE_DEFINITIONS` dans `js/aiManager.js` (`kind: "openai"` suffit pour tout fournisseur compatible OpenAI). Paramètres, rôles et orchestrateur s'adaptent automatiquement.

## Changelog V3
- 12 moteurs réels (plus aucune simulation) ; relais automatique en cas d'échec
- Orchestrateur Studio, mode Fusion, affinage, aperçu isolé, export ZIP
- Pack d'effets et d'animations, PWA hors-ligne, mode fichier unique
- Correction : `index.html` chargeait `js/aiManager.js` alors que le fichier s'appelait `aimanager.js` (404 sur GitHub Pages, sensible à la casse)
- Cloudflare AI (jamais branché) remplacé par l'endpoint personnalisé
