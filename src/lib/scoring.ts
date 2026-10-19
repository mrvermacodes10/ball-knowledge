// Pure scoring rules shared by every game engine. No React here, so it can be unit-tested (see tests/).
import type { Engine, Question } from "../data/games";
import { isCorrect } from "./answers";

export type Outcome = { points: number; max: number; correct: boolean };
export type Tally = { points: number; max: number; correct: number; answered: number; run: number; bestRun: number; lives: number };
export type Summary = { points: number; max: number; correct: number; answered: number; bestRun: number; ms: number; won: boolean };

export const TIMED_SECONDS = 60;
export const HINT_FACTOR = 0.5;

/** Lives per engine: survival gets three, sudden death one, everything else unlimited. */
export function startingLives(engine: Engine) { return engine === "survival" ? 3 : engine === "elimination" ? 1 : Infinity; }
export function newTally(engine: Engine): Tally { return { points: 0, max: 0, correct: 0, answered: 0, run: 0, bestRun: 0, lives: startingLives(engine) }; }

// ---------- per-question scoring ----------
export function scoreOption(q: Pick<Question, "answer">, picked: string): Outcome {
  const ok = picked === q.answer; return { points: ok ? 1 : 0, max: 1, correct: ok };
}
/** Typed answer: 1 point, or half a point if a hint was used. Giving up (empty input) scores 0. */
export function scoreTyped(q: Pick<Question, "answer" | "accept">, input: string, usedHint = false): Outcome {
  const ok = isCorrect(input, q.answer, q.accept);
  return { points: ok ? (usedHint ? HINT_FACTOR : 1) : 0, max: 1, correct: ok };
}
/** Progressive clues: guessing after the first clue is worth N points, after the last clue 1 point. */
export function scoreClues(totalClues: number, cluesShown: number, solved: boolean): Outcome {
  return { points: solved ? Math.max(1, totalClues - cluesShown + 1) : 0, max: totalClues, correct: solved };
}
/** Matching: one point per correct pair. `chosen` maps left-index → right label. */
export function scoreMatch(pairs: [string, string][], chosen: Record<number, string>): Outcome {
  const good = pairs.filter((p, k) => chosen[k] === p[1]).length;
  return { points: good, max: pairs.length, correct: good === pairs.length };
}
/** Ordering: one point per item in its correct position. */
export function scoreOrder(correctOrder: string[], submitted: string[]): Outcome {
  const good = submitted.filter((x, k) => correctOrder[k] === x).length;
  return { points: good, max: correctOrder.length, correct: good === correctOrder.length };
}

// ---------- game-level state ----------
export function applyOutcome(t: Tally, o: Outcome): Tally {
  const run = o.correct ? t.run + 1 : 0;
  return { points: t.points + o.points, max: t.max + o.max, correct: t.correct + (o.correct ? 1 : 0), answered: t.answered + 1, run, bestRun: Math.max(t.bestRun, run), lives: t.lives - (o.correct ? 0 : 1) };
}
/** True when no further question should be shown. */
export function isOver(t: Tally, totalQuestions: number) { return t.lives <= 0 || t.answered >= totalQuestions; }

/**
 * What counts as a win depends on the mode:
 * - survival: reach the end with at least one life left
 * - sudden death / perfect-score games: every question answered correctly
 * - everything else: at least half the available points
 */
export function isWin(engine: Engine, t: Tally, totalQuestions: number, perfectRequired = false) {
  const perfect = t.answered === totalQuestions && t.correct === totalQuestions;
  if (perfectRequired || engine === "elimination") return perfect;
  if (engine === "survival") return t.answered === totalQuestions && t.lives > 0;
  return t.max > 0 && t.points / t.max >= 0.5;
}

export function summarise(engine: Engine, t: Tally, totalQuestions: number, ms: number, perfectRequired = false): Summary {
  return { points: t.points, max: Math.max(t.max, 1), correct: t.correct, answered: t.answered, bestRun: t.bestRun, ms, won: isWin(engine, t, totalQuestions, perfectRequired) };
}

// ---------- XP ----------
const MULT = { Beginner: 1, Intermediate: 1.25, Advanced: 1.5, Expert: 2 } as const;
/** XP = 10 per question-equivalent of score, scaled by difficulty, plus 10 for finishing. Repeat plays of a game on the same day earn half. */
export function xpFor(fraction: number, questions: number, difficulty: keyof typeof MULT, repeatToday = false) {
  const base = Math.round(Math.max(0, Math.min(1, fraction)) * questions * 10 * MULT[difficulty] + 10);
  return repeatToday ? Math.round(base / 2) : base;
}
