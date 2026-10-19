import { Play } from "lucide-react";
import { ENGINES, categoryName, type Game } from "../data/games";
import type { Result } from "../lib/store";

export function DiffTag({ d }: { d: Game["difficulty"] }) { return <span className={`tag diff-${d.toLowerCase()}`}>{d}</span>; }

export default function GameCard({ g, best }: { g: Game; best?: Result }) {
  return (
    <a className="card game-card" href={`#/game/${g.id}`}>
      <div className="row between"><span className="eyebrow">{categoryName(g.category)}</span><DiffTag d={g.difficulty} /></div>
      <h3>{g.title}</h3>
      <p className="muted">{g.description}</p>
      <div className="row between card-foot">
        <span className="muted small">{ENGINES[g.engine]} · {g.questions.length} {g.engine === "match" || g.engine === "order" ? "rounds" : "questions"}{best ? ` · best ${Math.round((best.points / best.max) * 100)}%` : ""}</span>
        <span className="play-link"><Play size={14} /> Play</span>
      </div>
    </a>
  );
}

export function GameRow({ g, right }: { g: Game; right?: React.ReactNode }) {
  return (
    <a className="game-row" href={`#/game/${g.id}`}>
      <div><div className="strong">{g.title}</div><div className="muted small">{categoryName(g.category)} · {ENGINES[g.engine]}</div></div>
      <div className="row gap">{right}<DiffTag d={g.difficulty} /></div>
    </a>
  );
}
