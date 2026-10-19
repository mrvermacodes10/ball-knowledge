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

const KEY = "ballknowledge:v1";
const listeners = new Set<() => void>();
const newProfile = (name = "Player 1", avatar = "⚽"): Profile => ({ id: Math.random().toString(36).slice(2, 10), name, avatar, results: [], dailyClaimed: [], created: new Date().toISOString() });

/** Reads saved progress, repairing missing fields so an old or hand-edited save can't crash the app. */
function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<State>;
      const profiles = (Array.isArray(s.profiles) ? s.profiles : []).filter((p) => p && typeof p.id === "string")
        .map((p) => ({ ...newProfile(p.name, p.avatar), ...p, results: Array.isArray(p.results) ? p.results.filter((r) => GAME_BY_ID.has(r?.gameId) && r.max > 0) : [], dailyClaimed: Array.isArray(p.dailyClaimed) ? p.dailyClaimed : [] }));
      if (profiles.length) return { profiles, activeId: profiles.some((p) => p.id === s.activeId) ? s.activeId! : profiles[0].id, friends: Array.isArray(s.friends) ? s.friends : [] };
    }
  } catch { /* storage unavailable or corrupt: start fresh in memory */ }
  const p = newProfile();
  return { profiles: [p], activeId: p.id, friends: [] };
}
let state: State = load();
function save(next: State) {
  state = next;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}
const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
export function useStore() { return useSyncExternalStore(subscribe, () => state); }
// Keep several open tabs in step: progress saved in one tab appears in the others.
if (typeof window !== "undefined") window.addEventListener("storage", (e) => { if (e.key === KEY) { state = load(); listeners.forEach((l) => l()); } });
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
  save({ ...state, profiles: state.profiles.filter((p) => p.id !== id) });
}
export function resetProgress() { updateActive((p) => ({ ...p, results: [], dailyClaimed: [] })); }

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
