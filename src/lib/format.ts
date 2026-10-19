/** Score with at most one decimal (hints and clues can give half points). */
export const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
/** Milliseconds as seconds with one decimal, e.g. "42.3s". */
export const secs = (ms: number) => `${Math.round(ms / 100) / 10}s`;
