import { useState } from "react";
import { CalendarCheck, Flame } from "lucide-react";
import { ENGINES, GAME_BY_ID } from "../data/games";
import { DAILY_BONUS, active, bestStreak, dailyGameId, streak, today, useStore } from "../lib/store";
import { DiffTag } from "../components/GameCard";

const shift = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export default function Daily() {
  const s = useStore(); const p = active(s);
  const g = GAME_BY_ID.get(dailyGameId())!; const done = p.dailyClaimed.includes(today());
  const [week] = useState(() => Array.from({ length: 7 }, (_, k) => shift(k - 6)));
  const [dateLabel] = useState(() => new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }));
  return (
    <div className="grid-2">
      <section className="panel">
        <span className="eyebrow gold">Daily Challenge · {dateLabel}</span>
        <h1>{g.title}</h1>
        <p className="muted">{g.description}</p>
        <div className="row gap wrap-row"><DiffTag d={g.difficulty} /><span className="tag">{ENGINES[g.engine]}</span></div>
        <p>{done ? <><CalendarCheck size={16} /> Completed today. The {DAILY_BONUS} XP bonus has been added. You can replay for practice.</> : <>Finish today's game (answering at least one question) to earn a <b>{DAILY_BONUS} XP bonus</b> and keep your streak going. Your score doesn't affect the bonus.</>}</p>
        <a className="btn primary big" href={`#/game/${g.id}`}>{done ? "Play again" : "Play today's challenge"}</a>
        <p className="muted small">Everyone gets the same game on the same date. A new one is picked at midnight, local time. Streaks count consecutive days with a completed daily challenge.</p>
      </section>
      <aside className="stack">
        <div className="card stat"><Flame size={16} /><div className="num">{streak(p)}</div><div className="muted small">current streak · best {bestStreak(p)}</div></div>
        <div className="card">
          <div className="section-head"><h2>Last 7 days</h2></div>
          <div className="week">{week.map((d) => <div key={d} className={`day ${p.dailyClaimed.includes(d) ? "on" : ""}`}><span>{new Date(d + "T12:00").toLocaleDateString(undefined, { weekday: "short" })}</span><b>{p.dailyClaimed.includes(d) ? "✓" : "–"}</b></div>)}</div>
        </div>
        <div className="card"><div className="section-head"><h2>Coming up</h2></div><p className="muted small">Tomorrow: {GAME_BY_ID.get(dailyGameId(shift(1)))!.title}</p></div>
      </aside>
    </div>
  );
}
