/**
 * studio.js
 * ---------------------------------------------------------------------
 * Orchestrateur multi-IA « Studio » (dans l'esprit de Nexus Text AI) :
 *
 *   1. ARCHITECTE  → plan JSON (titre, palette, polices, sections, features)
 *   2. STRUCTURE   → index.html
 *   3. DESIGN ∥ LOGIQUE (en parallèle, sur des IA différentes)
 *        design  → css/style.css (styles, animations, micro-interactions)
 *        logique → js/app.js
 *   4. RELECTURE   → cohérence HTML/CSS/JS (+ auto-réparation de syntaxe)
 *   5. ASSEMBLAGE  → pack d'effets, PWA, fichier unique, README, CI
 *
 * Chaque rôle a une chaîne de SECOURS : si une IA échoue (quota, CORS,
 * clé), la suivante prend le relais ; si tout échoue, un fichier de
 * repli est généré et le projet est tout de même livré.
 * ---------------------------------------------------------------------
 */
const Studio = (() => {

  const ROLE_LABELS = { architect: "Architecte", structure: "Structure HTML", design: "Design & effets", logic: "Logique JS", review: "Relecture", refine: "Affinage", fusion: "Fusion", repair: "Réparation" };
  const SKILL_OF = { architect: "reason", structure: "write", design: "design", logic: "logic", review: "reason", refine: "logic", fusion: "reason", repair: "logic" };

  const SYSTEM_BASE =
    "Tu es un ingénieur front-end senior ET directeur artistique. Tu produis du code COMPLET et fonctionnel : jamais de placeholder, de « ... », de TODO ni de lorem ipsum. " +
    "HTML5 sémantique, CSS moderne (variables, grid, flex, clamp), JavaScript vanilla ES2022, mobile-first, accessible (contrastes, aria, :focus-visible), sans dépendance externe hormis Google Fonts. " +
    "Réponds UNIQUEMENT avec les blocs de code demandés, sans introduction ni conclusion. Format : un bloc ```langage par fichier dont la PREMIÈRE ligne est un commentaire « filename: chemin/fichier.ext ».";

  // ----------------------------------------------------------------
  // Sélection des moteurs
  // ----------------------------------------------------------------
  function readyEngines() {
    const s = Settings.get();
    return AIManager.getAll().filter((e) => AIManager.isReady(e, s.engines[e.id]));
  }

  function chainFor(role, ready, usage) {
    const s = Settings.get();
    const skill = SKILL_OF[role];
    const score = (e) => (e.skills?.[skill] ?? 5) * 10 - (usage[e.id] || 0) * 4;
    let list = [...ready].sort((a, b) => score(b) - score(a));
    const pref = s.roles?.[role] || "auto";
    if (pref !== "auto") {
      const p = list.find((e) => e.id === pref);
      if (p) list = [p, ...list.filter((e) => e !== p)];
    }
    if (list[0]) usage[list[0].id] = (usage[list[0].id] || 0) + 1; // répartit les rôles entre IA
    return list;
  }

  function tokensFor(base) { return Math.max(Settings.get().maxTokens, base); }

  async function callRole(role, chain, prompt, ctx, extra = {}) {
    const s = Settings.get();
    let lastErr = null;
    for (const engine of chain) {
      ctx.hooks.engine(engine.id, "loading", `${engine.label} · ${ROLE_LABELS[role]}`);
      try {
        const res = await Api.callEngine(engine, s.engines[engine.id], prompt, { system: extra.system || SYSTEM_BASE, maxTokens: extra.maxTokens, temperature: extra.temperature });
        ctx.hooks.engine(engine.id, "ok", `${engine.label} · ${ROLE_LABELS[role]} ✓`);
        ctx.hooks.log("ok", `${ROLE_LABELS[role]} → ${engine.label} (${res.model})${res.usage.completionTokens ? ` · ${res.usage.completionTokens} tokens` : ""}`);
        ctx.team.push({ role: ROLE_LABELS[role], engine: engine.label, model: res.model });
        return { res, engine };
      } catch (err) {
        lastErr = err;
        ctx.hooks.engine(engine.id, "error", `${engine.label} · échec`);
        ctx.hooks.log("warn", `${ROLE_LABELS[role]} : ${engine.label} a échoué — ${err.message}${chain.length > 1 ? " → relais par l'IA suivante" : ""}`);
      }
    }
    throw lastErr || new Error("Aucun moteur disponible");
  }

  // ----------------------------------------------------------------
  // Contraintes créatives injectées dans les prompts
  // ----------------------------------------------------------------
  function buildBrief(o) {
    const type = StudioAssets.PROJECT_TYPES.find((t) => t.id === o.type);
    const style = StudioAssets.STYLES.find((t) => t.id === o.style) || StudioAssets.STYLES[0];
    const fx = StudioAssets.EFFECTS.filter((e) => (o.effects || []).includes(e.id));
    return {
      type: type?.brief || "",
      style: style.brief,
      fx,
      fxText: fx.length ? fx.map((e) => `- ${e.label} : ${e.hook}`).join("\n") : "- (aucun effet imposé : reste sobre)",
    };
  }


  const PROMPTS = {
    planSystem: "Tu es directeur technique et directeur artistique. Réponds UNIQUEMENT par un objet JSON valide, sans texte autour ni balises.",
    plan: (prompt, b) =>
      `Demande : ${prompt}\n${b.type ? `Type : ${b.type}\n` : ""}Direction artistique : ${b.style}\n\n` +
      `JSON attendu : {"title":"nom court","tagline":"slogan","summary":"2 phrases","lang":"fr","palette":{"bg":"#hex","fg":"#hex","accent":"#hex","accent2":"#hex"},"fonts":{"display":"police Google Fonts","body":"police Google Fonts"},"sections":["…"],"features":["fonctionnalités JavaScript concrètes et vérifiables"]}`,

    structure: (prompt, plan, b) =>
      `DEMANDE : ${prompt}\nPLAN : ${JSON.stringify(plan)}\n${b.type ? `TYPE : ${b.type}\n` : ""}\n` +
      `Écris index.html COMPLET : doctype, <html lang>, <head> (meta viewport, title, meta description, lien Google Fonts pour les polices du plan, <link rel="stylesheet" href="css/style.css">), ` +
      `body avec TOUTES les sections du plan, contenu rédactionnel réel et riche (langue de la demande), puis <script src="js/app.js" defer></script> avant </body>.\n` +
      `IDs/classes explicites (BEM) : le CSS et le JS seront écrits par d'autres IA à partir de ton HTML. Chaque bouton, formulaire ou zone dynamique a un id ou data-action clair.\n` +
      `EFFETS DU PACK à utiliser aux bons endroits (le pack est ajouté automatiquement, ne le référence pas) :\n${b.fxText}\n` +
      `Aucun <style> ni JavaScript inline. Un seul bloc \`\`\`html dont la 1re ligne est <!-- filename: index.html -->.`,

    design: (plan, html, b) =>
      `PLAN : ${JSON.stringify(plan)}\nDIRECTION ARTISTIQUE : ${b.style}\n\nHTML de référence (classes et ids EXACTS) :\n\`\`\`html\n${html}\n\`\`\`\n\n` +
      `Écris css/style.css COMPLET :\n- :root avec --bg --fg --accent --accent-2 (valeurs de la palette du plan) + espacements, rayons, ombres, easing\n- reset léger, typographie fluide clamp(), mise en page grid/flex mobile-first (breakpoints 640px et 1024px)\n` +
      `- style de CHAQUE classe et id du HTML, états :hover :focus-visible :active :disabled\n- animations : entrée du hero (@keyframes), micro-interactions (boutons, cartes, liens), transitions fluides ; respecte prefers-reduced-motion\n` +
      `- profondeur : dégradés, ombres, bordures fines ; jamais de rendu « page blanche par défaut » sauf direction minimale\n` +
      `- les effets du pack (.glass, .aurora, .neon, [data-reveal], [data-tilt]…) sont déjà fournis par effects.css : ne les redéfinis PAS, adapte seulement les variables\n` +
      `Un seul bloc \`\`\`css dont la 1re ligne est /* filename: css/style.css */.`,

    logic: (plan, html) =>
      `PLAN : ${JSON.stringify(plan)}\n\nHTML de référence :\n\`\`\`html\n${html}\n\`\`\`\n\n` +
      `Écris js/app.js COMPLET en JavaScript vanilla ES2022 :\n- 'use strict', tout dans DOMContentLoaded\n- n'utilise QUE des ids/classes/data-* présents dans le HTML ci-dessus (vérifie chacun)\n` +
      `- implémente RÉELLEMENT chaque fonctionnalité du plan (aucun stub, aucun TODO)\n- état centralisé, fonctions de rendu, délégation d'événements\n- persistance localStorage dans try/catch avec valeurs par défaut\n` +
      `- menu mobile, défilement fluide, attributs aria mis à jour\n- aucune librairie, aucune requête réseau externe\n- les effets visuels (reveal, tilt, particules) sont gérés par effects.js : ne les réimplémente pas\n` +
      `Un seul bloc \`\`\`javascript dont la 1re ligne est // filename: js/app.js.`,

    review: (plan, sources) =>
      `Relis ce projet (plan : ${JSON.stringify(plan)}).\n\n` + Object.entries(sources).map(([p, c]) => "### " + p + "\n```" + StudioCore.langOf(p) + "\n" + c.slice(0, 16000) + "\n```").join("\n\n") +
      `\n\nVérifie : (1) ids/classes utilisés par le JS et le CSS qui n'existent pas dans le HTML, (2) erreurs de syntaxe, (3) fonctionnalités du plan non implémentées, (4) problèmes responsive ou d'accessibilité évidents.\n` +
      `Réponds par les fichiers CORRIGÉS, COMPLETS (jamais d'extraits), uniquement ceux qui changent, au format demandé. Si tout est correct, réponds exactement : OK`,

    repair: (code, error) =>
      `Ce fichier JavaScript contient une erreur de syntaxe : « ${error} ».\nRenvoie le fichier COMPLET corrigé (même comportement), un seul bloc \`\`\`javascript dont la 1re ligne est // filename: js/app.js.\n\n\`\`\`javascript\n${code}\n\`\`\``,

    refine: (instruction, sources) =>
      `Voici le projet actuel :\n\n` + Object.entries(sources).map(([p, c]) => "### " + p + "\n```" + StudioCore.langOf(p) + "\n" + c + "\n```").join("\n\n") +
      `\n\nMODIFICATION DEMANDÉE : ${instruction}\n\nRenvoie UNIQUEMENT les fichiers modifiés ou créés, en entier, au format demandé (1re ligne « filename: »). Conserve tout ce qui n'est pas concerné.`,
  };

  // ----------------------------------------------------------------
  // Repli (aucune IA n'a répondu pour un rôle)
  // ----------------------------------------------------------------
  function fallbackPlan(prompt) {
    return { title: prompt.trim().split(/\s+/).slice(0, 4).join(" ").replace(/^./, (c) => c.toUpperCase()) || "Projet", tagline: "", summary: prompt.trim().slice(0, 200), lang: "fr",
      palette: { bg: "#0c0c11", fg: "#f5f5f7", accent: "#ff2d4d", accent2: "#7c2ae8" }, fonts: { display: "Space Grotesk", body: "Inter" }, sections: ["Hero", "Contenu", "Contact"], features: [] };
  }
  const hex = (v, d) => (/^#[0-9a-f]{3,8}$/i.test(v || "") ? v : d);
  function sanitizePlan(plan, prompt) {
    const f = fallbackPlan(prompt);
    plan.title = String(plan.title || f.title).slice(0, 60);
    plan.palette = { bg: hex(plan.palette?.bg, f.palette.bg), fg: hex(plan.palette?.fg, f.palette.fg), accent: hex(plan.palette?.accent, f.palette.accent), accent2: hex(plan.palette?.accent2, f.palette.accent2) };
    plan.fonts = { display: plan.fonts?.display || f.fonts.display, body: plan.fonts?.body || f.fonts.body };
    plan.sections = Array.isArray(plan.sections) ? plan.sections.slice(0, 12) : f.sections;
    plan.features = Array.isArray(plan.features) ? plan.features.slice(0, 12) : [];
    return plan;
  }
  function fallbackCss(plan) {
    const p = plan.palette;
    return `:root{--bg:${p.bg};--fg:${p.fg};--accent:${p.accent};--accent-2:${p.accent2}}\n*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font-family:system-ui,sans-serif;line-height:1.6}\nmain,section,header,footer{max-width:960px;margin:0 auto;padding:clamp(24px,6vw,72px)}h1,h2{line-height:1.1}a,button{color:var(--accent)}button{cursor:pointer}`;
  }

  const sourcesFromBlocks = (blocks, into = {}) => { blocks.forEach((b) => { if (b.path) into[b.path] = StudioCore.autoClose(b.path, b.code); }); return into; };

  // ----------------------------------------------------------------
  // Pipeline Studio
  // ----------------------------------------------------------------
  async function run({ prompt, options, hooks }) {
    const ready = readyEngines();
    if (!ready.length) throw new Error("Aucune IA prête : activez un moteur (et saisissez sa clé) dans les Paramètres.");
    const ctx = { hooks, team: [] };
    const usage = {};
    const b = buildBrief(options);
    const warnings = [];

    hooks.engines(ready);
    hooks.log("info", `${ready.length} IA prête(s) : ${ready.map((e) => e.label).join(", ")}.`);

    // 1. Architecte
    hooks.step("read", "is-active"); hooks.progress(8, "Plan du projet", "L'architecte conçoit la structure et la direction artistique");
    let plan;
    try {
      const { res } = await callRole("architect", chainFor("architect", ready, usage), PROMPTS.plan(prompt, b), ctx, { system: PROMPTS.planSystem, temperature: 0.3, maxTokens: 1500 });
      plan = sanitizePlan(StudioCore.extractJSON(res.text), prompt);
    } catch (e) {
      hooks.log("warn", `Plan automatique indisponible (${e.message}) : plan de secours utilisé.`);
      plan = fallbackPlan(prompt);
    }
    hooks.step("read", "is-done");

    // 2. Structure HTML
    hooks.step("dispatch", "is-active"); hooks.progress(25, "Structure HTML", "Écriture du squelette sémantique et du contenu");
    const sources = {};
    const html = await callRole("structure", chainFor("structure", ready, usage), PROMPTS.structure(prompt, plan, b), ctx, { maxTokens: tokensFor(8192), temperature: 0.6 });
    const parsedHtml = StudioCore.parseFiles(html.res.text);
    sourcesFromBlocks(parsedHtml.blocks.filter((x) => x.lang === "html" || x.path === "index.html"), sources);
    if (!sources["index.html"]) {
      const raw = html.res.text.trim();
      if (/<html|<!doctype/i.test(raw)) sources["index.html"] = StudioCore.autoClose("index.html", raw.replace(/^```\w*\n?|```$/g, ""));
      else throw new Error("L'IA n'a pas renvoyé de HTML exploitable.");
    }
    if (parsedHtml.truncated) warnings.push("HTML tronqué (limite de tokens) : balises fermées automatiquement.");
    hooks.step("dispatch", "is-done");

    // 3. Design ∥ Logique
    hooks.step("wait", "is-active"); hooks.progress(48, "Design & logique en parallèle", "Deux IA travaillent simultanément sur le même HTML");
    const [cssRes, jsRes] = await Promise.all([
      callRole("design", chainFor("design", ready, usage), PROMPTS.design(plan, sources["index.html"], b), ctx, { maxTokens: tokensFor(8192), temperature: 0.7 }).catch((e) => ({ error: e })),
      callRole("logic", chainFor("logic", ready, usage), PROMPTS.logic(plan, sources["index.html"]), ctx, { maxTokens: tokensFor(8192), temperature: 0.3 }).catch((e) => ({ error: e })),
    ]);
    if (cssRes.error) { hooks.log("error", `Design : toutes les IA ont échoué (${cssRes.error.message}). CSS de secours.`); sources["css/style.css"] = fallbackCss(plan); warnings.push("CSS de secours (design indisponible)."); }
    else {
      const p = StudioCore.parseFiles(cssRes.res.text);
      const blk = p.blocks.find((x) => x.lang === "css" || x.path === "css/style.css");
      sources["css/style.css"] = blk ? StudioCore.autoClose("css/style.css", blk.code) : fallbackCss(plan);
      if (p.truncated) warnings.push("CSS tronqué : accolades refermées automatiquement.");
    }
    if (jsRes.error) { hooks.log("error", `Logique : toutes les IA ont échoué (${jsRes.error.message}).`); sources["js/app.js"] = "// Logique indisponible : relancez l'affinage.\n"; warnings.push("JavaScript non généré."); }
    else {
      const p = StudioCore.parseFiles(jsRes.res.text);
      const blk = p.blocks.find((x) => /^(js|javascript)$/.test(x.lang) || x.path === "js/app.js");
      sources["js/app.js"] = blk ? blk.code : "// Réponse sans code exploitable.\n";
      if (p.truncated) warnings.push("JavaScript possiblement tronqué (limite de tokens) : augmentez « tokens max ».");
    }
    hooks.step("wait", "is-done");

    // 4. Contrôles + relecture
    hooks.step("compare", "is-active"); hooks.progress(72, "Contrôle qualité", "Cohérence HTML ↔ JS, syntaxe, relecture");
    let lint = StudioCore.lint(sources);
    if (lint.jsSyntaxError) {
      hooks.log("warn", `Erreur de syntaxe JS : ${lint.jsSyntaxError} → réparation automatique.`);
      try {
        const { res } = await callRole("repair", chainFor("repair", ready, usage), PROMPTS.repair(sources["js/app.js"], lint.jsSyntaxError), ctx, { maxTokens: tokensFor(8192), temperature: 0.1 });
        const blk = StudioCore.parseFiles(res.text).blocks.find((x) => /^(js|javascript)$/.test(x.lang));
        if (blk && !StudioCore.lint({ ...sources, "js/app.js": blk.code }).jsSyntaxError) { sources["js/app.js"] = blk.code; hooks.log("ok", "Syntaxe JS réparée."); }
        else warnings.push("Erreur de syntaxe JS non résolue.");
      } catch (e) { warnings.push("Erreur de syntaxe JS non résolue."); }
    }
    if (options.review) {
      try {
        const { res } = await callRole("review", chainFor("review", ready, usage), PROMPTS.review(plan, sources), ctx, { maxTokens: tokensFor(8192), temperature: 0.2 });
        if (res.text.trim().toUpperCase() !== "OK") {
          let applied = 0;
          StudioCore.parseFiles(res.text).blocks.forEach((blk) => {
            const old = sources[blk.path];
            // Garde-fou : on refuse une « correction » tronquée (<60 % de l'original)
            if (!blk.path || old == null || blk.code.length < old.length * 0.6) return;
            const next = StudioCore.autoClose(blk.path, blk.code);
            if (blk.path === "js/app.js" && StudioCore.lint({ ...sources, [blk.path]: next }).jsSyntaxError) return;
            sources[blk.path] = next; applied++;
          });
          hooks.log(applied ? "ok" : "info", applied ? `Relecture : ${applied} fichier(s) corrigé(s).` : "Relecture : corrections ignorées (incomplètes).");
        } else hooks.log("ok", "Relecture : aucun problème détecté.");
      } catch (e) { hooks.log("warn", "Relecture indisponible : étape ignorée."); }
    }
    lint = StudioCore.lint(sources);
    if (lint.missingIds.length) warnings.push(`Le JS référence des ids absents du HTML : ${lint.missingIds.join(", ")}.`);
    hooks.step("compare", "is-done");

    // 5. Assemblage
    hooks.step("merge", "is-active"); hooks.progress(90, "Assemblage", "Effets, PWA, README, déploiement GitHub Pages");
    const result = buildResult({ sources, plan, options, team: ctx.team, warnings, prompt });
    hooks.step("merge", "is-done");
    hooks.step("finalize", "is-active"); hooks.progress(100, "Terminé", "Projet prêt : aperçu et ZIP disponibles");
    hooks.step("finalize", "is-done");
    return result;
  }

  function buildResult({ sources, plan, options, team, warnings, prompt }) {
    const meta = { title: plan.title, summary: plan.summary, palette: plan.palette, contributors: team };
    const files = StudioCore.assemble(sources, options, meta);
    const order = (p) => (p === "index.html" ? 0 : p.startsWith("css/") ? 1 : p.startsWith("js/") ? 2 : 3);
    const list = Object.keys(files).sort((a, b) => order(a) - order(b) || a.localeCompare(b)).map((name) => ({
      name, content: files[name], size: files[name].length > 1024 ? (files[name].length / 1024).toFixed(1) + " Ko" : files[name].length + " o",
    }));
    const contributors = [...new Set(team.map((t) => t.engine))];
    const teamLines = team.map((t) => `• ${t.role} — ${t.engine} (${t.model})`).join("\n");
    return {
      mode: "studio", title: plan.title, prompt, options, plan, sources,
      finalText: `« ${plan.title} » — ${plan.summary || "projet généré"}\n\n${list.length} fichiers générés, prêts à être téléchargés en ZIP ou prévisualisés.` + (warnings.length ? `\n\n⚠️ Points d'attention :\n${warnings.map((w) => "• " + w).join("\n")}` : ""),
      explanation: `Équipe d'IA mobilisée :\n${teamLines || "—"}\n\nDirection : palette ${Object.values(plan.palette).join(" · ")} · polices ${plan.fonts.display} / ${plan.fonts.body}.\nSections : ${plan.sections.join(", ")}.\nFonctionnalités : ${plan.features.join(" ; ") || "—"}.`,
      codeBlocks: list.filter((f) => /\.(html|css|js|json|webmanifest|md|svg)$/.test(f.name) && !f.name.startsWith(".github")).map((f) => ({ language: StudioCore.langOf(f.name), code: f.content, path: f.name })),
      files: list, contributors, warnings, team,
    };
  }

  // ----------------------------------------------------------------
  // Affinage d'un projet existant
  // ----------------------------------------------------------------
  async function refine({ instruction, previous, hooks }) {
    const ready = readyEngines();
    if (!ready.length) throw new Error("Aucune IA prête.");
    const ctx = { hooks, team: [...(previous.team || [])] };
    hooks.engines(ready);
    const chain = chainFor("refine", ready, {});
    const { res } = await callRole("refine", chain, PROMPTS.refine(instruction, previous.sources), ctx, { maxTokens: tokensFor(12000), temperature: 0.4 });
    const parsed = StudioCore.parseFiles(res.text);
    const sources = { ...previous.sources };
    let changed = 0;
    parsed.blocks.forEach((blk) => {
      if (!blk.path || !/\.(html|css|js|json|svg|md)$/.test(blk.path) || !blk.code.trim()) return;
      if (blk.path === "js/app.js" && StudioCore.lint({ ...sources, [blk.path]: blk.code }).jsSyntaxError) { hooks.log("warn", "Modification de js/app.js refusée (erreur de syntaxe)."); return; }
      sources[blk.path] = StudioCore.autoClose(blk.path, blk.code); changed++;
    });
    if (!changed) throw new Error("L'IA n'a renvoyé aucun fichier exploitable.");
    hooks.log("ok", `${changed} fichier(s) mis à jour.`);
    const out = buildResult({ sources, plan: previous.plan, options: previous.options, team: ctx.team, warnings: [...(parsed.truncated ? ["Réponse possiblement tronquée."] : [])], prompt: previous.prompt });
    return out;
  }

  // ----------------------------------------------------------------
  // Mode « Fusion » : toutes les IA répondent, une IA fusionne
  // ----------------------------------------------------------------
  async function fusion({ prompt, hooks }) {
    const ready = readyEngines();
    if (!ready.length) throw new Error("Aucune IA prête.");
    const s = Settings.get();
    const ctx = { hooks, team: [] };
    hooks.engines(ready);
    hooks.step("read", "is-done"); hooks.step("dispatch", "is-active"); hooks.progress(20, "Envoi à toutes les IA", `${ready.length} moteur(s) sollicité(s)`);
    ready.forEach((e) => hooks.engine(e.id, "loading", `${e.label} · en cours…`));
    hooks.step("dispatch", "is-done"); hooks.step("wait", "is-active");
    const outs = await Promise.all(ready.map((e) =>
      Api.callEngine(e, s.engines[e.id], prompt, { system: SYSTEM_BASE.replace(/Réponds UNIQUEMENT[^.]*\./, "Explique brièvement puis donne le code."), maxTokens: tokensFor(6000) })
        .then((r) => { hooks.engine(e.id, "ok", `${e.label} · réussi`); hooks.log("ok", `${e.label} a répondu.`); ctx.team.push({ role: "Contributeur", engine: e.label, model: r.model }); return r; })
        .catch((err) => { hooks.engine(e.id, "error", `${e.label} · échec`); hooks.log("error", `${e.label} : ${err.message}`); return null; })));
    const good = outs.filter(Boolean);
    hooks.step("wait", "is-done");
    if (!good.length) throw new Error("Toutes les IA ont échoué.");

    hooks.step("compare", "is-done"); hooks.step("merge", "is-active"); hooks.progress(80, "Fusion", "Une IA combine les meilleures parties");
    let merged = good[0].text;
    if (good.length > 1) {
      const ctxText = good.map((r, i) => `### Proposition ${i + 1} (${AIManager.getById(r.engineId).label})\n${r.text}`).join("\n\n");
      try {
        const { res } = await callRole("fusion", chainFor("fusion", ready, {}), `Demande : ${prompt}\n\n${ctxText}\n\nFusionne ces propositions en UNE réponse finale : garde le meilleur de chacune, corrige les erreurs, ne mentionne pas les « propositions ». Code complet en blocs \`\`\` avec « filename: » en 1re ligne quand ce sont des fichiers.`, ctx, { maxTokens: tokensFor(8192), system: "Tu es un relecteur senior qui fusionne plusieurs réponses d'IA en une seule réponse excellente. Réponds dans la langue de la demande." });
        merged = res.text;
      } catch (e) { hooks.log("warn", "Fusion indisponible : meilleure réponse brute retenue."); merged = good.sort((a, b) => b.text.length - a.text.length)[0].text; }
    }
    const parsed = StudioCore.parseFiles(merged);
    const sources = {};
    parsed.blocks.forEach((blk, i) => { if (blk.path && !sources[blk.path]) sources[blk.path] = blk.code; });
    const files = Object.keys(sources).map((name) => ({ name, content: sources[name], size: (sources[name].length / 1024).toFixed(1) + " Ko" }));
    hooks.step("merge", "is-done"); hooks.step("finalize", "is-done"); hooks.progress(100, "Terminé", "Résultat prêt");
    return {
      mode: "fusion", title: prompt.slice(0, 40), prompt, options: {}, sources, plan: null,
      finalText: merged.replace(/```[\s\S]*?```/g, "[bloc de code — voir l'onglet Code]").trim() || merged,
      explanation: `Réponse fusionnée à partir de ${good.length} IA :\n${[...new Set(ctx.team.map((t) => `• ${t.engine} (${t.model})`))].join("\n")}`,
      codeBlocks: parsed.blocks.map((blk) => ({ language: blk.lang, code: blk.code, path: blk.path })),
      files, contributors: [...new Set(ctx.team.map((t) => t.engine))], team: ctx.team, warnings: [],
    };
  }

  /** Reconstruit un résultat complet depuis sa version compacte (historique). */
  function rehydrate(c) {
    if (c.mode === "studio" && c.sources && c.plan) {
      return { ...buildResult({ sources: c.sources, plan: c.plan, options: c.options || {}, team: c.team || [], warnings: c.warnings || [], prompt: c.prompt }), logs: c.logs || [] };
    }
    const files = Object.keys(c.sources || {}).map((name) => ({ name, content: c.sources[name], size: (c.sources[name].length / 1024).toFixed(1) + " Ko" }));
    return { ...c, files, codeBlocks: files.map((f) => ({ language: StudioCore.langOf(f.name), code: f.content, path: f.name })), logs: c.logs || [] };
  }

  function compact(r) {
    const { files, codeBlocks, ...rest } = r;
    return rest;
  }

  function previewHtml(files) {
    const map = {}; (files || []).forEach((f) => { map[f.name] = f.content; });
    if (map["index.html"] == null) return "";
    return StudioCore.inlineAssets(map["index.html"], map);
  }

  function zipBlob(result) {
    const map = {}; result.files.forEach((f) => { map[f.name] = f.content; });
    return StudioCore.makeZip(map);
  }

  return { run, refine, fusion, readyEngines, previewHtml, zipBlob, rehydrate, compact, ROLE_LABELS };
})();
