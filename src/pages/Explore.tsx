import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { CATEGORIES, DIFFICULTIES, ENGINES, GAMES, categoryName, type Engine, type Game } from "../data/games";
import { active, personalBests, playCounts, recentGames, useStore } from "../lib/store";
import GameCard, { GameRow } from "../components/GameCard";

const DIFF_RANK = Object.fromEntries(DIFFICULTIES.map((d, i) => [d, i]));
const SORTS = { recommended: "Recommended", unplayed: "Not played yet", played: "Most played by you", easy: "Easiest first", hard: "Hardest first", az: "Title A–Z" } as const;
type Sort = keyof typeof SORTS;

export default function Explore({ query }: { query: URLSearchParams }) {
  const s = useStore(); const p = active(s);
  const [q, setQ] = useState(query.get("q") ?? "");
  const [cat, setCat] = useState(query.get("cat") ?? "all");
  const [diff, setDiff] = useState(query.get("diff") ?? "all");
  const [engine, setEngine] = useState(query.get("type") ?? "all");
  const [sort, setSort] = useState<Sort>((query.get("sort") as Sort) in SORTS ? (query.get("sort") as Sort) : "recommended");
  const counts = playCounts(p); const bests = personalBests(p); const recent = recentGames(p, 4);

  // Mirror filters in the URL (without adding history entries) so a refresh or shared link keeps them.
  useEffect(() => {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim()); if (cat !== "all") params.set("cat", cat); if (diff !== "all") params.set("diff", diff);
    if (engine !== "all") params.set("type", engine); if (sort !== "recommended") params.set("sort", sort);
    const next = `#/explore${params.size ? "?" + params : ""}`;
    if (window.location.hash !== next) history.replaceState(null, "", next);
  }, [q, cat, diff, engine, sort]);

  const term = q.trim().toLowerCase();
  const matches = (g: Game) => !term || [g.title, g.description, categoryName(g.category), ENGINES[g.engine]].some((t) => t.toLowerCase().includes(term));
  const by: Record<Sort, (a: Game, b: Game) => number> = {
    recommended: () => 0,
    played: (a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0),
    easy: (a, b) => DIFF_RANK[a.difficulty] - DIFF_RANK[b.difficulty],
    hard: (a, b) => DIFF_RANK[b.difficulty] - DIFF_RANK[a.difficulty],
    az: (a, b) => a.title.localeCompare(b.title),
    unplayed: (a, b) => (counts.has(a.id) ? 1 : 0) - (counts.has(b.id) ? 1 : 0),
  };
  const list = GAMES.filter((g) => (cat === "all" || g.category === cat) && (diff === "all" || g.difficulty === diff) && (engine === "all" || g.engine === engine) && matches(g)).sort(by[sort]);
  const filtered = q || cat !== "all" || diff !== "all" || engine !== "all";
  const clear = () => { setQ(""); setCat("all"); setDiff("all"); setEngine("all"); setSort("recommended"); };
  const playedHere = list.filter((g) => counts.has(g.id)).length;

  return (
    <div className="stack">
      <div className="page-head"><h1>Explore games</h1><p className="muted">{GAMES.length} playable games across {CATEGORIES.length} categories and {Object.keys(ENGINES).length} game types.</p></div>
      <div className="chips" role="group" aria-label="Category">
        <button className={`chip-btn ${cat === "all" ? "on" : ""}`} onClick={() => setCat("all")} aria-pressed={cat === "all"}>All <span>{GAMES.length}</span></button>
        {CATEGORIES.map((c) => (
          <button key={c.id} className={`chip-btn ${cat === c.id ? "on" : ""}`} onClick={() => setCat(c.id)} aria-pressed={cat === c.id}>{c.name} <span>{GAMES.filter((g) => g.category === c.id).length}</span></button>
        ))}
      </div>
      <div className="card filters">
        <label className="search"><Search size={16} aria-hidden /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search titles, categories or game types…" aria-label="Search games" type="search" /></label>
        <select value={diff} onChange={(e) => setDiff(e.target.value)} aria-label="Difficulty"><option value="all">All difficulties</option>{DIFFICULTIES.map((d) => <option key={d}>{d}</option>)}</select>
        <select value={engine} onChange={(e) => setEngine(e.target.value)} aria-label="Game type"><option value="all">All game types</option>{(Object.keys(ENGINES) as Engine[]).map((k) => <option key={k} value={k}>{ENGINES[k]}</option>)}</select>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">{(Object.keys(SORTS) as Sort[]).map((k) => <option key={k} value={k}>Sort: {SORTS[k]}</option>)}</select>
      </div>
      {recent.length > 0 && !filtered && (
        <div className="card"><div className="section-head"><h2>Recently played</h2></div><div className="list two-col">{recent.map((g) => <GameRow key={g.id} g={g} />)}</div></div>
      )}
      <div className="row between wrap-row gap">
        <span className="muted" aria-live="polite">{list.length} game{list.length === 1 ? "" : "s"}{list.length ? ` · ${playedHere} played` : ""}</span>
        {filtered && <button className="btn ghost small" onClick={clear}>Clear filters</button>}
      </div>
      {list.length === 0 ? (
        <div className="card empty"><h3>No games match those filters</h3><p className="muted">Try a different search term or clear the filters.</p><button className="btn primary" onClick={clear}>Clear filters</button></div>
      ) : <div className="cards">{list.map((g) => <GameCard key={g.id} g={g} best={bests.get(g.id)} />)}</div>}
    </div>
  );
}
