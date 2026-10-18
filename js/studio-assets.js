/**
 * studio-assets.js
 * ---------------------------------------------------------------------
 * Ressources « statiques » du Studio : packs d'effets TESTÉS (CSS + JS)
 * livrés dans chaque projet généré, catalogue d'effets et styles.
 * Les IA n'inventent pas les animations de base : elles utilisent ces
 * « hooks » (data-reveal, data-tilt, .glass, .aurora…), ce qui garantit
 * un rendu soigné même avec un modèle modeste.
 * ---------------------------------------------------------------------
 */
const StudioAssets = (() => {

  const EFFECTS_CSS = String.raw`/* RapSound Effects Pack — hooks : data-reveal, data-tilt, data-particles, data-magnetic, data-parallax, data-count, .glass, .aurora, .neon, .grad-text, .float, .shine, .marquee */
:root{--fx-accent:var(--accent,#ff2d4d);--fx-accent2:var(--accent-2,#7c2ae8)}
[data-reveal]{opacity:0;transition:opacity .8s cubic-bezier(.22,1,.36,1),transform .8s cubic-bezier(.22,1,.36,1);transition-delay:var(--reveal-delay,0s)}
[data-reveal="up"],[data-reveal=""]{transform:translateY(32px)}
[data-reveal="left"]{transform:translateX(-40px)}
[data-reveal="right"]{transform:translateX(40px)}
[data-reveal="zoom"]{transform:scale(.92)}
[data-reveal].is-visible{opacity:1;transform:none}
.glass{background:rgba(255,255,255,.06);-webkit-backdrop-filter:blur(16px) saturate(140%);backdrop-filter:blur(16px) saturate(140%);border:1px solid rgba(255,255,255,.12);border-radius:18px;box-shadow:0 10px 40px -10px rgba(0,0,0,.5)}
.aurora{position:relative;isolation:isolate;overflow:hidden}
.aurora::before,.aurora::after{content:"";position:absolute;inset:-30%;z-index:-1;filter:blur(70px);opacity:.55;background:radial-gradient(40% 40% at 25% 30%,var(--fx-accent),transparent 70%),radial-gradient(35% 35% at 75% 65%,var(--fx-accent2),transparent 70%);animation:fx-aurora 16s ease-in-out infinite alternate}
.aurora::after{animation-duration:23s;animation-direction:alternate-reverse;opacity:.35}
@keyframes fx-aurora{to{transform:translate3d(8%,-6%,0) rotate(25deg) scale(1.15)}}
.neon{color:#fff;text-shadow:0 0 6px var(--fx-accent),0 0 18px var(--fx-accent),0 0 42px var(--fx-accent2);animation:fx-flicker 5s infinite}
@keyframes fx-flicker{0%,18%,22%,62%,64%,100%{opacity:1}20%,63%{opacity:.7}}
.grad-text{background:linear-gradient(90deg,var(--fx-accent),var(--fx-accent2),var(--fx-accent));background-size:200% auto;-webkit-background-clip:text;background-clip:text;color:transparent;animation:fx-shift 6s linear infinite}
@keyframes fx-shift{to{background-position:200% center}}
.float{animation:fx-float 5s ease-in-out infinite}
@keyframes fx-float{50%{transform:translateY(-12px)}}
.shine{position:relative;overflow:hidden}
.shine::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 35%,rgba(255,255,255,.35) 50%,transparent 65%);transform:translateX(-120%);transition:transform .8s;pointer-events:none}
.shine:hover::after{transform:translateX(120%)}
.marquee{overflow:hidden;white-space:nowrap}
.marquee__track{display:inline-flex;gap:3rem;animation:fx-marquee 22s linear infinite}
.marquee:hover .marquee__track{animation-play-state:paused}
@keyframes fx-marquee{to{transform:translateX(-50%)}}
[data-tilt]{transform-style:preserve-3d;transition:transform .15s ease-out;will-change:transform}
[data-particles]{position:relative}
[data-particles]>canvas.fx-particles{position:absolute;inset:0;width:100%;height:100%;z-index:0;pointer-events:none}
.fx-cursor-glow{position:fixed;left:0;top:0;width:420px;height:420px;margin:-210px 0 0 -210px;border-radius:50%;pointer-events:none;z-index:0;background:radial-gradient(circle,var(--fx-accent) 0%,transparent 65%);opacity:.18;mix-blend-mode:screen}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}[data-reveal]{opacity:1;transform:none}}
`;

  // Le JS des effets est écrit comme une vraie fonction (vérifiée à la syntaxe)
  // puis sérialisée dans le projet généré.
  function effectsRuntime() {
    const rm = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const $$ = (s) => [...document.querySelectorAll(s)];
    function init() {
      const io = new IntersectionObserver((es) => es.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); }
      }), { threshold: 0.15 });
      $$("[data-reveal]").forEach((el) => {
        const d = el.dataset.revealDelay;
        if (d) el.style.setProperty("--reveal-delay", d + "ms");
        io.observe(el);
      });
      const co = new IntersectionObserver((es) => es.forEach((e) => {
        if (!e.isIntersecting) return;
        co.unobserve(e.target);
        const el = e.target, end = parseFloat(el.dataset.count) || 0, t0 = performance.now();
        const dec = (String(el.dataset.count).split(".")[1] || "").length;
        (function f(t) {
          const p = Math.min((t - t0) / 1400, 1), v = end * (1 - Math.pow(1 - p, 3));
          el.textContent = v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
          if (p < 1) requestAnimationFrame(f);
        })(t0);
      }), { threshold: 0.5 });
      $$("[data-count]").forEach((el) => co.observe(el));
      if (rm) return;
      $$("[data-tilt]").forEach((el) => {
        const max = parseFloat(el.dataset.tilt) || 10;
        el.addEventListener("pointermove", (e) => {
          const r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
          el.style.transform = "perspective(800px) rotateX(" + (-y * max) + "deg) rotateY(" + (x * max) + "deg) scale(1.02)";
        });
        el.addEventListener("pointerleave", () => { el.style.transform = ""; });
      });
      $$("[data-magnetic]").forEach((el) => {
        el.addEventListener("pointermove", (e) => {
          const r = el.getBoundingClientRect();
          el.style.transform = "translate(" + (e.clientX - r.left - r.width / 2) * 0.25 + "px," + (e.clientY - r.top - r.height / 2) * 0.25 + "px)";
        });
        el.addEventListener("pointerleave", () => { el.style.transform = ""; });
      });
      const px = $$("[data-parallax]");
      if (px.length) addEventListener("scroll", () => {
        px.forEach((el) => { el.style.transform = "translate3d(0," + scrollY * (parseFloat(el.dataset.parallax) || 0.2) + "px,0)"; });
      }, { passive: true });
      if (document.body.hasAttribute("data-cursor-glow")) {
        const g = document.createElement("div");
        g.className = "fx-cursor-glow";
        document.body.appendChild(g);
        addEventListener("pointermove", (e) => { g.style.transform = "translate(" + e.clientX + "px," + e.clientY + "px)"; });
      }
      $$("[data-particles]").forEach((host) => {
        const c = document.createElement("canvas");
        c.className = "fx-particles";
        host.prepend(c);
        const x = c.getContext("2d");
        let w = 0, h = 0, P = [];
        const col = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#ff2d4d";
        const rs = () => {
          w = c.width = host.clientWidth; h = c.height = host.clientHeight;
          P = Array.from({ length: Math.min(90, Math.floor(w * h / 14000)) }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5 }));
        };
        rs();
        addEventListener("resize", rs);
        (function loop() {
          x.clearRect(0, 0, w, h); x.fillStyle = col; x.strokeStyle = col;
          P.forEach((p, i) => {
            p.x += p.vx; p.y += p.vy;
            if (p.x < 0 || p.x > w) p.vx *= -1;
            if (p.y < 0 || p.y > h) p.vy *= -1;
            x.globalAlpha = 0.8; x.beginPath(); x.arc(p.x, p.y, 1.6, 0, 6.283); x.fill();
            for (let j = i + 1; j < P.length; j++) {
              const q = P[j], d = Math.hypot(p.x - q.x, p.y - q.y);
              if (d < 110) { x.globalAlpha = (1 - d / 110) * 0.35; x.beginPath(); x.moveTo(p.x, p.y); x.lineTo(q.x, q.y); x.stroke(); }
            }
          });
          requestAnimationFrame(loop);
        })();
      });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  }

  const EFFECTS_JS = "/* RapSound Effects Pack (runtime) */\n(" + effectsRuntime.toString() + ")();\n";

  /** Catalogue : id, libellé, hook à utiliser (injecté dans les prompts). */
  const EFFECTS = [
    { id: "reveal", label: "Apparition au scroll", hook: 'attribut data-reveal="up|left|right|zoom" (+ data-reveal-delay="120" en ms) sur les sections, cartes, titres' },
    { id: "tilt", label: "Cartes 3D (tilt)", hook: 'attribut data-tilt="10" sur les cartes' },
    { id: "particles", label: "Particules canvas", hook: 'attribut data-particles sur le conteneur du hero (le contenu du hero doit avoir position:relative; z-index:1)' },
    { id: "aurora", label: "Fond aurore animé", hook: 'classe .aurora sur le hero ou le body (utilise --accent et --accent-2)' },
    { id: "glass", label: "Glassmorphism", hook: 'classe .glass sur les cartes/panneaux (fond clair translucide + flou)' },
    { id: "neon", label: "Texte néon / dégradé animé", hook: 'classes .neon (titre lumineux) et .grad-text (dégradé animé)' },
    { id: "magnetic", label: "Boutons magnétiques", hook: 'attribut data-magnetic sur les boutons principaux, plus la classe .shine' },
    { id: "counter", label: "Compteurs animés", hook: 'attribut data-count="1234" sur un élément (le texte est animé de 0 à la valeur)' },
    { id: "parallax", label: "Parallax", hook: 'attribut data-parallax="0.2" sur les éléments décoratifs' },
    { id: "marquee", label: "Bandeau défilant", hook: 'structure <div class="marquee"><div class="marquee__track">…contenu DUPLIQUÉ deux fois…</div></div>' },
    { id: "cursor", label: "Halo curseur", hook: 'attribut data-cursor-glow sur la balise <body>' },
    { id: "float", label: "Éléments flottants", hook: 'classe .float sur les éléments décoratifs' },
  ];

  const STYLES = [
    { id: "auto", label: "Libre (l'IA choisit)", brief: "Choisis une direction artistique cohérente, moderne et mémorable, adaptée au sujet." },
    { id: "street", label: "Street / Rap", brief: "Noir profond, rouge vif, typographie display très grasse en capitales, contrastes forts, grain subtil, énergie urbaine." },
    { id: "neon", label: "Néon cyber", brief: "Fond quasi noir, accents cyan/magenta, lueurs néon, grilles, polices techniques monospace." },
    { id: "glass", label: "Glassmorphism", brief: "Dégradés doux en arrière-plan, panneaux translucides floutés, bordures fines claires, coins très arrondis." },
    { id: "minimal", label: "Minimal éditorial", brief: "Beaucoup d'espace blanc, typographie serif élégante pour les titres, grille stricte, une seule couleur d'accent." },
    { id: "brutal", label: "Brutalist", brief: "Bordures épaisses noires, aplats de couleurs vives, ombres dures décalées, typographie énorme, aucune retenue." },
    { id: "retro", label: "Rétro 90s / Vaporwave", brief: "Dégradés rose-violet-cyan, soleil et grilles perspective, polices pixel ou arrondies, ambiance synthwave." },
    { id: "soft", label: "Doux / Pastel", brief: "Palette pastel, formes organiques, ombres douces, typographie arrondie, micro-animations apaisantes." },
  ];

  const PROJECT_TYPES = [
    { id: "auto", label: "Libre", brief: "" },
    { id: "site", label: "Site vitrine", brief: "Site vitrine multi-sections (hero, présentation, services/portfolio, témoignages, contact, footer) avec navigation ancrée." },
    { id: "landing", label: "Landing page", brief: "Landing page de conversion : hero fort, bénéfices, preuve sociale, tarifs ou offre, FAQ, appels à l'action répétés." },
    { id: "app", label: "Application web", brief: "Application web interactive avec état, persistance localStorage, interface type app (barre de navigation, vues, formulaires)." },
    { id: "dashboard", label: "Dashboard", brief: "Tableau de bord avec cartes de KPI, graphiques dessinés en SVG/canvas natif (sans librairie), filtres et tableau triable." },
    { id: "game", label: "Jeu", brief: "Jeu jouable au clavier ET au tactile, boucle requestAnimationFrame, score, meilleur score sauvegardé, écran de début/fin." },
  ];

  return { EFFECTS_CSS, EFFECTS_JS, EFFECTS, STYLES, PROJECT_TYPES };
})();
