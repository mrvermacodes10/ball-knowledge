// Typed-answer checking. Run with `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { editDistance, isCorrect, normalise, variants } from "../src/lib/answers";

test("normalise ignores case, accents, punctuation and filler words", () => {
  assert.equal(normalise("  The   Gunners! "), "gunners");
  assert.equal(normalise("Atlético Madrid"), "atletico madrid");
  assert.equal(normalise("Ole Gunnar Solskjær"), "ole gunnar solskjaer");
  assert.equal(normalise("Brighton & Hove Albion"), "brighton and hove albion");
  assert.equal(normalise("Toronto FC"), "toronto");
  assert.equal(normalise("Sir Alex Ferguson"), "alex ferguson");
});

test("exact, accented and alias answers are accepted", () => {
  assert.ok(isCorrect("atletico madrid", "Atlético Madrid"));
  assert.ok(isCorrect("Solskjaer", "Ole Gunnar Solskjær", ["Solskjær"]));
  assert.ok(isCorrect("spurs", "Tottenham Hotspur", ["spurs", "tottenham"]));
  assert.ok(isCorrect("MÜLLER", "Gerd Müller", ["Müller"]));
});

test("parenthetical answers accept either part, but not a lowercase qualifier alone", () => {
  assert.deepEqual(variants("Westfalenstadion (Signal Iduna Park)"), ["Westfalenstadion (Signal Iduna Park)", "Westfalenstadion", "Signal Iduna Park"]);
  assert.ok(isCorrect("Signal Iduna Park", "Westfalenstadion (Signal Iduna Park)"));
  assert.ok(isCorrect("Nigeria", "Nigeria (women)"));
  assert.equal(isCorrect("women", "Nigeria (women)"), false);
});

test("wrong, empty and near-miss short answers are rejected", () => {
  assert.equal(isCorrect("", "Brazil"), false);
  assert.equal(isCorrect("   ", "Brazil"), false);
  assert.equal(isCorrect("Argentina", "Brazil"), false);
  assert.equal(isCorrect("Iraq", "Iran"), false); // short names get no typo allowance
  assert.equal(isCorrect("Ireland", "Iceland"), false);
  assert.equal(isCorrect("Manchester City", "Manchester United"), false);
});

test("long answers tolerate a small typo, with the first letter matching", () => {
  assert.ok(isCorrect("Barcelna", "Barcelona")); // 1 edit, 9 letters
  assert.ok(isCorrect("Zlatan Ibrahimovic", "Zlatan Ibrahimović"));
  assert.ok(isCorrect("Zlatan Ibrahimovich", "Zlatan Ibrahimović")); // 1 edit
  assert.equal(isCorrect("Carcelona", "Barcelona"), false); // first letter differs
  assert.equal(isCorrect("Barclna", "Barcelona"), false); // 2 edits on a 9-letter answer
  assert.equal(editDistance("kitten", "sitting"), 3);
});
