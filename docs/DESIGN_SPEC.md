# RNDYVISUALS — Design & Build Specification

One-page cinematic portfolio for **Ivan Rudy (rndyvisuals)** — yacht, regatta and open-water videographer based in Greece.
Stack: **Vite + vanilla TypeScript + GSAP/ScrollTrigger + Lenis + SplitType**. Static, deployed to GitHub Pages, custom-domain ready.
Socials: Instagram `https://www.instagram.com/rndyvisuals/` · YouTube `https://www.youtube.com/@OnthewavewithIvan` · WhatsApp `+30 693 463 1572`.
All site copy is **English**.

---

## 1. Brand Direction & Mood

**Night watch on open water.** The site feels like standing on a deck after sunset: a cold, blue-black darkness, foam-white type, one quiet sea-glass accent. Every surface is calm; the footage supplies the drama. The benchmark to beat (reilinjoey.com) is a templated Wix build with stock fades and no motion craft — we win with disciplined, custom choreography: smooth inertial scroll, hover video previews, a curtain preloader, and a cursor that knows what it's pointing at.

**Editor's room, not brochure.** The yacht industry defaults to serif-and-navy luxury brochures. We deliberately avoid that: an expanded grotesk display, tabular metadata (durations, coordinates, vessel names), a list-style work index. The work index is the centerpiece — eight curated films presented like an edit bin, each row spawning a live preview under the cursor.

**Premium restraint.** One accent color rationed to under 3% of any viewport. No marquees, no WebGL gimmicks, no decorative noise beyond a 3.5% film grain. Motion is expensive-feeling because it is consistent: two easing tokens, one stagger system, reveals that play once and never reverse.

---

## 2. Palette — CSS Custom Properties

```css
:root {
  /* surfaces — near-black with a cold sea tint */
  --bg:        #070B0F;   /* page base, also preloader & overlay panel */
  --surface:   #0D141A;   /* raised cards, admin rows, overlay chrome */
  --surface-2: #131C24;   /* hover states, chips, input fields */

  /* lines */
  --line:        #1C2730; /* hairline rules, row borders */
  --line-strong: #2C3A45; /* focused inputs, active row border */

  /* ink — foam off-white ramp (use alpha steps, not new grays) */
  --ink-hi:  #EAF0EF;     /* headlines, hero, primary text */
  --ink:     #B8C4C6;     /* body copy */
  --ink-mid: #7C8A8E;     /* metadata, captions */
  --ink-low: #4E5B60;     /* disabled, watermark indices */

  /* accent — sea glass; CTAs, cursor dot, active states ONLY */
  --accent:      #5FC9BA;
  --accent-dim:  #2E5F58; /* accent borders, focus rings */

  /* utility */
  --scrim:   rgba(7, 11, 15, 0.78);   /* overlay/header backdrop */
  --grain-o: 0.035;                    /* global grain opacity */
}
```

Rule: `--accent` never appears as a text block or background fill — dot, underline, chip border, focus outline, "PLAY" cursor state only.

---

## 3. Typography

Two families, self-hosted WOFF2 (latin subset), `font-display: swap`, max 4 files. Both free (Google Fonts).

| Role | Family | Weights / settings |
|---|---|---|
| Display | **Archivo** (variable) | `wght 500–700`, `wdth 125` (Expanded). Uppercase, `letter-spacing: -0.01em`, `line-height: 0.94` for hero/H2 |
| Text + metadata | **Space Grotesk** (variable) | `wght 300–700`. Body at 400; metadata at 500 uppercase, `letter-spacing: 0.08em`, `font-variant-numeric: tabular-nums` for durations/counters |

```css
:root {
  --font-display: 'Archivo', 'Arial Narrow', Impact, sans-serif;
  --font-text:    'Space Grotesk', 'Inter', system-ui, sans-serif;

  /* fluid type scale */
  --fs-hero:    clamp(3.25rem, 11vw, 10rem);      /* hero H1, uppercase expanded */
  --fs-h2:      clamp(2.25rem, 6vw, 4.5rem);      /* section headlines */
  --fs-h3:      clamp(1.25rem, 2.2vw, 1.75rem);   /* row titles, about lede */
  --fs-body:    clamp(1rem, 0.95rem + 0.3vw, 1.125rem);
  --fs-caption: clamp(0.8125rem, 0.78rem + 0.2vw, 0.875rem);
  --fs-micro:   0.6875rem;                         /* 11px — eyebrows, chips, footer legal */
}
```

Work-row index numbers and duration chips: Space Grotesk 500, `--fs-caption`, tabular. Watermark indices on posters: Archivo 700 at `min(18vw, 14rem)`.

---

## 4. Section-by-Section Layout (one page, in order)

### 4.1 Preloader
Full-screen `--bg` panel, inline-critical CSS. Bottom-left: counter `0 → 100` in tabular Space Grotesk at 12vw, `--ink-low`. Top-left micro line: `RNDYVISUALS — YACHT & SEA FILMS`. Bottom-right micro: `37.98° N, 23.72° E`. Sequence per §6 (2.6 s first visit; repeat visits within session skip to a 0.6 s curtain via `sessionStorage['seen-intro']`). Lenis stopped throughout.

### 4.2 Hero — `#top`
100svh. Background: muted looping hero video (≤2.5 MB, 1280×720, CRF 28, H.264 + WebM), poster `fetchpriority="high"`, under a `--scrim` gradient from bottom. Content lockup bottom-left:

- Eyebrow (micro caps, `--ink-mid`): `RNDYVISUALS — IVAN RUDY`
- H1 (display, `--fs-hero`, 2 lines): `ON THE` / `WAVE`
- Sub (body, `--ink`, max 38ch): `Videographer for yachts, regattas and the open sea. Based in Greece — shooting worldwide.`
- Meta row (micro, tabular, `--ink-mid`): `ATHENS, GR · 37.98° N, 23.72° E` · `AVAILABLE — SEASON 2026`
- CTA (magnetic button, accent dot + label): `Watch the reel`

Fixed header (logo wordmark `RNDY®` left; `Work / About / Contact` anchors + `WhatsApp` right) condenses with backdrop blur after 40 px scroll.
Scroll behavior: hero media parallaxes `yPercent 0 → 12` (scrubbed) as the section leaves; lockup fades at 60% exit.

### 4.3 Featured Showreel — `#reel`
Section eyebrow: `SHOWREEL — '25`. One full-bleed 16:9 frame (max-width 1400 px, centered), clip-path reveal on scroll, inner media parallax ±12%. Bottom-left of frame: `Two minutes of open water.` (caption). Bottom-right: duration chip `2:06`. Cursor over frame → "PLAY" state. Click → overlay player (§6, overlay spec) with sound, sourced from the first `featured` manifest entry.

### 4.4 Work Index — `#work` (centerpiece)
Eyebrow: `SELECTED WORK 2023–2025`. H2: `WORK INDEX (08)`.
Layout: **full-width text list**, one row per film. Row grid (desktop): `index (01) · title (H3 display) · client · category · duration · year`, separated by `--line` rules that draw in on reveal. Client/category/duration/year in micro caps `--ink-mid`, durations tabular.
Hover: row text shifts `--ink-hi`, index slides in from mask, and a **fixed 480×270 preview card** (border-radius 4 px) follows the cursor with lerp 0.08 — animated duotone poster (§8) immediately, real video lazily swapped per §6 mechanics. Cursor becomes "PLAY".
Click: overlay player opens (no navigation; `history.pushState('#work/<id>')`, Esc/back/scrim all close). Overlay shows title line-stagger, meta line (`CLIENT · CATEGORY · YEAR · DURATION`), prev/next arrows.
Scroll: rows fade-up in batches (y 60, stagger 0.1).

### 4.5 About — `#about`
Two columns (5/7): left — portrait still with clip-path reveal + grain; right — lede + body.
H2: `SHOT FROM THE WATER, NOT THE SHORE.`
Body (~100 words, final copy):

> I'm Ivan — a videographer based in Greece, working on and around the water. For the past several seasons I've filmed sailing yachts, motor yachts, regattas and the coastlines between them — from the deck, the tender and the air. My job is simple to say and hard to do: make a vessel feel the way it feels to be aboard. The light at seven in the morning. The sound of the hull at speed. The quiet after the sails are trimmed. I keep crews small, schedules tight and edits honest. If it floats, I'll find the film in it.

Below: micro meta list — `BASED — ATHENS, GREECE` · `LICENSED DRONE OPERATOR (EASA A1/A3)` · `DELIVERY — 4K MASTERS + SOCIAL CUTS`.
Scroll: headline line-stagger; image clip reveal; meta fade-up.

### 4.6 Services / Approach — `#approach` (optional, ship in v1)
Eyebrow: `WHAT I SHOOT`. Three numbered rows (same rule-draw language as work index, no hover preview):

1. **Charter & brokerage films** — `A vessel's best ninety seconds. Built for charter listings, brokers and owners.`
2. **Regattas & events** — `Race starts, mark roundings, prize-givings. Same-week highlight edits.`
3. **Aerial & coastline** — `Licensed drone work over open water — establishing shots, itineraries, anchorages.`

Closing line (caption): `4K masters · vertical social cuts · 48-hour preview edit on request.`

### 4.7 Contact / Footer — `#contact`
Full-viewport closer. H2 (display, ~7vw): `TELL ME ABOUT YOUR BOAT.`
Two magnetic CTAs: `WhatsApp +30 693 463 1572` (links `https://wa.me/306934631572`) and `hello@rndyvisuals.com` (placeholder — replace before launch).
Expectation microcopy (caption, `--ink-mid`): `Based in Athens — available worldwide. Charters: dates & itinerary. Regattas: schedule & format. Reply within 24–48 h.`
Footer bar: `© 2026 rndyvisuals — Ivan Rudy` · `Instagram` · `YouTube` · `37.98° N, 23.72° E` · `Back to top`.
Scroll: headline lines rise, CTAs fade-up, footer rule draws.

---

## 5. Placeholder Work Entries (8)

| # | id | title | client | category | duration | year | featured |
|---|---|---|---|---|---|---|---|
| 01 | `aegean-crossing` | Aegean Crossing | S/Y Mythos | Yacht Film | 1:24 | 2025 | **yes** |
| 02 | `meltemi` | Meltemi | Saronic Regatta Week | Regatta Film | 2:08 | 2025 | **yes** |
| 03 | `ionian-slowly` | Ionian, Slowly | Navis Yachting | Charter Promo | 1:05 | 2024 | no |
| 04 | `coastline-study-i` | Coastline Study I | Personal | Drone Study | 1:48 | 2024 | no |
| 05 | `first-light-delivery` | Delivery at First Light | M/Y Eleonora K | Delivery Film | 1:32 | 2025 | no |
| 06 | `spetses-classic` | Spetses Classic | Classic Week Spetses | Regatta Film | 2:24 | 2023 | no |
| 07 | `the-winter-sea` | The Winter Sea | Personal | Short Film | 3:02 | 2024 | no |
| 08 | `tender-to-shore` | Tender to Shore | Calypso Charters | Charter Promo | 0:58 | 2023 | no |

`aegean-crossing` doubles as the showreel slot until a real reel exists.

---

## 6. Animation System

Engine: `gsap@3.15.0` + ScrollTrigger, `lenis@1.3.23`, `split-type@0.3.4`. Lenis driven by `gsap.ticker` only (`autoRaf: false`); `lenis.on('scroll', ScrollTrigger.update)`; `gsap.ticker.lagSmoothing(500, 33)`.
Lenis config: `duration: 1.1`, expo-out easing `(t) => Math.min(1, 1.001 - Math.pow(2, -10 * t))`, `wheelMultiplier: 1.0`, `touchMultiplier: 1.5`, `syncTouch: false`. **Skip Lenis entirely under 769 px.** `lenis.stop()` while preloader or overlay is open.

Ease tokens (only these three):

| Token | GSAP | CSS |
|---|---|---|
| `ease-out-expo` | `expo.out` | `cubic-bezier(0.16, 1, 0.3, 1)` |
| `ease-out-quart` | `power3.out` | `cubic-bezier(0.25, 1, 0.5, 1)` |
| `ease-inout-circ` | `power4.inOut` | `cubic-bezier(0.85, 0, 0.15, 1)` |

Named effects (all reveals `toggleActions: 'play none none none'`, initial states set by JS with no-JS fallback; `ScrollTrigger.refresh()` after `document.fonts.ready`):

| Effect | Properties | Duration | Ease | Stagger | Trigger |
|---|---|---|---|---|---|
| `preloader-counter` | proxy 0→100, `snap: 1`, tabular render | 1.2 s (chases real asset progress) | `power2.inOut` | — | t=0.0 |
| `counter-exit` | `yPercent: 110` in mask | 0.5 s | `power4.in` | — | t=0.9 |
| `curtain-wipe` | `clip-path: inset(0) → inset(0 0 100% 0)`; darker under-curtain lags 0.08 s | 0.9 s | `power4.inOut` | — | t=1.3 |
| `hero-title-rise` | chars `yPercent: 100 → 0` from line masks | 0.9 s | `expo.out` | 0.022/char | t=1.5 |
| `hero-media-settle` | `scale: 1.25 → 1` | 1.4 s | `expo.out` | — | t=1.3 |
| `fade-up` | `y: 40 → 0`, `autoAlpha: 0 → 1` | 0.8 s | `expo.out` | batch 0.08, max 6 | `top 85%` |
| `clip-reveal` (media) | container `inset(0 0 100% 0) → inset(0)` + inner `scale 1.25 → 1` | 1.1 s | `power4.out` | — | `top 80%` |
| `parallax-media` | inner `yPercent: −12 → 12` (pre-scaled 1.25) | scrubbed | `none`, `scrub: true` | — | `top bottom → bottom top` |
| `headline-lines` | lines `yPercent: 110 → 0`, `rotate: 4deg → 0`, origin `0 100%` | 1.0 s | `expo.out` | 0.09/line | `top 88%` |
| `index-slide` | `xPercent: −100 → 0` masked | 0.7 s | `power3.out` | 0.05 | `top 90%` |
| `rule-draw` | `scaleX: 0 → 1`, origin left | 1.2 s | `expo.out` | — | `top 92%` |
| `work-row-reveal` | fade-up variant `y: 60` + rule-draw per row | 0.8 s | `expo.out` | 0.1 | `top 85%` |
| `preview-card-in/out` | in: `clip inset(100% 0 0 0) → 0`, video counter-scale 1.3→1 · out: `inset(0 0 100% 0)` | 0.5 s / 0.4 s | `expo.out` / `power3.in` | — | row `pointerenter/leave` (300 ms detach grace) |
| `overlay-open` | panel `clip inset(100% 0 0 0) → 0` (0–0.7 s, `power4.inOut`); video `scale 0.92→1, fade` (0.35–0.95 s, `expo.out`); title lines 0.45 s+; close btn `back.out(1.7)` 0.4 s | 1.0 s total | mixed | meta 0.06 | row click |
| `overlay-close` | content `opacity→0, y:−20` 0.25 s `power2.in`; panel `inset(0 0 100% 0)` 0.5 s `power4.inOut` from t=0.1; video src released t=0.35 | 0.6 s total | mixed | — | Esc / scrim / back / × |
| `header-condense` | padding, `--scrim` bg, blur(14px), border fade | 0.4 s | css `ease-out-quart` | — | `scrollY > 40` |

Hover preview video mechanics: **one shared `<video>`** (`muted loop playsinline preload="none"`) for the whole list; `src` swapped on `pointerenter`, released (`pause(); removeAttribute('src'); load()`) after the 300 ms grace; first 2 previews warmed to `preload="metadata"` when the section is 400 px from viewport. Preview assets: 640×360, H.264 + VP9, 3–5 s loop, no audio, ≤800 KB, CRF ~30; poster gradient remains beneath, video fades in 0.3 s at `canplay`.

Performance budget: JS ≤ 90 KB gzip (overlay module dynamically imported on first click); transform/opacity/clip-path only; `will-change` from JS on ≤6 concurrent elements (cursor dot+ring and preview card permanent); ≤12 simultaneous tweens; composited layers ≤25; LCP ≤ 2.0 s.

---

## 7. Custom Cursor

Two fixed elements driven by one `gsap.ticker` callback, transform-only. Instantiated **only** when `matchMedia('(hover: hover) and (pointer: fine)').matches`; `cursor: none` applied via `html.has-custom-cursor` only when active; killed on `pointerType === 'touch'`.

- **Dot:** 8 px, `--accent`, follows pointer 1:1, no blend.
- **Ring:** 40 px, 1.5 px border `#fff`, `mix-blend-mode: difference`, frame-rate-independent lerp `0.15` → `pos += (target − pos) * (1 − Math.pow(1 − 0.15, dt * 60))`.

State tweens on the ring: `duration 0.35 s`, `power3.out`:

| State | Trigger | Ring scale | Extra |
|---|---|---|---|
| default | — | 1 (40 px) | — |
| link | `a, button, [data-cursor="link"]` | 1.6 | dot scales to 0 |
| play | `[data-cursor="play"]` (work rows, reel frame) | 2.5 (100 px) | blend removed; solid `--ink-hi` fill; label `PLAY ●` in `--bg`, fades in 0.25 s |
| drag | overlay scrub bar | 1.8 | label `DRAG` |
| hidden | pointer leaves window | 0 | 0.2 s |

**Magnetic CTAs** (hero CTA, contact CTAs, overlay close — max 4 per page): activation radius **80 px** from element center (padded-wrapper listener); element translates `(pointer − center) × 0.35`, inner label counter-translates `× 0.15`; displacement clamped to **24 px**; snap-back `0.6 s, elastic.out(1, 0.3)`.

---

## 8. Placeholder Poster Art Direction

Generated entirely in CSS/SVG — no image assets per item.

- **Duotone sea gradient**, unique hue per entry via `--poster-hue` (Yacht Film 200°, Regatta Film 215°, Charter Promo 174°, Drone Study 232°, Delivery Film 188°, Short Film 252°; ±8° jitter from id hash):
  `linear-gradient(130deg, #070B0F 0%, hsl(var(--poster-hue) 45% 18%) 45%, hsl(calc(var(--poster-hue) + 25) 55% 38%) 82%)`, sized 200%, `background-position 0% → 100%` keyframed **6 s linear alternate infinite**, `animation-play-state: paused` unless hovered.
- **Film grain:** 128 px tiled SVG fractal-noise layer at `opacity 0.12`, `background-position` stepped `steps(8)` 0.8 s loop, also paused unless hovered.
- **Index watermark:** `01`–`08`, Archivo 700, ~18vw, `--ink-hi` at `opacity 0.18`, parallaxes −15 px against the card's cursor-follow.
- **Duration chip:** bottom-right, micro tabular caps in a 1 px `--line-strong` pill on `--scrim`, e.g. `1:24`.
- **Client line:** bottom-left micro caps `--ink-mid`, e.g. `S/Y MYTHOS · 2025`.
- Same posters serve as static in-row thumbnails on touch devices and as loading states under real video forever. YouTube-sourced items use `https://i.ytimg.com/vi/<id>/hqdefault.jpg` with the gradient behind as fallback.

---

## 9. Component Inventory

```
index.html                      admin.html
vite.config.ts                  package.json / tsconfig.json
.github/workflows/deploy.yml
public/fonts/archivo-var.woff2  public/fonts/space-grotesk-var.woff2
public/og.jpg  public/favicon.svg
src/styles/tokens.css           # §2–§3 custom properties
src/styles/base.css             # reset, grain, focus, reduced-motion
src/styles/components.css       # header, rows, cards, chips, overlay, posters
src/data/videos.json            # §10 manifest — single source of truth
src/main.ts                     # bootstrap, gsap/lenis wiring, matchMedia contexts
src/modules/preloader.ts        # §4.1 / §6 intro timeline
src/modules/cursor.ts           # §7 dot/ring/states
src/modules/magnetic.ts         # §7 magnetic CTAs
src/modules/reveals.ts          # §6 named effects + ScrollTrigger.batch
src/modules/workIndex.ts        # renders rows from manifest
src/modules/hoverPreview.ts     # shared <video>, poster cards, cursor-follow
src/modules/overlayPlayer.ts    # dynamic import; YouTube/Vimeo/file embeds
src/modules/posters.ts          # generates gradient posters from manifest
src/lib/split.ts                # SplitType helper: line masks + aria fixes
src/admin/admin.ts  src/admin/admin.css   # §11
```

Vite multi-page build: `rollupOptions.input = { main: 'index.html', admin: 'admin.html' }`.

---

## 10. Data Manifest Schema — `src/data/videos.json`

Single source of truth; **array order = display order**. Exactly:

```json
{
  "videos": [
    {
      "id": "kebab-slug",
      "title": "Aegean Crossing",
      "client": "S/Y Mythos",
      "category": "Yacht Film",
      "year": 2025,
      "duration": "1:24",
      "source": { "type": "placeholder | youtube | vimeo | file", "id": "<youtube/vimeo id>", "url": "<for file type>" },
      "poster": "",
      "featured": false
    }
  ]
}
```

Resolution rules: empty `poster` ⇒ YouTube thumb derived from `source.id` (`hqdefault.jpg`) when `type: "youtube"`, otherwise the generated gradient poster (§8). `featured: true` items feed the showreel section (first featured wins). Ship v1 with the 8 entries from §5, all `source.type: "placeholder"`.

---

## 11. Admin Page — `/admin.html`

Dark minimal dashboard on the same tokens (`--bg`, `--surface`, Space Grotesk throughout, no display font except the `RNDY — ADMIN` micro wordmark). Single centered column (720 px). Top: **token field** (GitHub fine-grained PAT, password input, stored in `localStorage`, status dot turns `--accent` when validated). Middle: **video list** — `--surface` rows mirroring the manifest (drag handle ⋮⋮ for reorder, title, client, category chip, duration, source badge `YT/VIMEO/PLACEHOLDER`, delete ×). **Add** row: paste a YouTube/Vimeo URL → id parsed, title prefetched via oEmbed, editable fields appear. Bottom bar: **Publish** button (commits `videos.json` via GitHub Contents API) + **deploy status** pill polling the latest Actions run (`queued / building / live` with timestamp). All interactions instant, no animation beyond 0.2 s opacity.

---

## 12. Deploy Notes

`vite.config.ts`: `base: './'` — relative asset resolution makes the same build work on the GitHub Pages project subpath today and a custom domain tomorrow, no code changes. All runtime asset URLs via `import.meta.env.BASE_URL`. OG/favicon paths relative (`./og.jpg`).

`.github/workflows/deploy.yml` (adapted from the Volos pipeline):

```yaml
name: Deploy to GitHub Pages
on:
  push: { branches: [main] }
  workflow_dispatch:
permissions: { contents: read, pages: write, id-token: write }
concurrency: { group: pages, cancel-in-progress: false }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npm run build          # vite build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: ./dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: "${{ steps.deployment.outputs.page_url }}" }
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Dependencies: `gsap@3.15.0`, `lenis@1.3.23`, `split-type@0.3.4`; dev: `vite@8.0.16`, `typescript@^5.7.3`. CI guard: bundlesize check on the 90 KB JS cap.

---

## 13. Mobile Behavior & Reduced Motion

**Mobile (`max-width: 768px` / `pointer: coarse`):** native scroll (no Lenis), no custom cursor, no magnetic, no hover previews. Hero uses `100svh`; resize handling ignores height changes (debounced 200 ms, width only). Reveal distances halved (`y: 20`), durations ×0.85, staggers ×0.7, parallax ±6%. Per section — *Hero:* lockup stacks, type 11vw, CTA full-width. *Showreel:* tap opens overlay. *Work index:* rows become stacked cards — static gradient/YouTube poster (16:9) above title/meta; tap opens overlay. *About:* single column, portrait first. *Approach:* rows stack. *Contact:* CTAs stack full-width; WhatsApp uses `wa.me` deep link. All contexts created inside `gsap.matchMedia()` so orientation changes revert cleanly. `visibilitychange` pauses hero video.

**Reduced motion (`prefers-reduced-motion: reduce`, checked at init and on `change`):** Lenis and cursor modules never instantiated; preloader is a static wordmark with a single 0.4 s opacity fade; every reveal becomes `opacity 0 → 1, 0.3 s` with no transforms; parallax disabled; poster gradient/grain `animation: none`; overlay is a 0.25 s cross-fade; no video autoplay — explicit play tap required.

— End of spec —
