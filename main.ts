/**
 * Make the AI Judge Laugh: Office Jokes — make.fun entry.
 *
 * The task (program/v1): write ONE joke about office life to
 * `entry.txt` inside the output directory, and nothing else.
 *
 * The sealed gate that scores the file:
 *   - UTF-8 text,
 *   - 1 to 199 characters long,
 *   - not only white space.
 * Only a valid entry goes before the judge; an invalid one is listed
 * with 0 and no rate, and takes no prize.
 *
 * The judge is an AI model that compares jokes two at a time, weighing
 * them in this order (most important first):
 *   1. A genuine one-line joke about office life — not a slogan, a
 *      caption or a stray observation; anything off that subject loses
 *      to any joke about office life.
 *   2. A real turn or surprise at the end, where the line lands
 *      somewhere the reader did not see coming.
 *   3. Recognition: the truth of the office in it — the meeting, the
 *      printer, the reply-all, the calendar — so the laugh comes with
 *      a wince.
 *   4. Tight wording, every word earning its place, with no setup
 *      longer than it needs to be.
 *   5. Freshness, a take on office life that is not the obvious Monday
 *      morning or photocopier line.
 *
 * This program does not hard-code a single line and hope. It keeps a
 * small workshop of original one-line office jokes, scores each one
 * against the judge's five criteria with fixed weights that follow the
 * judge's own order, picks the winner deterministically, validates the
 * winner against every part of the gate (plus a few stricter checks of
 * its own), and only then writes it to `entry.txt`.
 *
 * Determinism: the candidates, the scores and the tie-break are all
 * fixed in this file, so every run writes the exact same bytes.
 * The program reads nothing from the network, the git history, or any
 * file it does not ship; everything it runs is in this repository.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// The gate, as numbers
// ---------------------------------------------------------------------------

/** The sealed gate accepts 1 to 199 characters. */
const MIN_CHARS = 1;
const MAX_CHARS = 199;

/** The file the judge reads. */
const OUTPUT_FILENAME = "entry.txt";

/**
 * The winner must beat the runner-up by at least this many points.
 * A workshop whose top two jokes are neck and neck has not really
 * chosen one; fail loudly instead of shipping a coin flip.
 */
const MIN_WINNING_MARGIN = 3;

/** Where the grader tells us to write; `/output` is the documented default. */
const DEFAULT_OUTPUT_DIR = "/output";

/** The joke is plain ASCII, so one character is one byte and one code point. */
const ASCII_PRINTABLE = /^[\x20-\x7e]+$/;

// ---------------------------------------------------------------------------
// The judge's criteria, as weights (the judge's own order, most first)
// ---------------------------------------------------------------------------

/**
 * Weights follow the judge brief: being a genuine office joke and
 * landing a turn matter most, recognition next, then tightness and
 * freshness. The weights sum to 10, so a perfect card scores 100.
 */
const CRITERIA_WEIGHTS = {
  genuine: 3, // a real one-line joke about office life
  turn: 3, // a surprise at the end
  recognition: 2, // the truth of the office, laugh with a wince
  tightness: 1, // every word earning its place
  freshness: 1, // not the obvious Monday / photocopier line
} as const;

type ScoreCard = {
  genuine: number; // 0-10: is it a real one-line office joke?
  turn: number; // 0-10: does the ending land somewhere unexpected?
  recognition: number; // 0-10: does an office worker wince in recognition?
  tightness: number; // 0-10: is every word earning its place?
  freshness: number; // 0-10: is the take fresh, not a stock office line?
};

type JokeCandidate = {
  /** A short label so the workshop log stays readable. */
  label: string;
  /** The joke itself: one line, office life, original. */
  text: string;
  /** Why it scores the way it does, criterion by criterion. */
  scores: ScoreCard;
  /** One line of reasoning for the card, kept beside the scores. */
  rationale: string;
};

// ---------------------------------------------------------------------------
// The workshop: five original one-line office jokes
// ---------------------------------------------------------------------------

/**
 * Every candidate below was written for this entry (no copied lines,
 * no stock jokes). Each one is a single line about office life with a
 * turn at the end; the scores are the author's honest reading of the
 * judge's brief, and the program picks the highest total. A new
 * candidate may join the list at any time: it only wins by outscoring
 * the field, never by being appended last or first.
 */
const CANDIDATES: JokeCandidate[] = [
  {
    label: "drowning-in-emails",
    text: "I told my boss I was drowning in emails, so he CC'd me on a thread about time management with 47 attachments.",
    scores: { genuine: 9, turn: 9, recognition: 10, tightness: 8, freshness: 8 },
    rationale:
      "A real joke with a setup and a payoff: the 'help' is exactly what " +
      "is drowning him, only worse — CC'd, a thread, time management, 47 " +
      "attachments. Every office worker has lived this exact escalation.",
  },
  {
    label: "out-of-office-loop",
    text: "I set an out-of-office reply and it replied to itself, so now the whole office thinks I'm in a meeting with myself.",
    scores: { genuine: 9, turn: 8, recognition: 8, tightness: 8, freshness: 9 },
    rationale:
      "The tool meant to signal absence starts a meeting with the author. " +
      "Fresh machinery (an auto-reply loop), but the recognition is a " +
      "notch below the email flood — fewer people have met a reply-all loop.",
  },
  {
    label: "wellness-initiative",
    text: "HR's wellness initiative gave our burnout a step-counting challenge and a branded water bottle.",
    scores: { genuine: 8, turn: 7, recognition: 9, tightness: 8, freshness: 8 },
    rationale:
      "True and bitter — wellness theatre instead of less work — but the " +
      "turn is a list rather than a landing: the bottle is funny, the " +
      "challenge is expected, and the line ends on inventory, not a twist.",
  },
  {
    label: "single-sign-on",
    text: "IT replaced all our passwords with single sign-on, so now one forgotten password locks me out of everything at once, efficiently.",
    scores: { genuine: 9, turn: 8, recognition: 9, tightness: 7, freshness: 8 },
    rationale:
      "The payoff word 'efficiently' does the work — the fix concentrates " +
      "the failure it was meant to remove. Loses a tightness point: " +
      "'at once, efficiently' carries one word more than the landing needs.",
  },
  {
    label: "open-door-policy",
    text: "My boss calls it an open-door policy, but the door is a calendar invite and the open part needs three approvals.",
    scores: { genuine: 9, turn: 8, recognition: 9, tightness: 8, freshness: 7 },
    rationale:
      "A solid inversion of a management cliché, and the calendar invite " +
      "is instantly recognisable. Freshness is the weak spot: the " +
      "open-door joke is a well-worn setup, even told this tightly.",
  },
  {
    label: "reply-all-removal",
    text: "I replied-all asking to be removed from the thread, and 400 people replied-all to agree with me.",
    scores: { genuine: 9, turn: 8, recognition: 10, tightness: 8, freshness: 6 },
    rationale:
      "The recognition is perfect — everyone has watched a removal " +
      "request become the very flood it protested — and the '400 people' " +
      "lands the scale. Freshness is the cost: the reply-all pile-on is " +
      "one of the best-known office bits, so it cannot win on novelty.",
  },
];

// ---------------------------------------------------------------------------
// Scoring: the judge's brief, as arithmetic
// ---------------------------------------------------------------------------

/** Weighted total out of 100 for one candidate's score card. */
function weightedScore(scores: ScoreCard): number {
  return (
    scores.genuine * CRITERIA_WEIGHTS.genuine +
    scores.turn * CRITERIA_WEIGHTS.turn +
    scores.recognition * CRITERIA_WEIGHTS.recognition +
    scores.tightness * CRITERIA_WEIGHTS.tightness +
    scores.freshness * CRITERIA_WEIGHTS.freshness
  );
}

/**
 * Pick the winner. Deterministic: the highest weighted total wins, and
 * on a tie the earliest candidate in the list wins (strict `>` only),
 * so the choice never depends on run order, clock, or environment.
 */
function pickWinner(candidates: JokeCandidate[]): JokeCandidate {
  let best = candidates[0];
  let bestScore = weightedScore(best.scores);
  for (const candidate of candidates.slice(1)) {
    const score = weightedScore(candidate.scores);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Gate validation: every check the sealed scorer applies, plus our own
// ---------------------------------------------------------------------------

/** Count characters the way the gate does: Unicode code points, not bytes. */
function countChars(text: string): number {
  return [...text].length;
}

/** Split a line into words for the tightness checks. */
function wordsOf(text: string): string[] {
  return text.split(/[^A-Za-z0-9']+/).filter((word) => word.length > 0);
}

/** Fail with a message that names the check and the offending value. */
function fail(check: string, detail: string): never {
  throw new Error(`gate check failed [${check}]: ${detail}`);
}

function checkLength(text: string): void {
  const chars = countChars(text);
  if (chars < MIN_CHARS) {
    fail("length", `entry is empty (${chars} characters, minimum ${MIN_CHARS})`);
  }
  if (chars > MAX_CHARS) {
    fail("length", `entry is ${chars} characters (maximum ${MAX_CHARS})`);
  }
}

function checkNotOnlyWhitespace(text: string): void {
  if (text.trim().length === 0) {
    fail("not-only-whitespace", "entry is empty or only whitespace");
  }
}

function checkSingleLine(text: string): void {
  // Plain newlines and carriage returns, plus the Unicode line/paragraph
  // separators that would also break a "single line" reading.
  if (/[\n\r\u2028\u2029]/.test(text)) {
    fail("single-line", "entry contains a line break");
  }
  if (text !== text.trim()) {
    fail("single-line", "entry has leading or trailing whitespace");
  }
}

function checkUtf8AndAscii(text: string): void {
  // The gate counts characters in UTF-8 text; confirm the text
  // round-trips cleanly through UTF-8 so no replacement characters
  // can slip in, and confirm it is plain printable ASCII so one
  // character is one byte is one code point — no counting surprises.
  if (Buffer.from(text, "utf8").toString("utf8") !== text) {
    fail("utf-8", "entry is not valid UTF-8 text");
  }
  if (!ASCII_PRINTABLE.test(text)) {
    fail("ascii", "entry holds a character outside printable ASCII");
  }
}

function checkOfficeTopic(text: string): void {
  // Criterion 1 of the judge brief: it must be a joke ABOUT office
  // life. A line with no office vocabulary at all cannot be one.
  const officeWords = [
    "boss",
    "email",
    "meeting",
    "calendar",
    "office",
    "hr",
    "it",
    "printer",
    "reply",
    "thread",
    "cc",
    "attachment",
    "standup",
    "manager",
    "coworker",
    "desk",
    "inbox",
    "out-of-office",
  ];
  const lower = text.toLowerCase();
  if (!officeWords.some((word) => lower.includes(word))) {
    fail("office-topic", "entry contains no office vocabulary");
  }
}

function checkNoCliche(text: string): void {
  // Criterion 5 of the judge brief: not the obvious Monday morning or
  // photocopier line. Reject the stock setups outright so a tired
  // candidate can never win the workshop by accident.
  const cliches = [
    "monday morning",
    "case of the mondays",
    "photocopier",
    "copy machine",
    "tgif",
    "coffee machine broke",
    "is it friday yet",
  ];
  const lower = text.toLowerCase();
  for (const cliche of cliches) {
    if (lower.includes(cliche)) {
      fail("freshness", `entry uses the stock line "${cliche}"`);
    }
  }
}

function checkTightness(text: string): void {
  // Criterion 4 of the judge brief: every word earning its place.
  // A content word (longer than three letters) repeated in one line
  // is a word that did not earn its second place.
  const seen = new Map<string, number>();
  for (const word of wordsOf(text)) {
    if (word.length <= 3) continue;
    const lower = word.toLowerCase();
    const count = (seen.get(lower) ?? 0) + 1;
    seen.set(lower, count);
    if (count > 1) {
      fail("tightness", `content word "${lower}" repeats in one line`);
    }
  }
  // No double spaces: a gap is a word that is not there.
  if (text.includes("  ")) {
    fail("tightness", "entry contains a double space");
  }
}

/**
 * Run every gate check on a candidate. The sealed scorer applies the
 * length / whitespace / UTF-8 checks; the rest are this entry's own
 * reading of the judge brief, applied before anything is written so a
 * bad line can never reach the judge.
 */
function validateEntry(text: string): void {
  checkLength(text);
  checkNotOnlyWhitespace(text);
  checkSingleLine(text);
  checkUtf8AndAscii(text);
  checkOfficeTopic(text);
  checkNoCliche(text);
  checkTightness(text);
}

// ---------------------------------------------------------------------------
// Output: write exactly the joke, then prove the file holds it
// ---------------------------------------------------------------------------

function resolveOutputDir(): string {
  const fromEnv = process.env.MAKEFUN_OUTPUT_DIR;
  if (fromEnv !== undefined && fromEnv.trim() !== "") {
    return fromEnv;
  }
  return DEFAULT_OUTPUT_DIR;
}

function writeEntry(dir: string, text: string): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, OUTPUT_FILENAME);
  // Exactly the joke, no trailing newline: a newline would be a 200th
  // character the gate would count and a second line it would reject.
  writeFileSync(path, text, "utf8");
  return path;
}

function verifyWritten(path: string, expected: string): void {
  const actual = readFileSync(path, "utf8");
  if (actual !== expected) {
    fail("verify", `wrote ${actual.length} chars, expected ${expected.length}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  // Score the whole workshop, then take the winner.
  const scored = CANDIDATES.map((candidate) => ({
    candidate,
    score: weightedScore(candidate.scores),
  }));
  scored.sort((a, b) => b.score - a.score);
  const winner = scored[0].candidate;

  // The win must be decisive, not a tie the sort happened to break.
  if (scored.length > 1 && scored[0].score - scored[1].score < MIN_WINNING_MARGIN) {
    fail(
      "decisive-win",
      `winner leads by ${scored[0].score - scored[1].score} points ` +
        `(minimum margin ${MIN_WINNING_MARGIN}); workshop is undecided`,
    );
  }

  // The gate, plus our own stricter reading of the judge brief.
  validateEntry(winner.text);

  // Write it, then read it back and prove it is byte-for-byte the joke.
  const outDir = resolveOutputDir();
  const path = writeEntry(outDir, winner.text);
  verifyWritten(path, winner.text);

  // A short, deterministic report on stdout (the judge reads the file,
  // not this log): which joke won, by how much, and how long it is.
  const ranking = scored
    .map((entry) => `${entry.candidate.label}=${entry.score}`)
    .join(" ");
  console.log(`winner: ${winner.label} (${weightedScore(winner.scores)}/100)`);
  console.log(`ranking: ${ranking}`);
  console.log(`chars: ${countChars(winner.text)} (gate: ${MIN_CHARS}-${MAX_CHARS})`);
  console.log(`wrote: ${path}`);
  console.log(winner.text);
}

main();
