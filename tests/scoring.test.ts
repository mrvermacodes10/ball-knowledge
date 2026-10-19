// Scoring, lives and win rules shared by every game engine. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOutcome, isOver, isWin, newTally, scoreClues, scoreMatch, scoreOption, scoreOrder, scoreTyped, summarise, xpFor, type Outcome } from "../src/lib/scoring";

const right: Outcome = { points: 1, max: 1, correct: true };
const wrong: Outcome = { points: 0, max: 1, correct: false };
const play = (engine: Parameters<typeof newTally>[0], outcomes: Outcome[]) => outcomes.reduce(applyOutcome, newTally(engine));

test("multiple choice scores 1 for the right option only", () => {
  assert.deepEqual(scoreOption({ answer: "Italy" }, "Italy"), right);
  assert.deepEqual(scoreOption({ answer: "Italy" }, "France"), wrong);
});

test("typed answers score 1, or 0.5 with a hint, and 0 when wrong", () => {
  const q = { answer: "Didier Drogba", accept: ["Drogba"] };
  assert.deepEqual(scoreTyped(q, "drogba"), right);
  assert.deepEqual(scoreTyped(q, "Didier Drogba", true), { points: 0.5, max: 1, correct: true });
  assert.deepEqual(scoreTyped(q, "Anelka"), wrong);
});

test("progressive clues: earlier guesses are worth more, never less than 1", () => {
  assert.deepEqual(scoreClues(4, 1, true), { points: 4, max: 4, correct: true });
  assert.deepEqual(scoreClues(4, 4, true), { points: 1, max: 4, correct: true });
  assert.deepEqual(scoreClues(4, 4, false), { points: 0, max: 4, correct: false });
});

test("matching and ordering give a point per correct item", () => {
  const pairs: [string, string][] = [["Arsenal", "Emirates Stadium"], ["Liverpool", "Anfield"], ["Everton", "Hill Dickinson Stadium"]];
  assert.deepEqual(scoreMatch(pairs, { 0: "Emirates Stadium", 1: "Anfield", 2: "Hill Dickinson Stadium" }), { points: 3, max: 3, correct: true });
  assert.deepEqual(scoreMatch(pairs, { 0: "Anfield", 1: "Emirates Stadium", 2: "Hill Dickinson Stadium" }), { points: 1, max: 3, correct: false });
  assert.deepEqual(scoreOrder(["1930", "1934", "1938"], ["1930", "1938", "1934"]), { points: 1, max: 3, correct: false });
  assert.deepEqual(scoreOrder(["a", "b"], ["a", "b"]), { points: 2, max: 2, correct: true });
});

test("tally tracks points, accuracy and the best streak", () => {
  const t = play("mc", [right, right, wrong, right, right, right]);
  assert.equal(t.points, 5); assert.equal(t.max, 6); assert.equal(t.correct, 5); assert.equal(t.answered, 6);
  assert.equal(t.run, 3); assert.equal(t.bestRun, 3);
});

test("survival ends after three wrong answers; sudden death after one", () => {
  const surv = play("survival", [wrong, right, wrong, wrong]);
  assert.equal(surv.lives, 0); assert.ok(isOver(surv, 15));
  assert.equal(isWin("survival", surv, 15), false);
  const sd = play("elimination", [right, wrong]);
  assert.ok(isOver(sd, 10)); assert.equal(isWin("elimination", sd, 10), false);
  assert.ok(isOver(play("mc", Array(8).fill(right)), 8));
  assert.equal(isOver(play("mc", [right]), 8), false);
});

test("win rules per mode", () => {
  assert.ok(isWin("survival", play("survival", [wrong, wrong, right, right]), 4)); // reached the end with a life left
  assert.ok(isWin("elimination", play("elimination", [right, right]), 2));
  assert.ok(isWin("mc", play("mc", [right, wrong]), 2)); // 50%
  assert.equal(isWin("mc", play("mc", [right, wrong, wrong]), 3), false);
  assert.equal(isWin("mc", play("mc", [right, right, right, right, wrong]), 5, true), false); // perfect required
  assert.ok(isWin("mc", play("mc", Array(5).fill(right)), 5, true));
});

test("summary never divides by zero when nothing was answered (e.g. sprint timed out)", () => {
  const s = summarise("timed", newTally("timed"), 16, 60000);
  assert.equal(s.max, 1); assert.equal(s.points, 0); assert.equal(s.won, false);
});

test("XP scales with score and difficulty; same-day replays earn half", () => {
  assert.equal(xpFor(1, 10, "Beginner"), 110);
  assert.equal(xpFor(1, 10, "Expert"), 210);
  assert.equal(xpFor(0, 10, "Expert"), 10);
  assert.equal(xpFor(0.5, 10, "Intermediate"), 73);
  assert.equal(xpFor(1, 10, "Beginner", true), 55);
  assert.equal(xpFor(2, 10, "Beginner"), 110); // clamped
});
