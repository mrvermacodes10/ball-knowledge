import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, Clock, Heart, Lightbulb, X } from "lucide-react";
import type { Game, Question } from "../data/games";
import { shuffle } from "../data/games";
import { hintFor, isCorrect, normalise } from "../lib/answers";
import {
  TIMED_SECONDS, applyOutcome, isOver, newTally, scoreClues, scoreMatch, scoreOption, scoreOrder, scoreTyped, startingLives, summarise,
  type Outcome, type Summary,
} from "../lib/scoring";
import Visual from "./Visual";
import { fmt } from "../lib/format";

export type { Outcome, Summary };
/** What the player actually entered, so feedback can say "you answered …" for typed modes. */
type Answered = Outcome & { given?: string };

/** One reusable player for every engine. Each engine only changes the answer controls; scoring and end rules live in lib/scoring. */
export default function Player({ game, onFinish }: { game: Game; onFinish: (s: Summary) => void }) {
  const qs = game.questions;
  const lives0 = startingLives(game.engine);
  const timed = game.engine === "timed";
  const [i, setI] = useState(0);
  const [tally, setTally] = useState(() => newTally(game.engine));
  const [last, setLast] = useState<Answered | null>(null);
  const [flash, setFlash] = useState<{ ok: boolean; answer: string } | null>(null); // sprint mode: brief feedback on the previous question
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(start);
  const [done, setDone] = useState(false);
  const finished = useRef(false); // guards against the clock and an answer both ending the game in the same tick
  const timeLeft = Math.max(0, TIMED_SECONDS - Math.floor((now - start) / 1000));

  useEffect(() => { if (!timed || done) return; const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, [timed, done]);

  const finish = (t = tally) => {
    if (finished.current) return;
    finished.current = true; setDone(true);
    onFinish(summarise(game.engine, t, qs.length, Date.now() - start, game.perfectRequired));
  };
  // Sprint clock ran out: end the game with whatever has been answered.
  useEffect(() => { if (timed && timeLeft === 0 && !done) finish(); }); // eslint-disable-line react-hooks/exhaustive-deps

  const answer = (o: Answered) => {
    if (done || last) return; // ignore double submissions
    const t = applyOutcome(tally, o);
    setTally(t);
    if (timed) {
      setFlash({ ok: o.correct, answer: qs[i].answer });
      if (isOver(t, qs.length)) finish(t); else setI(i + 1);
    } else setLast(o);
  };
  const next = () => {
    if (isOver(tally, qs.length)) return finish();
    setI(i + 1); setLast(null);
  };

  const q = qs[i];
  const showFeedback = !!last && !timed;
  const outOfLives = tally.lives <= 0;
  return (
    <div className="panel play">
      <div className="play-top">
        <span className="muted">Question {i + 1} of {qs.length}</span>
        <div className="play-stats">
          {timed && <span className={`pill-stat ${timeLeft <= 10 ? "warn" : ""}`} aria-label={`${timeLeft} seconds left`}><Clock size={15} /> {timeLeft}s</span>}
          {lives0 !== Infinity && (
            <span className="pill-stat" aria-label={`${Math.max(0, tally.lives)} of ${lives0} lives left`}>
              {Array.from({ length: lives0 }, (_, k) => <Heart key={k} size={15} fill={k < tally.lives ? "currentColor" : "none"} aria-hidden />)}
            </span>
          )}
          <span className="pill-stat strong">Score {fmt(tally.points)}{tally.max ? ` / ${fmt(tally.max)}` : ""}</span>
        </div>
      </div>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={qs.length} aria-valuenow={tally.answered} aria-label="Game progress">
        <div style={{ width: `${(tally.answered / qs.length) * 100}%` }} />
      </div>
      {timed && flash && (
        <p className={`flash ${flash.ok ? "ok" : "bad"}`} role="status">{flash.ok ? "✓ Correct" : <>✗ Previous answer: <b>{flash.answer}</b></>}</p>
      )}

      <QuestionView key={q.id} q={q} engine={game.engine} locked={showFeedback || done} onAnswer={answer} />

      {showFeedback && last && (
        <div className={`feedback ${last.correct ? "ok" : last.points > 0 ? "part" : "bad"}`} role="status">
          <strong>{last.correct ? (last.points < last.max && game.engine === "type" ? "Correct (hint used)." : "Correct.") : last.points > 0 ? "Partly right." : "Not quite."}</strong>{" "}
          {last.given && !last.correct && <>You answered “{last.given}”. </>}
          {last.given && last.correct && normalise(last.given) !== normalise(q.answer) && <>Accepted as <b>{q.answer}</b>. </>}
          {!last.correct && !["match", "order"].includes(game.engine) && <>The answer: <b>{q.answer}</b>. </>}
          <span>{q.explanation}</span>
          <div className="feedback-foot">
            <a href={q.source} target="_blank" rel="noreferrer" className="muted small">Reference{q.season ? ` · ${q.season}` : ""}</a>
            <button className="btn primary" onClick={next} autoFocus>{outOfLives ? "See results" : i + 1 >= qs.length ? "See results" : "Next question"}</button>
          </div>
          {outOfLives && <p className="small" style={{ margin: "8px 0 0" }}>{game.engine === "elimination" ? "Sudden death — that mistake ends the run." : "No lives left — that's full time."}</p>}
        </div>
      )}
    </div>
  );
}


type QProps = { q: Question; locked: boolean; onAnswer: (o: Answered) => void };

function QuestionView({ q, engine, locked, onAnswer }: QProps & { engine: Game["engine"] }) {
  if (engine === "match") return <MatchQ q={q} locked={locked} onAnswer={onAnswer} />;
  if (engine === "order") return <OrderQ q={q} locked={locked} onAnswer={onAnswer} />;
  if (engine === "clues") return <CluesQ q={q} locked={locked} onAnswer={onAnswer} />;
  if (engine === "type" || engine === "career") return <TypeQ q={q} locked={locked} onAnswer={onAnswer} career={engine === "career"} />;
  return <OptionsQ q={q} locked={locked} onAnswer={onAnswer} />;
}

function Prompt({ q, hideCareer }: { q: Question; hideCareer?: boolean }) {
  return (
    <>
      {q.visual && <div className="visual-wrap"><Visual v={q.visual} /></div>}
      <h2 className="q-prompt">{hideCareer ? "Whose career path is this?" : q.prompt}</h2>
    </>
  );
}

function OptionsQ({ q, locked, onAnswer }: QProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const options = q.options ?? [];
  const choose = (o: string) => { if (picked || locked) return; setPicked(o); onAnswer(scoreOption(q, o)); };
  // Keyboard: A–D or 1–4 pick an option (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.closest?.("input, textarea, select")) return;
      const k = e.key.toLowerCase();
      const idx = /^[1-9]$/.test(k) ? Number(k) - 1 : /^[a-i]$/.test(k) ? k.charCodeAt(0) - 97 : -1;
      if (idx >= 0 && idx < options.length) { e.preventDefault(); choose(options[idx]); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <div>
      <Prompt q={q} />
      <div className={`options ${options.length === 2 ? "two" : ""}`}>
        {options.map((o, k) => {
          const state = picked ? (o === q.answer ? "right" : o === picked ? "wrong" : "") : "";
          return (
            <button key={o} className={`option ${state}`} onClick={() => choose(o)} disabled={!!picked || locked} aria-keyshortcuts={String.fromCharCode(65 + k)}>
              <span className="opt-key" aria-hidden>{String.fromCharCode(65 + k)}</span>{o}
            </button>
          );
        })}
      </div>
      {!picked && <p className="muted small kbd-hint">Tip: press A–{String.fromCharCode(64 + options.length)} (or 1–{options.length}) to answer.</p>}
    </div>
  );
}

function TypeQ({ q, locked, onAnswer, career }: QProps & { career?: boolean }) {
  const [val, setVal] = useState("");
  const [hint, setHint] = useState(false);
  const [sent, setSent] = useState(false);
  const submit = (giveUp = false) => {
    if (locked || sent) return;
    setSent(true);
    onAnswer({ ...(giveUp ? { points: 0, max: 1, correct: false } : scoreTyped(q, val, hint)), given: giveUp ? undefined : val.trim() });
  };
  return (
    <div>
      <Prompt q={q} hideCareer={career} />
      {career && q.items && <div className="path" aria-label="Career path">{q.items.map((c, k) => <span key={k} className="chip">{c}</span>)}</div>}
      <form className="type-row" onSubmit={(e) => { e.preventDefault(); if (val.trim()) submit(); }}>
        <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} disabled={locked || sent} placeholder="Type your answer" aria-label="Your answer" autoComplete="off" autoCapitalize="off" spellCheck={false} />
        <button className="btn primary" disabled={locked || sent || !val.trim()}>Submit</button>
      </form>
      {!locked && !sent && (
        <div className="row gap wrap-row">
          <button type="button" className="btn ghost small" onClick={() => setHint(true)} disabled={hint} aria-live="polite"><Lightbulb size={14} /> {hint ? hintFor(q.answer) : "Hint (half points)"}</button>
          <button type="button" className="btn ghost small" onClick={() => submit(true)}>Give up</button>
        </div>
      )}
    </div>
  );
}

function CluesQ({ q, locked, onAnswer }: QProps) {
  const clues = q.clues ?? [];
  const [shown, setShown] = useState(1);
  const [val, setVal] = useState("");
  const [miss, setMiss] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const worth = scoreClues(clues.length, shown, true).points;
  const end = (o: Answered) => { setOver(true); onAnswer(o); };
  const guess = () => {
    if (locked || over || !val.trim()) return;
    if (isCorrect(val, q.answer, q.accept)) return end({ ...scoreClues(clues.length, shown, true), given: val.trim() });
    setMiss(val.trim()); setVal("");
    if (shown >= clues.length) end({ ...scoreClues(clues.length, shown, false), given: val.trim() }); else setShown(shown + 1);
  };
  const reveal = () => { if (locked || over) return; if (shown >= clues.length) end(scoreClues(clues.length, shown, false)); else { setShown(shown + 1); setMiss(null); } };
  const finished = locked || over;
  return (
    <div>
      {q.visual && <div className="visual-wrap"><Visual v={q.visual} /></div>}
      <h2 className="q-prompt">{q.prompt} {!finished && <span className="muted small">— worth {worth} point{worth === 1 ? "" : "s"} now</span>}</h2>
      <ol className="clues" aria-live="polite">{clues.slice(0, finished ? clues.length : shown).map((c, k) => <li key={k}>{c}</li>)}</ol>
      {miss && !finished && <p className="muted small">“{miss}” isn't right — here's another clue.</p>}
      <form className="type-row" onSubmit={(e) => { e.preventDefault(); guess(); }}>
        <input autoFocus value={val} onChange={(e) => setVal(e.target.value)} disabled={finished} placeholder="Your guess" aria-label="Your guess" autoComplete="off" autoCapitalize="off" spellCheck={false} />
        <button className="btn primary" disabled={finished || !val.trim()}>Guess</button>
      </form>
      {!finished && <button type="button" className="btn ghost small" onClick={reveal}>{shown >= clues.length ? "Give up" : "Next clue (−1 point)"}</button>}
    </div>
  );
}

function MatchQ({ q, locked, onAnswer }: QProps) {
  const pairs = useMemo(() => q.pairs ?? [], [q.pairs]);
  const rights = useMemo(() => shuffle(pairs.map((p) => p[1]), q.id), [q.id, pairs]);
  const [sel, setSel] = useState<number | null>(null);
  const [map, setMap] = useState<Record<number, string>>({});
  const [checked, setChecked] = useState(false);
  const pickRight = (r: string) => {
    if (sel === null || checked) return;
    const next = Object.fromEntries(Object.entries(map).filter(([, v]) => v !== r)); next[sel] = r; setMap(next);
    // Move straight on to the next unpaired item to save taps.
    const free = pairs.findIndex((_, k) => k !== sel && !(k in next));
    setSel(free === -1 ? null : free);
  };
  const check = () => { if (checked) return; setChecked(true); onAnswer(scoreMatch(pairs, map)); };
  const paired = Object.keys(map).length;
  return (
    <div>
      <h2 className="q-prompt">{q.prompt}</h2>
      <p className="muted small" aria-live="polite">{checked ? "" : sel === null ? "Choose an item on the left." : `Now choose the partner for “${pairs[sel][0]}”.`}</p>
      <div className="match">
        <div className="col" role="group" aria-label="Items">
          {pairs.map((p, k) => (
            <button key={k} className={`option ${sel === k ? "selected" : ""} ${checked ? (map[k] === p[1] ? "right" : "wrong") : ""}`} onClick={() => !checked && setSel(k)} disabled={checked || locked} aria-pressed={sel === k}>
              <span>{p[0]}</span>{map[k] && <span className="paired">→ {map[k]}</span>}
              {checked && map[k] !== p[1] && <span className="paired fix">✓ {p[1]}</span>}
            </button>
          ))}
        </div>
        <div className="col" role="group" aria-label="Partners">
          {rights.map((r) => <button key={r} className={`option ${Object.values(map).includes(r) ? "used" : ""}`} onClick={() => pickRight(r)} disabled={checked || locked || sel === null}>{r}</button>)}
        </div>
      </div>
      {!checked && (
        <div className="row gap wrap-row">
          <button className="btn primary" disabled={paired < pairs.length} onClick={check}>Check matches ({paired}/{pairs.length})</button>
          {paired > 0 && <button type="button" className="btn ghost small" onClick={() => { setMap({}); setSel(0); }}>Clear</button>}
        </div>
      )}
    </div>
  );
}

function OrderQ({ q, locked, onAnswer }: QProps) {
  const items = q.items ?? [];
  const [list, setList] = useState(() => { let s = shuffle(items, q.id); if (s.join() === items.join()) s = [...s].reverse(); return s; });
  const [checked, setChecked] = useState(false);
  const move = (k: number, d: number) => { const n = [...list]; const j = k + d; if (j < 0 || j >= n.length) return; [n[k], n[j]] = [n[j], n[k]]; setList(n); };
  const check = () => { if (checked) return; setChecked(true); onAnswer(scoreOrder(items, list)); };
  return (
    <div>
      <h2 className="q-prompt">{q.prompt}</h2>
      <ol className="order">
        {list.map((x, k) => (
          <li key={x} className={checked ? (items[k] === x ? "right" : "wrong") : ""}>
            <span className="order-n">{k + 1}</span><span className="grow">{x}</span>
            {checked ? (items[k] === x ? <Check size={16} aria-label="Correct position" /> : <span className="muted small">should be #{items.indexOf(x) + 1}</span>) : (
              <span className="row">
                <button className="icon-btn" onClick={() => move(k, -1)} disabled={k === 0 || locked} aria-label={`Move ${x} up`}><ArrowUp size={16} /></button>
                <button className="icon-btn" onClick={() => move(k, 1)} disabled={k === list.length - 1 || locked} aria-label={`Move ${x} down`}><ArrowDown size={16} /></button>
              </span>
            )}
          </li>
        ))}
      </ol>
      {!checked && <button className="btn primary" onClick={check}>Lock in order</button>}
      {checked && <p className="muted small"><X size={12} /> Correct order: {items.join(" → ")}</p>}
    </div>
  );
}
