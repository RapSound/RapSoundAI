/**
 * studio-core.js
 * ---------------------------------------------------------------------
 * Outils purs (sans UI, sans réseau) du Studio :
 *   - parseFiles   : extrait les fichiers des blocs ``` des réponses IA
 *   - extractJSON  : JSON tolérant (réponses de planificateur)
 *   - assemble     : branche effets, PWA, mode fichier unique, README, CI
 *   - makeZip      : écrit un vrai fichier .zip (sans aucune dépendance)
 *   - lint/repair  : contrôles de cohérence HTML ↔ JS et syntaxe
 * ---------------------------------------------------------------------
 */
const StudioCore = (() => {

  const LANG_BY_EXT = { html: "html", css: "css", js: "javascript", json: "json", md: "markdown", svg: "xml", webmanifest: "json", yml: "yaml", ts: "typescript", py: "python" };
  const DEFAULT_PATH = { html: "index.html", css: "css/style.css", javascript: "js/app.js", js: "js/app.js" };

  const extOf = (p) => (p.split(".").pop() || "").toLowerCase();
  const langOf = (p) => LANG_BY_EXT[extOf(p)] || "text";

  function normPath(p) {
    const clean = String(p || "").trim().replace(/^["'`]+|["'`]+$/g, "").replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/^\/+/, "").split("?")[0];
    if (!clean || clean.split("/").includes("..")) return null;
    return clean;
  }

  /** Extrait tous les blocs de code ; renvoie { blocks:[{path,lang,code}], truncated } */
  function parseFiles(text) {
    let src = String(text || "");
    const fences = (src.match(/```/g) || []).length;
    const truncated = fences % 2 === 1;
    if (truncated) src += "\n```";

    const blocks = [];
    const re = /```([^\n`]*)\n([\s\S]*?)```/g;
    let m;
    while ((m = re.exec(src))) {
      const info = (m[1] || "").trim();
      let code = m[2].replace(/\s+$/, "");
      const tokens = info.split(/\s+/).filter(Boolean);
      let lang = tokens[0] && !/\./.test(tokens[0]) ? tokens[0].toLowerCase() : "";
      let path = null;

      const kv = info.match(/(?:filename|file|path|title)\s*[:=]\s*["']?([\w\-./]+\.[A-Za-z0-9]+)/i);
      if (kv) path = kv[1];
      else { const t = tokens.find((x) => /^[\w\-./]+\.[A-Za-z0-9]+$/.test(x)); if (t) path = t; }

      const first = code.split("\n")[0];
      const c = first.match(/^\s*(?:\/\/|#|--|;|\/\*|<!--)\s*(?:filename|file|path|fichier)\s*[:=]\s*["']?([\w\-./]+\.[A-Za-z0-9]+)/i);
      if (c) { path = path || c[1]; code = code.split("\n").slice(1).join("\n").replace(/^\n+/, ""); }

      path = normPath(path);
      if (!path && DEFAULT_PATH[lang]) path = DEFAULT_PATH[lang];
      if (!lang && path) lang = langOf(path);
      blocks.push({ path, lang: lang || "text", code });
    }
    return { blocks, truncated };
  }

  function extractJSON(text) {
    let t = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
    const a = t.indexOf("{"), b = t.lastIndexOf("}");
    if (a === -1 || b === -1) throw new Error("Pas de JSON trouvé");
    return JSON.parse(t.slice(a, b + 1));
  }

  /** Complète un fichier tronqué (accolades, balises de fin). */
  function autoClose(path, code) {
    const ext = extOf(path);
    if (ext === "css") {
      const diff = (code.match(/{/g) || []).length - (code.match(/}/g) || []).length;
      return diff > 0 ? code + "\n" + "}".repeat(diff) : code;
    }
    if (ext === "html" && !/<\/html>/i.test(code)) {
      return code + (/<\/body>/i.test(code) ? "" : "\n</body>") + "\n</html>";
    }
    return code;
  }

  // ------------------------------------------------------------------
  // Inline (mode fichier unique + aperçu)
  // ------------------------------------------------------------------
  const isRemote = (u) => /^(https?:)?\/\//i.test(u) || /^data:/i.test(u);

  function inlineAssets(html, files) {
    html = html.replace(/<link\b[^>]*\brel=["']?stylesheet["']?[^>]*>/gi, (tag) => {
      const href = (tag.match(/\bhref=["']([^"']+)["']/i) || [])[1];
      if (!href || isRemote(href)) return tag;
      const f = files[normPath(href)];
      return f != null ? `<style>\n${f}\n</style>` : tag;
    });
    const scripts = [];
    html = html.replace(/<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, (tag, a, src) => {
      if (isRemote(src)) return tag;
      const f = files[normPath(src)];
      if (f == null) return tag;
      scripts.push(`<script>\n${f.replace(/<\/script/gi, "<\\/script")}\n</script>`);
      return "";
    });
    if (scripts.length) {
      const block = scripts.join("\n");
      html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, () => block + "\n</body>") : html + "\n" + block;
    }
    return html;
  }

  const insertBeforeClose = (html, tag, snippet) =>
    new RegExp(`</${tag}>`, "i").test(html) ? html.replace(new RegExp(`</${tag}>`, "i"), () => snippet + `\n</${tag}>`) : html + "\n" + snippet;

  const referenced = (html, path) => html.includes(path);

  // ------------------------------------------------------------------
  // Assemblage final
  // ------------------------------------------------------------------
  function slugify(s) {
    return String(s || "projet").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "projet";
  }

  function assemble(sources, opts, meta) {
    const files = { ...sources };
    let html = files["index.html"] || "<!DOCTYPE html>\n<html lang=\"fr\"><head><meta charset=\"UTF-8\"></head><body></body></html>";
    if (!/<meta[^>]+viewport/i.test(html)) html = html.replace(/<head[^>]*>/i, (h) => h + '\n<meta name="viewport" content="width=device-width, initial-scale=1">');
    if (!/<meta[^>]+charset/i.test(html)) html = html.replace(/<head[^>]*>/i, (h) => h + '\n<meta charset="UTF-8">');

    const hasEffects = (opts.effects || []).length > 0;
    if (hasEffects) {
      files["css/effects.css"] = StudioAssets.EFFECTS_CSS;
      files["js/effects.js"] = StudioAssets.EFFECTS_JS;
      if (!referenced(html, "css/effects.css")) {
        html = referenced(html, "css/style.css")
          ? html.replace(/(<link\b[^>]*css\/style\.css[^>]*>)/i, '<link rel="stylesheet" href="css/effects.css">\n$1')
          : insertBeforeClose(html, "head", '<link rel="stylesheet" href="css/effects.css">');
      }
    }
    if (files["css/style.css"] && !referenced(html, "css/style.css")) html = insertBeforeClose(html, "head", '<link rel="stylesheet" href="css/style.css">');
    if (hasEffects && !referenced(html, "js/effects.js")) html = insertBeforeClose(html, "body", '<script src="js/effects.js" defer></script>');
    if (files["js/app.js"] && !referenced(html, "js/app.js")) html = insertBeforeClose(html, "body", '<script src="js/app.js" defer></script>');

    const title = meta.title || "Projet";
    const slug = slugify(title);

    if (opts.pwa) {
      const bg = meta.palette?.bg || "#0c0c11", accent = meta.palette?.accent || "#ff2d4d";
      files["manifest.webmanifest"] = JSON.stringify({
        name: title, short_name: title.slice(0, 12), start_url: "./", scope: "./", display: "standalone",
        background_color: bg, theme_color: bg, icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
      }, null, 2);
      files["icon.svg"] = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="${bg}"/><text x="256" y="350" font-family="Arial Black,Arial,sans-serif" font-size="300" font-weight="900" text-anchor="middle" fill="${accent}">${(title[0] || "R").toUpperCase().replace(/[<>&]/g, "")}</text></svg>`;
      html = insertBeforeClose(html, "head", `<link rel="manifest" href="manifest.webmanifest">\n<meta name="theme-color" content="${bg}">\n<link rel="icon" href="icon.svg" type="image/svg+xml">`);
      html = insertBeforeClose(html, "body", `<script>try{if("serviceWorker"in navigator&&location.protocol!=="file:"){navigator.serviceWorker.register("sw.js").catch(function(){})}}catch(e){}</script>`);
    }

    if (opts.single) {
      html = inlineAssets(html, files);
      Object.keys(files).forEach((p) => { if (/^(css|js)\/.+\.(css|js)$/.test(p)) delete files[p]; });
    }
    files["index.html"] = html;

    if (opts.pwa) {
      const list = Object.keys(files).filter((p) => p !== "sw.js").map((p) => "./" + p);
      files["sw.js"] = `const CACHE="${slug}-${Date.now().toString(36)}";\nconst ASSETS=${JSON.stringify(["./"].concat(list))};\nself.addEventListener("install",e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));\nself.addEventListener("activate",e=>e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim())));\nself.addEventListener("fetch",e=>{if(e.request.method!=="GET")return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return res}).catch(()=>caches.match("./index.html"))))});\n`;
    }

    files["README.md"] = buildReadme(files, opts, meta);
    files[".github/workflows/pages.yml"] = PAGES_WORKFLOW;
    return files;
  }

  const PAGES_WORKFLOW = `name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: .
      - id: deployment
        uses: actions/deploy-pages@v4
`;

  function buildReadme(files, opts, meta) {
    const list = Object.keys(files).filter((p) => p !== "README.md" && !p.startsWith(".github/")).sort();
    const team = (meta.contributors || []).map((c) => `- **${c.role}** : ${c.engine} (${c.model})`).join("\n") || "- (non renseigné)";
    return `# ${meta.title || "Projet"}\n\n${meta.summary || ""}\n\n## Lancer\nOuvrez \`index.html\` dans un navigateur (ou servez le dossier : \`npx serve .\`).\n\n## Déployer sur GitHub Pages\n1. Poussez ces fichiers sur la branche \`main\`.\n2. *Settings → Pages → Source : GitHub Actions* — le workflow \`.github/workflows/pages.yml\` publie le site.\n\n## Fichiers\n${list.map((p) => `- \`${p}\``).join("\n")}\n\n## Généré par RapSoundAI Studio\n${team}\n\n${opts.pwa ? "Application installable et utilisable hors-ligne (manifest + service worker).\n\n" : ""}${(opts.effects || []).length ? "Pack d'effets : \`css/effects.css\` / \`js/effects.js\` (attributs \`data-reveal\`, \`data-tilt\`, \`data-particles\`, classes \`.glass\`, \`.aurora\`, \`.neon\`…).\n" : ""}`;
  }

  // ------------------------------------------------------------------
  // ZIP (méthode « stored », compatible partout)
  // ------------------------------------------------------------------
  function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function makeZip(fileMap) {
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const chunks = [], central = [];
    let offset = 0;

    Object.keys(fileMap).forEach((path) => {
      const name = enc.encode(path), data = enc.encode(fileMap[path]), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      chunks.push(new Uint8Array(lh.buffer), name, data);

      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    });

    const count = Object.keys(fileMap).length;
    const cdSize = central.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, count, true); end.setUint16(10, count, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: "application/zip" });
  }

  // ------------------------------------------------------------------
  // Contrôles qualité
  // ------------------------------------------------------------------
  /** Renvoie { jsSyntaxError, missingIds[] } */
  function lint(sources) {
    const out = { jsSyntaxError: null, missingIds: [] };
    const js = sources["js/app.js"], html = sources["index.html"] || "";
    if (js) {
      try { new Function(js); } catch (e) { out.jsSyntaxError = e.message; }
      const ids = new Set();
      for (const m of js.matchAll(/getElementById\(\s*["'`]([\w-]+)["'`]\s*\)/g)) ids.add(m[1]);
      for (const m of js.matchAll(/querySelector(?:All)?\(\s*["'`]#([\w-]+)["'`]\s*\)/g)) ids.add(m[1]);
      ids.forEach((id) => { if (!new RegExp(`id=["']${id}["']`).test(html)) out.missingIds.push(id); });
    }
    return out;
  }

  return { parseFiles, extractJSON, autoClose, assemble, inlineAssets, makeZip, crc32, lint, langOf, extOf, normPath, slugify };
})();
