import { useState } from "react";
import { ArrowLeft, Check, Play, RotateCcw, Share2, SkipForward } from "lucide-react";
import { ENGINES, GAMES, GAME_BY_ID, categoryName } from "../data/games";
import { active, achievements, decodeChallenge, encodeChallenge, personalBests, playedToday, recordResult, saveFriendResult, useStore, type FriendResult, type Result } from "../lib/store";
import { xpFor } from "../lib/scoring";
import Player, { type Summary } from "../components/Player";
import { fmt, secs } from "../lib/format";
import { DiffTag } from "../components/GameCard";


/** Compares two challenge results: higher score fraction wins, then the faster time. */
function verdict(me: { points: number; max: number; ms: number }, them: { points: number; max: number; ms: number }) {
  const a = me.points / me.max, b = them.points / them.max;
  if (a !== b) return a > b ? "won" : "lost";
  return me.ms === them.ms ? "draw" : me.ms < them.ms ? "won" : "lost";
}

export default function GamePage({ id, challenge }: { id: string; challenge: string | null }) {
  const g = GAME_BY_ID.get(id);
  const s = useStore(); const p = active(s);
  const [phase, setPhase] = useState<"intro" | "play" | "done">("intro");
  const [run, setRun] = useState(0);
  const [res, setRes] = useState<{ r: Result; s: Summary; ach: string[]; repeat: boolean; friend?: FriendResult } | null>(null);
  const [share, setShare] = useState<"idle" | "copied" | "manual">("idle");
  if (!g) return <div className="card empty"><h2>Game not found</h2><p className="muted">That game doesn't exist. It may have been renamed.</p><a className="btn primary" href="#/explore">Explore games</a></div>;
  const ch = challenge ? decodeChallenge(challenge) : null;
  const best = personalBests(p).get(g.id);
  const sameCat = GAMES.filter((x) => x.category === g.category);
  const nextGame = sameCat[(sameCat.indexOf(g) + 1) % sameCat.length];
  const unit = g.engine === "match" || g.engine === "order" ? "rounds" : "questions";

  const start = () => { setRes(null); setShare("idle"); setRun((r) => r + 1); setPhase("play"); window.scrollTo(0, 0); };
  const finish = (sm: Summary) => {
    const repeat = playedToday(g.id, p);
    const xp = xpFor(sm.points / sm.max, sm.answered, g.difficulty, repeat);
    const { result, newAchievements } = recordResult({ gameId: g.id, points: sm.points, max: sm.max, correct: sm.correct, answered: sm.answered, bestRun: sm.bestRun, ms: sm.ms, xp, category: g.category, difficulty: g.difficulty, won: sm.won });
    const friend = ch && challenge ? saveFriendResult(challenge, ch, { points: sm.points, max: sm.max, ms: sm.ms }) : undefined;
    setRes({ r: result, s: sm, ach: newAchievements, repeat, friend }); setPhase("done");
  };
  const link = res ? `${location.origin}${location.pathname}#/challenge/${encodeChallenge({ g: g.id, n: p.name, p: res.s.points, m: res.s.max, t: res.s.ms, d: res.r.date.slice(0, 10) })}` : "";
  const copy = async () => { try { await navigator.clipboard.writeText(link); setShare("copied"); } catch { setShare("manual"); } };
  const achNames = achievements(p);
  const counted = res?.friend?.mine; // the attempt that counts against the friend (your first one)

  return (
    <div className="stack narrow">
      <a href="#/explore" className="back"><ArrowLeft size={15} /> All games</a>
      <div className="game-head">
        <span className="eyebrow">{categoryName(g.category)}</span>
        <h1>{g.title}</h1>
        <div className="row gap wrap-row"><DiffTag d={g.difficulty} /><span className="tag">{ENGINES[g.engine]}</span><span className="tag">{g.questions.length} {unit}</span>{g.perfectRequired && <span className="tag gold">Perfect score required</span>}</div>
      </div>
      {ch && phase !== "done" && <div className="banner-card">⚔️ <b>{ch.n}</b> challenged you: {fmt(ch.p)}/{fmt(ch.m)} in {secs(ch.t)}. Beat it!</div>}

      {phase === "intro" && (
        <div className="panel">
          <p>{g.description}</p>
          <h3>How to play</h3>
          <p className="muted">{g.instructions}</p>
          {best && <p className="muted small">Your best: {Math.round((best.points / best.max) * 100)}% in {secs(best.ms)}.</p>}
          <button className="btn primary big" onClick={start} autoFocus><Play size={16} /> Start game</button>
        </div>
      )}
      {phase === "play" && <Player key={run} game={g} onFinish={finish} />}
      {phase === "done" && res && (
        <div className="panel results" role="region" aria-label="Results">
          <span className="eyebrow gold">Full time</span>
          <h2>{resultHeadline(g.engine, res.s, g.perfectRequired)}</h2>
          <div className="result-grid">
            <div><div className="num">{fmt(res.s.points)}/{fmt(res.s.max)}</div><div className="muted small">score</div></div>
            {unit === "rounds"
              ? <div><div className="num">{Math.round((res.s.points / res.s.max) * 100)}%</div><div className="muted small">items correct · {res.s.correct} of {res.s.answered} rounds perfect</div></div>
              : <div><div className="num">{res.s.answered ? Math.round((res.s.correct / res.s.answered) * 100) : 0}%</div><div className="muted small">accuracy · {res.s.correct} of {res.s.answered} correct{res.s.answered < g.questions.length ? ` (${g.questions.length - res.s.answered} not reached)` : ""}</div></div>}
            <div><div className="num">{secs(res.s.ms)}</div><div className="muted small">time</div></div>
            <div><div className="num">+{res.r.xp + res.r.dailyBonus}</div><div className="muted small">XP{res.r.dailyBonus ? " (incl. daily bonus)" : res.repeat ? " (half XP: replayed today)" : ""}</div></div>
          </div>
          {res.ach.length > 0 && <div className="banner-card">🏅 Achievement unlocked: {res.ach.map((a) => achNames.find((x) => x.id === a)?.name).join(", ")}</div>}
          {ch && counted && (() => { const v = verdict(counted, { points: ch.p, max: ch.m, ms: ch.t }); return (
            <div className="banner-card">{v === "won" ? `🏆 You beat ${ch.n}!` : v === "draw" ? "It's a draw." : `${ch.n} wins this one.`} You: {fmt(counted.points)}/{fmt(counted.max)} in {secs(counted.ms)} · {ch.n}: {fmt(ch.p)}/{fmt(ch.m)} in {secs(ch.t)}
              {counted.points !== res.s.points || counted.ms !== res.s.ms ? <span className="muted small"> (your first attempt counts)</span> : null}</div>); })()}
          <div className="row gap wrap-row">
            <button className="btn primary" onClick={start}><RotateCcw size={15} /> Replay</button>
            <a className="btn ghost" href={`#/game/${nextGame.id}`}><SkipForward size={15} /> Next game</a>
            <button className="btn ghost" onClick={copy}>{share === "copied" ? <><Check size={15} /> Link copied</> : <><Share2 size={15} /> Challenge a friend</>}</button>
          </div>
          {share === "manual" && (
            <label className="stack" style={{ gap: 6 }}><span className="small">Copying isn't available here. Select and copy this link:</span>
              <input readOnly value={link} onFocus={(e) => e.currentTarget.select()} autoFocus aria-label="Challenge link" /></label>
          )}
          <p className="muted small">Challenge links carry your score inside the link. Your friend plays the same questions in the same order, then sees the comparison. Scores aren't verified by a server.</p>
        </div>
      )}
    </div>
  );
}

function resultHeadline(engine: string, s: Summary, perfectRequired?: boolean) {
  if (perfectRequired) return s.won ? "Perfect — challenge complete!" : "So close — only a perfect score wins this one.";
  if (engine === "elimination") return s.won ? "Flawless — you survived sudden death!" : `Knocked out after ${s.answered} question${s.answered === 1 ? "" : "s"}.`;
  if (engine === "survival") return s.won ? "You survived to the final whistle!" : `Out of lives after ${s.answered} question${s.answered === 1 ? "" : "s"}.`;
  if (engine === "timed") return `${s.correct} correct in 60 seconds.`;
  return s.won ? "Well played." : "Tough one. Have another go.";
}
