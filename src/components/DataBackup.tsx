import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { checkBackup, currentSummary, exportBackup, restoreBackup, safetyCopies, savingBlocked, today, useStore, type BackupCheck, type BackupSummary } from "../lib/store";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "unknown date");
const fileDate = (iso?: string) => (iso ?? "").slice(0, 10) || today();

/** Export / import of everything saved on this device, plus the automatic safety copies. Nothing is replaced without confirmation. */
export default function DataBackup() {
  useStore(); // re-render when the save changes
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<(BackupCheck & { ok: true; from: string }) | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const copies = safetyCopies();

  const pick = async (f: File | undefined) => {
    setPending(null); setMsg(null);
    if (!f) return;
    const c = checkBackup(await f.text().catch(() => ""));
    if (c.ok) setPending({ ...c, from: f.name }); else setMsg({ ok: false, text: `${c.error} Your current data hasn't been changed.` });
    if (input.current) input.current.value = "";
  };
  const restoreCopy = (file: string, label: string) => {
    setMsg(null); const c = checkBackup(file);
    if (c.ok) setPending({ ...c, from: `safety copy: ${label}` }); else setMsg({ ok: false, text: `${c.error} Your current data hasn't been changed.` });
  };
  const confirm = () => {
    if (!pending) return;
    const r = restoreBackup(pending.raw);
    setPending(null);
    setMsg(r.ok ? { ok: true, text: "Backup restored. Your previous data was kept as a safety copy below." } : { ok: false, text: r.error });
  };

  return (
    <div className="card">
      <div className="section-head"><h2>Back up your progress</h2></div>
      <p className="muted small" style={{ marginTop: 0 }}>Your progress lives only in this browser. Download a backup file now and then, and keep it somewhere safe. It includes every player on this device.</p>
      {savingBlocked() && <div className="banner-card" role="alert">Your saved data couldn't be read and couldn't be copied aside, so new progress isn't being saved to protect it. Download a backup or contact the site owner.</div>}
      <div className="row gap wrap-row">
        <button className="btn primary small" onClick={() => { setMsg(null); download(`ball-knowledge-backup-${today()}.json`, exportBackup()); }}><Download size={14} /> Download backup</button>
        <button className="btn ghost small" onClick={() => input.current?.click()}><Upload size={14} /> Restore from file</button>
        <input ref={input} type="file" accept=".json,application/json" hidden onChange={(e) => pick(e.target.files?.[0])} aria-label="Backup file" />
      </div>

      {pending && (
        <div className="banner-card" role="alert" style={{ marginTop: 12 }}>
          <p style={{ margin: "0 0 6px" }}><b>Restore this backup?</b> <span className="muted small">({pending.from}, saved {when(pending.savedAt)})</span></p>
          <Summary list={pending.profiles} />
          <p className="small" style={{ margin: "8px 0" }}>This replaces <b>all</b> players, progress and challenge results currently on this device:</p>
          <Summary list={currentSummary()} />
          <p className="muted small" style={{ margin: "8px 0" }}>A safety copy of your current data is kept first, so you can switch back.</p>
          <div className="row gap"><button className="btn primary small" onClick={confirm}>Yes, replace my data</button><button className="btn ghost small" onClick={() => setPending(null)} autoFocus>Cancel</button></div>
        </div>
      )}
      {msg && <p className="small" style={msg.ok ? undefined : { color: "var(--red)" }} role="status">{msg.text}</p>}

      {copies.length > 0 && (
        <>
          <h3 className="small" style={{ margin: "14px 0 6px" }}>Safety copies on this device</h3>
          <div className="list">{copies.map((c) => { let saved: string | undefined; try { saved = (JSON.parse(c.file) as { savedAt?: string }).savedAt; } catch { /* shown as unknown date */ } return (
            <div key={c.key} className="list-row">
              <span className="small">{c.label}<span className="muted"> · {when(saved)}</span></span>
              <span className="row gap">
                <button className="btn ghost small" onClick={() => download(`ball-knowledge-safety-copy-${fileDate(saved)}.json`, c.file)}>Download</button>
                <button className="btn ghost small" onClick={() => restoreCopy(c.file, c.label)}>Restore</button>
              </span>
            </div>); })}</div>
        </>
      )}
    </div>
  );
}

function Summary({ list }: { list: BackupSummary[] }) {
  return (
    <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
      {list.map((p, k) => <li key={k}>{p.avatar} <b>{p.name}</b>: {p.games} games · {p.xp.toLocaleString()} XP · {p.days} daily challenges{p.unknown ? ` · ${p.unknown} results from retired games (kept)` : ""}</li>)}
    </ul>
  );
}
