import { GAME_BY_ID } from "../data/games";
import { decodeChallenge, useStore } from "../lib/store";
import { fmt, secs } from "../lib/format";

export default function ChallengePage({ code }: { code: string }) {
  const s = useStore();
  const c = decodeChallenge(code);
  if (!c) return <div className="card empty"><h2>That challenge link doesn't work</h2><p className="muted">It may have been cut off when it was copied. Ask your friend to send it again.</p><a className="btn primary" href="#/explore">Explore games</a></div>;
  const g = GAME_BY_ID.get(c.g)!;
  const mine = s.friends.find((f) => f.code === code)?.mine;
  return (
    <div className="stack narrow">
      <div className="panel">
        <span className="eyebrow gold">Friend challenge</span>
        <h1>{c.n} challenged you</h1>
        <p><b>{g.title}</b> · {g.difficulty} · {g.questions.length} {g.engine === "match" || g.engine === "order" ? "rounds" : "questions"}</p>
        <p className="muted">{c.n} scored <b>{fmt(c.p)}/{fmt(c.m)}</b> in {secs(c.t)}{c.d ? ` on ${c.d}` : ""}. You'll get the same questions in the same order. Higher score wins; if scores are level, the faster time wins.</p>
        {mine && <div className="banner-card">You've already played this challenge: {fmt(mine.points)}/{fmt(mine.max)} in {secs(mine.ms)}. Your first attempt is the one that counts — you can still replay for practice.</div>}
        <a className="btn primary big" href={`#/game/${g.id}?challenge=${code}`}>{mine ? "Play again" : "Accept challenge"}</a>
        <p className="muted small">Scores travel inside the link and aren't verified by a server. There's no live matchmaking. Results you play appear on your Leaderboard page.</p>
      </div>
    </div>
  );
}
