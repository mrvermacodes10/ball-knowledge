import { useId } from "react";
import type { Visual as V } from "../data/games";

const SHIRT = "M60 10 L85 4 Q100 18 115 4 L140 10 L178 40 L160 70 L140 58 L140 176 L60 176 L60 58 L40 70 L22 40 Z";

/** Drawn (not photographed) kits and flags, so no copyrighted badges or photos are used. */
export default function Visual({ v }: { v: V }) {
  const clip = `shirt-${useId().replace(/:/g, "")}`;
  if (v.kind === "flag") {
    const n = v.colours.length;
    return (
      <svg viewBox="0 0 300 200" className="visual" role="img" aria-label="Flag to identify">
        {v.colours.map((c, i) => v.dir === "v"
          ? <rect key={i} x={(300 / n) * i} y={0} width={300 / n + 0.5} height={200} fill={c} />
          : <rect key={i} x={0} y={(200 / n) * i} width={300} height={200 / n + 0.5} fill={c} />)}
        <rect x="0.5" y="0.5" width="299" height="199" fill="none" stroke="#d9cfbc" />
      </svg>
    );
  }
  const { pattern, a, b } = v;
  return (
    <svg viewBox="0 0 200 180" className="visual" role="img" aria-label="Football kit to identify">
      <defs><clipPath id={clip}><path d={SHIRT} /></clipPath></defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="200" height="180" fill={a} />
        {pattern === "stripes" && [0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={48 + i * 22} y="0" width="11" height="180" fill={b} />)}
        {pattern === "hoops" && [0, 1, 2, 3, 4].map((i) => <rect key={i} x="0" y={40 + i * 30} width="200" height="15" fill={b} />)}
        {pattern === "sash" && <polygon points="40,40 70,40 170,176 140,176" fill={b} />}
        {pattern === "band" && <rect x="88" y="0" width="24" height="180" fill={b} />}
        {pattern === "hband" && <rect x="0" y="68" width="200" height="34" fill={b} />}
        {pattern === "halves" && <rect x="100" y="0" width="100" height="180" fill={b} />}
        {pattern === "sleeves" && <><polygon points="0,0 60,10 60,70 0,80" fill={b} /><polygon points="200,0 140,10 140,70 200,80" fill={b} /></>}
        {pattern === "solid" && <path d="M85 4 Q100 18 115 4 L112 14 Q100 26 88 14 Z" fill={b} />}
      </g>
      <path d={SHIRT} fill="none" stroke="#1d2b22" strokeWidth="2" />
    </svg>
  );
}
