// Forgiving comparison for typed answers: ignores case, accents, punctuation, extra spaces
// and common prefixes/suffixes like "the" or "FC".
export function normalise(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[ø]/g, "o").replace(/æ/g, "ae").replace(/œ/g, "oe").replace(/ß/g, "ss").replace(/[đð]/g, "d").replace(/ł/g, "l").replace(/ı/g, "i").replace(/þ/g, "th")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ").replace(/\b(the|fc|cf|ac|afc|sc|sir)\b/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * "Westfalenstadion (Signal Iduna Park)" → [full, "Westfalenstadion", "Signal Iduna Park"].
 * A lowercase qualifier such as "England (women)" only adds "England" (never "women" on its own).
 */
export function variants(answer: string) {
  const m = answer.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (!m) return [answer];
  return /^\p{Lu}/u.test(m[2]) ? [answer, m[1], m[2]] : [answer, m[1]];
}

/** Edit distance (insert/delete/substitute), used only for small typo tolerance. */
export function editDistance(a: string, b: string) {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]; prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Typos allowed for a target of this length: none for short names (Iran/Iraq, Iceland/Ireland), one from 8 letters, two from 13. */
export const typoAllowance = (len: number) => (len >= 13 ? 2 : len >= 8 ? 1 : 0);

export function isCorrect(input: string, answer: string, accept: string[] = []) {
  const n = normalise(input);
  if (!n) return false;
  const targets = [...variants(answer), ...accept].map(normalise).filter(Boolean);
  if (targets.includes(n)) return true;
  // Small typo tolerance, only against the full official answer (never against short aliases), and the first letter must match.
  const full = normalise(answer);
  return full[0] === n[0] && editDistance(n, full) <= typoAllowance(full.length);
}

export function hintFor(answer: string) {
  return answer.split(" ").map((w) => w.charAt(0) + w.slice(1).replace(/[^\s]/g, "•")).join(" ");
}
