// Builds every Ball Knowledge game from the central fact tables.
// Games share engines but each one has its own question set (checked by scripts/validate.ts).
import * as F from "./facts";
import type { Lvl } from "./facts";

export type Difficulty = "Beginner" | "Intermediate" | "Advanced" | "Expert";
export const DIFFICULTIES: Difficulty[] = ["Beginner", "Intermediate", "Advanced", "Expert"];
export type Engine = "mc" | "type" | "timed" | "image" | "match" | "order" | "career" | "clues" | "survival" | "elimination" | "tf";
export const ENGINES: Record<Engine, string> = {
  mc: "Multiple choice", type: "Type the answer", timed: "60-second sprint", image: "Image identification", match: "Matching pairs",
  order: "Chronological order", career: "Career path", clues: "Progressive clues", survival: "Survival (3 lives)", elimination: "Sudden death", tf: "True or false",
};
export type CategoryId = "players" | "clubs" | "international" | "leagues" | "transfers" | "matches" | "images" | "ultimate";
export const CATEGORIES: { id: CategoryId; name: string; blurb: string }[] = [
  { id: "players", name: "Player Knowledge", blurb: "Careers, nicknames, honours and legends." },
  { id: "clubs", name: "Clubs & Stadiums", blurb: "Grounds, nicknames, derbies and club history." },
  { id: "international", name: "International & World Cups", blurb: "World Cups, Euros, Copa América, AFCON and more." },
  { id: "leagues", name: "Leagues & Competitions", blurb: "Champions, cups and European finals." },
  { id: "transfers", name: "Transfers & Careers", blurb: "Big moves, free transfers, loans and managers." },
  { id: "matches", name: "Matches & Moments", blurb: "Finals, comebacks, upsets and famous goals." },
  { id: "images", name: "Kits, Flags & Visuals", blurb: "Identify clubs and nations from drawn kits and flags." },
  { id: "ultimate", name: "Ultimate Trivia", blurb: "Mixed modes: survival, sudden death, sprints and ladders." },
];

export type Visual = { kind: "kit"; pattern: string; a: string; b: string } | { kind: "flag"; dir: "v" | "h"; colours: string[] };
export type Question = {
  id: string; gameId: string; category: CategoryId; prompt: string; answer: string; accept: string[];
  options?: string[]; difficulty: Difficulty; season: string; source: string; explanation: string;
  visual?: Visual; clues?: string[]; items?: string[]; pairs?: [string, string][];
};
export type Game = {
  id: string; title: string; category: CategoryId; difficulty: Difficulty; engine: Engine; description: string;
  instructions: string; questions: Question[]; perfectRequired?: boolean;
};

type RawQ = Omit<Question, "id" | "gameId" | "category" | "difficulty"> & { lvl?: Lvl };

// ---------- deterministic randomness ----------
function hash(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
export function rng(seed: string) { let a = hash(seed); return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function shuffle<T>(arr: T[], seed: string): T[] { const r = rng(seed); const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const uniq = <T,>(a: T[]) => [...new Set(a)];

const LVL: Record<Difficulty, Lvl> = { Beginner: 1, Intermediate: 2, Advanced: 3, Expert: 4 };
/** Rows for a difficulty: exact level first, then the nearest levels, so harder games really use harder facts. */
function pick<T extends { lvl: Lvl }>(rows: T[], d: Difficulty | Lvl[], n = 10, seed = ""): T[] {
  if (Array.isArray(d)) return shuffle(rows.filter((r) => d.includes(r.lvl)), seed).slice(0, n);
  const t = LVL[d];
  const order = [t, t - 1, t + 1, t - 2, t + 2].filter((x) => x >= 1 && x <= 4) as Lvl[];
  const out: T[] = [];
  for (const l of order) for (const r of shuffle(rows.filter((x) => x.lvl === l), seed + l)) if (out.length < n) out.push(r);
  return out;
}

// ---------- option safety ----------
// Two option labels that a fair player could treat as the same answer must never appear together.
const SAME_NATION = [["Germany", "West Germany"], ["Soviet Union", "Russia", "Ukraine"], ["Czechoslovakia", "Czech Republic", "Slovakia"], ["Yugoslavia", "Serbia"]];
const core = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\(.*?\)/g, " ").replace(/\b(all|and|with|a|the)\b/g, " ").replace(/[^a-z0-9–-]+/g, " ").trim().split(/\s+/).sort().join(" ");
const parts = (s: string) => s.split(/\s*(?:&|,)\s*/).map((x) => x.trim()).filter(Boolean);
export function clash(a: string, b: string) {
  if (a === b) return true;
  if (core(a) === core(b)) return true; // "red" vs "all red", "London" vs "London (Wembley)", "1–0" vs "1–0 (a.e.t.)"
  if (SAME_NATION.some((g) => g.includes(a) && g.includes(b))) return true;
  const pa = parts(a), pb = parts(b); // "South Korea & Japan" vs "Japan"
  return (pa.length > 1 || pb.length > 1) && pa.some((x) => pb.includes(x));
}

function mc(prompt: string, answer: string, pool: string[], seed: string, extra: Partial<RawQ> = {}): RawQ {
  const distractors: string[] = [];
  for (const p of shuffle(uniq(pool), seed)) {
    if (distractors.length === 3) break;
    if (!clash(p, answer) && !distractors.some((d) => clash(d, p))) distractors.push(p);
  }
  return { prompt, answer, accept: [], options: shuffle([answer, ...distractors], seed + "o"), season: "", source: "", explanation: "", ...extra };
}

// ---------- shared pools ----------
const NATIONS = uniq([...F.WORLD_CUPS.flatMap((w) => [w.winner, w.runnerUp]), ...F.EUROS.flatMap((e) => [e.winner, e.runnerUp]), ...F.COPA.flatMap((e) => [e.winner, e.runnerUp]),
  ...F.AFCON.flatMap((e) => [e.winner, e.runnerUp]), ...F.ASIAN_CUP.flatMap((e) => [e.winner, e.runnerUp]), ...F.WOMENS_WC.flatMap((e) => [e.winner, e.runnerUp]), ...F.PLAYERS.map((p) => p.nation)]);
const CLUB_NAMES = uniq([...F.CLUBS.map((c) => c.club), ...F.UCL.flatMap((u) => [u.winner, u.runnerUp]), ...F.UEL.flatMap((u) => [u.winner, u.runnerUp])]);
const HOSTS = uniq([...F.WORLD_CUPS.map((w) => w.host), ...F.EUROS.map((e) => e.host!), ...F.WOMENS_WC.map((e) => e.host!)]);
const PLAYER_NAMES = uniq([...F.PLAYERS.map((p) => p.name), ...F.NICKNAMES.map((n) => n.player), ...F.BALLON.map((b) => b.player)]);
const MANAGER_NAMES = F.MANAGERS.map((m) => m.name);
/** Plausible wrong years: never in the future (facts stop at the 2024–25 season) and never before organised football. */
const LAST_YEAR = 2025;
const yearPool = (y: number) => [y - 4, y + 4, y - 8, y + 8, y - 12, y + 12, y - 2, y + 2, y - 6].filter((x) => x <= LAST_YEAR && x >= 1872 && x !== y).map(String);

// Regional pools keep distractors plausible (an African cup gets African nations as wrong options).
const continentNations = (rows: F.Final[]) => uniq(rows.flatMap((r) => [r.winner, r.runnerUp]));

// ---------- question builders ----------
type B = (d: Difficulty | Lvl[], seed: string, n?: number) => RawQ[];
const yr = (y: number | string) => String(y);
/** "the North London derby" but "El Clásico" / "O Clássico" / "Der Klassiker" (already have an article). */
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const theDerby = (n: string) => (/^(El|O|De|Der|Le|La|Il|Los)\s/.test(n) ? n : `the ${n}`);
/** English possessive: "Rangers'" but "Arsenal's". */
const poss = (name: string) => (name.endsWith("s") ? `${name}'` : `${name}'s`);

const finalsWinner = (rows: F.Final[], comp: string, ref: string, pool?: string[]): B => (d, seed, n = 8) =>
  pick(rows, d, n, seed).map((r) => mc(`Who won the ${yr(r.year)} ${comp}?`, r.winner, pool ?? continentNations(rows).concat(NATIONS), seed + r.year,
    { season: yr(r.year), source: ref, explanation: `${r.winner} beat ${r.runnerUp} in the ${yr(r.year)} final${r.host ? `, hosted by ${r.host}` : ""}.`, lvl: r.lvl }));
const finalsRunner = (rows: F.Final[], comp: string, ref: string, pool?: string[]): B => (d, seed, n = 8) =>
  pick(rows, d, n, seed).map((r) => mc(`${r.winner} won the ${yr(r.year)} ${comp}. Who did they beat in the final?`, r.runnerUp, pool ?? continentNations(rows).concat(NATIONS), seed + r.year,
    { season: yr(r.year), source: ref, explanation: `${r.winner} beat ${r.runnerUp} in the ${yr(r.year)} final.`, lvl: r.lvl }));
const finalsHost = (rows: F.Final[], comp: string, ref: string): B => (d, seed, n = 8) =>
  pick(rows.filter((r) => r.host), d, n, seed).map((r) => mc(`Which country hosted the ${yr(r.year)} ${comp}?`, r.host!, rows.map((x) => x.host!).concat(HOSTS), seed + r.year,
    { season: yr(r.year), source: ref, explanation: `The ${yr(r.year)} ${comp} was held in ${r.host}; ${r.winner} won it.`, lvl: r.lvl }));

const wcWinner: B = (d, seed, n = 8) => pick(F.WORLD_CUPS, d, n, seed).map((w) => mc(`Who won the ${w.year} World Cup?`, w.winner, NATIONS, seed + w.year,
  { season: yr(w.year), source: F.REF.wc, explanation: `${w.winner} beat ${w.runnerUp} ${w.score} in the final.`, lvl: w.lvl }));
const wcHost: B = (d, seed, n = 8) => pick(F.WORLD_CUPS, d, n, seed).map((w) => mc(`Which country hosted the ${w.year} World Cup?`, w.host, HOSTS, seed + w.year,
  { season: yr(w.year), source: F.REF.wc, explanation: `${w.host} hosted ${w.year}; ${w.winner} won it.`, lvl: w.lvl }));
const wcRunner: B = (d, seed, n = 8) => pick(F.WORLD_CUPS, d, n, seed).map((w) => mc(`${w.winner} won the ${w.year} World Cup. Who did they beat in the final?`, w.runnerUp, NATIONS, seed + w.year,
  { season: yr(w.year), source: F.REF.wc, explanation: `${w.winner} ${w.score} ${w.runnerUp}.`, lvl: w.lvl }));
const wcScore: B = (d, seed, n = 8) => pick(F.WORLD_CUPS, d, n, seed).map((w) => mc(`What was the score in the ${w.year} World Cup final, ${w.winner} v ${w.runnerUp}?`, w.score,
  F.WORLD_CUPS.map((x) => x.score), seed + w.year, { season: yr(w.year), source: F.REF.wc, explanation: `${w.winner} won ${w.score}.`, lvl: w.lvl }));
const wcBoot: B = (d, seed, n = 8) => pick(F.WORLD_CUPS.filter((w) => w.boot), d, n, seed).map((w) => mc(`Who was the top scorer (Golden Boot) at the ${w.year} World Cup?`, w.boot!,
  F.WORLD_CUPS.filter((x) => x.boot).map((x) => x.boot!), seed + w.year, { season: yr(w.year), source: F.REF.wcBoot, explanation: `${w.boot} finished as top scorer in ${w.year}.`, lvl: w.lvl }));
const wcBall: B = (d, seed, n = 8) => pick(F.WORLD_CUPS.filter((w) => w.ball), d, n, seed).map((w) => mc(`Who won the Golden Ball (best player) at the ${w.year} World Cup?`, w.ball!,
  F.WORLD_CUPS.filter((x) => x.ball).map((x) => x.ball!).concat(PLAYER_NAMES), seed + w.year, { season: yr(w.year), source: F.REF.wcBoot, explanation: `${w.ball} won the Golden Ball in ${w.year}.`, lvl: w.lvl }));

const clubFinalWinner = (rows: F.ClubFinal[], comp: string, ref: string): B => (d, seed, n = 8) => pick(rows, d, n, seed).map((r) => mc(`Who won the ${r.year} ${comp} final?`, r.winner,
  rows.flatMap((x) => [x.winner, x.runnerUp]).concat(CLUB_NAMES), seed + r.year, { season: yr(r.year), source: ref, explanation: `${r.winner} beat ${r.runnerUp} ${r.score}${r.venue ? ` in ${r.venue}` : ""}.`, lvl: r.lvl }));
const clubFinalRunner = (rows: F.ClubFinal[], comp: string, ref: string): B => (d, seed, n = 8) => pick(rows, d, n, seed).map((r) => mc(`${r.winner} won the ${r.year} ${comp} final. Who did they beat?`, r.runnerUp,
  rows.flatMap((x) => [x.winner, x.runnerUp]).concat(CLUB_NAMES), seed + r.year, { season: yr(r.year), source: ref, explanation: `${r.winner} ${r.score} ${r.runnerUp}.`, lvl: r.lvl }));
const clubFinalScore = (rows: F.ClubFinal[], comp: string, ref: string): B => (d, seed, n = 8) => pick(rows, d, n, seed).map((r) => mc(`What was the score in the ${r.year} ${comp} final, ${r.winner} v ${r.runnerUp}?`, r.score,
  rows.map((x) => x.score), seed + r.year, { season: yr(r.year), source: ref, explanation: `${r.winner} won ${r.score}.`, lvl: r.lvl }));
const uclVenue: B = (d, seed, n = 8) => pick(F.UCL.filter((u) => u.venue), d, n, seed).map((u) => mc(`In which city was the ${u.year} European Cup / Champions League final played?`, u.venue!,
  F.UCL.map((x) => x.venue!), seed + u.year, { season: yr(u.year), source: F.REF.ucl, explanation: `${u.winner} beat ${u.runnerUp} in ${u.venue}.`, lvl: u.lvl }));

const champs = (rows: F.Champ[], league: string, ref: string): B => (d, seed, n = 8) => pick(rows, d, n, seed).map((c) => mc(`Who won the ${league} in ${c.season}?`, c.champion,
  rows.map((x) => x.champion).concat(CLUB_NAMES.filter((x) => F.CLUBS.find((y) => y.club === x)?.country === F.CLUBS.find((y) => y.club === c.champion)?.country)), seed + c.end,
  { season: c.season, source: ref, explanation: `${c.champion} were ${league} champions in ${c.season}${c.note ? ` (${c.note})` : ""}.`, lvl: c.lvl }));

/** True when any significant word of `answer` (city, club…) already appears in `text`. */
const giveaway = (text: string, answer: string) => {
  const t = text.toLowerCase();
  return answer.toLowerCase().split(/[^\p{L}]+/u).filter((w) => w.length > 3 && !["city", "united", "stadium", "park"].includes(w)).some((w) => t.includes(w));
};
/** Nicknames "The Reds" / "Reds" or "As Águias (The Eagles)" / "Las Águias (The Eagles)" would make a question ambiguous. */
const nickParts = (n = "") => n.toLowerCase().split(/[()]/).map((x) => x.replace(/^\s*(the|los|las|les|os|as|la|il|i|die|de)\s+/, "").trim()).filter(Boolean);
const nickClash = (x: F.Club, y: F.Club) => x !== y && nickParts(x.nickname).some((a) => nickParts(y.nickname).includes(a));

const clubAttr = (attr: "stadium" | "nickname" | "city" | "country" | "colours", rows = F.CLUBS): B => (d, seed, n = 8) => {
  const has = rows.filter((c) => c[attr]);
  const ask: Record<string, (c: F.Club) => string> = {
    stadium: (c) => `What is the home stadium of ${c.club}?`, nickname: (c) => `Which club is nicknamed "${c.nickname}"?`, city: (c) => `In which city are ${c.club} based?`,
    country: (c) => `In which country do ${c.club} play their league football?`, colours: (c) => `What are ${poss(c.club)} traditional colours?`,
  };
  // "In which city are Real Madrid based?" or "Tottenham Hotspur's stadium?" give themselves away, so skip those clubs.
  const usable = attr === "city" ? has.filter((c) => !giveaway(c.club, c.city)) : attr === "stadium" ? has.filter((c) => !giveaway(c.stadium, c.club)) : has;
  return pick(usable, d, n, seed).map((c) => {
    const answer = attr === "nickname" ? c.club : (c[attr] as string);
    const pool = attr === "nickname" ? has.filter((x) => !nickClash(x, c)).map((x) => x.club) : has.filter((x) => x[attr] !== c[attr]).map((x) => x[attr] as string);
    if (attr === "nickname" && has.some((x) => x !== c && nickClash(x, c))) return null;
    return mc(ask[attr](c), answer, pool, seed + c.club, { source: attr === "nickname" ? F.REF.nick : F.REF.stadium, season: "As of autumn 2025",
      explanation: attr === "nickname" ? `${c.club} are known as ${c.nickname}.` : `${c.club}: ${attr} — ${c[attr]}.`, lvl: c.lvl });
  }).filter(Boolean) as RawQ[];
};
const stadiumToClub: B = (d, seed, n = 8) => {
  const unique = F.CLUBS.filter((c) => F.CLUBS.filter((x) => x.stadium === c.stadium).length === 1 && !giveaway(c.stadium, c.club));
  return pick(unique, d, n, seed).map((c) => mc(`Which club plays its home games at ${c.stadium}?`, c.club, F.CLUBS.filter((x) => x.continent === c.continent).map((x) => x.club), seed + c.club,
    { source: F.REF.stadium, season: "As of autumn 2025", explanation: `${c.stadium} is home to ${c.club} (${c.city}).`, lvl: c.lvl }));
};
const sharedStadium: B = (_d, seed) => {
  const pairs = F.CLUBS.filter((c) => F.CLUBS.some((x) => x !== c && x.stadium === c.stadium));
  return pairs.map((c) => { const other = F.CLUBS.find((x) => x !== c && x.stadium === c.stadium)!;
    return mc(`${c.club} share their stadium, ${c.stadium}, with which club?`, other.club, F.CLUBS.filter((x) => x.country === c.country && x !== c).map((x) => x.club).concat(CLUB_NAMES), seed + c.club,
      { source: F.REF.stadium, season: "As of autumn 2025", explanation: `${c.club} and ${other.club} both play at ${c.stadium}.`, lvl: c.lvl }); });
};

const derbyOpponent: B = (d, seed, n = 8) => pick(F.DERBIES, d, n, seed).map((r) => mc(`In ${theDerby(r.name)}, ${r.a} face which club?`, r.b, F.DERBIES.flatMap((x) => [x.a, x.b]).filter((x) => x !== r.a), seed + r.name,
  { source: F.REF.derby, season: "Historic", explanation: `${cap(theDerby(r.name))} is ${r.a} v ${r.b}.`, lvl: r.lvl }));
const derbyName: B = (d, seed, n = 8) => pick(F.DERBIES, d, n, seed).map((r) => mc(`What is the name of the rivalry between ${r.a} and ${r.b}?`, r.name, F.DERBIES.map((x) => x.name), seed + r.name,
  { source: F.REF.derby, season: "Historic", explanation: `${r.a} v ${r.b} is known as ${theDerby(r.name)}.`, lvl: r.lvl }));

const careerPlayers = F.PLAYERS.filter((p) => !p.women && p.name !== "Sunil Chhetri");
/** Every club a player has appeared for, including loans — used whenever a question claims someone did NOT play somewhere. */
const everPlayed = (p: F.Player) => uniq([...p.clubs, ...(p.loans ?? [])]);
const playedFor = (p: F.Player, club: string) => everPlayed(p).includes(club);
const ALL_CAREER_CLUBS = uniq(careerPlayers.flatMap(everPlayed));
const playerNation: B = (d, seed, n = 8) => pick(F.PLAYERS, d, n, seed).map((p) => mc(`Which country does ${p.name} represent internationally?`, p.nation, NATIONS, seed + p.name,
  { source: F.REF.careers, season: "As of autumn 2025", explanation: `${p.name} plays/played for ${p.nation}.`, lvl: p.lvl }));
const playerClueMc = (filter: (p: F.Player) => boolean, clueIdx = 0): B => (d, seed, n = 8) => pick(F.PLAYERS.filter(filter), d, n, seed).map((p) => mc(`Which player: ${p.clue[clueIdx]}?`, p.name,
  F.PLAYERS.filter((x) => x.women === p.women).map((x) => x.name), seed + p.name, { source: F.REF.careers, season: "As of autumn 2025", explanation: `${p.name} — ${p.clue.join("; ")}.`, lvl: p.lvl }));
const playerClues = (filter: (p: F.Player) => boolean, reverse = false): B => (d, seed, n = 6) => pick(F.PLAYERS.filter(filter), d, n, seed).map((p) => {
  const clues = [...(reverse ? [...p.clue].reverse() : p.clue), `Nationality: ${p.nation}`];
  return { prompt: "Who is this player?", answer: p.name, accept: personAccept(p.name), clues, season: "As of autumn 2025", source: F.REF.careers, explanation: `${p.name} — ${p.clue.join("; ")}.`, lvl: p.lvl };
});
const careerPath = (filter: (p: F.Player) => boolean, typed = true): B => (d, seed, n = 6) => pick(careerPlayers.filter(filter), d, n, seed).map((p) => {
  const base = { prompt: `Whose career path is this? ${p.clubs.join(" → ")}`, answer: p.name, accept: personAccept(p.name), items: p.clubs, season: "As of autumn 2025", source: F.REF.careers, explanation: `${p.name}: ${p.clubs.join(" → ")}.`, lvl: p.lvl };
  return typed ? base : { ...base, accept: [], options: mc("", p.name, careerPlayers.map((x) => x.name), seed + p.name).options };
});
const careerOrder = (filter: (p: F.Player) => boolean): B => (d, seed, n = 4) => pick(careerPlayers.filter((p) => filter(p) && new Set(p.clubs).size === p.clubs.length && p.clubs.length >= 3), d, n, seed).map((p) => ({
  prompt: `Put ${p.name}'s clubs in the order he joined them.`, answer: p.clubs.join(" → "), accept: [], items: p.clubs.slice(0, 6), season: "As of autumn 2025", source: F.REF.careers,
  explanation: `${p.name}: ${p.clubs.join(" → ")}.`, lvl: p.lvl }));
const bothClubs: B = (d, seed, n = 8) => {
  const out: RawQ[] = [];
  for (const p of pick(careerPlayers, d, 30, seed)) {
    const cl = uniq(p.clubs); if (cl.length < 2) continue;
    const r = rng(seed + p.name); const a = cl[Math.floor(r() * cl.length)]; let b = cl[Math.floor(r() * cl.length)]; if (a === b) b = cl[(cl.indexOf(a) + 1) % cl.length];
    if (careerPlayers.some((x) => x !== p && playedFor(x, a) && playedFor(x, b))) continue;
    const others = careerPlayers.filter((x) => x !== p && !(playedFor(x, a) && playedFor(x, b)));
    out.push(mc(`Which player has played for both ${a} and ${b}?`, p.name, others.map((x) => x.name), seed + p.name + a, { source: F.REF.careers, season: "As of autumn 2025", explanation: `${p.name}: ${p.clubs.join(" → ")}.`, lvl: p.lvl }));
    if (out.length >= n) break;
  }
  return out;
};
const sharedClub: B = (d, seed, n = 8) => {
  const out: RawQ[] = []; const ps = pick(careerPlayers, d, 40, seed);
  for (let i = 0; i < ps.length && out.length < n; i++) for (let j = i + 1; j < ps.length && out.length < n; j++) {
    const common = everPlayed(ps[i]).filter((c) => playedFor(ps[j], c)); if (common.length !== 1 || !ps[i].clubs.includes(common[0])) continue;
    if (out.some((q) => q.answer === common[0])) continue;
    const pool = uniq([...everPlayed(ps[i]), ...everPlayed(ps[j]), ...CLUB_NAMES]).filter((c) => !(playedFor(ps[i], c) && playedFor(ps[j], c)));
    out.push(mc(`Which club have both ${ps[i].name} and ${ps[j].name} played for?`, common[0], pool, seed + i + j, { source: F.REF.careers, season: "As of autumn 2025", explanation: `Both played for ${common[0]}.`, lvl: Math.max(ps[i].lvl, ps[j].lvl) as Lvl }));
  }
  return out;
};
// False statements only use European clubs the player never appeared for (loans included). Active players' future moves
// are most likely to Saudi Arabia or MLS, so clubs there are never used to make a "false" claim about a current player.
const playerTF: B = (d, seed, n = 10) => pick(careerPlayers, d, n, seed).map((p, i) => {
  const r = rng(seed + p.name); const truth = r() < 0.5;
  const falsePool = F.CLUBS.filter((c) => c.continent === "Europe" && !playedFor(p, c.club)).map((c) => c.club);
  const club = truth ? p.clubs[Math.floor(r() * p.clubs.length)] : shuffle(falsePool, seed + i)[0];
  return { prompt: `True or false: ${p.name} has played for ${club}.`, answer: truth ? "True" : "False", accept: [], options: ["True", "False"], season: "As of autumn 2025", source: F.REF.careers,
    explanation: `${p.name}'s clubs: ${p.clubs.join(", ")}${p.loans?.length ? ` (plus loans/short spells at ${p.loans.join(", ")})` : ""}.`, lvl: p.lvl };
});
const notTheirs = (p: F.Player) => ALL_CAREER_CLUBS.filter((c) => !playedFor(p, c));
const firstClub: B = (d, seed, n = 8) => pick(careerPlayers, d, n, seed).map((p) => mc(`At which club did ${p.name} begin his senior career?`, p.clubs[0], notTheirs(p), seed + p.name,
  { source: F.REF.careers, season: "Historic", explanation: `${p.name} started at ${p.clubs[0]}.`, lvl: p.lvl }));
const lastClub: B = (d, seed, n = 8) => pick(careerPlayers.filter((p) => p.retired), d, n, seed).map((p) => mc(`What was ${p.name}'s final club before retiring?`, p.clubs[p.clubs.length - 1], notTheirs(p), seed + p.name,
  { source: F.REF.careers, season: "Historic", explanation: `${p.name} finished at ${p.clubs[p.clubs.length - 1]}.`, lvl: p.lvl }));
const nextClub: B = (d, seed, n = 8) => pick(careerPlayers.filter((p) => p.clubs.length >= 3), d, n, seed).map((p) => {
  const i = 1 + Math.floor(rng(seed + p.name)() * (p.clubs.length - 2)); const from = p.clubs[i]; const to = p.clubs[i + 1];
  if (p.clubs.indexOf(from) !== i) return null;
  return mc(`After ${from}, which club did ${p.name} join next?`, to, notTheirs(p), seed + p.name,
    { source: F.REF.careers, season: "Historic", explanation: `${p.name}: ${p.clubs.join(" → ")}.`, lvl: p.lvl });
}).filter(Boolean) as RawQ[];
const returnedTo: B = (d, seed, n = 8) => pick(careerPlayers.filter((p) => new Set(p.clubs).size < p.clubs.length), d, n, seed).map((p) => {
  const repeats = uniq(p.clubs.filter((c, i) => p.clubs.indexOf(c) !== i));
  const back = repeats[0];
  // Distractors: his single-spell clubs, then other clubs — never a second club he also returned to (Buffon: Juventus AND Parma).
  const single = uniq(p.clubs).filter((c) => !repeats.includes(c));
  return mc(`${p.name} had two separate spells at which club?`, back, single.concat(shuffle(CLUB_NAMES.filter((c) => !playedFor(p, c)), seed + p.name)), seed + p.name,
    { source: F.REF.careers, season: "Historic", explanation: `${p.name}: ${p.clubs.join(" → ")}.`, lvl: p.lvl });
});
// Typed answer: three clubs plus nationality, so the answer is unique in real life too (Eto'o and Lukaku both played for Chelsea, Everton and Inter).
const threeClubs: B = (d, seed, n = 8) => pick(careerPlayers.filter((p) => uniq(p.clubs).length >= 3), d, n, seed).map((p) => {
  const three = shuffle(uniq(p.clubs), seed + p.name).slice(0, 3);
  return { prompt: `Name the ${p.nation} international who played for all of: ${three.join(", ")}.`, answer: p.name, accept: personAccept(p.name), season: "Historic", source: F.REF.careers, explanation: `${p.name}: ${p.clubs.join(" → ")}.`, lvl: p.lvl };
});
const rivalCrossers: B = (_d, seed, n = 8) => {
  const out: RawQ[] = [];
  for (const dby of F.DERBIES) for (const p of careerPlayers) if (p.clubs.includes(dby.a) && p.clubs.includes(dby.b)) {
    if (out.some((q) => q.answer === p.name)) continue;
    const pool = careerPlayers.filter((x) => !(playedFor(x, dby.a) && playedFor(x, dby.b))).map((x) => x.name);
    out.push(mc(`Which player has played for both sides of ${theDerby(dby.name)} (${dby.a} and ${dby.b})?`, p.name, pool, seed + p.name, { source: F.REF.derby, season: "Historic", explanation: `${p.name} played for ${dby.a} and ${dby.b}.`, lvl: 3 }));
  }
  return out.slice(0, n);
};

const nicknameMc: B = (d, seed, n = 8) => pick(F.NICKNAMES, d, n, seed).map((r) => mc(`Which player was nicknamed "${r.nick}"?`, r.player, F.NICKNAMES.map((x) => x.player), seed + r.nick, { source: F.REF.careers, season: "Historic", explanation: `${r.player} — "${r.nick}".`, lvl: r.lvl }));
const nicknameType: B = (d, seed, n = 8) => pick(F.NICKNAMES, d, n, seed).map((r) => ({ prompt: `Name the player nicknamed "${r.nick}".`, answer: r.player, accept: personAccept(r.player), season: "Historic", source: F.REF.careers, explanation: `${r.player} — "${r.nick}".`, lvl: r.lvl }));

const BALLON_NATION: Record<string, string> = { "Stanley Matthews": "England", "Lev Yashin": "Soviet Union", Eusébio: "Portugal", "Bobby Charlton": "England", "George Best": "Northern Ireland", "Igor Belanov": "Soviet Union",
  "George Weah": "Liberia", "Matthias Sammer": "Germany", "Zinedine Zidane": "France", Rivaldo: "Brazil", "Luís Figo": "Portugal", "Michael Owen": "England", "Pavel Nedvěd": "Czech Republic", "Andriy Shevchenko": "Ukraine",
  Ronaldinho: "Brazil", "Fabio Cannavaro": "Italy", Kaká: "Brazil", "Luka Modrić": "Croatia", "Lionel Messi": "Argentina", "Karim Benzema": "France", Rodri: "Spain", "Ousmane Dembélé": "France" };
const ballonMc: B = (d, seed, n = 8) => pick(F.BALLON, d, n, seed).map((b) => mc(`Who won the men's Ballon d'Or in ${b.year}?`, b.player, F.BALLON.map((x) => x.player).concat(PLAYER_NAMES), seed + b.year, { source: F.REF.ballon, season: yr(b.year), explanation: `${b.player} won the ${b.year} Ballon d'Or.`, lvl: b.lvl }));
const ballonNation: B = (d, seed, n = 8) => pick(F.BALLON, d, n, seed).map((b) => mc(`Which country did ${b.year} Ballon d'Or winner ${b.player} represent?`, BALLON_NATION[b.player], Object.values(BALLON_NATION).concat(NATIONS), seed + b.year, { source: F.REF.ballon, season: yr(b.year), explanation: `${b.player} played for ${BALLON_NATION[b.player]}.`, lvl: b.lvl }));
const ballonWomen: B = (_d, seed) => F.BALLON.filter((b) => b.women).map((b) => mc(`Who won the Ballon d'Or Féminin in ${b.year}?`, b.women!, ["Ada Hegerberg", "Megan Rapinoe", "Alexia Putellas", "Aitana Bonmatí", "Sam Kerr", "Marta", "Lucy Bronze", "Pernille Harder"], seed + b.year, { source: F.REF.ballon, season: yr(b.year), explanation: `${b.women} won in ${b.year}.`, lvl: b.lvl }));
const puskasMc: B = (d, seed, n = 8) => pick(F.PUSKAS, d, n, seed).map((p) => mc(`Who won the ${p.year} FIFA Puskás Award${p.detail ? ` for a ${p.detail}` : ""}?`, p.player, F.PUSKAS.map((x) => x.player).concat(PLAYER_NAMES), seed + p.year, { source: F.REF.puskas, season: yr(p.year), explanation: `${p.player} won the ${p.year} Puskás Award.`, lvl: p.lvl }));

// Former players who became managers. `clubs` = every senior club they have managed (checked so a wrong option never managed the club asked about).
const PLAYER_MANAGERS = [
  { p: "Zinedine Zidane", ask: "Real Madrid", clubs: ["Real Madrid"], lvl: 1 as Lvl }, { p: "Xabi Alonso", ask: "Bayer Leverkusen", clubs: ["Bayer Leverkusen", "Real Madrid"], lvl: 2 as Lvl },
  { p: "Steven Gerrard", ask: "Rangers", clubs: ["Rangers", "Aston Villa", "Al-Ettifaq"], lvl: 2 as Lvl }, { p: "Frank Lampard", ask: "Coventry City", clubs: ["Derby County", "Chelsea", "Coventry City"], lvl: 3 as Lvl },
  { p: "Patrick Vieira", ask: "Crystal Palace", clubs: ["New York City FC", "Nice", "Crystal Palace", "Strasbourg", "Genoa"], lvl: 3 as Lvl }, { p: "Wayne Rooney", ask: "DC United", clubs: ["Derby County", "DC United", "Birmingham City", "Plymouth Argyle"], lvl: 3 as Lvl },
  { p: "Andrea Pirlo", ask: "Juventus", clubs: ["Juventus", "Fatih Karagümrük", "Sampdoria"], lvl: 3 as Lvl }, { p: "Thierry Henry", ask: "Monaco", clubs: ["Monaco", "Montreal Impact"], lvl: 3 as Lvl },
  { p: "Cesc Fàbregas", ask: "Como", clubs: ["Como"], lvl: 2 as Lvl }, { p: "Mikel Arteta", ask: "Arsenal", clubs: ["Arsenal"], lvl: 1 as Lvl },
];
const playerManagers: B = (d, seed, n = 8) => pick(PLAYER_MANAGERS, d, n, seed).map((r) => mc(`Which former player went on to manage ${r.ask}?`, r.p,
  PLAYER_MANAGERS.filter((x) => !x.clubs.includes(r.ask)).map((x) => x.p), seed + r.p, { source: F.REF.managers, season: "Historic", explanation: `${r.p} has managed ${r.clubs.join(", ")}.`, lvl: r.lvl }));

const transferTo = (filter: (t: F.Transfer) => boolean, typed = false): B => (d, seed, n = 8) => pick(F.TRANSFERS.filter(filter), d, n, seed).map((t) => {
  const label = t.type === "loan" ? "on loan" : t.type === "free" ? "on a free transfer" : "in a permanent transfer";
  const prompt = `In ${t.year}, ${t.player} left ${t.from} ${label}. Which club did he join?`;
  const extra = { season: yr(t.year), source: F.REF.careers, explanation: `${t.player}: ${t.from} → ${t.to} (${t.year}, ${t.type}) — ${t.note}.`, lvl: t.lvl };
  return typed ? { prompt, answer: t.to, accept: clubAccept(t.to), ...extra } : mc(prompt, t.to, F.TRANSFERS.map((x) => x.to).concat(CLUB_NAMES).filter((c) => c !== t.from), seed + t.player + t.year, extra);
});
const transferFrom: B = (d, seed, n = 8) => pick(F.TRANSFERS, d, n, seed).map((t) => mc(`${t.player} joined ${t.to} in ${t.year}. Which club did he come from?`, t.from, F.TRANSFERS.map((x) => x.from).filter((c) => c !== t.to), seed + t.player,
  { season: yr(t.year), source: F.REF.careers, explanation: `${t.from} → ${t.to} (${t.type}).`, lvl: t.lvl }));
const transferType: B = (d, seed, n = 10) => pick(F.TRANSFERS, d, n, seed).map((t) => ({ prompt: `${t.player}: ${t.from} → ${t.to} (${t.year}). What kind of move was it?`, answer: { permanent: "Permanent transfer (fee paid)", free: "Free transfer", loan: "Loan" }[t.type],
  accept: [], options: ["Permanent transfer (fee paid)", "Free transfer", "Loan"], season: yr(t.year), source: F.REF.careers, explanation: `It was a ${t.type} move — ${t.note}.`, lvl: t.lvl }));
const transferYear: B = (d, seed, n = 8) => pick(F.TRANSFERS, d, n, seed).map((t) => mc(`In which year did ${t.player} move from ${t.from} to ${t.to}?`, yr(t.year), yearPool(t.year), seed + t.player, { season: yr(t.year), source: F.REF.careers, explanation: `${t.year} — ${t.note}.`, lvl: t.lvl }));
const transferStory: B = (d, seed, n = 8) => pick(F.TRANSFERS, d, n, seed).map((t) => mc(`Which player's ${t.year} move from ${t.from} to ${t.to} involved ${t.note}?`, t.player, F.TRANSFERS.map((x) => x.player), seed + t.year + t.player,
  { season: yr(t.year), source: F.REF.careers, explanation: `${t.player} (${t.type}).`, lvl: t.lvl }));
const transferClues: B = (d, seed, n = 6) => pick(F.TRANSFERS, d, n, seed).map((t) => ({ prompt: "Who made this move?", answer: t.player, accept: personAccept(t.player),
  clues: [`Year: ${t.year}`, `Type: ${t.type === "permanent" ? "permanent transfer" : t.type === "free" ? "free transfer" : "loan"} — ${t.note}`, `Selling/parent club: ${t.from}`, `New club: ${t.to}`],
  season: yr(t.year), source: F.REF.careers, explanation: `${t.player}: ${t.from} → ${t.to}.`, lvl: t.lvl }));

const managerFamous: B = (d, seed, n = 8) => pick(F.MANAGERS, d, n, seed).map((m) => mc(`Which manager ${m.famous}?`, m.name, MANAGER_NAMES, seed + m.name, { source: F.REF.managers, season: "Historic", explanation: `${m.name} ${m.famous}.`, lvl: m.lvl }));
const managerFamousType: B = (d, seed, n = 8) => pick(F.MANAGERS, d, n, seed).map((m) => ({ prompt: `Name the manager who ${m.famous}.`, answer: m.name, accept: personAccept(m.name), season: "Historic", source: F.REF.managers, explanation: `${m.name} ${m.famous}.`, lvl: m.lvl }));
const managed = (m: F.Manager, club: string) => m.clubs.includes(club) || !!m.other?.includes(club);
const managerClub: B = (d, seed, n = 8) => pick(F.MANAGERS.filter((m) => m.clubs.length >= 2), d, n, seed).map((m) => {
  const c = m.clubs[Math.floor(rng(seed + m.name)() * m.clubs.length)];
  return mc(`Which of these clubs has ${m.name} managed?`, c, F.MANAGERS.flatMap((x) => x.clubs).filter((x) => !managed(m, x)), seed + m.name, { source: F.REF.managers, season: "As of autumn 2025", explanation: `${m.name}'s clubs include ${m.clubs.join(", ")}.`, lvl: m.lvl });
});
const managerTwoClubs: B = (d, seed, n = 8) => pick(F.MANAGERS.filter((m) => m.clubs.length >= 2), d, n, seed).map((m) => {
  const two = shuffle(m.clubs, seed + m.name).slice(0, 2);
  const pool = F.MANAGERS.filter((x) => !(managed(x, two[0]) && managed(x, two[1]))).map((x) => x.name);
  return mc(`Which manager has been in charge of both ${two[0]} and ${two[1]}?`, m.name, pool, seed + m.name + "2", { source: F.REF.managers, season: "As of autumn 2025", explanation: `${m.name}: ${m.clubs.join(", ")}.`, lvl: m.lvl });
});
const coachMc: B = (d, seed, n = 8) => pick(F.NATIONAL_COACHES, d, n, seed).map((c) => mc(`Who coached ${c.team} to the ${c.feat}?`, c.coach, F.NATIONAL_COACHES.map((x) => x.coach), seed + c.coach, { source: F.REF.managers, season: c.feat, explanation: `${c.coach} led ${c.team} to the ${c.feat}.`, lvl: c.lvl }));

const momentAnswer = (filter: (m: F.Moment) => boolean, typed = false): B => (d, seed, n = 8) => pick(F.MOMENTS.filter(filter), d, n, seed).map((m) => {
  const prompt = `${m.clue}. Who?`; const extra = { season: yr(m.year), source: F.REF.moments, explanation: `"${m.title}" — ${m.answer}, ${m.competition} ${m.year}.`, lvl: m.lvl };
  return typed ? { prompt, answer: m.answer, accept: [...(m.accept ?? []), ...(isPerson(m.answer) ? personAccept(m.answer) : clubAccept(m.answer))], ...extra } : mc(prompt, m.answer, F.MOMENTS.map((x) => x.answer).filter((a) => isPerson(a) === isPerson(m.answer)), seed + m.title, extra);
});
const isComeback = (m: F.Moment) => /came back|come from|Came from|after losing|stoppage time|3–0/.test(m.clue);
const momentTitle: B = (d, seed, n = 8) => pick(F.MOMENTS, d, n, seed).map((m) => mc(`Which famous moment is this? ${m.clue}.`, m.title, F.MOMENTS.map((x) => x.title), seed + m.title, { season: yr(m.year), source: F.REF.moments, explanation: `${m.title} (${m.competition}, ${m.year}).`, lvl: m.lvl }));
const compWords: Record<string, RegExp> = { "European Championship": /Euro\b|European Championship/i, "Women's Euro": /Euro\b/i };
const momentComp: B = (d, seed, n = 8) => pick(F.MOMENTS.filter((m) => !(compWords[m.competition] ?? new RegExp(m.competition, "i")).test(m.clue)), d, n, seed).map((m) => mc(`In which competition did this happen? ${m.answer}: ${m.clue}.`, m.competition, F.MOMENTS.map((x) => x.competition), seed + m.title,
  { season: yr(m.year), source: F.REF.moments, explanation: `${m.title} — ${m.competition}, ${m.year}.`, lvl: m.lvl }));
const finalsYear = (rows: { year: number | string; winner: string; runnerUp: string; lvl: Lvl }[], comp: string, ref: string): B => (d, seed, n = 8) =>
  pick(rows.filter((r) => rows.filter((x) => x.winner === r.winner && x.runnerUp === r.runnerUp).length === 1 && /^\d{4}$/.test(String(r.year))), d, n, seed).map((r) =>
    mc(`In which year did ${r.winner} beat ${r.runnerUp} in the ${comp} final?`, String(r.year), yearPool(Number(r.year)), seed + r.year, { season: String(r.year), source: ref, explanation: `${r.winner} beat ${r.runnerUp} in ${r.year}.`, lvl: r.lvl }));
const AWARD_NATION: Record<string, string> = { "Guillermo Stábile": "Argentina", "Oldřich Nejedlý": "Czechoslovakia", Leônidas: "Brazil", "Sándor Kocsis": "Hungary", "Just Fontaine": "France", Eusébio: "Portugal",
  "Gerd Müller": "West Germany", "Grzegorz Lato": "Poland", "Mario Kempes": "Argentina", "Paolo Rossi": "Italy", "Gary Lineker": "England", "Salvatore Schillaci": "Italy", "Davor Šuker": "Croatia", "Ronaldo Nazário": "Brazil",
  "Miroslav Klose": "Germany", "Thomas Müller": "Germany", "James Rodríguez": "Colombia", "Harry Kane": "England", "Kylian Mbappé": "France", "Diego Maradona": "Argentina", Romário: "Brazil", "Oliver Kahn": "Germany",
  "Zinedine Zidane": "France", "Diego Forlán": "Uruguay", "Lionel Messi": "Argentina", "Luka Modrić": "Croatia" };
const awardNation: B = (d, seed, n = 12) => {
  const rows = F.WORLD_CUPS.flatMap((w) => [w.boot ? { year: w.year, award: "Golden Boot", who: w.boot, lvl: w.lvl } : null, w.ball ? { year: w.year, award: "Golden Ball", who: w.ball, lvl: w.lvl } : null]).filter(Boolean) as { year: number; award: string; who: string; lvl: Lvl }[];
  return pick(rows, d, n, seed).map((r) => mc(`${r.who} won the ${r.award} at the ${r.year} World Cup. Which country did he play for?`, AWARD_NATION[r.who], Object.values(AWARD_NATION).concat(NATIONS), seed + r.year + r.award,
    { season: yr(r.year), source: F.REF.wcBoot, explanation: `${r.who} represented ${AWARD_NATION[r.who]}.`, lvl: r.lvl }));
};
const ballonYear: B = (d, seed, n = 8) => pick(F.BALLON.filter((b) => F.BALLON.filter((x) => x.player === b.player).length === 1), d, n, seed).map((b) => mc(`In which year did ${b.player} win the men's Ballon d'Or?`, yr(b.year), yearPool(b.year), seed + b.year,
  { season: yr(b.year), source: F.REF.ballon, explanation: `${b.player} won it in ${b.year}.`, lvl: b.lvl }));
/** Removes years ("in 2017", "the 2005", "2011–12") so a "which year?" question doesn't contain its own answer. */
const noYears = (t: string) => t.replace(/\b(in )?(18|19|20)\d\d(–\d\d)?\b ?/g, "").replace(/\s+([.,])/g, "$1").replace(/\s{2,}/g, " ").trim();
const momentYear: B = (d, seed, n = 8) => pick(F.MOMENTS, d, n, seed).map((m) => mc(`In which year did this happen? ${m.answer}: ${noYears(m.clue)}.`, yr(m.year), yearPool(m.year), seed + m.title, { season: yr(m.year), source: F.REF.moments, explanation: `${m.title} — ${m.year}.`, lvl: m.lvl }));
const momentTF: B = (d, seed, n = 10) => pick(F.MOMENTS, d, n, seed).map((m, i) => {
  const truth = rng(seed + i)() < 0.5; const wrong = shuffle(F.MOMENTS.filter((x) => x.answer !== m.answer && isPerson(x.answer) === isPerson(m.answer)).map((x) => x.answer), seed + m.title)[0];
  const who = truth ? m.answer : wrong;
  return { prompt: `True or false: ${who} — ${m.clue.charAt(0).toLowerCase()}${m.clue.slice(1)}.`, answer: truth ? "True" : "False", accept: [], options: ["True", "False"], season: yr(m.year), source: F.REF.moments, explanation: `It was ${m.answer} (${m.competition}, ${m.year}).`, lvl: m.lvl };
});
const penaltyFinals: B = (d, seed, n = 8) => {
  const rows = [...F.WORLD_CUPS.map((w) => ({ comp: "World Cup", year: w.year, winner: w.winner, runnerUp: w.runnerUp, score: w.score, lvl: w.lvl })),
    ...F.UCL.map((u) => ({ comp: "European Cup / Champions League", ...u })), ...F.UEL.map((u) => ({ comp: "UEFA Cup / Europa League", ...u })), ...F.FA_CUP.map((u) => ({ comp: "FA Cup", ...u }))].filter((r) => r.score.includes("pens"));
  return pick(rows, d, n, seed).map((r) => mc(`The ${r.year} ${r.comp} final went to penalties. Who won the shootout against ${r.runnerUp}?`, r.winner, rows.map((x) => x.winner).concat(NATIONS, CLUB_NAMES).filter((x) => x !== r.runnerUp), seed + r.year + r.comp,
    { season: yr(r.year), source: F.REF.moments, explanation: `${r.winner} won ${r.score}.`, lvl: r.lvl as Lvl }));
};
const titleNotes: B = (d, seed, n = 8) => {
  const rows = [...F.PL_CHAMPS.map((c) => ({ ...c, lg: "Premier League" })), ...F.SERIEA_CHAMPS.map((c) => ({ ...c, lg: "Serie A" })), ...F.BULI_CHAMPS.map((c) => ({ ...c, lg: "Bundesliga" })), ...F.LIGUE1_CHAMPS.map((c) => ({ ...c, lg: "Ligue 1" }))].filter((c) => c.note);
  return pick(rows, d, n, seed).map((c) => mc(`Which club won the ${c.season} ${c.lg} — ${c.note}?`, c.champion, rows.map((x) => x.champion).concat(CLUB_NAMES), seed + c.season + c.lg, { season: c.season, source: F.REF.pl, explanation: `${c.champion}, ${c.season}.`, lvl: c.lvl }));
};

const ntNickMc: B = (d, seed, n = 8) => pick(F.NATIONAL_NICKNAMES, d, n, seed).map((r) => mc(`Which national team is nicknamed "${r.nick}"?`, r.team, F.NATIONAL_NICKNAMES.map((x) => x.team), seed + r.nick, { source: F.REF.natNick, season: "Historic", explanation: `${r.team} — ${r.nick}.`, lvl: r.lvl }));
const ntNickType: B = (d, seed, n = 8) => pick(F.NATIONAL_NICKNAMES, d, n, seed).map((r) => ({ prompt: `Which national team is nicknamed "${r.nick}"?`, answer: r.team, accept: [], season: "Historic", source: F.REF.natNick, explanation: `${r.team} — ${r.nick}.`, lvl: r.lvl }));

const boot: B = (d, seed, n = 8) => pick(F.PL_BOOT, d, n, seed).map((b) => mc(`Who won the Premier League Golden Boot outright in ${b.season}?`, b.player, F.PL_BOOT.map((x) => x.player).concat(PLAYER_NAMES), seed + b.season, { season: b.season, source: F.REF.plBoot, explanation: `${b.player} (${b.club}).`, lvl: b.lvl }));
const bootType: B = (d, seed, n = 8) => pick(F.PL_BOOT, d, n, seed).map((b) => ({ prompt: `Name the outright Premier League Golden Boot winner in ${b.season} (playing for ${b.club}).`, answer: b.player, accept: personAccept(b.player), season: b.season, source: F.REF.plBoot, explanation: `${b.player}.`, lvl: b.lvl }));
const otherCups: B = (_d, seed) => F.OTHER_CUPS_2025.map((c) => mc(`Who won the ${c.season} ${c.cup}?`, c.winner, F.OTHER_CUPS_2025.flatMap((x) => [x.winner, x.runnerUp]).concat(CLUB_NAMES), seed + c.cup, { season: c.season, source: F.REF.facup, explanation: `${c.winner} beat ${c.runnerUp} in the final.`, lvl: c.lvl }));

const HISTORIC_GROUNDS = [
  { club: "Arsenal", ground: "Highbury", lvl: 1 as Lvl }, { club: "West Ham United", ground: "Upton Park (Boleyn Ground)", lvl: 2 as Lvl }, { club: "Manchester City", ground: "Maine Road", lvl: 2 as Lvl },
  { club: "Everton", ground: "Goodison Park", lvl: 1 as Lvl }, { club: "Juventus", ground: "Stadio delle Alpi", lvl: 3 as Lvl }, { club: "Bayern Munich", ground: "Olympiastadion (Munich)", lvl: 3 as Lvl },
  { club: "Napoli", ground: "Stadio San Paolo (renamed in 2020)", lvl: 2 as Lvl }, { club: "Ajax", ground: "De Meer Stadion", lvl: 4 as Lvl }, { club: "Atlético Madrid", ground: "Vicente Calderón", lvl: 2 as Lvl },
  { club: "Southampton", ground: "The Dell", lvl: 3 as Lvl }, { club: "Leicester City", ground: "Filbert Street", lvl: 4 as Lvl }, { club: "Sunderland", ground: "Roker Park", lvl: 4 as Lvl },
  { club: "Tottenham Hotspur", ground: "White Hart Lane", lvl: 1 as Lvl }, { club: "Barcelona", ground: "Les Corts", lvl: 4 as Lvl },
];
const historicGround: B = (d, seed, n = 8) => pick(HISTORIC_GROUNDS, d, n, seed).map((g) => mc(`Which club used to play at ${g.ground}?`, g.club, HISTORIC_GROUNDS.map((x) => x.club), seed + g.ground, { season: "Historic", source: F.REF.stadium, explanation: `${g.club} played at ${g.ground}.`, lvl: g.lvl }));
const FORMER_NAMES = [
  { now: "Manchester United", was: "Newton Heath", lvl: 2 as Lvl }, { now: "Arsenal", was: "Woolwich Arsenal", lvl: 2 as Lvl }, { now: "Manchester City", was: "Ardwick", lvl: 3 as Lvl },
  { now: "West Ham United", was: "Thames Ironworks", lvl: 3 as Lvl }, { now: "Southampton", was: "St Mary's", lvl: 4 as Lvl }, { now: "Everton", was: "St Domingo's", lvl: 4 as Lvl },
  { now: "Inter Milan", was: "Ambrosiana-Inter", lvl: 4 as Lvl }, { now: "Coventry City", was: "Singers FC", lvl: 4 as Lvl }, { now: "Mohun Bagan Super Giant", was: "ATK Mohun Bagan", lvl: 2 as Lvl },
];
const formerNames: B = (d, seed, n = 8) => pick(FORMER_NAMES, d, n, seed).map((f) => mc(`Which club was once known as ${f.was}?`, f.now, FORMER_NAMES.map((x) => x.now).concat(CLUB_NAMES), seed + f.was, { season: "Historic", source: F.REF.nick, explanation: `${f.now} were once called ${f.was}.`, lvl: f.lvl }));
const FIRST_EC: [string, number][] = [["Real Madrid", 1956], ["Benfica", 1961], ["AC Milan", 1963], ["Inter Milan", 1964], ["Celtic", 1967], ["Manchester United", 1968], ["Feyenoord", 1970], ["Ajax", 1971], ["Bayern Munich", 1974],
  ["Liverpool", 1977], ["Nottingham Forest", 1979], ["Aston Villa", 1982], ["Hamburger SV", 1983], ["Juventus", 1985], ["Steaua București", 1986], ["Porto", 1987], ["PSV Eindhoven", 1988], ["Red Star Belgrade", 1991],
  ["Barcelona", 1992], ["Marseille", 1993], ["Borussia Dortmund", 1997], ["Chelsea", 2012], ["Manchester City", 2023], ["Paris Saint-Germain", 2025]];
// Clubs with no European Cup up to the 2024–25 final. Later finals aren't in the fact tables, so recent contenders (e.g. Arsenal) are left out.
const NEVER_EC = ["Atlético Madrid", "Tottenham Hotspur", "Valencia", "Bayer Leverkusen", "Schalke 04", "Roma", "Lazio", "Sevilla", "Napoli", "Fiorentina", "Galatasaray", "Fenerbahçe", "Newcastle United", "Everton"];
const ecWinnerPick: B = (_d, seed, n = 8) => shuffle(FIRST_EC, seed).slice(0, n).map(([c, y]) => mc("Which of these clubs has won the European Cup / Champions League?", c, NEVER_EC, seed + c, { season: `First won ${y}`, source: F.REF.ucl, explanation: `${c} first won it in ${y}. The other three had never won it as of the 2024–25 season.`, lvl: 3 }));

// Order games: rounds of 4–5 events to arrange earliest → latest
const orderRounds = (events: { label: string; year: number }[], seed: string, rounds = 3, size = 5): RawQ[] => {
  const ev = shuffle(events.filter((e, i) => events.findIndex((x) => x.year === e.year) === i), seed);
  const out: RawQ[] = [];
  for (let r = 0; r < rounds && (r + 1) * size <= ev.length; r++) {
    const set = ev.slice(r * size, (r + 1) * size).sort((a, b) => a.year - b.year);
    out.push({ prompt: "Arrange these from earliest to latest.", answer: set.map((e) => e.label).join(" → "), accept: [], items: set.map((e) => e.label), season: `${set[0].year}–${set[set.length - 1].year}`,
      source: F.REF.wc, explanation: set.map((e) => `${e.year}: ${e.label}`).join(" · "), lvl: 3 });
  }
  return out;
};

// Match games: rounds of 4 pairs
const matchRounds = (pairs: [string, string][], seed: string, rounds = 3, size = 4, ref = F.REF.stadium): RawQ[] => {
  // Right-hand labels must be distinguishable ("red" and "all red" can't both appear), so look-alikes are dropped.
  const ps = shuffle(pairs.filter((p, i) => pairs.findIndex((x) => x[0] === p[0] || clash(x[1], p[1])) === i), seed);
  const out: RawQ[] = [];
  for (let r = 0; r < rounds && (r + 1) * size <= ps.length; r++) {
    const set = ps.slice(r * size, (r + 1) * size);
    out.push({ prompt: "Match each item on the left with its partner on the right.", answer: set.map((p) => `${p[0]} — ${p[1]}`).join("; "), accept: [], pairs: set, season: "As of autumn 2025", source: ref, explanation: set.map((p) => `${p[0]} — ${p[1]}`).join(" · "), lvl: 2 });
  }
  return out;
};

// Visual (image) builders
const kitClubs = F.CLUBS.filter((c) => c.kit);
const rivalsOf = (club: string) => F.DERBIES.flatMap((x) => (x.a === club ? [x.b] : x.b === club ? [x.a] : []));
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const colourDist = (x: string, y: string) => { const a = rgb(x), b = rgb(y); return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); };
/** Two drawn kits that a player couldn't tell apart (same pattern, near-identical colours). */
const similarKit = (x: F.Club, y: F.Club) => x !== y && x.kit!.pattern === y.kit!.pattern && colourDist(x.kit!.a, y.kit!.a) < 90 && (x.kit!.pattern === "solid" || colourDist(x.kit!.b, y.kit!.b) < 90);
const uniqueKit = (c: F.Club) => !kitClubs.some((o) => similarKit(c, o));
const kitMc = (ask: "club" | "city" | "country" | "stadium" | "nickname" | "rival", filter: (c: F.Club) => boolean = () => true, typed = false): B => (d, seed, n = 8) =>
  // Only "which club?" multiple choice can use look-alike kits (their look-alikes are kept out of the options);
  // every other kit question, and typed answers, only use kits that are visually unique.
  pick(kitClubs.filter((c) => filter(c) && (ask === "club" && !typed ? true : uniqueKit(c))), d, n, seed).map((c) => {
    const visual: Visual = { kind: "kit", ...c.kit! };
    const derby = F.DERBIES.find((x) => x.a === c.club || x.b === c.club);
    const spec: Record<string, [string, string | undefined, string[]]> = {
      club: ["Which club's home kit is this?", c.club, kitClubs.filter((x) => x.club !== c.club && !similarKit(c, x)).map((x) => x.club)],
      city: ["This is the home kit of a famous club. Which city is it from?", c.city, F.CLUBS.map((x) => x.city)],
      country: ["Which country's league does the club wearing this kit play in?", c.country, F.CLUBS.map((x) => x.country)],
      stadium: ["Where does the club wearing this kit play its home games?", c.stadium, F.CLUBS.map((x) => x.stadium)],
      nickname: ["What is the nickname of the club wearing this kit?", c.nickname, F.CLUBS.filter((x) => x.nickname).map((x) => x.nickname!)],
      rival: ["Who are the derby rivals of the club wearing this kit?", derby ? (derby.a === c.club ? derby.b : derby.a) : undefined, F.DERBIES.flatMap((x) => [x.a, x.b]).filter((x) => x !== c.club && !rivalsOf(c.club).includes(x))],
    };
    const [prompt, answer, pool] = spec[ask];
    if (!answer) return null;
    const extra = { visual, season: "Traditional home colours", source: F.REF.kits, explanation: `This is ${poss(c.club)} ${c.colours} kit (${c.city}).`, lvl: c.lvl };
    return typed ? { prompt, answer, accept: clubAccept(answer), ...extra } : mc(prompt, answer, pool, seed + c.club + ask, extra);
  }).filter(Boolean) as RawQ[];
const flagMc = (ask: "team" | "nickname"): B => (d, seed, n = 8) => pick(F.FLAGS, d, n, seed).map((f) => {
  const visual: Visual = { kind: "flag", dir: f.dir, colours: f.colours };
  if (ask === "nickname") { const nn = F.NATIONAL_NICKNAMES.find((x) => x.team === f.team); if (!nn) return null;
    return mc("What is the nickname of the national team that plays under this flag?", nn.nick, F.NATIONAL_NICKNAMES.map((x) => x.nick), seed + f.team, { visual, season: "Current flag", source: F.REF.natNick, explanation: `${f.team}: ${nn.nick}.`, lvl: f.lvl }); }
  return mc("Which national team plays under this flag?", f.team, F.FLAGS.map((x) => x.team), seed + f.team, { visual, season: "Current flag", source: "https://en.wikipedia.org/wiki/Gallery_of_sovereign_state_flags", explanation: `This is the flag of ${f.team}.`, lvl: f.lvl });
}).filter(Boolean) as RawQ[];
const clubClues: B = (d, seed, n = 6) => pick(F.CLUBS.filter((c) => c.nickname && c.colours), d, n, seed).map((c) => ({
  prompt: "Which club is this?", answer: c.club, accept: clubAccept(c.club), visual: c.kit ? { kind: "kit", ...c.kit } as Visual : undefined,
  clues: [`Colours: ${c.colours}`, `Nickname: ${c.nickname}`, `Home: ${c.stadium}`, `City: ${c.city}, ${c.country}`], season: "As of autumn 2025", source: F.REF.nick, explanation: `${c.club} — ${c.nickname}, ${c.stadium}.`, lvl: c.lvl }));

// ---------- typed answer helpers ----------
// People who appear as answers to "moment" questions. Explicit rather than guessed from the shape of the name (a guess once classed Crystal Palace as a person).
const MOMENT_PEOPLE = ["Geoff Hurst", "John Terry", "Roberto Baggio", "Andrés Iniesta", "Mario Götze", "Marco van Basten", "Ryan Giggs"];
function isPerson(s: string) { return PLAYER_NAMES.includes(s) || MANAGER_NAMES.includes(s) || MOMENT_PEOPLE.includes(s); }
const PERSON_ALIASES: Record<string, string[]> = {
  "Ronaldo Nazário": ["ronaldo", "r9", "ronaldo nazario", "ronaldo luis nazario de lima"], "Cristiano Ronaldo": ["ronaldo", "cr7"], "Son Heung-min": ["son", "heung min son", "son heungmin"],
  "Robin van Persie": ["rvp"], "Ruud van Nistelrooy": ["rvn"], "Ole Gunnar Solskjær": ["solskjaer", "ole"], "Javier Hernández": ["chicharito"], "Alex Ferguson": ["fergie", "alexander ferguson"],
  "Zinedine Zidane": ["zizou"], "Gabriel Batistuta": ["batigol"], "Lionel Messi": ["leo messi", "messi"], "Kylian Mbappé": ["mbappe"], "Diego Maradona": ["diego armando maradona"],
  "Virgil van Dijk": ["vvd", "van dijk"], "Kevin De Bruyne": ["kdb"], "Trent Alexander-Arnold": ["trent", "taa", "alexander arnold"], "Luis Enrique": ["luis enrique martinez"],
  "Pep Guardiola": ["guardiola", "josep guardiola"], "Bob Paisley": ["paisley"], "Vicente del Bosque": ["del bosque"], "Salvatore Schillaci": ["toto schillaci"],
};
function personAccept(name: string) { const parts = name.split(" "); return uniq([...(parts.length > 1 ? [parts[parts.length - 1], parts.slice(-2).join(" ")] : []), ...(PERSON_ALIASES[name] ?? [])]); }
const ALIASES: Record<string, string[]> = {
  "Manchester United": ["man utd", "man united", "united", "mufc"], "Manchester City": ["man city", "city"], "Tottenham Hotspur": ["spurs", "tottenham"], "Paris Saint-Germain": ["psg", "paris sg", "paris"],
  "Bayern Munich": ["bayern", "fc bayern", "bayern munchen", "bayern muenchen"], "Borussia Dortmund": ["dortmund", "bvb"], "Inter Milan": ["inter", "internazionale"], "AC Milan": ["milan"], "Atlético Madrid": ["atletico", "atleti"],
  "Real Madrid": ["madrid", "real"], Barcelona: ["barca", "fc barcelona"], "Bayer Leverkusen": ["leverkusen"], "Newcastle United": ["newcastle"], "West Ham United": ["west ham"], "Leicester City": ["leicester"],
  "Wolverhampton Wanderers": ["wolves"], "Brighton & Hove Albion": ["brighton"], "West Bromwich Albion": ["west brom", "wba"], "Sporting CP": ["sporting", "sporting lisbon"], "PSV Eindhoven": ["psv"],
  "Mohun Bagan Super Giant": ["mohun bagan", "atk mohun bagan"], "Red Star Belgrade": ["red star", "crvena zvezda"], "Athletic Bilbao": ["athletic club", "bilbao", "athletic"],
  "Schalke 04": ["schalke"], "TP Mazembe": ["mazembe"], "Urawa Red Diamonds": ["urawa", "urawa reds"], "Ulsan HD": ["ulsan", "ulsan hyundai"], "Club América": ["america"], "Seattle Sounders": ["seattle", "sounders"],
  "Kaizer Chiefs": ["chiefs"], "Orlando Pirates": ["pirates"], "Sheffield Wednesday": ["sheff wed", "wednesday"], "Norwich City": ["norwich"], "Al Hilal": ["hilal"], "Al Nassr": ["nassr"],
  "Borussia Mönchengladbach": ["gladbach", "monchengladbach"], "Hamburger SV": ["hamburg", "hsv"], "Steaua București": ["steaua", "steaua bucharest", "fcsb"], "Eintracht Frankfurt": ["frankfurt"],
  "Olympiacos": ["olympiakos"], "Real Betis": ["betis"], "Wigan Athletic": ["wigan"], "Crystal Palace": ["palace"], "Dnipro Dnipropetrovsk": ["dnipro"], "Los Angeles FC": ["lafc"], "LA Galaxy": ["galaxy", "los angeles galaxy"],
  "Leeds United": ["leeds"], "Aston Villa": ["villa"], "Nottingham Forest": ["forest", "nottm forest"], "Real Sociedad": ["la real", "sociedad"], Sevilla: ["seville"], Juventus: ["juve"],
  Marseille: ["om", "olympique de marseille", "olympique marseille"], Lyon: ["olympique lyonnais", "ol"], Monaco: ["as monaco"], Lille: ["losc"], Roma: ["as roma"], Lazio: ["ss lazio"], Napoli: ["ssc napoli"],
  "Boca Juniors": ["boca"], "River Plate": ["river"], "Birmingham City": ["birmingham"], "Partizan": ["partizan belgrade"], "Mumbai City": ["mumbai"], "Bengaluru FC": ["bengaluru", "bangalore"],
  "Kerala Blasters": ["kerala"], "East Bengal": ["sc east bengal"], "Toronto FC": ["toronto"], "Fenerbahçe": ["fener"], "Galatasaray": ["gala"],
  // nations
  "United States": ["usa", "us", "america", "usmnt", "uswnt"], "West Germany": ["germany", "frg"], "Soviet Union": ["ussr"], "Netherlands": ["holland"], "Ivory Coast": ["cote d ivoire", "cote divoire"],
  "South Korea": ["korea", "korea republic"], "Republic of Ireland": ["ireland"], "DR Congo": ["drc", "congo dr"], "Saudi Arabia": ["ksa"], "North Korea": ["korea dpr", "dprk"],
  "Czech Republic": ["czechia"], "England (women)": ["lionesses"], "Australia (women)": ["matildas"], "Nigeria (women)": ["super falcons"],
};
function clubAccept(name: string) { return ALIASES[name] ?? []; }

// ---------- game registry ----------
let counter = 0;
const GAMES: Game[] = [];
const INSTR: Record<Engine, string> = {
  mc: "Pick the correct answer from four options.", type: "Type your answer. Spelling is forgiving: case, accents and punctuation are ignored. A hint costs half a point.",
  timed: "Answer as many as you can in 60 seconds.", image: "Study the drawn kit or flag, then choose the answer.", match: "Tap an item on the left, then its partner on the right. Score a point per correct pair.",
  order: "Use the arrows to arrange the events from earliest to latest, then lock it in.", career: "Read the career path and type the player's name.", clues: "Clues are revealed one at a time. Guess early for more points (4 → 1).",
  survival: "Keep going until you lose three lives.", elimination: "One wrong answer and it's over.", tf: "Decide whether each statement is true or false.",
};
function add(category: CategoryId, title: string, difficulty: Difficulty, engine: Engine, description: string, raw: RawQ[], extra: Partial<Game> = {}) {
  const id = `${category}-${String(++counter).padStart(3, "0")}`;
  const questions: Question[] = raw.map((q, i) => {
    const { lvl: _lvl, ...rest } = q; void _lvl;
    const accept = engine === "type" || engine === "career" || engine === "clues" ? uniq([...(rest.accept ?? []), ...clubAccept(rest.answer)]) : rest.accept ?? [];
    const options = engine === "type" || engine === "career" || engine === "clues" ? undefined : rest.options;
    return { ...rest, accept, options, id: `${id}-q${String(i + 1).padStart(2, "0")}`, gameId: id, category, difficulty };
  });
  GAMES.push({ id, title, category, difficulty, engine, description, instructions: INSTR[engine], questions, ...extra });
}
const S = (s: string) => s;
const TF_INTL_RE = /World Cup|Euro|Asian|Africa|Uruguay|England have|Netherlands|Southgate/;
const tfQ = (t: (typeof F.TRUE_FALSE)[number]) => ({ prompt: t.s, answer: t.t ? "True" : "False", accept: [], options: ["True", "False"], season: "Historic", source: F.REF.moments, explanation: t.why, lvl: t.lvl });
const TF_INTL = F.TRUE_FALSE.filter((t) => TF_INTL_RE.test(t.s)).map(tfQ);
const TF_OTHER = F.TRUE_FALSE.filter((t) => !TF_INTL_RE.test(t.s)).map(tfQ); // readability alias for seeds
const all = (...bs: RawQ[][]) => bs.flat();
const sample = (qs: RawQ[], n: number, seed: string) => shuffle(qs, seed).slice(0, n);
const byLevel = (qs: RawQ[]) => [...qs].sort((a, b) => (a.lvl ?? 2) - (b.lvl ?? 2));

// ===== A. Player Knowledge =====
add("players", "Guess the Player from Career Clues", "Beginner", "clues", "Three career clues and a nationality — name the star.", playerClues((p) => !p.women)("Beginner", S("A1")));
add("players", "Guess Who? Progressive Clues", "Advanced", "clues", "Tougher players, same progressive format.", playerClues((p) => !p.women)("Advanced", S("A2")));
add("players", "Player Nationality Quiz", "Beginner", "mc", "Which country does each star represent?", playerNation("Beginner", S("A3")));
add("players", "Player Nationality: Deep Cuts", "Advanced", "mc", "Nationalities of less obvious names.", playerNation([2, 3], S("A4")));
add("players", "Player-to-Country Matching", "Intermediate", "match", "Pair players with their national teams.", matchRounds(careerPlayers.map((p) => [p.name, p.nation]), S("A5"), 3, 4, F.REF.careers));
add("players", "Player Career Path", "Intermediate", "career", "Read the clubs, name the player.", careerPath(() => true)("Intermediate", S("A6")));
add("players", "Complete the Career Timeline", "Advanced", "order", "Order active players' clubs correctly.", careerOrder((p) => !p.retired)("Advanced", S("A7")));
add("players", "Which Player Played for Both Clubs?", "Intermediate", "mc", "Two clubs, one player in common.", bothClubs("Intermediate", S("A8")));
add("players", "Player Nickname Quiz", "Beginner", "mc", "Famous nicknames from across the game.", nicknameMc([1, 2], S("A9")));
add("players", "Nicknames of the Legends", "Expert", "type", "Type the legend behind the nickname.", nicknameType([3, 4], S("A10"), 10));
add("players", "Identify the Player from Their Honours", "Intermediate", "mc", "Recent Ballon d'Or winners.", ballonMc([1, 2], S("A11")));
add("players", "Ballon d'Or Legends", "Expert", "mc", "Ballon d'Or winners from the 1950s to the 2000s.", ballonMc([3, 4], S("A12")));
add("players", "Retired Player Challenge", "Intermediate", "mc", "Identify retired greats from a career clue.", playerClueMc((p) => p.retired && !p.women, 1)("Intermediate", S("A13")));
add("players", "Active Player Challenge", "Beginner", "mc", "Identify current stars from a career clue.", playerClueMc((p) => !p.retired && !p.women, 0)("Beginner", S("A14")));
add("players", "Legendary Footballers", "Advanced", "type", "Type the legend from one big clue.", pick(careerPlayers.filter((p) => p.retired), "Advanced", 8, "A15").map((p) => ({ prompt: `Name the player: ${p.clue[0]}.`, answer: p.name, accept: personAccept(p.name), season: "Historic", source: F.REF.careers, explanation: p.clue.join("; "), lvl: p.lvl })));
add("players", "International Player Identification", "Intermediate", "mc", "Which of these players represents the nation shown?", pick(careerPlayers.filter((p, i, a) => a.findIndex((x) => x.nation === p.nation) === i), "Intermediate", 8, "A16").map((p) => mc(`Which of these players has represented ${p.nation}?`, p.name, careerPlayers.filter((x) => x.nation !== p.nation).map((x) => x.name), "A16" + p.name, { season: "As of autumn 2025", source: F.REF.careers, explanation: `${p.name} plays/played for ${p.nation}.` })));
add("players", "Player and Manager Connections", "Advanced", "mc", "Former players who moved into the dugout.", playerManagers([1, 2, 3], S("A17")));
add("players", "Famous Career Moments", "Beginner", "mc", "Which player was behind each famous moment?", momentAnswer((m) => isPerson(m.answer) && m.lvl === 1)([1], S("A18")));
add("players", "Ballon d'Or Winners by Nation", "Advanced", "mc", "Which country did each Ballon d'Or winner represent?", ballonNation("Advanced", S("A19")));
add("players", "Women's Football Stars", "Intermediate", "clues", "Progressive clues about stars of the women's game.", playerClues((p) => !!p.women)("Intermediate", S("A20"), 8));
add("players", "Player Biographies: True or False", "Advanced", "tf", "Did they really play for that club?", playerTF("Advanced", S("A21")));
add("players", "Historic Club Connections", "Expert", "mc", "Which single club links two players?", sharedClub("Expert", S("A22")));
add("players", "Crossing the Divide: Rival Clubs", "Advanced", "mc", "Players who represented both sides of a derby.", rivalCrossers("Advanced", S("A23")));
add("players", "Mixed Player Trivia", "Intermediate", "survival", "Nationalities, nicknames and clues — three lives.", sample(all(playerNation([2], "A24a"), nicknameMc([2], "A24b"), playerClueMc((p) => !p.women, 2)([2], "A24c")), 15, "A24"));
add("players", "Guess the Player: Expert Clues", "Expert", "clues", "The hardest clue comes first.", playerClues((p) => !p.women, true)([2, 3], S("A25"), 8));
add("players", "Ballon d'Or Féminin Winners", "Intermediate", "mc", "Winners of the women's Ballon d'Or.", ballonWomen("Intermediate", S("A26")));
add("players", "Ballon d'Or: Name the Year", "Advanced", "mc", "When did each winner lift the Ballon d'Or?", ballonYear([2, 3, 4], S("A28")));
add("players", "Puskás Award Winners", "Intermediate", "mc", "Who scored FIFA's goal of the year?", puskasMc([1, 2, 3], S("A27")));

// ===== B. Clubs & Stadiums =====
add("clubs", "Stadium Identification", "Beginner", "mc", "Name the home of each big club.", clubAttr("stadium")("Beginner", S("B1")));
add("clubs", "Stadium Identification: World Tour", "Advanced", "mc", "Grounds from Europe, South America, Africa and Asia.", clubAttr("stadium")([3, 4], S("B2")));
add("clubs", "Match Clubs to Stadiums", "Intermediate", "match", "Pair clubs with their grounds.", matchRounds(F.CLUBS.filter((c) => c.lvl <= 2).map((c) => [c.club, c.stadium]), S("B3")));
add("clubs", "Club Nicknames", "Beginner", "mc", "Gunners, Magpies, Old Lady and more.", clubAttr("nickname")([1, 2], S("B4")));
add("clubs", "Club Nicknames: Expert", "Expert", "type", "Type the club behind the nickname.", pick(F.CLUBS.filter((c) => c.nickname && c.lvl >= 3 && !F.CLUBS.some((x) => nickClash(x, c))), [3, 4], 10, "B5").map((c) => ({ prompt: `Which club is nicknamed "${c.nickname}"?`, answer: c.club, accept: clubAccept(c.club), season: "As of autumn 2025", source: F.REF.nick, explanation: `${c.club} — ${c.nickname}.`, lvl: c.lvl })));
add("clubs", "Club Colours", "Intermediate", "mc", "Match each club to its traditional colours.", clubAttr("colours")("Intermediate", S("B6")));
add("clubs", "European Club Knowledge", "Intermediate", "mc", "Which city is each European club from?", clubAttr("city", F.CLUBS.filter((c) => c.continent === "Europe"))([2, 3], S("B7")));
add("clubs", "South American Club Knowledge", "Advanced", "mc", "Grounds of South America's giants.", stadiumToClub([2, 3, 4], S("B8")).filter((q) => F.CLUBS.find((c) => c.club === q.answer)?.continent === "South America").concat(clubAttr("city", F.CLUBS.filter((c) => c.continent === "South America"))([2, 3, 4], "B8b", 4)));
add("clubs", "Asian Club Knowledge", "Advanced", "mc", "Clubs of the AFC, from Riyadh to Saitama.", clubAttr("stadium", F.CLUBS.filter((c) => c.continent === "Asia" && c.country !== "India"))([2, 3, 4], S("B9")).concat(finalsWinner(F.ACL, "AFC Champions League", F.REF.acl, F.ACL.flatMap((r) => [r.winner, r.runnerUp]))([3], "B9b", 3)));
add("clubs", "African Club Knowledge", "Expert", "mc", "Clubs and grounds across Africa.", clubAttr("stadium", F.CLUBS.filter((c) => c.continent === "Africa"))([2, 3, 4], S("B10")).concat(clubAttr("city", F.CLUBS.filter((c) => c.continent === "Africa"))([3, 4], "B10b", 3)));
add("clubs", "North American Club Knowledge", "Advanced", "mc", "MLS and Liga MX clubs and stadiums.", clubAttr("stadium", F.CLUBS.filter((c) => c.continent === "North America"))([2, 3], S("B11")).concat(finalsWinner(F.MLS_CUP, "MLS Cup", F.REF.mls, F.MLS_CUP.flatMap((r) => [r.winner, r.runnerUp]))([2, 3], "B11b", 4)));
add("clubs", "Indian Football Clubs", "Intermediate", "mc", "ISL clubs, cities and grounds.", clubAttr("stadium", F.CLUBS.filter((c) => c.country === "India"))([2, 3], S("B12")).concat(clubAttr("city", F.CLUBS.filter((c) => c.country === "India"))([2, 3], "B12b", 4)));
add("clubs", "Famous Rivalries", "Beginner", "mc", "Who faces whom in football's great derbies?", derbyOpponent([1, 2], S("B13")));
add("clubs", "Derby History", "Advanced", "mc", "Name the rivalry from the two clubs.", derbyName([2, 3, 4], S("B14")));
add("clubs", "Match Clubs to Legendary Managers", "Intermediate", "match", "Pair managers with the club that defined them.", matchRounds([["Alex Ferguson", "Manchester United"], ["Arsène Wenger", "Arsenal"], ["Diego Simeone", "Atlético Madrid"], ["Jürgen Klopp", "Liverpool"], ["Brian Clough", "Nottingham Forest"], ["Unai Emery", "Sevilla"], ["Arrigo Sacchi", "AC Milan"], ["Claudio Ranieri", "Leicester City"], ["Xabi Alonso", "Bayer Leverkusen"], ["Pep Guardiola", "Manchester City"], ["José Mourinho", "Porto"], ["Louis van Gaal", "Ajax (1995)"]], S("B15"), 3, 4, F.REF.managers));
add("clubs", "Match Clubs to Countries", "Beginner", "match", "Which country does each club call home?", matchRounds(F.CLUBS.filter((c) => c.lvl <= 2).map((c) => [c.club, c.country]), S("B16")));
add("clubs", "Guess the Club from Clues", "Intermediate", "clues", "Colours, nickname, ground, city — name the club.", clubClues([1, 2], S("B17"), 8));
add("clubs", "Club Honours: European Champions", "Advanced", "mc", "Spot the club that has lifted the European Cup.", ecWinnerPick("Advanced", S("B18")));
add("clubs", "Historic Stadium Names", "Intermediate", "mc", "Grounds clubs have left behind.", historicGround([1, 2, 3, 4], S("B19")));
add("clubs", "Historic Club Identities", "Expert", "mc", "Clubs by their former names.", formerNames([2, 3, 4], S("B20")));
add("clubs", "Club History Timelines", "Advanced", "order", "Order clubs by their first European Cup win.", orderRounds(FIRST_EC.map(([c, y]) => ({ label: c, year: y })), S("B21"), 3, 5).map((q) => ({ ...q, prompt: "Order these clubs by their FIRST European Cup / Champions League win, earliest first.", source: F.REF.ucl })));
add("clubs", "Clubs by City", "Beginner", "mc", "Which city is home to each famous club?", clubAttr("city")("Beginner", S("B22")));
add("clubs", "Match Clubs to Countries: World Tour", "Advanced", "match", "Lesser-known clubs and their countries.", matchRounds(F.CLUBS.filter((c) => c.lvl >= 3).map((c) => [c.club, c.country]), S("B23")));
add("clubs", "Mixed Club Trivia", "Intermediate", "survival", "Stadiums, nicknames, derbies — three lives.", sample(all(clubAttr("stadium")([2], "B24a"), clubAttr("nickname")([2, 3], "B24b"), derbyOpponent([2, 3], "B24c")), 15, "B24"));
add("clubs", "Stadium Sharers", "Advanced", "mc", "Clubs that share a ground with a rival.", sharedStadium("Advanced", S("B25")));
add("clubs", "Which Club Plays Here?", "Intermediate", "mc", "From stadium to club.", stadiumToClub([1, 2], S("B26")));
add("clubs", "Historic Clubs: European Cup Finalists", "Expert", "mc", "Who lost the classic European Cup finals?", clubFinalRunner(F.UCL, "European Cup", F.REF.ucl)([3, 4], S("B27")));

// ===== C. International & World Cups =====
add("international", "World Cup Winners", "Beginner", "mc", "Recent World Cup champions.", wcWinner("Beginner", S("C1")));
add("international", "World Cup Winners: The Early Years", "Advanced", "mc", "Champions from 1930 to the 1970s.", wcWinner([3, 4], S("C2")));
add("international", "World Cup Hosts", "Intermediate", "mc", "Where was each World Cup played?", wcHost([1, 2], S("C3")));
add("international", "World Cup Hosts: History", "Expert", "type", "Type the host nation of early tournaments.", pick(F.WORLD_CUPS, [3, 4], 8, "C4").map((w) => ({ prompt: `Which country hosted the ${w.year} World Cup?`, answer: w.host, accept: clubAccept(w.host), season: yr(w.year), source: F.REF.wc, explanation: `${w.host} hosted; ${w.winner} won.`, lvl: w.lvl })));
add("international", "World Cup Final Trivia", "Intermediate", "mc", "Who lost each World Cup final?", wcRunner([1, 2], S("C5")));
add("international", "Golden Boot Winners", "Intermediate", "mc", "World Cup top scorers.", wcBoot([1, 2], S("C6")));
add("international", "Golden Boot Winners: Expert", "Expert", "type", "Type the World Cup top scorer.", pick(F.WORLD_CUPS.filter((w) => w.boot), [3, 4], 8, "C7").map((w) => ({ prompt: `Who was top scorer at the ${w.year} World Cup?`, answer: w.boot!, accept: personAccept(w.boot!), season: yr(w.year), source: F.REF.wcBoot, explanation: `${w.boot}.`, lvl: w.lvl })));
add("international", "Golden Ball Winners", "Intermediate", "mc", "Best player of each World Cup.", wcBall("Intermediate", S("C8")));
add("international", "Women's World Cup History", "Beginner", "mc", "Champions of the Women's World Cup.", finalsWinner(F.WOMENS_WC, "Women's World Cup", F.REF.wwc)([1, 2], S("C9")));
add("international", "Women's World Cup Hosts", "Advanced", "mc", "Where each Women's World Cup was held.", finalsHost(F.WOMENS_WC, "Women's World Cup", F.REF.wwc)([2, 3], S("C10")));
add("international", "Women's International Football", "Intermediate", "mc", "Women's Euro winners and finalists.", finalsWinner(F.WOMENS_EUROS, "Women's European Championship", F.REF.wwc)([1, 2, 3], S("C11")).concat(finalsRunner(F.WOMENS_WC, "Women's World Cup", F.REF.wwc)([2, 3], "C11b", 3)));
add("international", "European Championship History", "Beginner", "mc", "Recent Euro winners.", finalsWinner(F.EUROS, "European Championship", F.REF.euro)([1, 2], S("C12")));
add("international", "European Championship: Early Editions", "Expert", "mc", "Euro winners from 1960 to 1984.", finalsWinner(F.EUROS, "European Championship", F.REF.euro)([3, 4], S("C13")));
add("international", "Euro Hosts", "Advanced", "mc", "Which country hosted each Euro?", finalsHost(F.EUROS, "European Championship", F.REF.euro)("Advanced", S("C14")));
add("international", "Euro Final Runners-Up", "Intermediate", "mc", "Who fell at the final hurdle?", finalsRunner(F.EUROS, "European Championship", F.REF.euro)([1, 2], S("C15")));
add("international", "Copa América History", "Intermediate", "mc", "South America's champions.", finalsWinner(F.COPA, "Copa América", F.REF.copa)("Intermediate", S("C16")));
add("international", "Copa América Finals", "Advanced", "mc", "Who lost each Copa América final?", finalsRunner(F.COPA, "Copa América", F.REF.copa)("Advanced", S("C17")));
add("international", "Asian Cup History", "Advanced", "mc", "Winners and finalists of the AFC Asian Cup.", finalsWinner(F.ASIAN_CUP, "AFC Asian Cup", F.REF.asian)("Advanced", S("C18")).concat(finalsRunner(F.ASIAN_CUP, "AFC Asian Cup", F.REF.asian)([1, 2], "C18b", 3)));
add("international", "Africa Cup of Nations History", "Intermediate", "mc", "Champions of Africa.", finalsWinner(F.AFCON, "Africa Cup of Nations", F.REF.afcon)("Intermediate", S("C19")));
add("international", "AFCON Finals and Hosts", "Advanced", "mc", "Runners-up and host nations at AFCON.", finalsRunner(F.AFCON, "Africa Cup of Nations", F.REF.afcon)([2, 3], S("C20"), 4).concat(finalsHost(F.AFCON, "Africa Cup of Nations", F.REF.afcon)([2, 3], "C20b", 4)));
add("international", "National Team Nicknames", "Beginner", "mc", "Azzurri, Oranje, Three Lions and more.", ntNickMc([1, 2], S("C21")));
add("international", "National Team Nicknames: Expert", "Expert", "type", "Type the nation behind the nickname.", ntNickType([3, 4], S("C22")));
add("international", "Legendary National Teams: Coaches", "Intermediate", "mc", "Who led each nation to glory?", coachMc([1, 2, 3], S("C23")));
add("international", "Historic International Upsets", "Advanced", "mc", "Shocks at World Cups and Euros.", momentAnswer((m) => ["World Cup", "European Championship"].includes(m.competition) && !isPerson(m.answer))([2, 3], S("C24")));
add("international", "Continental Championships Mixed", "Intermediate", "survival", "Copa, AFCON, Asian Cup and Euros — three lives.", sample(all(finalsWinner(F.COPA, "Copa América", F.REF.copa)([2, 3], "C25a", 4), finalsWinner(F.AFCON, "Africa Cup of Nations", F.REF.afcon)([2, 3], "C25b", 4), finalsWinner(F.ASIAN_CUP, "AFC Asian Cup", F.REF.asian)([2, 3], "C25c", 4), finalsWinner(F.EUROS, "European Championship", F.REF.euro)([2, 3], "C25d", 4)), 16, "C25"));
add("international", "Tournament Editions in Order", "Advanced", "order", "Arrange World Cup winners chronologically.", orderRounds(F.WORLD_CUPS.map((w) => ({ label: `${w.winner} win in ${w.host}`, year: w.year })), S("C26"), 3, 5));
add("international", "Mixed International Trivia", "Intermediate", "tf", "True or false: international edition.", TF_INTL);
add("international", "World Cup Final Years", "Intermediate", "mc", "When did each final pairing happen?", finalsYear(F.WORLD_CUPS, "World Cup", F.REF.wc)([1, 2, 3], S("C29")));
add("international", "Euro Final Years", "Advanced", "mc", "When did each Euro final pairing happen?", finalsYear(F.EUROS, "European Championship", F.REF.euro)([2, 3, 4], S("C30")));
add("international", "Asian Cup Hosts", "Expert", "mc", "Where each AFC Asian Cup was held.", finalsHost(F.ASIAN_CUP, "AFC Asian Cup", F.REF.asian)([1, 2, 3], S("C31")));
add("international", "Copa América Hosts", "Advanced", "mc", "Where each Copa América was held.", finalsHost(F.COPA, "Copa América", F.REF.copa)([1, 2, 3], S("C32")));
add("international", "Women's Euro Finalists", "Advanced", "mc", "Who lost each Women's Euro final?", finalsRunner(F.WOMENS_EUROS, "Women's European Championship", F.REF.wwc)([1, 2, 3], S("C33")));
add("international", "Women's World Cup Finals", "Advanced", "mc", "Who lost each Women's World Cup final?", finalsRunner(F.WOMENS_WC, "Women's World Cup", F.REF.wwc)([1, 2, 4], S("C28")).filter((q) => !["1999", "2003", "2007"].includes(q.season)));

// ===== D. Leagues & Competitions =====
add("leagues", "Premier League History", "Beginner", "mc", "Famous Premier League champions.", champs(F.PL_CHAMPS, "Premier League", F.REF.pl)("Beginner", S("D1")));
add("leagues", "Premier League Champions: Deep Cuts", "Advanced", "mc", "The less obvious title winners.", champs(F.PL_CHAMPS, "Premier League", F.REF.pl)([2, 3], S("D2")));
add("leagues", "La Liga History", "Intermediate", "mc", "Spanish champions season by season.", champs(F.LIGA_CHAMPS, "La Liga", F.REF.liga)("Intermediate", S("D3")));
add("leagues", "Serie A History", "Intermediate", "mc", "Italian champions season by season.", champs(F.SERIEA_CHAMPS, "Serie A", F.REF.serieA)("Intermediate", S("D4")));
add("leagues", "Bundesliga History", "Intermediate", "mc", "German champions season by season.", champs(F.BULI_CHAMPS, "Bundesliga", F.REF.buli)("Intermediate", S("D5")));
add("leagues", "Ligue 1 History", "Advanced", "mc", "French champions season by season.", champs(F.LIGUE1_CHAMPS, "Ligue 1", F.REF.ligue1)("Advanced", S("D6")));
add("leagues", "Champions League History", "Beginner", "mc", "Recent Champions League winners.", clubFinalWinner(F.UCL, "Champions League", F.REF.ucl)("Beginner", S("D7")));
add("leagues", "Champions League Runners-Up", "Intermediate", "mc", "Who lost each final?", clubFinalRunner(F.UCL, "Champions League", F.REF.ucl)([1, 2], S("D8")));
add("leagues", "European Cup: The Early Years", "Expert", "mc", "Winners from the 1950s to the 1990s.", clubFinalWinner(F.UCL, "European Cup", F.REF.ucl)([3, 4], S("D9")));
add("leagues", "Champions League Final Venues", "Advanced", "mc", "Which city hosted each final?", uclVenue([1, 2], S("D10")));
add("leagues", "Europa League History", "Intermediate", "mc", "Winners of the UEFA Cup / Europa League.", clubFinalWinner(F.UEL, "Europa League", F.REF.uel)("Intermediate", S("D11")));
add("leagues", "Conference League Winners", "Intermediate", "mc", "Every Conference League final so far.", clubFinalWinner(F.CONFERENCE, "Conference League", F.REF.uel)([1, 2], S("D12")).concat(clubFinalRunner(F.CONFERENCE, "Conference League", F.REF.uel)([1, 2], "D12b", 2)));
add("leagues", "Domestic Cup History", "Intermediate", "mc", "Recent FA Cup winners.", clubFinalWinner(F.FA_CUP, "FA Cup", F.REF.facup)([1, 2], S("D13")));
add("leagues", "Cups Around Europe 2024–25", "Advanced", "mc", "Domestic cup winners across Europe last season.", otherCups("Advanced", S("D14")));
add("leagues", "Premier League Golden Boot", "Intermediate", "mc", "Outright top scorers by season.", boot([1, 2], S("D15")));
add("leagues", "Golden Boot: Expert", "Expert", "type", "Type the Premier League top scorer.", bootType([3, 4], S("D16")));
add("leagues", "Famous Title Races", "Advanced", "mc", "Which club won the title described?", titleNotes("Advanced", S("D17")));
// Each label describes a one-off event, so there is exactly one correct order (a plain "Chelsea win the Premier League" would not be).
const TITLE_MILESTONES = [
  { label: "Manchester United win the first Premier League title", year: 1993 }, { label: "Blackburn Rovers win their only Premier League title", year: 1995 },
  { label: "Arsenal win their first Premier League title", year: 1998 }, { label: "Deportivo La Coruña win their only La Liga title", year: 2000 },
  { label: "Arsenal's 'Invincibles' go the league season unbeaten", year: 2004 }, { label: "Chelsea win their first Premier League title", year: 2005 },
  { label: "Lyon win a seventh Ligue 1 title in a row", year: 2008 }, { label: "VfL Wolfsburg win their only Bundesliga title", year: 2009 },
  { label: "Montpellier win their only Ligue 1 title", year: 2012 }, { label: "Atlético Madrid win La Liga under Diego Simeone for the first time", year: 2014 },
  { label: "Leicester City win the Premier League as 5000–1 outsiders", year: 2016 }, { label: "Juventus win a ninth Serie A title in a row", year: 2020 },
  { label: "Napoli win their first Serie A title since 1990", year: 2023 }, { label: "Bayer Leverkusen win an unbeaten Bundesliga title", year: 2024 },
];
add("leagues", "Competition Winner Timelines", "Advanced", "order", "Order famous title wins chronologically.", orderRounds(TITLE_MILESTONES, S("D18"), 3, 4).map((q) => ({ ...q, source: F.REF.pl })));
add("leagues", "League Club Identification", "Beginner", "mc", "Which country's league does each club play in?", clubAttr("country")([1, 2], S("D19")));
add("leagues", "European Finals: Europa League", "Advanced", "mc", "Who lost each Europa League final?", clubFinalRunner(F.UEL, "Europa League", F.REF.uel)([2, 3, 4], S("D20")));
add("leagues", "Famous League Managers", "Intermediate", "mc", "Which manager achieved each feat?", managerFamous([1, 2], S("D21")));
add("leagues", "Famous League Managers: Expert", "Expert", "type", "Type the manager behind the achievement.", managerFamousType([3, 4], S("D22")));
add("leagues", "Indian Domestic Football", "Intermediate", "mc", "Indian Super League champions.", finalsWinner(F.ISL, "Indian Super League final", F.REF.isl, F.ISL.flatMap((r) => [r.winner, r.runnerUp]))("Intermediate", S("D23")));
add("leagues", "Football Competitions Worldwide", "Advanced", "mc", "Libertadores, MLS Cup and AFC Champions League winners.", sample(all(finalsWinner(F.LIBERTADORES, "Copa Libertadores", F.REF.libertadores, F.LIBERTADORES.flatMap((r) => [r.winner, r.runnerUp]))([2, 3], "D24a", 4), finalsWinner(F.MLS_CUP, "MLS Cup", F.REF.mls, F.MLS_CUP.flatMap((r) => [r.winner, r.runnerUp]))([3], "D24b", 3), finalsWinner(F.ACL, "AFC Champions League", F.REF.acl, F.ACL.flatMap((r) => [r.winner, r.runnerUp]))([4], "D24c", 3)), 10, "D24"));
add("leagues", "Copa Libertadores Finals", "Advanced", "mc", "Who lost each Libertadores final?", finalsRunner(F.LIBERTADORES, "Copa Libertadores", F.REF.libertadores, F.LIBERTADORES.flatMap((r) => [r.winner, r.runnerUp]).concat(["Boca Juniors", "Peñarol", "Independiente"]))([2, 3, 4], S("D25")));
add("leagues", "MLS Cup Finals", "Advanced", "mc", "Who lost each MLS Cup?", finalsRunner(F.MLS_CUP, "MLS Cup", F.REF.mls, F.MLS_CUP.flatMap((r) => [r.winner, r.runnerUp]))([2, 3], S("D26")));
add("leagues", "AFC Champions League History", "Expert", "mc", "Asia's continental champions.", finalsRunner(F.ACL, "AFC Champions League", F.REF.acl, F.ACL.flatMap((r) => [r.winner, r.runnerUp]))([3, 4], S("D27")));
add("leagues", "Champions League Final Years", "Advanced", "mc", "When did each final pairing happen?", finalsYear(F.UCL, "Champions League", F.REF.ucl)([1, 2], S("D29")));
add("leagues", "Mixed League Trivia", "Intermediate", "survival", "Champions from five leagues — three lives.", sample(all(champs(F.PL_CHAMPS, "Premier League", F.REF.pl)([2], "D28a", 4), champs(F.LIGA_CHAMPS, "La Liga", F.REF.liga)([1, 2], "D28b", 4), champs(F.SERIEA_CHAMPS, "Serie A", F.REF.serieA)([1, 2], "D28c", 3), champs(F.BULI_CHAMPS, "Bundesliga", F.REF.buli)([1, 2], "D28d", 3)), 14, "D28"));

// ===== E. Transfers & Careers =====
add("transfers", "Guess the Transfer", "Beginner", "mc", "The biggest moves of the modern era.", transferTo((t) => t.type === "permanent")("Beginner", S("E1")));
add("transfers", "Guess the Transfer: Deep Cuts", "Advanced", "mc", "Less famous permanent transfers.", transferTo((t) => t.type === "permanent")([3, 4], S("E2")));
add("transfers", "Match Players to Former Clubs", "Intermediate", "match", "Who did each player leave?", matchRounds(F.TRANSFERS.filter((t) => t.type === "permanent").map((t) => [`${t.player} (${t.year})`, t.from]), S("E3"), 3, 4, F.REF.careers));
add("transfers", "Transfer Timeline", "Advanced", "order", "Put the transfers in date order.", orderRounds(F.TRANSFERS.map((t) => ({ label: `${t.player}: ${t.from} → ${t.to}`, year: t.year })), S("E4"), 3, 5).map((q) => ({ ...q, source: F.REF.careers })));
add("transfers", "Loan Move History", "Advanced", "mc", "Famous loan spells (loans only — not permanent deals).", transferTo((t) => t.type === "loan")("Advanced", S("E5")));
add("transfers", "Famous Free Transfers", "Intermediate", "mc", "Big names who moved for no fee.", transferTo((t) => t.type === "free")("Intermediate", S("E6")));
add("transfers", "Permanent, Free or Loan?", "Intermediate", "mc", "Identify the type of each move.", transferType("Intermediate", S("E7")));
add("transfers", "Transfer Destination Challenge", "Intermediate", "type", "Type the club each player joined.", transferTo(() => true, true)([1, 2], S("E8")));
add("transfers", "Identify the Next Club", "Advanced", "mc", "Where did each player go next?", nextClub("Advanced", S("E9")));
add("transfers", "Career Journey Identification", "Intermediate", "mc", "Spot the player from his club path.", careerPath(() => true, false)("Beginner", S("E10")));
add("transfers", "Players Who Returned to Former Clubs", "Intermediate", "mc", "Which club did they go back to?", returnedTo("Intermediate", S("E11")));
add("transfers", "Manager Career Journeys", "Intermediate", "mc", "Which club has each manager led?", managerClub("Intermediate", S("E12")));
add("transfers", "Legendary Managerial Careers", "Advanced", "mc", "Two clubs, one manager.", managerTwoClubs("Advanced", S("E13")));
add("transfers", "Match Managers to Nationalities", "Intermediate", "match", "Pair each manager with his country.", matchRounds(F.MANAGERS.map((m) => [m.name, m.nation]), S("E14"), 3, 4, F.REF.managers));
add("transfers", "Retired Player Timelines", "Advanced", "order", "Order retired players' clubs correctly.", careerOrder((p) => p.retired)("Advanced", S("E15")));
add("transfers", "Historic Transfer Stories", "Advanced", "mc", "Whose transfer had this story?", transferStory("Advanced", S("E16")));
add("transfers", "Transfers by Year", "Advanced", "mc", "When did each move happen?", transferYear([2, 3], S("E17")));
add("transfers", "Multi-Club Careers", "Expert", "type", "Three clubs — name the player who played for all of them.", threeClubs([2, 3], S("E18")));
add("transfers", "Academy-to-First-Team Stories", "Intermediate", "mc", "Where did each player start?", firstClub("Intermediate", S("E19")));
add("transfers", "Final Club Before Retirement", "Advanced", "mc", "Where did the legends hang up their boots?", lastClub("Advanced", S("E20")));
add("transfers", "Transfer Detective", "Expert", "clues", "Year, type, selling club, buying club — who was it?", transferClues([2, 3, 4], S("E21")));
add("transfers", "Mixed Transfer Detective", "Intermediate", "survival", "Transfers of every kind — three lives.", sample(all(transferTo(() => true)([1, 2], "E22a"), transferFrom([1, 2], "E22b"), transferType([1, 2], "E22c", 5)), 15, "E22"));
add("transfers", "Transfer Sprint", "Intermediate", "timed", "60 seconds of transfer questions.", sample(all(transferFrom([2, 3], "E23a"), transferStory([1, 2], "E23b")), 16, "E23"));
add("transfers", "Selling Clubs", "Beginner", "mc", "Which club did each star leave?", transferFrom("Beginner", S("E24")));
add("transfers", "Players Who Moved Between Leagues", "Advanced", "mc", "Which country did each player move to?", F.TRANSFERS.filter((t) => { const a = F.CLUBS.find((c) => c.club === t.from); const b = F.CLUBS.find((c) => c.club === t.to); return a && b && a.country !== b.country; }).slice(0, 10).map((t) => { const b = F.CLUBS.find((c) => c.club === t.to)!; return mc(`When ${t.player} left ${t.from} for ${t.to} in ${t.year}, which country did he move to?`, b.country, F.CLUBS.map((c) => c.country), "E25" + t.player, { season: yr(t.year), source: F.REF.careers, explanation: `${t.to} play in ${b.country}.` }); }));

// ===== F. Matches & Moments =====
add("matches", "Iconic Finals", "Beginner", "mc", "Which team was behind each famous final?", momentAnswer((m) => !isPerson(m.answer))("Beginner", S("F1")));
add("matches", "Identify the Match from Clues", "Intermediate", "mc", "Name the famous moment from its description.", momentTitle("Intermediate", S("F2")));
add("matches", "Historic Scoreline Identification", "Advanced", "mc", "World Cup final scores.", wcScore([1, 2], S("F3")));
add("matches", "Historic Scorelines: European Cup", "Expert", "mc", "Scores of classic European Cup finals.", clubFinalScore(F.UCL, "European Cup", F.REF.ucl)([3, 4], S("F4")));
add("matches", "Famous Comebacks", "Intermediate", "mc", "Teams that turned games upside down.", momentAnswer(isComeback)([1, 2, 3], S("F5")));
add("matches", "Legendary Goals", "Intermediate", "mc", "Who scored FIFA's goal of the year?", puskasMc([1, 2], S("F6")).map((q) => ({ ...q, prompt: q.prompt.replace("Who won the", "Whose goal won the") })));
add("matches", "Club Football Drama", "Advanced", "type", "Type the club behind each famous club-football moment.", momentAnswer((m) => !isPerson(m.answer) && m.lvl >= 2 && !/World Cup|Euro/.test(m.competition), true)([2, 3], S("F7")).map((q) => ({ ...q, prompt: `Type the club: ${q.prompt.replace(/\. Who\?$/, "")}.` })));
add("matches", "Match-to-Season Identification", "Advanced", "mc", "In which year did each moment happen?", momentYear("Advanced", S("F8")));
add("matches", "Famous Penalty Shootouts", "Intermediate", "mc", "Finals settled from the spot.", penaltyFinals([1, 2, 3], S("F9")));
add("matches", "Historic Derbies: Name the Rival", "Expert", "type", "Type the derby opponent.", pick(F.DERBIES, [3, 4], 8, "F10").map((r) => ({ prompt: `In ${theDerby(r.name)}, ${r.a} face which club?`, answer: r.b, accept: clubAccept(r.b), season: "Historic", source: F.REF.derby, explanation: `${r.a} v ${r.b}.`, lvl: r.lvl })));
add("matches", "Match Events in Order", "Advanced", "order", "Arrange famous moments chronologically.", orderRounds(F.MOMENTS.map((m) => ({ label: m.title, year: m.year })), S("F11"), 3, 5).map((q) => ({ ...q, source: F.REF.moments })));
add("matches", "Title-Deciding Moments", "Intermediate", "mc", "Which club won the title described?", titleNotes([1, 2], S("F12")));
add("matches", "European Competition Moments", "Intermediate", "mc", "Champions League and Europa League drama.", momentAnswer((m) => ["Champions League", "Europa League"].includes(m.competition) && !isComeback(m))([1, 2, 3], S("F13")));
add("matches", "World Cup Moments", "Beginner", "mc", "Unforgettable World Cup scenes.", momentAnswer((m) => m.competition === "World Cup" && (isPerson(m.answer) ? m.lvl >= 2 : m.lvl === 1))([1, 2, 3], S("F14")));
add("matches", "Which Competition?", "Advanced", "mc", "Name the competition each famous moment happened in.", momentComp([1, 2, 3], S("F15")));
add("matches", "Domestic Cup Finals", "Advanced", "mc", "Who lost each FA Cup final?", clubFinalRunner(F.FA_CUP, "FA Cup", F.REF.facup)([2, 3], S("F16")));
add("matches", "Managerial Milestones", "Intermediate", "mc", "Coaches who won international tournaments.", coachMc([2, 3, 4], S("F17")));
add("matches", "Memorable Tournament Runs", "Advanced", "mc", "Beaten World Cup finalists from the early years.", wcRunner([3, 4], S("F18")));
add("matches", "Historic Women's Matches", "Intermediate", "mc", "Great moments in the women's game.", momentAnswer((m) => m.competition.startsWith("Women"))([1, 2], S("F19")));
add("matches", "Europa League Final Scores", "Advanced", "mc", "Scores of recent Europa League finals.", clubFinalScore(F.UEL, "Europa League", F.REF.uel)([1, 2, 3], S("F20")));
add("matches", "Champions League Final Scores", "Intermediate", "mc", "Scores of recent Champions League finals.", clubFinalScore(F.UCL, "Champions League", F.REF.ucl)([1, 2], S("F21")));
add("matches", "Legendary Performances", "Advanced", "type", "Type the player behind each iconic performance.", momentAnswer((m) => isPerson(m.answer) && m.lvl >= 2, true)([2, 3], S("F22")).map((q) => ({ ...q, prompt: `Type the player: ${q.prompt.replace(/\. Who\?$/, "")}.` })));
add("matches", "Mixed Match Trivia", "Intermediate", "survival", "Moments, scores and shootouts — three lives.", sample(all(momentTitle([1, 2], "F23a"), wcScore([1], "F23b", 4), penaltyFinals([1, 2], "F23c", 4)), 15, "F23"));
add("matches", "Speed Round: Moments", "Intermediate", "timed", "60 seconds of famous moments.", sample(all(momentAnswer(() => true)([1, 2], "F24a", 10), momentYear([1, 2], "F24b", 8)), 18, "F24"));
add("matches", "Libertadores & Beyond", "Advanced", "mc", "South American club football's biggest nights.", momentAnswer((m) => m.competition === "Copa Libertadores")([3], S("F25")).concat(finalsWinner(F.LIBERTADORES, "Copa Libertadores", F.REF.libertadores, F.LIBERTADORES.flatMap((r) => [r.winner, r.runnerUp]))([2, 3], "F25b", 5)));
add("matches", "Famous Moments: True or False", "Intermediate", "tf", "Is the right name attached to the moment?", momentTF("Intermediate", S("F26")));

// ===== G. Kits, Flags & Visuals =====
// Beginners get the most distinctive kits; plain look-alike shirts (all-red, all-white…) are for harder games.
add("images", "Club Kit Identification", "Beginner", "image", "Name the club from its drawn home kit.", kitMc("club", uniqueKit)([1, 2], S("G1")));
add("images", "Club Kit Identification: Plain Colours", "Advanced", "image", "Single-colour kits from around Europe.", kitMc("club", (c) => c.kit!.pattern === "solid")([2, 3, 4], S("G2")));
add("images", "Striped Kits", "Intermediate", "image", "Clubs famous for their stripes.", kitMc("club", (c) => c.kit!.pattern === "stripes")([2, 3, 4], S("G3")));
add("images", "National Flags", "Beginner", "image", "Identify national teams from their flags.", flagMc("team")([1, 2], S("G4")));
add("images", "National Flags: Expert", "Expert", "image", "Lesser-known flags of footballing nations.", flagMc("team")([3, 4], S("G5")));
// Typed recall (no options to recognise) over the distinctive kits the Beginner game doesn't use. The city is given because
// a kit alone isn't unique in the real world (Inter and Atalanta both wear blue-and-black stripes).
const G1_CLUBS = new Set(GAMES.find((g) => g.title === "Club Kit Identification")!.questions.map((q) => q.answer));
add("images", "Kit to Name (Typed)", "Expert", "type", "Type the club from the kit — no options to help.", kitMc("club", (c) => !G1_CLUBS.has(c.club), true)([1, 2, 3, 4], S("G6")).map((q) => ({ ...q, prompt: `This is the home kit of a club from ${F.CLUBS.find((c) => c.club === q.answer)!.city}. Type the club's name.` })));
add("images", "Match Kits to Clubs", "Intermediate", "match", "Pair clubs with their colours.", matchRounds(F.CLUBS.filter((c) => c.colours).map((c) => [c.club, c.colours!]), S("G7"), 3, 4, F.REF.kits));
add("images", "Progressive Visual Clues", "Advanced", "clues", "A kit plus clues — name the club.", clubClues([2, 3, 4], S("G8"), 8));
add("images", "Club and Stadium Matching", "Intermediate", "image", "Where does the club in this kit play?", kitMc("stadium")([1, 2], S("G9")));
add("images", "Kit Colour Nicknames", "Advanced", "image", "Name the nickname of the club in this kit.", kitMc("nickname")([1, 2, 3], S("G10")));
add("images", "Flags and Nicknames", "Intermediate", "image", "What is this flag's national team called?", flagMc("nickname")([1, 2, 3], S("G11")));
add("images", "Kits of Derby Rivals", "Advanced", "image", "Who are the rivals of the club in this kit?", kitMc("rival")([1, 2, 3], S("G12")));
add("images", "Kit to City", "Intermediate", "image", "Which city is the club in this kit from?", kitMc("city")([1, 2], S("G13")));
add("images", "Kit to Country", "Beginner", "image", "Which country's league is this kit from?", kitMc("country")([1, 2, 3], S("G14")));
add("images", "Mixed Image Identification", "Intermediate", "survival", "Kits and flags together — three lives.", sample(all(kitMc("city")([2, 3], "G17a", 6), flagMc("team")([2], "G17b", 6), kitMc("country")([3, 4], "G17c", 4)), 16, "G17"));
add("images", "Kit Eras: Classic Colours", "Advanced", "image", "Clubs whose colours are part of their identity.", kitMc("club", (c) => ["hoops", "halves", "band", "hband", "sleeves", "sash"].includes(c.kit!.pattern))([2, 3, 4], S("G18")));

// ===== H. Ultimate Trivia =====
const MIX_EASY = all(wcWinner([1], "Hm1"), champs(F.PL_CHAMPS, "Premier League", F.REF.pl)([1], "Hm2"), clubAttr("stadium")([1], "Hm3"), nicknameMc([1], "Hm4"), transferTo(() => true)([1], "Hm5"), momentAnswer(() => true)([1], "Hm6"));
const MIX_MID = all(wcBoot([2], "Hn1"), clubFinalWinner(F.UCL, "Champions League", F.REF.ucl)([2], "Hn2"), derbyName([2], "Hn3"), managerFamous([2], "Hn4"), finalsWinner(F.EUROS, "European Championship", F.REF.euro)([2], "Hn5"), coachMc([2], "Hn6"));
const MIX_HARD = all(awardNation([4], "Ho1", 4), clubFinalWinner(F.UCL, "European Cup", F.REF.ucl)([4], "Ho2"), ballonMc([4], "Ho3"), formerNames([4], "Ho4"), finalsWinner(F.ACL, "AFC Champions League", F.REF.acl, F.ACL.flatMap((r) => [r.winner, r.runnerUp]))([4], "Ho5"), nicknameMc([4], "Ho6"), finalsWinner(F.EUROS, "European Championship", F.REF.euro)([4], "Ho7"));
const MID = shuffle(MIX_MID, "MID"); const HARD = shuffle(MIX_HARD, "HARD");
add("ultimate", "Mixed Football Knowledge", "Intermediate", "mc", "A bit of everything.", MID.slice(0, 12));
add("ultimate", "Sixty-Second Survival", "Beginner", "timed", "How many can you answer in a minute?", sample(MIX_EASY, 20, "H2"));
add("ultimate", "Sudden Death", "Advanced", "elimination", "One mistake and you're out.", sample(all(derbyOpponent([3], "H3a", 4), playerNation([3], "H3b", 4), champs(F.LIGA_CHAMPS, "La Liga", F.REF.liga)([3], "H3c", 3), wcHost([3, 4], "H3d", 4), managerClub([3], "H3e", 5)), 20, "H3"));
add("ultimate", "Expert History", "Expert", "mc", "Deep football history.", HARD.slice(0, 12));
add("ultimate", "Perfect Score Challenge", "Advanced", "mc", "Ten questions. Only 10/10 counts as a win.", MID.slice(12, 22), { perfectRequired: true });
add("ultimate", "Daily Boss Battle", "Expert", "survival", "The hardest mix in the game — three lives.", HARD.slice(12).concat(ballonNation([4], "H6b", 4), wcScore([3, 4], "H6c", 4)));
add("ultimate", "Guess Ten Players in a Row", "Intermediate", "elimination", "Identify ten players without a mistake.", sample(all(playerClueMc((p) => !p.women, 0)([1, 2], "H7a"), playerClueMc((p) => !p.women, 2)([2, 3], "H7b")), 10, "H7"));
add("ultimate", "Manager Connections", "Advanced", "mc", "Which manager links both clubs?", managerTwoClubs([1, 2], S("H8")));
add("ultimate", "Football Knowledge Ladder", "Intermediate", "elimination", "Questions get harder as you climb. One slip ends the climb.", byLevel(sample(MIX_EASY, 5, "H9a").concat(sample(MIX_MID, 5, "H9b"), sample(MIX_HARD, 5, "H9c"))));
add("ultimate", "Endless Trivia", "Intermediate", "survival", "A long mixed run — three lives.", sample(MIX_EASY.concat(MIX_MID), 30, "H10"));
add("ultimate", "Speed Rounds", "Intermediate", "timed", "60 seconds of mid-level questions.", MID.slice(22, 42));
add("ultimate", "Mystery Player", "Advanced", "clues", "Progressive clues about players from every era.", playerClues(() => true)([2], S("H12"), 8));
add("ultimate", "Knockout Quiz", "Intermediate", "elimination", "International football, knockout style.", sample(all(finalsWinner(F.COPA, "Copa América", F.REF.copa)([1, 2], "H13a", 4), wcRunner([1], "H13b", 4), finalsRunner(F.EUROS, "European Championship", F.REF.euro)([1], "H13c", 4), ntNickMc([1], "H13d", 4)), 14, "H13"));
add("ultimate", "Football History Connections", "Advanced", "order", "Mixed events from 1930 to 2025 in order.", orderRounds([...F.WORLD_CUPS.map((w) => ({ label: `${w.winner} win the World Cup (${w.host})`, year: w.year })), ...F.MOMENTS.map((m) => ({ label: m.title, year: m.year + 0.5 }))].map((e) => ({ ...e, year: Math.floor(e.year) === e.year ? e.year : Math.floor(e.year) })), S("H14"), 3, 5));
add("ultimate", "Final Whistle Challenge", "Intermediate", "tf", "True or false across all football.", TF_OTHER.filter((_, i) => i % 2 === 0));
add("ultimate", "International Football Trivia", "Intermediate", "survival", "International questions — three lives.", sample(all(wcHost([1, 2], "H16a", 3), wcBall([1, 2], "H16b", 2), finalsWinner(F.WOMENS_WC, "Women's World Cup", F.REF.wwc)([1, 2], "H16c", 2), ntNickMc([2], "H16d", 3), finalsWinner(F.AFCON, "Africa Cup of Nations", F.REF.afcon)([1], "H16e", 2), finalsWinner(F.COPA, "Copa América", F.REF.copa)([1], "H16f", 2), finalsHost(F.EUROS, "European Championship", F.REF.euro)([1], "H16g", 2)), 16, "H16"));
add("ultimate", "Domestic Football Trivia", "Intermediate", "survival", "League and cup questions — three lives.", sample(all(champs(F.LIGA_CHAMPS, "La Liga", F.REF.liga)([2, 3], "H17a", 4), clubFinalWinner(F.FA_CUP, "FA Cup", F.REF.facup)([2, 3], "H17b", 4), boot([2, 3], "H17c", 4), champs(F.BULI_CHAMPS, "Bundesliga", F.REF.buli)([2, 3, 4], "H17d", 3)), 15, "H17"));
add("ultimate", "Transfer Detective Rounds", "Advanced", "timed", "60 seconds of transfer facts.", sample(all(transferYear([1, 2], "H18a"), transferType([2, 3], "H18b", 6)), 16, "H18"));
add("ultimate", "Famous Football Moments", "Advanced", "tf", "True or false: who did what?", momentTF([2, 3], S("H19")));
add("ultimate", "Legendary Clubs", "Beginner", "mc", "Stadiums, cities and nicknames of the giants.", sample(all(clubAttr("city")([1], "H20a", 5), clubAttr("nickname")([1], "H20b", 5)), 10, "H20"));
add("ultimate", "Tournament Knowledge", "Advanced", "type", "Type the winner of each tournament.", sample(all(pick(F.EUROS, [1, 2], 5, "H21a").map((r) => ({ prompt: `Who won the European Championship in ${yr(r.year)}?`, answer: r.winner, accept: [], season: yr(r.year), source: F.REF.euro, explanation: `${r.winner} beat ${r.runnerUp}.` })), pick(F.COPA, [1, 2], 4, "H21b").map((r) => ({ prompt: `Who won the Copa América in ${yr(r.year)}?`, answer: r.winner, accept: [], season: yr(r.year), source: F.REF.copa, explanation: `${r.winner} beat ${r.runnerUp}.` }))), 9, "H21"));
add("ultimate", "Historic Player Connections", "Intermediate", "match", "Pair legends with their nicknames.", matchRounds(F.NICKNAMES.map((n) => [n.player, n.nick]), S("H22"), 3, 4, F.REF.careers));
add("ultimate", "Football True or False", "Beginner", "tf", "Quick-fire true or false.", TF_OTHER.filter((_, i) => i % 2 === 1));
add("ultimate", "Progressive Clue Quizzes", "Intermediate", "clues", "Players and clubs, one clue at a time.", sample(all(playerClues((p) => !p.women)([1, 2], "H24a", 4), clubClues([2, 3], "H24b", 4)), 8, "H24"));
add("ultimate", "Ultimate Mixed Challenge", "Expert", "mc", "Fifteen of the hardest questions in the game.", sample(all(wcRunner([4], "H25a", 3), clubFinalScore(F.UCL, "European Cup", F.REF.ucl)([4], "H25b", 3), uclVenue([3, 4], "H25c", 3), historicGround([4], "H25d", 3), transferStory([4], "H25e", 3)), 15, "H25"));
add("ultimate", "World Cup Award Winners by Nation", "Advanced", "elimination", "Golden Boot and Golden Ball winners — which country? One mistake ends it.", awardNation([1, 2, 3, 4], S("H26"), 14));

export { GAMES };
export const GAME_BY_ID = new Map(GAMES.map((g) => [g.id, g]));
export const categoryName = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)!.name;
