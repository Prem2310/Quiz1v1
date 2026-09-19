---
version: 1
slug: "src-pages-arena-tsx"
primary_target: "src/pages/Arena.tsx"
related_targets: ["src/index.css","src/components/layout/AppShell.tsx","src/pages/DuelRoom.tsx","src/pages/Landing.tsx","src/pages/Login.tsx","src/pages/Signup.tsx","src/pages/PracticePage.tsx","src/pages/Leaderboard.tsx","src/pages/Friends.tsx","src/pages/Profile.tsx","src/pages/Progress.tsx","src/pages/Settings.tsx","src/pages/DuelMatchmaking.tsx"]
---

## Scope and visitor mode

Operate. Primary target: authenticated app shell + Arena (hub), extending to Practice, Duel Matchmaking/Room, Leaderboard, Friends, Profile, Progress, Settings via the shared token/primitive system. Landing/Login/Signup inherit this world's palette and materials but are scoped as their own Persuade-mode composition (separate brief note below), not rebuilt as versus-screens.

## Audience, job, action, proof, constraints

Placement/exam-prep students (banking, SSC, campus placements) practicing aptitude/reasoning under time pressure, solo and in live 1v1 duels. Job: pick a topic or opponent fast, answer under a clock, see the score/result instantly, come back tomorrow. Proof: real seeded question content (IndiaBix-sourced), real rating/streak/XP numbers from the API — no invented stats. Constraint: dense quiz content (question text, 4 options, `indiabix-html` math markup) must stay fully legible under the new world; nothing in the redesign may reduce answer-option legibility or timer visibility.

## Direction contract

**THESIS:** QuizIt is not a dashboard with quiz features bolted on — it's a versus-screen: every surface is staged as a match (select your mode/topic, face an opponent or the clock, see the verdict), refusing the generic dark-SaaS-dashboard-with-cards arrangement the category defaults to.

**OWN-WORLD:** 90s arcade fighting-game vocabulary, hard-edged not glassy. Near-black CRT ground (`~6% L`). Two combat colors carry the surface at Committed strength (30-60%): P1 electric cyan-blue (`~198 90% 58%`) and P2 hot coral-red (`~8 88% 60%`), never mixed as a gradient — they oppose, like corner colors. Amber (`~40 95% 55%`) reserved for timer/urgency only. Display type: bold condensed arcade-marquee face (Anton or equivalent condensed grotesk) for headlines/scores, set in tight tracking, occasional white-drop-shadow "screen-print" register on hero numbers. UI/body: condensed hazard-stencil-adjacent grotesk (Barlow Condensed) for labels/nav, uppercase, tracked. Numerics: monospace tabular (JetBrains Mono, kept from incumbent) for every score, timer, rating, rank — never proportional digits. Panels are flat cabinet bezels: 1-2px high-contrast borders, sharp or minimally rounded corners (not the current `rounded-2xl` blur glass), inset "screen" panels reading as CRT frames, not frosted glass. State changes never rely on color alone — pair every P1/P2/correct/wrong/timer state with an icon, label, or motion cue. Numeric deltas (+10, ▲2, -1 streak) render inline next to every changed value, always, not just on hover.

**STORY:** A student opens the app mid-session and immediately reads it as "which match am I about to play" — Arena is a mode-select screen (Practice / Duel / Topic), Duel Room is a live two-corner versus layout with HP-style accuracy/time bars, results screens read as a K.O./round-win recap with the real score.

**FIRST VIEWPORT:** Arena, top of page: a full-width "ARENA" marquee header in the display face, tabular rating/streak/XP chips as HUD readouts (not soft cards) top-right, then a mode-select row of exactly three large select-tiles (Practice / Find Duel / Topics) styled as fighter-select boxes with hover-glow-on-selection only (no ambient glow at rest), each tile carrying one stat readout. Primary action (Find Duel) sits visually first/largest.

**FORM:** Arcade Versus-Screen, candidate 4 of 7 on my own ranked list (order: 1 OMR sheet, 2 cricket scorecard, 3 railway PNR chart, 4 arcade versus-screen [assigned], 5 admit card, 6 bank passbook, 7 coaching booklet), assigned by seed key `558aef9a`. Weighed against catalog challengers (teletext broadcast: competitive, full alternate; stagecraft cyclorama, console dashboard, Designers Republic info-noise, darkroom exposure record: declined, raises folded in above; paper-folds origami: declined, no raise). User confirmed this direction over the OMR pick, teletext challenger, and standing-exit canon option.

**FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

## Unresolved decisions

- Landing page gets its own Persuade-mode composition pass (same OWN-WORLD tokens/materials, different first-viewport strategy: hook → proof → signup CTA) — not covered by this brief's FIRST VIEWPORT block.
- Practice/Leaderboard/Friends/Profile/Progress/Settings inherit the token + primitive system and AppShell; deep bespoke composition per page is not separately contracted here — each stays legible and on-system, not necessarily its own "signature moment."
