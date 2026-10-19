# Ball Knowledge — Think You Know Ball?

A football trivia platform with **210 validated, playable games** across 8 categories, built with Vite, React, TypeScript and Lucide icons. It runs entirely in the browser: no backend, no API keys, no environment variables.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
```

Other commands:

```bash
npm test           # unit tests: answer checking, scoring/lives/win rules, XP, and content fairness
npm run validate   # checks the game registry (count, IDs, answers, options, look-alike options, giveaways, distinct content)
npm run lint       # oxlint
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build (http://localhost:4173)
```

## What's inside

- **8 categories**: Player Knowledge · Clubs & Stadiums · International & World Cups · Leagues & Competitions · Transfers & Careers · Matches & Moments · Kits, Flags & Visuals · Ultimate Trivia. There are no tactics, formation, maths or shirt-number games.
- **11 reusable engines**: multiple choice, type-the-answer, 60-second sprint, image identification, matching pairs, chronological order, career path, progressive clues, survival (3 lives), sudden death, and true/false. One `Player` component renders them; all scoring, lives and win rules live in `src/lib/scoring.ts` (pure functions, unit-tested).
- **Win rules**: survival = reach the end with a life left; sudden death and "perfect score" games = every answer right; everything else = at least half the points.
- **Typed answers** (`src/lib/answers.ts`) ignore case, accents, punctuation and "FC"/"the"; accept listed aliases (e.g. "Spurs", "PSG", "USSR", "Holland", "R9"); accept either half of "Westfalenstadion (Signal Iduna Park)"; and allow one typo from 8 letters (two from 13). Short names get no typo allowance, so Iran ≠ Iraq and Iceland ≠ Ireland.
- **4 difficulties**: games at higher levels draw from facts tagged as less well known, use typed answers more often, and use tighter wrong options.
- **Progression** (stored in this browser): XP and levels, 9 achievements checked against real results, personal bests, game history, category performance, and a daily challenge (same game for everyone on a date, +50 XP once per day for a completed attempt with at least one answer, streaks). Replaying a game you already finished today earns half XP.
- **Keyboard**: options can be picked with A–D or 1–4; Enter submits typed answers and moves to the next question.
- **Local leaderboard**: ranks the player profiles saved on this device (all-time / last 7 days). There are no invented users.
- **Friend challenges**: share a link containing your score; your friend plays the identical question set and sees the comparison (higher score wins, then faster time). Only their first attempt counts. Results appear on their leaderboard page.

## Content and sources

- All facts live in `src/data/facts.ts`. Games are generated from them in `src/data/games.ts`. Each question carries an ID, game ID, category, prompt, answer, accepted alternatives, difficulty, season/date, reference URL and explanation.
- Facts were checked up to **autumn 2025** (e.g. the 2024–25 finals, the 2025 Ballon d'Or, summer-2025 transfers). Later results — the 2025–26 season, the 2026 World Cup — are deliberately not included, and current-club labels say "As of autumn 2025". Each question links to a reference list page (mostly Wikipedia lists of finals and champions); the links themselves weren't individually re-opened, so spot-check anything you're unsure of.
- Questions are generated so they stay fair: wrong options never include an equivalent of the answer (Germany/West Germany, "London"/"London (Wembley)", "Japan"/"South Korea & Japan", "1–0"/"1–0 (a.e.t.)"); a question never contains its own answer; players' loan clubs and managers' minor jobs are recorded so they are never offered as "never played/managed there"; and timeline/matching rounds always have exactly one correct solution. `npm run validate` and `npm test` enforce these rules.
- Transfers are labelled **permanent**, **free** or **loan**. Rumours aren't included.
- **No photographs or official badges** are used: "image" games use simplified drawn kits and flags. Photo-based games from the brief (player or stadium photographs) weren't built, because they would need licensed images.
- **football-data.org** isn't used. Its free tier needs an API key and covers only a limited set of competitions and recent seasons, so the site doesn't depend on any external API and stays fully playable offline.

## Limitations (honest list)

- Progress, profiles and leaderboards live in `localStorage`: one browser, no cross-device sync (open tabs in the same browser stay in step). A real global leaderboard or accounts would need a backend.
- Challenge scores travel inside the link and aren't verified by a server. There's no live matchmaking.
- The Inter font loads from Google Fonts; offline, the site falls back to the system sans-serif.
- Drawn kits are simplified (colours and pattern only), so a few plain-coloured kits look alike; games only offer look-alikes as options where the question still has one clear answer, and the typed kit game also names the club's city.
- 210 games is the count of distinct question sets, built from ~25 fact tables by 11 engines. Several games share a format at different difficulty levels (e.g. "World Cup Winners" and "World Cup Winners: The Early Years") but no two games share more than half their questions.
