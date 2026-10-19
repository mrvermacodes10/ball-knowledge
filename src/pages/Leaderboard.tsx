import { useState } from "react";
import { GAME_BY_ID } from "../data/games";
import { accuracy, levelInfo, totalXp, useStore, type Profile } from "../lib/store";
import { fmt, secs } from "../lib/format";

export default function Leaderboard() {
  const s = useStore();
  const [range, setRange] = useState<"all" | "week">("all");
  const [since] = useState(() => Date.now() - 7 * 86400000);
  const rows = s.profiles.map((p: Profile) => {
    const rs = range === "all" ? p.results : p.results.filter((r) => new Date(r.date).getTime() >= since);
    const xp = range === "all" ? totalXp(p) : rs.reduce((t, r) => t + r.xp + r.dailyBonus, 0);
    return { p, xp, level: levelInfo(totalXp(p)).level, games: rs.length, acc: accuracy(rs) };
  }).sort((a, b) => b.xp - a.xp);
  return (
    <div className="stack">
      <div className="page-head"><h1>Leaderboard</h1><p className="muted">Local leaderboard: the profiles saved on this device. Add more on the Profile page to compete with family or friends who share it. Scores aren't synced online.</p></div>
      <div className="seg"><button className={range === "all" ? "on" : ""} onClick={() => setRange("all")}>All-time</button><button className={range === "week" ? "on" : ""} onClick={() => setRange("week")}>Last 7 days</button></div>
      <div className="card table">
        <div className="tr th"><span>#</span><span>Player</span><span className="r">XP</span><span className="r hide-sm">Level</span><span className="r hide-sm">Games</span><span className="r">Accuracy</span></div>
        {rows.map((r, k) => (
          <div className={`tr ${r.p.id === s.activeId ? "me" : ""}`} key={r.p.id}>
            <span className="rank">{k + 1}</span><span className="strong">{r.p.avatar} {r.p.name}{r.p.id === s.activeId && <span className="muted small"> (you)</span>}</span>
            <span className="r strong">{r.xp.toLocaleString()}</span><span className="r hide-sm">{r.level}</span><span className="r hide-sm">{r.games}</span><span className="r">{r.acc === null ? "—" : `${Math.round(r.acc * 100)}%`}</span>
          </div>
        ))}
      </div>
      <div className="card">
        <div className="section-head"><h2>Friend challenge results</h2></div>
        {s.friends.length === 0 ? <p className="muted">No challenges yet. Finish any game and use “Challenge a friend” to send a link. Links you receive and play show up here.</p> : (
          <div className="table">
            <div className="tr th c5"><span>Game</span><span>Friend</span><span className="r">Their score</span><span className="r">Your score</span><span className="r">Result</span></div>
            {s.friends.map((f) => { const theirs = f.points / f.max; const mine = f.mine ? f.mine.points / f.mine.max : null; return (
              <div className="tr c5" key={f.code}><span>{GAME_BY_ID.get(f.gameId)?.title}</span><span className="strong">{f.name}</span><span className="r">{fmt(f.points)}/{fmt(f.max)} · {secs(f.ms)}</span>
                <span className="r">{f.mine ? `${fmt(f.mine.points)}/${fmt(f.mine.max)} · ${secs(f.mine.ms)}` : "not played"}</span>
                <span className="r strong">{mine === null ? "—" : mine > theirs || (mine === theirs && f.mine!.ms < f.ms) ? "Won" : mine === theirs && f.mine!.ms === f.ms ? "Draw" : "Lost"}</span></div>); })}
          </div>
        )}
      </div>
    </div>
  );
}
