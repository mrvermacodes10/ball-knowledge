// Data safety: export/import, unknown game IDs, damaged saves and safety copies. Run with `npm test`.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// An in-memory localStorage, installed before the store loads. `failing` keys throw on write, like a full or blocked storage.
const mem = new Map<string, string>();
const failing = new Set<string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { if (failing.has(k)) throw new Error("QuotaExceededError"); mem.set(k, String(v)); },
  removeItem: (k: string) => { mem.delete(k); },
};
const S = await import("../src/lib/store");
const { KEY, SAFETY_COPIES } = S;
const [ORIGINAL, PREVIOUS, UNREADABLE] = SAFETY_COPIES.map((c) => c.key);

const result = (gameId: string, xp: number, extra: object = {}) => ({ gameId, points: 4, max: 8, correct: 4, answered: 8, bestRun: 3, ms: 41000, date: "2026-10-01T12:00:00.000Z", xp, dailyBonus: 0, category: "players", difficulty: "Beginner", won: true, ...extra });
const retired = result("retired-game-999", 70);
const save = {
  profiles: [
    { id: "aaaa1111", name: "Neel", avatar: "🦁", created: "2026-09-01T10:00:00.000Z", dailyClaimed: ["2026-10-01", "2026-10-02"],
      results: [result("players-001", 60, { dailyBonus: 50 }), retired, result("clubs-029", 45), result("players-002", 20, { max: 0 })], favouriteClub: "Arsenal" },
    { id: "bbbb2222", name: "Sam", avatar: "🧤", created: "2026-09-05T10:00:00.000Z", dailyClaimed: [], results: [result("players-003", 30)] },
    { name: "no id, unreadable profile", results: [] },
  ],
  activeId: "bbbb2222",
  friends: [{ code: "abc", gameId: "players-001", name: "Jo", points: 5, max: 8, ms: 30000, date: "2026-10-01" }],
  futureField: { keep: true },
};
const RAW = JSON.stringify(save);
const allResults = (raw: string) => (JSON.parse(raw) as typeof save).profiles.flatMap((p) => p.results.map((r) => JSON.stringify(r))).sort();
const start = (raw: string | null) => { mem.clear(); failing.clear(); if (raw !== null) mem.set(KEY, raw); S.reload(); };
const snapshot = () => S.currentSummary();

beforeEach(() => start(RAW));

test("loading keeps the save byte-for-byte and copies it aside once, as the original", () => {
  assert.equal(mem.get(KEY), RAW);
  const copy = JSON.parse(mem.get(ORIGINAL)!);
  assert.equal(copy.data, RAW); assert.equal(copy.app, "ball-knowledge");
  mem.set(KEY, JSON.stringify({ ...save, activeId: "aaaa1111" })); S.reload();
  assert.equal(JSON.parse(mem.get(ORIGINAL)!).data, RAW, "the original copy is never overwritten");
});

test("results for unknown games are hidden exactly as before but kept in storage through play", () => {
  const neel = S.decode(RAW).state.profiles[0];
  assert.equal(neel.results.length, 2, "retired game and max=0 result aren't shown");
  assert.equal(S.totalXp(neel), 60 + 50 + 45, "XP is derived from shown results only, as before");
  S.switchProfile("aaaa1111");
  S.recordResult({ gameId: "players-004", points: 6, max: 8, correct: 6, answered: 8, bestRun: 4, ms: 30000, xp: 50, category: "players", difficulty: "Beginner", won: true });
  const saved = mem.get(KEY)!;
  for (const r of allResults(RAW)) assert.ok(allResults(saved).includes(r), "every original result is still saved");
  const out = JSON.parse(saved);
  assert.deepEqual(out.futureField, { keep: true });
  assert.ok(out.profiles.some((p: { name: string }) => p.name === "no id, unreadable profile"));
  assert.equal(out.profiles[0].favouriteClub, "Arsenal");
  assert.deepEqual(out.profiles[0].dailyClaimed, ["2026-10-01", "2026-10-02"]);
});

test("export then import with several profiles restores everything exactly", () => {
  const before = snapshot();
  const file = S.exportBackup();
  assert.equal(JSON.parse(file).data, RAW);
  start(null); // a different, empty device
  S.addProfile("Someone else");
  const other = mem.get(KEY)!;
  const c = S.checkBackup(file);
  assert.ok(c.ok);
  assert.deepEqual(c.ok && c.profiles.map((p) => [p.name, p.games, p.xp, p.days, p.unknown]), [["Neel", 2, 155, 2, 2], ["Sam", 1, 30, 0, 0]]);
  assert.deepEqual(S.restoreBackup(c.ok ? c.raw : ""), { ok: true });
  assert.equal(mem.get(KEY), RAW, "the save is replaced with the exact backed-up text");
  assert.equal(JSON.parse(mem.get(PREVIOUS)!).data, other, "the replaced data is kept as a safety copy");
  assert.deepEqual(snapshot(), before);
  const neel = S.decode(mem.get(KEY)!).state.profiles[0];
  assert.deepEqual(S.achievements(neel).filter((a) => a.done).map((a) => a.id), S.achievements(S.decode(RAW).state.profiles[0]).filter((a) => a.done).map((a) => a.id));
  assert.equal(S.active().name, "Sam", "the active player comes back too");
});

test("restoring a wrapped backup file writes the save inside it, not the wrapper", () => {
  const before = snapshot();
  const file = S.makeBackup(RAW);
  start(null);
  S.addProfile("Someone else");
  const other = mem.get(KEY)!;
  assert.deepEqual(S.restoreBackup(file), { ok: true });
  assert.equal(mem.get(KEY), RAW, "the main key holds the original save text");
  assert.equal(JSON.parse(mem.get(PREVIOUS)!).data, other, "the replaced data is still kept as a safety copy");
  assert.equal(mem.get(UNREADABLE), undefined);
  assert.deepEqual(snapshot(), before, "both profiles come back with their games, XP and daily claims");
  assert.deepEqual(S.currentSummary().map((p) => [p.name, p.games, p.xp, p.days, p.unknown]), [["Neel", 2, 155, 2, 2], ["Sam", 1, 30, 0, 0]]);
});

test("raw save text copied from the browser console is accepted", () => {
  const c = S.checkBackup(RAW);
  assert.ok(c.ok && c.raw === RAW);
});

test("invalid or damaged backup files are rejected and nothing changes", () => {
  const bad = ["", "not json", "{}", "[]", "null", JSON.stringify({ app: "ball-knowledge", data: "{broken" }),
    JSON.stringify({ app: "ball-knowledge", data: JSON.stringify({ profiles: [] }) }), JSON.stringify({ profiles: [{ name: "no id" }] }), "x".repeat(5_000_001)];
  for (const text of bad) {
    const c = S.checkBackup(text);
    assert.equal(c.ok, false, `rejected: ${text.slice(0, 40)}`);
    assert.equal(S.restoreBackup(text).ok, false);
  }
  assert.equal(mem.get(KEY), RAW);
  assert.equal(mem.get(PREVIOUS), undefined, "no import happened, so no safety copy was needed");
});

test("an import is refused if the current data can't be copied aside first", () => {
  const file = S.makeBackup(JSON.stringify({ ...save, activeId: "aaaa1111" }));
  failing.add(PREVIOUS);
  const r = S.restoreBackup((S.checkBackup(file) as { raw: string }).raw);
  assert.equal(r.ok, false);
  assert.equal(mem.get(KEY), RAW);
});

test("a damaged save is copied aside before anything can overwrite it", () => {
  start("{this is not json");
  assert.equal(JSON.parse(mem.get(UNREADABLE)!).data, "{this is not json");
  S.setName("Fresh"); // play continues on a fresh profile, as before
  assert.equal(JSON.parse(mem.get(UNREADABLE)!).data, "{this is not json");
});

test("if a damaged save can't be copied aside, it is never overwritten", () => {
  mem.clear(); failing.clear();
  mem.set(KEY, "{damaged"); failing.add(UNREADABLE); S.reload();
  assert.ok(S.savingBlocked());
  S.setName("Fresh");
  assert.equal(mem.get(KEY), "{damaged");
});

test("reset and remove keep a safety copy of the data first", () => {
  S.removeProfile("aaaa1111");
  assert.equal(JSON.parse(mem.get(PREVIOUS)!).data, RAW);
  const afterRemove = mem.get(KEY)!;
  S.resetProgress();
  assert.equal(JSON.parse(mem.get(PREVIOUS)!).data, afterRemove);
});
