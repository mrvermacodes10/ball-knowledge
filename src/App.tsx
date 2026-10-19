import { useEffect, useState } from "react";
import { Flame, Menu, Trophy } from "lucide-react";
import { GAMES, GAME_BY_ID } from "./data/games";
import { active, dailyGameId, levelInfo, streak, today, totalXp, useStore } from "./lib/store";
import Home from "./pages/Home";
import Explore from "./pages/Explore";
import Daily from "./pages/Daily";
import Leaderboard from "./pages/Leaderboard";
import ProfilePage from "./pages/Profile";
import GamePage from "./pages/GamePage";
import ChallengePage from "./pages/Challenge";

function useRoute() {
  const [hash, setHash] = useState(window.location.hash.slice(1) || "/");
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    // Every navigation bumps the nonce so pages remount fresh (Explore may have rewritten its own URL with replaceState).
    const f = () => { setHash(window.location.hash.slice(1) || "/"); setNonce((n) => n + 1); window.scrollTo(0, 0); };
    // Clicking a link to the page you're already on (e.g. "Play again" on a results screen) restarts that page.
    const same = (e: MouseEvent) => { const a = (e.target as HTMLElement).closest("a"); if (a && a.getAttribute("href") === window.location.hash) { setNonce((n) => n + 1); window.scrollTo(0, 0); } };
    window.addEventListener("hashchange", f); document.addEventListener("click", same);
    return () => { window.removeEventListener("hashchange", f); document.removeEventListener("click", same); };
  }, []);
  return [hash, nonce] as const;
}

const NAV = [["/", "Home"], ["/explore", "Explore"], ["/daily", "Daily Challenge"], ["/leaderboard", "Leaderboard"], ["/profile", "Profile"]] as const;

export default function App() {
  const [route, nonce] = useRoute();
  const s = useStore();
  const p = active(s);
  const xp = totalXp(p);
  const { level } = levelInfo(xp);
  const dailyDone = p.dailyClaimed.includes(today());
  const daily = GAME_BY_ID.get(dailyGameId())!;
  // The mobile menu is open only for the route it was opened on, so navigating closes it.
  const [menuRoute, setMenuRoute] = useState<string | null>(null);
  const menu = menuRoute === route;
  const setMenu = (open: boolean) => setMenuRoute(open ? route : null);
  const [path, query] = route.split("?");
  const parts = path.split("/").filter(Boolean);

  let page;
  if (parts[0] === "explore") page = <Explore key={(query ?? "") + nonce} query={new URLSearchParams(query)} />;
  else if (parts[0] === "daily") page = <Daily />;
  else if (parts[0] === "leaderboard") page = <Leaderboard />;
  else if (parts[0] === "profile") page = <ProfilePage />;
  else if (parts[0] === "game" && parts[1]) page = <GamePage key={parts[1] + (query ?? "") + nonce} id={parts[1]} challenge={new URLSearchParams(query).get("challenge")} />;
  else if (parts[0] === "challenge" && parts[1]) page = <ChallengePage code={parts[1]} />;
  else page = <Home />;
  const current = "/" + (parts[0] ?? "");

  return (
    <div className="app">
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById("main")?.focus(); }}>Skip to content</a>
      <header className="site-header">
        <div className="wrap">
          <div className="brand-row">
            <a href="#/" className="brand">BALL KNOWLEDGE</a>
            <button className="menu-btn" onClick={() => setMenu(!menu)} aria-label="Menu" aria-expanded={menu}><Menu size={22} /></button>
          </div>
          <div className="season">Think You Know Ball?</div>
          <div className="meta">
            <span>{p.avatar} {p.name}</span><span>Level {level}</span><span>{xp.toLocaleString()} XP</span>
            <span><Flame size={13} /> {streak(p)}-day streak</span><span><Trophy size={13} /> {GAMES.length} games</span><span>Facts checked to autumn 2025</span>
          </div>
          <nav className={`nav ${menu ? "open" : ""}`} aria-label="Main">
            {NAV.map(([href, label]) => (
              <a key={href} href={"#" + href} onClick={() => setMenu(false)} className={current === href || (href === "/explore" && current === "/game") ? "active" : ""}>{label}</a>
            ))}
          </nav>
        </div>
      </header>
      <div className="banner">
        <div className="wrap banner-inner">
          <span><b>Daily Challenge:</b> {daily.title} · {daily.difficulty} · {dailyDone ? "completed today ✓" : `+50 XP bonus`}</span>
          <a className="btn small dark" href={`#/game/${daily.id}`}>{dailyDone ? "Play again" : "Play now"}</a>
        </div>
      </div>
      <main className="wrap main" id="main" tabIndex={-1}>{page}</main>
      <footer className="site-footer">
        <div className="wrap footer-inner">
          <span><b>Ball Knowledge</b> · Football trivia with facts checked up to autumn 2025.</span>
          <span className="muted-light">Progress, profiles and the leaderboard are saved in this browser only (no account or server). Kits and flags are simplified drawings, not official badges.</span>
        </div>
      </footer>
    </div>
  );
}
