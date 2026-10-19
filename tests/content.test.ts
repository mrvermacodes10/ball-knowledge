// Every game must be playable and fair. Run with `npm test` (scripts/validate.ts prints a fuller report).
import { test } from "node:test";
import assert from "node:assert/strict";
import { GAMES, clash } from "../src/data/games";
import { isCorrect } from "../src/lib/answers";
import { scoreOrder, scoreMatch } from "../src/lib/scoring";

test("there are at least 200 games with unique ids and titles", () => {
  assert.ok(GAMES.length >= 200);
  assert.equal(new Set(GAMES.map((g) => g.id)).size, GAMES.length);
  assert.equal(new Set(GAMES.map((g) => g.title)).size, GAMES.length);
});

test("multiple-choice answers appear exactly once and no option is a look-alike of the answer", () => {
  for (const g of GAMES) for (const q of g.questions) if (q.options) {
    assert.equal(q.options.filter((o) => o === q.answer).length, 1, `${q.id}: answer not in options`);
    for (const o of q.options) if (o !== q.answer) assert.equal(clash(o, q.answer), false, `${q.id}: "${o}" looks like the answer "${q.answer}"`);
  }
});

test("each typed answer is accepted when typed exactly", () => {
  for (const g of GAMES) if (["type", "career", "clues"].includes(g.engine)) for (const q of g.questions) assert.ok(isCorrect(q.answer, q.answer, q.accept), q.id);
});

test("match and order rounds are solvable: the stored solution scores full marks", () => {
  for (const g of GAMES) for (const q of g.questions) {
    if (g.engine === "match") {
      const sol = Object.fromEntries(q.pairs!.map((p, k) => [k, p[1]]));
      assert.ok(scoreMatch(q.pairs!, sol).correct, q.id);
      assert.equal(new Set(q.pairs!.map((p) => p[1])).size, q.pairs!.length, `${q.id}: duplicate right-hand labels`);
    }
    if (g.engine === "order") {
      assert.ok(scoreOrder(q.items!, [...q.items!]).correct, q.id);
      assert.equal(new Set(q.items).size, q.items!.length, `${q.id}: duplicate items`);
    }
  }
});

test("no option is a year after the facts cut-off", () => {
  for (const g of GAMES) for (const q of g.questions) for (const o of q.options ?? []) if (/^\d{4}$/.test(o)) assert.ok(Number(o) <= 2025, `${q.id}: ${o}`);
});

test("questions are deterministic, so friend challenges replay the identical set", async () => {
  const again = (await import("../src/data/games?again" as string)) as typeof import("../src/data/games");
  assert.deepEqual(again.GAMES.map((g) => g.questions.map((q) => q.prompt + q.options?.join())), GAMES.map((g) => g.questions.map((q) => q.prompt + q.options?.join())));
});
