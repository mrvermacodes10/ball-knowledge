// Validates the game registry: run with `npm run validate`.
import { GAMES, ENGINES, CATEGORIES, DIFFICULTIES, clash } from "../src/data/games";
import { isCorrect } from "../src/lib/answers";

const errors: string[] = [];
const warn: string[] = [];
const ids = new Set<string>();
const qids = new Set<string>();
const titles = new Set<string>();
const MIN: Record<string, number> = { match: 2, order: 2, survival: 8, elimination: 8, timed: 8 };

for (const g of GAMES) {
  if (ids.has(g.id)) errors.push(`Duplicate game id ${g.id}`);
  ids.add(g.id);
  if (titles.has(g.title)) errors.push(`Duplicate title "${g.title}"`);
  titles.add(g.title);
  if (!(g.engine in ENGINES)) errors.push(`${g.id}: unknown engine ${g.engine}`);
  if (!CATEGORIES.some((c) => c.id === g.category)) errors.push(`${g.id}: unknown category`);
  if (!DIFFICULTIES.includes(g.difficulty)) errors.push(`${g.id}: bad difficulty`);
  const min = MIN[g.engine] ?? 4;
  if (g.questions.length < min) errors.push(`${g.id} "${g.title}": only ${g.questions.length} questions (needs ${min})`);
  for (const q of g.questions) {
    if (qids.has(q.id)) errors.push(`Duplicate question id ${q.id}`);
    qids.add(q.id);
    if (q.gameId !== g.id) errors.push(`${q.id}: wrong gameId reference`);
    if (!q.prompt?.trim()) errors.push(`${q.id}: empty question`);
    if (!q.answer?.trim()) errors.push(`${q.id}: missing answer`);
    if (!q.explanation?.trim()) errors.push(`${q.id}: missing explanation`);
    if (!q.source?.startsWith("http")) errors.push(`${q.id}: missing source URL`);
    if (q.options) {
      if (q.options.filter((o) => o === q.answer).length !== 1) errors.push(`${q.id}: answer "${q.answer}" not exactly once in options [${q.options.join(" | ")}]`);
      if (new Set(q.options).size !== q.options.length) errors.push(`${q.id}: duplicate options`);
      if (q.options.length < 2) errors.push(`${q.id}: fewer than 2 options`);
      if (q.options.length < 4 && q.options[0] !== "True" && !q.options.includes("Loan")) warn.push(`${q.id}: only ${q.options.length} options`);
      for (const o of q.options) if (o !== q.answer && clash(o, q.answer)) errors.push(`${q.id}: option "${o}" is a look-alike of the answer "${q.answer}"`);
      for (const o of q.options) if (/^\d{4}$/.test(o) && Number(o) > 2025) errors.push(`${q.id}: option year ${o} is after the facts cut-off`);
    }
    const needsOptions = ["mc", "timed", "image", "survival", "elimination", "tf"].includes(g.engine);
    if (needsOptions && !q.options) errors.push(`${q.id}: engine ${g.engine} needs options`);
    if (g.engine === "match" && (!q.pairs || q.pairs.length < 3)) errors.push(`${q.id}: match round needs 3+ pairs`);
    if (g.engine === "order" && (!q.items || q.items.length < 3)) errors.push(`${q.id}: order round needs 3+ items`);
    if (g.engine === "clues" && (!q.clues || q.clues.length < 2)) errors.push(`${q.id}: needs 2+ clues`);
    if (g.engine === "image" && !q.visual) errors.push(`${q.id}: image question without a visual`);
    if (["type", "career", "clues"].includes(g.engine) && !isCorrect(q.answer, q.answer, q.accept)) errors.push(`${q.id}: typed answer doesn't accept itself`);
    // The prompt must not contain the answer ("In which year…? … in 2010", "Which club plays at Tottenham Hotspur Stadium?").
    if (!["tf", "order", "match"].includes(g.engine) && q.answer.length > 3 && q.prompt.toLowerCase().includes(q.answer.toLowerCase())) errors.push(`${q.id}: prompt gives away the answer "${q.answer}"`);
    if (g.engine === "match" && q.pairs && new Set(q.pairs.map((p) => p[1])).size !== q.pairs.length) errors.push(`${q.id}: duplicate right-hand labels`);
    if (g.engine === "order" && q.items && new Set(q.items).size !== q.items.length) errors.push(`${q.id}: duplicate items to order`);
  }
}

// Distinct content: no two games may share more than half their questions.
const sig = new Map(GAMES.map((g) => [g.id, new Set(g.questions.map((q) => `${q.prompt}::${q.answer}`))]));
for (let i = 0; i < GAMES.length; i++) for (let j = i + 1; j < GAMES.length; j++) {
  const a = sig.get(GAMES[i].id)!, b = sig.get(GAMES[j].id)!;
  const inter = [...a].filter((x) => b.has(x)).length;
  const ratio = inter / Math.min(a.size, b.size);
  if (ratio > 0.5) errors.push(`Games too similar (${Math.round(ratio * 100)}% shared): ${GAMES[i].id} "${GAMES[i].title}" and ${GAMES[j].id} "${GAMES[j].title}"`);
}

const perCat = CATEGORIES.map((c) => `${c.name}: ${GAMES.filter((g) => g.category === c.id).length}`);
const perDiff = DIFFICULTIES.map((d) => `${d}: ${GAMES.filter((g) => g.difficulty === d).length}`);
const totalQ = GAMES.reduce((s, g) => s + g.questions.length, 0);
console.log(`Games: ${GAMES.length} (unique ids: ${ids.size}) · Questions: ${totalQ}`);
console.log(perCat.join(" · "));
console.log(perDiff.join(" · "));
if (warn.length) console.log(`${warn.length} warning(s):\n  ` + warn.slice(0, 15).join("\n  "));
if (GAMES.length < 200) errors.push(`Only ${GAMES.length} games — need at least 200`);
if (errors.length) { console.error(`\n${errors.length} ERROR(S):\n  ` + errors.slice(0, 60).join("\n  ")); process.exit(1); }
console.log("\nVALID: all checks passed.");
