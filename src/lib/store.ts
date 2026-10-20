// Local progress, stored in this browser only (no account, no cross-device sync).
import { useSyncExternalStore } from "react";
import { GAMES, GAME_BY_ID, CATEGORIES, type CategoryId, type Difficulty } from "../data/games";

export type Result = {
  gameId: string; points: number; max: number; correct: number; answered: number; bestRun: number; ms: number;
  date: string; xp: number; dailyBonus: number; category: CategoryId; difficulty: Difficulty; won: boolean;
};
export type FriendResult = { code: string; gameId: string; name: string; points: number; max: number; ms: number; date: string; mine?: { points: number; max: number; ms: number } };
export type Profile = { id: string; name: string; avatar: string; results: Result[]; dailyClaimed: string[]; created: string };
type State = { profiles: Profile[]; activeId: string; friends: FriendResult[] };

export const KEY = "ballknowledge:v1";
/** Safety copies kept next to the save. Each one is a backup file (see makeBackup), so it can be downloaded or restored as-is. */
export const SAFETY_COPIES = [
  { key: `${KEY}:backup:original`, label: "As first found by this version" },
  { key: `${KEY}:backup:previous`, label: "Before the last import, reset or removal" },
  { key: `${KEY}:backup:unreadable`, label: "Damaged data that couldn't be read" },
] as const;
const [ORIGINAL, PREVIOUS, UNREADABLE] = SAFETY_COPIES.map((c) => c.key);
const listeners = new Set<() => void>();
const newProfile = (name = "Player 1", avatar = "⚽"): Profile => ({ id: Math.random().toString(36).slice(2, 10), name, avatar, results: [], dailyClaimed: [], created: new Date().toISOString() });

/**
 * Saved data the app doesn't show: results for games that no longer exist, profiles it can't read and unknown fields.
 * It is never shown or counted, but it is written back untouched on every save so nothing is silently lost.
 */
type Kept = { top: Record<string, unknown>; hidden: Map<string, unknown[]>; extraProfiles: unknown[] };
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
const shown = (r: unknown) => isObj(r) && GAME_BY_ID.has(r.gameId as string) && (r.max as number) > 0;

/** Reads saved progress, repairing missing fields so an old or hand-edited save can't crash the app. `readable` is false when the text isn't a save at all. */
export function decode(raw: string | null): { state: State; kept: Kept; readable: boolean } {
  const kept: Kept = { top: {}, hidden: new Map(), extraProfiles: [] };
  let s: unknown = null;
  try { s = raw ? JSON.parse(raw) : null; } catch { /* unreadable */ }
  const readable = isObj(s) && Array.isArray(s.profiles);
  const profiles: Profile[] = [];
  if (readable) {
    kept.top = s as Record<string, unknown>;
    for (const p of (s as { profiles: unknown[] }).profiles) {
      if (!isObj(p) || typeof p.id !== "string") { kept.extraProfiles.push(p); continue; }
      const rs: unknown[] = Array.isArray(p.results) ? p.results : [];
      const hidden = rs.filter((r) => !shown(r));
      if (hidden.length) kept.hidden.set(p.id, [...(kept.hidden.get(p.id) ?? []), ...hidden]);
      profiles.push({ ...newProfile(p.name as string, p.avatar as string), ...(p as Profile), results: rs.filter(shown) as Result[], dailyClaimed: Array.isArray(p.dailyClaimed) ? p.dailyClaimed : [] });
    }
  }
  const friends = readable && Array.isArray((s as State).friends) ? (s as State).friends : [];
  if (profiles.length) return { state: { profiles, activeId: profiles.some((p) => p.id === (s as State).activeId) ? (s as State).activeId : profiles[0].id, friends }, kept, readable };
  const p = newProfile();
  return { state: { profiles: [p], activeId: p.id, friends }, kept, readable };
}
/** The text to save: the current state plus everything kept aside. */
export function encode(s: State, k: Kept) {
  const used = new Set<string>();
  const profiles = s.profiles.map((p) => { const h = used.has(p.id) ? undefined : k.hidden.get(p.id); used.add(p.id); return h ? { ...p, results: [...h, ...p.results] } : p; });
  return JSON.stringify({ ...k.top, profiles: [...profiles, ...k.extraProfiles], activeId: s.activeId, friends: s.friends });
}

// ---------- safety copies and backup files ----------
const readItem = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
export const makeBackup = (raw: string, reason = "export") => JSON.stringify({ app: "ball-knowledge", key: KEY, reason, savedAt: new Date().toISOString(), data: raw });
const keepCopy = (key: string, raw: string, reason: string) => { try { localStorage.setItem(key, makeBackup(raw, reason)); return true; } catch { return false; } };

let kept: Kept;
/** False when saved data couldn't be read and couldn't be copied aside: then nothing is written, so it can't be overwritten. */
let writable = true;
function load(): State {
  const raw = readItem(KEY);
  const d = decode(raw);
  kept = d.kept; writable = true;
  if (raw !== null) {
    // The first time this version runs, keep the data exactly as the earlier version left it.
    if (readItem(ORIGINAL) === null) keepCopy(ORIGINAL, raw, "original");
    if (!d.readable) writable = keepCopy(UNREADABLE, raw, "unreadable");
  }
  return d.state;
}
let state: State = load();
function save(next: State) {
  state = next;
  if (writable) try { localStorage.setItem(KEY, encode(state, kept)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
export function useStore() { return useSyncExternalStore(subscribe, () => state); }
/** Re-reads the save, e.g. after another tab or an import changed it. */
export function reload() { state = load(); listeners.forEach((l) => l()); }
// Keep several open tabs in step: progress saved in one tab appears in the others.
if (typeof window !== "undefined") window.addEventListener("storage", (e) => { if (e.key === KEY) reload(); });
export const savingBlocked = () => !writable;
/** Copies the current save aside before an action that replaces or deletes progress. */
const keepPrevious = (reason: string) => { const raw = readItem(KEY); return raw === null || keepCopy(PREVIOUS, raw, reason); };

/** The whole save on this device (every profile), as a backup file. */
export const exportBackup = () => makeBackup(readItem(KEY) ?? encode(state, kept));
export const safetyCopies = () => SAFETY_COPIES.map((c) => ({ ...c, file: readItem(c.key) })).filter((c): c is typeof c & { file: string } => c.file !== null);

export type BackupSummary = { name: string; avatar: string; games: number; xp: number; days: number; unknown: number };
export type BackupCheck = { ok: true; raw: string; savedAt?: string; profiles: BackupSummary[] } | { ok: false; error: string };
export const summarise = (raw: string | null): BackupSummary[] => { const d = decode(raw); return d.state.profiles.map((p) => ({ name: p.name, avatar: p.avatar, games: p.results.length, xp: totalXp(p), days: p.dailyClaimed.length, unknown: d.kept.hidden.get(p.id)?.length ?? 0 })); };
export const currentSummary = () => summarise(encode(state, kept));
/** Validates a backup file (or the raw save text copied from the browser console) without changing anything. */
export function checkBackup(text: string): BackupCheck {
  if (text.length > 5_000_000) return { ok: false, error: "That file is too big to be a Ball Knowledge backup." };
  let f: unknown;
  try { f = JSON.parse(text); } catch { return { ok: false, error: "That file isn't a Ball Knowledge backup (it isn't valid JSON)." }; }
  const raw = isObj(f) && f.app === "ball-knowledge" && typeof f.data === "string" ? f.data : isObj(f) && Array.isArray(f.profiles) ? text : null;
  if (raw === null) return { ok: false, error: "That file isn't a Ball Knowledge backup." };
  const d = decode(raw);
  const usable = d.readable && (JSON.parse(raw) as { profiles: unknown[] }).profiles.some((p) => isObj(p) && typeof p.id === "string");
  if (!usable) return { ok: false, error: "The backup is damaged: it has no player profiles that can be read." };
  return { ok: true, raw, savedAt: isObj(f) && typeof f.savedAt === "string" ? f.savedAt : undefined, profiles: summarise(raw) };
}
/** Replaces the save with a checked backup, after keeping a safety copy of the current one. */
export function restoreBackup(raw: string): { ok: true } | { ok: false; error: string } {
  const c = checkBackup(raw);
  if (!c.ok) return { ok: false, error: "That backup can't be read, so nothing was changed." };
  if (!keepPrevious("before-import")) return { ok: false, error: "Couldn't keep a safety copy of your current data (storage may be full), so nothing was changed." };
  // Write the validated save itself, never a backup file wrapped around it.
  try { localStorage.setItem(KEY, c.raw); } catch { return { ok: false, error: "Couldn't save the backup (storage may be full or blocked). Your current data is unchanged." }; }
  reload();
  return { ok: true };
}
export const active = (s: State = state) => s.profiles.find((p) => p.id === s.activeId) ?? s.profiles[0];
function updateActive(fn: (p: Profile) => Profile) { save({ ...state, profiles: state.profiles.map((p) => (p.id === state.activeId ? fn(p) : p)) }); }

export const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
/** Local calendar day of an ISO timestamp. */
export const localDay = (iso: string) => { const d = new Date(iso); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dayShift = (iso: string, n: number) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

// ---------- daily challenge (same game for everyone on a given date) ----------
export function dailyGameId(date = today()) {
  let h = 0; for (const c of "bk-daily-" + date) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return GAMES[h % GAMES.length].id;
}
export const DAILY_BONUS = 50;

// ---------- XP & levels (XP formula lives in lib/scoring) ----------
/** Has the active player already completed this game today? Repeats on the same day earn half XP. */
export const playedToday = (gameId: string, p: Profile = active()) => p.results.some((r) => r.gameId === gameId && localDay(r.date) === today());
export const totalXp = (p: Profile) => p.results.reduce((s, r) => s + r.xp + r.dailyBonus, 0);
export function levelInfo(xp: number) { const per = 250; return { level: Math.floor(xp / per) + 1, into: xp % per, per }; }

export function recordResult(r: Omit<Result, "dailyBonus" | "date">): { result: Result; newAchievements: string[] } {
  const before = achievements(active()).filter((a) => a.done).map((a) => a.id);
  const date = today();
  const p = active();
  // The daily bonus needs a real attempt: at least one question answered.
  const isDaily = r.gameId === dailyGameId(date) && !p.dailyClaimed.includes(date) && r.answered > 0;
  const result: Result = { ...r, date: new Date().toISOString(), dailyBonus: isDaily ? DAILY_BONUS : 0 };
  updateActive((x) => ({ ...x, results: [...x.results, result], dailyClaimed: isDaily ? [...x.dailyClaimed, date] : x.dailyClaimed }));
  const after = achievements(active()).filter((a) => a.done).map((a) => a.id);
  return { result, newAchievements: after.filter((a) => !before.includes(a)) };
}

// ---------- streaks ----------
export function streak(p: Profile) {
  const set = new Set(p.dailyClaimed); let d = today(); if (!set.has(d)) d = dayShift(d, -1);
  let n = 0; while (set.has(d)) { n++; d = dayShift(d, -1); } return n;
}
export function bestStreak(p: Profile) {
  const days = [...new Set(p.dailyClaimed)].sort(); let best = 0, run = 0, prev = "";
  for (const d of days) { run = prev && dayShift(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; }
  return best;
}

// ---------- achievements (computed from real results) ----------
export function achievements(p: Profile) {
  const rs = p.results; const correct = rs.reduce((s, r) => s + r.correct, 0);
  const perfect = (r: Result) => r.answered >= 5 && r.correct === r.answered;
  const cats = new Set(rs.map((r) => r.category));
  const list = [
    { id: "first-whistle", name: "First Whistle", desc: "Complete your first game.", done: rs.length >= 1 },
    { id: "hat-trick", name: "Hat-Trick", desc: "Answer three in a row correctly in one game.", done: rs.some((r) => r.bestRun >= 3) },
    { id: "perfect", name: "Perfect Performance", desc: "Get every answer right in a game of 5+ questions.", done: rs.some(perfect) },
    { id: "daily-regular", name: "Daily Regular", desc: "Complete the daily challenge three days in a row.", done: bestStreak(p) >= 3 },
    { id: "history-expert", name: "History Expert", desc: "Score 70%+ in five Advanced or Expert games.", done: rs.filter((r) => (r.difficulty === "Advanced" || r.difficulty === "Expert") && r.points / r.max >= 0.7).length >= 5 },
    { id: "merchant", name: "Ball Knowledge Merchant", desc: "Earn 2,000 XP.", done: totalXp(p) >= 2000 },
    { id: "expert-status", name: "Expert Status", desc: "Get a perfect score in an Expert game.", done: rs.some((r) => r.difficulty === "Expert" && perfect(r)) },
    { id: "globetrotter", name: "Globetrotter", desc: "Complete a game in all eight categories.", done: cats.size >= CATEGORIES.length },
    { id: "centurion", name: "Centurion", desc: "Answer 100 questions correctly.", done: correct >= 100 },
  ];
  return list;
}

// ---------- derived stats ----------
export function personalBests(p: Profile) {
  const m = new Map<string, Result>();
  for (const r of p.results) { const b = m.get(r.gameId); if (!b || r.points / r.max > b.points / b.max || (r.points / r.max === b.points / b.max && r.ms < b.ms)) m.set(r.gameId, r); }
  return m;
}
export function categoryStats(p: Profile) {
  return CATEGORIES.map((c) => { const rs = p.results.filter((r) => r.category === c.id); const ans = rs.reduce((s, r) => s + r.answered, 0); const cor = rs.reduce((s, r) => s + r.correct, 0);
    return { ...c, played: rs.length, accuracy: ans ? cor / ans : null }; });
}
export const playCounts = (p: Profile) => { const m = new Map<string, number>(); p.results.forEach((r) => m.set(r.gameId, (m.get(r.gameId) ?? 0) + 1)); return m; };
export const recentGames = (p: Profile, n = 6) => [...new Set([...p.results].reverse().map((r) => r.gameId))].slice(0, n).map((id) => GAME_BY_ID.get(id)!).filter(Boolean);
export function accuracy(rs: Result[]) { const a = rs.reduce((s, r) => s + r.answered, 0); return a ? rs.reduce((s, r) => s + r.correct, 0) / a : null; }

// ---------- profiles ----------
export const setName = (name: string) => updateActive((p) => ({ ...p, name: name.trim().slice(0, 24) || p.name }));
export const setAvatar = (avatar: string) => updateActive((p) => ({ ...p, avatar }));
export function addProfile(name: string) { const p = newProfile(name.trim().slice(0, 24) || `Player ${state.profiles.length + 1}`, "🧤"); save({ ...state, profiles: [...state.profiles, p], activeId: p.id }); }
export const switchProfile = (id: string) => save({ ...state, activeId: id });
export function removeProfile(id: string) {
  if (id === state.activeId || state.profiles.length <= 1) return;
  keepPrevious("before-remove");
  save({ ...state, profiles: state.profiles.filter((p) => p.id !== id) });
}
export function resetProgress() { keepPrevious("before-reset"); updateActive((p) => ({ ...p, results: [], dailyClaimed: [] })); }

// ---------- friend challenges (shareable codes; scores are self-reported) ----------
export type ChallengePayload = { g: string; n: string; p: number; m: number; t: number; d: string };
export function encodeChallenge(c: ChallengePayload) { return btoa(unescape(encodeURIComponent(JSON.stringify(c)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
export function decodeChallenge(code: string): ChallengePayload | null {
  try { const s = code.replace(/-/g, "+").replace(/_/g, "/"); const c = JSON.parse(decodeURIComponent(escape(atob(s + "===".slice((s.length + 3) % 4))))) as ChallengePayload;
    const valid = GAME_BY_ID.has(c.g) && typeof c.n === "string" && Number.isFinite(c.p) && Number.isFinite(c.m) && c.m > 0 && c.p >= 0 && c.p <= c.m && Number.isFinite(c.t) && c.t >= 0;
    return valid ? { ...c, n: c.n.trim().slice(0, 24) || "A friend", d: String(c.d ?? "").slice(0, 10) } : null; } catch { return null; }
}
/** Records your answer to a friend's challenge. Only your first attempt counts; replays don't overwrite it. */
export function saveFriendResult(code: string, c: ChallengePayload, mine: FriendResult["mine"]) {
  const existing = state.friends.find((f) => f.code === code);
  if (existing?.mine) return existing;
  const fr: FriendResult = { code, gameId: c.g, name: c.n.slice(0, 24), points: c.p, max: c.m, ms: c.t, date: c.d, mine };
  save({ ...state, friends: [fr, ...state.friends.filter((f) => f.code !== code)].slice(0, 50) });
  return fr;
}
