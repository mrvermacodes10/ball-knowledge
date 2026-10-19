import { useState } from "react";
import { GAME_BY_ID } from "../data/games";
import { achievements, active, addProfile, bestStreak, categoryStats, levelInfo, personalBests, removeProfile, resetProgress, setAvatar, setName, streak, switchProfile, totalXp, useStore } from "../lib/store";
import { secs } from "../lib/format";

const AVATARS = ["⚽", "🧤", "🏆", "🦁", "🦅", "🐺", "🐉", "🎯", "👟", "🥅"];

export default function ProfilePage() {
  const s = useStore(); const p = active(s);
  const [newName, setNew] = useState(""); const [confirmReset, setConfirmReset] = useState(false);
  const xp = totalXp(p); const lv = levelInfo(xp); const ach = achievements(p);
  const bests = [...personalBests(p).values()].sort((a, b) => b.points / b.max - a.points / a.max).slice(0, 8);
  return (
    <div className="grid-2">
      <section className="stack">
        <div className="panel">
          <div className="row gap"><span className="avatar">{p.avatar}</span><div><h1 style={{ margin: 0 }}>{p.name}</h1><div className="muted">Level {lv.level} · {xp.toLocaleString()} XP · {p.results.length} games played</div></div></div>
          <div className="bar big"><div style={{ width: `${(lv.into / lv.per) * 100}%` }} /></div>
          <div className="muted small">{lv.per - lv.into} XP to level {lv.level + 1}</div>
          <NameForm key={p.id} current={p.name} />
          <div className="avatars">{AVATARS.map((a) => <button key={a} className={a === p.avatar ? "on" : ""} onClick={() => setAvatar(a)} aria-label={`Avatar ${a}`}>{a}</button>)}</div>
        </div>
        <div className="card">
          <div className="section-head"><h2>Achievements</h2><span className="muted small">{ach.filter((a) => a.done).length} of {ach.length}</span></div>
          <div className="ach-grid">{ach.map((a) => <div key={a.id} className={`ach ${a.done ? "done" : ""}`}><b>{a.done ? "🏅" : "○"} {a.name}</b><span className="muted small">{a.desc}</span></div>)}</div>
        </div>
        <div className="card">
          <div className="section-head"><h2>Category performance</h2></div>
          {categoryStats(p).map((c) => (
            <div key={c.id} className="cat-row"><span>{c.name}</span><div className="bar"><div style={{ width: `${(c.accuracy ?? 0) * 100}%` }} /></div><span className="muted small r">{c.accuracy === null ? "not played" : `${Math.round(c.accuracy * 100)}% · ${c.played}`}</span></div>
          ))}
        </div>
      </section>
      <aside className="stack">
        <div className="stats-row two">
          <div className="card stat"><div className="num">{streak(p)}</div><div className="muted small">day streak (best {bestStreak(p)})</div></div>
          <div className="card stat"><div className="num">{p.results.length}</div><div className="muted small">games played</div></div>
        </div>
        <div className="card"><div className="section-head"><h2>Recent results</h2></div>
          {p.results.length === 0 ? <p className="muted">Nothing yet. Your results will appear here.</p> : <div className="list">{[...p.results].reverse().slice(0, 8).map((r, k) => (
            <div key={k} className="list-row"><span>{GAME_BY_ID.get(r.gameId)?.title}</span><span className="strong">{Math.round((r.points / r.max) * 100)}%</span></div>))}</div>}
        </div>
        <div className="card"><div className="section-head"><h2>Personal bests</h2></div>
          {bests.length === 0 ? <p className="muted">Play a game to set a personal best.</p> : <div className="list">{bests.map((r) => (
            <a key={r.gameId} className="list-row link" href={`#/game/${r.gameId}`}><span>{GAME_BY_ID.get(r.gameId)?.title}</span><span className="strong">{Math.round((r.points / r.max) * 100)}% · {secs(r.ms)}</span></a>))}</div>}
        </div>
        <div className="card"><div className="section-head"><h2>Players on this device</h2></div>
          <div className="list">{s.profiles.map((x) => (
            <div key={x.id} className={`list-row ${x.id === s.activeId ? "me" : ""}`}>
              <span>{x.avatar} {x.name} <span className="muted small">· {x.results.length} games</span></span>
              {x.id === s.activeId ? <span className="muted small">playing now</span> : (
                <span className="row gap"><button className="btn ghost small" onClick={() => switchProfile(x.id)}>Switch</button><RemoveButton name={x.name} onRemove={() => removeProfile(x.id)} /></span>
              )}
            </div>))}</div>
          <form className="type-row" onSubmit={(e) => { e.preventDefault(); addProfile(newName); setNew(""); }}><input value={newName} onChange={(e) => setNew(e.target.value)} placeholder="New player name" aria-label="New player name" maxLength={24} /><button className="btn ghost">Add player</button></form>
          {confirmReset ? (
            <div className="banner-card" role="alert" style={{ marginTop: 12 }}>
              <p style={{ margin: "0 0 8px" }}>Delete all results, XP and streaks for <b>{p.name}</b>? This can't be undone.</p>
              <div className="row gap"><button className="btn primary small" onClick={() => { resetProgress(); setConfirmReset(false); }}>Yes, reset</button><button className="btn ghost small" onClick={() => setConfirmReset(false)} autoFocus>Cancel</button></div>
            </div>
          ) : <button className="btn ghost small danger" onClick={() => setConfirmReset(true)}>Reset my progress</button>}
          <p className="muted small">Players and progress are stored in this browser only. Clearing site data removes them.</p>
        </div>
      </aside>
    </div>
  );
}

function NameForm({ current }: { current: string }) {
  const [name, setN] = useState(current); const [saved, setSaved] = useState(false);
  return (
    <form className="type-row" onSubmit={(e) => { e.preventDefault(); setName(name); setSaved(true); }}>
      <input value={name} onChange={(e) => { setN(e.target.value); setSaved(false); }} aria-label="Display name" maxLength={24} />
      <button className="btn primary" disabled={!name.trim() || name.trim() === current}>{saved && name.trim() === current ? "Saved" : "Save name"}</button>
    </form>
  );
}

function RemoveButton({ name, onRemove }: { name: string; onRemove: () => void }) {
  const [ask, setAsk] = useState(false);
  return ask
    ? <span className="row gap"><button className="btn primary small" onClick={onRemove} aria-label={`Confirm removing ${name}`}>Remove {name}?</button><button className="btn ghost small" onClick={() => setAsk(false)}>Keep</button></span>
    : <button className="btn ghost small danger-inline" onClick={() => setAsk(true)}>Remove</button>;
}
