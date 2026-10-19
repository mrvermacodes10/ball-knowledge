import { ArrowRight, Award, Flame, Gamepad2, Shuffle, Star } from "lucide-react";
import { CATEGORIES, GAMES, GAME_BY_ID, ENGINES, rng } from "../data/games";
import { achievements, active, dailyGameId, levelInfo, playCounts, recentGames, streak, today, totalXp, useStore } from "../lib/store";
import { DiffTag, GameRow } from "../components/GameCard";


export default function Home() {
  const s = useStore(); const p = active(s);
  const xp = totalXp(p); const lv = levelInfo(xp);
  const daily = GAME_BY_ID.get(dailyGameId())!; const done = p.dailyClaimed.includes(today());
  const ach = achievements(p); const recent = recentGames(p, 5);
  // A game you haven't played yet (any game once you've played them all). Seeded by date and games played, so it changes after each game.
  const played = playCounts(p); const fresh = GAMES.filter((g) => !played.has(g.id)); const pool = fresh.length ? fresh : GAMES;
  const surprise = pool[Math.floor(rng(today() + p.results.length)() * pool.length)];
  const picks = CATEGORIES.map((c) => GAMES.find((g) => g.category === c.id && g.difficulty === "Beginner") ?? GAMES.find((g) => g.category === c.id)).slice(0, 6);
  return (
    <div className="grid-2">
      <section className="stack">
        <div className="card featured">
          <span className="eyebrow gold">Today's featured challenge</span>
          <h1>{daily.title}</h1>
          <p className="muted">{daily.description} {ENGINES[daily.engine]} · {daily.questions.length} {daily.engine === "match" || daily.engine === "order" ? "rounds" : "questions"}.</p>
          <div className="row gap wrap-row">
            <DiffTag d={daily.difficulty} />
            <span className="tag">{done ? "Daily bonus claimed" : "+50 XP daily bonus"}</span>
          </div>
          <div className="row gap wrap-row" style={{ marginTop: 18 }}>
            <a className="btn primary" href={`#/game/${daily.id}`}>{done ? "Play again" : "Start challenge"} <ArrowRight size={16} /></a>
            <a className="btn ghost" href="#/explore">Browse all {GAMES.length} games</a>
            <a className="btn ghost" href={`#/game/${surprise.id}`} title={surprise.title}><Shuffle size={15} /> Random game</a>
          </div>
        </div>
        <div className="stats-row">
          <div className="card stat"><Star size={16} /><div className="num">Lv {lv.level}</div><div className="muted small">{lv.into}/{lv.per} XP to next</div><div className="bar"><div style={{ width: `${(lv.into / lv.per) * 100}%` }} /></div></div>
          <div className="card stat"><Flame size={16} /><div className="num">{streak(p)}</div><div className="muted small">day streak</div></div>
          <div className="card stat"><Gamepad2 size={16} /><div className="num">{p.results.length}</div><div className="muted small">games completed</div></div>
          <div className="card stat"><Award size={16} /><div className="num">{ach.filter((a) => a.done).length}/{ach.length}</div><div className="muted small">achievements</div></div>
        </div>
        <div className="card">
          <div className="section-head"><h2>Recent results</h2><a href="#/profile" className="small">Profile</a></div>
          {p.results.length === 0 ? <p className="muted">No games played yet. Start with today's challenge or pick a game on the right.</p> : (
            <div className="list">{[...p.results].reverse().slice(0, 5).map((r, k) => { const g = GAME_BY_ID.get(r.gameId); return g && (
              <div key={k} className="list-row"><span><b>{g.title}</b><span className="muted small"> · {new Date(r.date).toLocaleDateString()}</span></span><span className="strong">{Math.round((r.points / r.max) * 100)}% · +{r.xp + r.dailyBonus} XP</span></div>); })}</div>
          )}
        </div>
      </section>
      <aside className="stack">
        <div className="card">
          <div className="section-head"><h2>Categories</h2><a href="#/explore" className="small">Explore</a></div>
          <div className="list">{CATEGORIES.map((c) => (
            <a key={c.id} className="list-row link" href={`#/explore?cat=${c.id}`}><span><b>{c.name}</b><br /><span className="muted small">{c.blurb}</span></span><span className="count">{GAMES.filter((g) => g.category === c.id).length}</span></a>
          ))}</div>
        </div>
        <div className="card">
          <div className="section-head"><h2>{recent.length ? "Jump back in" : "Good places to start"}</h2></div>
          <div className="list">{(recent.length ? recent : picks).map((g) => <GameRow key={g!.id} g={g!} />)}</div>
        </div>
      </aside>
    </div>
  );
}
