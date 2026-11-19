/*
 * Finds the one-time code in a message, so it can be copied without being retyped.
 *
 * The whole value of this is that it is right. A code offered for the wrong number is
 * worse than none at all — it gets pasted, rejected, and the next one is not trusted — so
 * everything here errs towards finding nothing. A number only counts when the words
 * around it say what it is, and anything that reads like an order, a reference, a phone
 * number or a duration is left alone.
 */

export type VerificationCode = { code: string; from: "subject" | "body" };

/** How far either side of a number to read for the words that explain it. */
const CONTEXT_BEFORE = 70;
const CONTEXT_AFTER = 45;

/*
 * Words that name a one-time code and nothing else. An all-letters-and-digits token needs
 * one of these, because `code` on its own is just as often a discount.
 */
const NAMES_A_CODE =
  /\b(verification|verify|verifying|confirmation|confirm|one[-\s]?time|single[-\s]use|otp|2fa|two[-\s]factor|authentication|authenticate|passcode|pin|security code|access code|login code|log[-\s]?in code|sign[-\s]?in code|temporary code)\b/i;

/** Enough on its own for a bare number, which a promotion almost never is. */
const MENTIONS_A_CODE = /\bcodes?\b/i;

/*
 * A number with one of these beside it is being used for something else. `id` is
 * deliberately absent: "your Apple ID verification code" is exactly the case to catch.
 */
const SOMETHING_ELSE =
  /\b(order|invoice|receipt|tracking|shipment|shipping|parcel|flight|booking|reservation|routing|fax|zip|postcode|post\s+code|suite|apartment|apt|ext|total|amount|price|balance|qty|quantity|version|copyright)\b/i;

/*
 * Words that disqualify a number only when they are being used to label one. A one-time
 * code mail says "in case you didn't request this" and "for your reference" as a matter
 * of routine, and reading those as "case number" or "reference number" threw away the
 * code the message was sent to deliver.
 */
const LABELS_SOMETHING_ELSE =
  /\b(?:(?:account|case|ticket|claim|reference|ref|member|customer|policy|contract)\s*(?:number|no\.?|#|id)|phone|telephone|call\s+us|extension\s+\d)\b/i;

/** A number followed by one of these is a duration or a measurement, not a code. */
const A_MEASUREMENT = /^[\s)]*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|months?|years?|%|am|pm|kb|mb|gb|px)\b/i;

/** Money, on either side. */
const CURRENCY_BEFORE = /[$£€¥₹]\s*$/;
const CURRENCY_AFTER = /^\s*(usd|eur|gbp|aed|sar|egp)\b/i;

/*
 * Another group of digits right beside this one, separated by a space, dash or bracket:
 * the shape of a phone number, a card, or a date, never of a code sitting on its own.
 */
const DIGITS_RUN_BEFORE = /\d[\s\-.()]{1,2}$/;
const DIGITS_RUN_AFTER = /^[\s\-.()]{1,2}\d/;

const LOOKS_LIKE_A_YEAR = /^(19|20)\d{2}$/;

type Candidate = { code: string; at: number; mixed: boolean };

/*
 * Four to eight characters, which covers every code worth copying and excludes the long
 * runs that identify orders and shipments. Three shapes are allowed: plain digits, the
 * `G-123456` that Google sends, and a mix of capitals and digits.
 */
const CANDIDATE = /\b(?:[A-Z]-\d{4,8}|\d{4,8}|[A-Z0-9]{5,8})\b/g;

function candidatesIn(text: string): Candidate[] {
  const found: Candidate[] = [];
  for (const match of text.matchAll(CANDIDATE)) {
    const code = match[0];
    if (match.index == null) continue;

    const digits = /\d/.test(code);
    const letters = /[A-Za-z]/.test(code);
    // A token of only capitals is a word, however much it shouts.
    if (!digits) continue;
    found.push({ code, at: match.index, mixed: letters && !code.includes("-") });
  }
  return found;
}

/** True when nothing shares the candidate's line, as a code printed on its own does. */
function standsAlone(text: string, candidate: Candidate): boolean {
  const end = candidate.at + candidate.code.length;
  const from = text.lastIndexOf("\n", candidate.at - 1) + 1;
  const to = text.indexOf("\n", end);
  return text.slice(from, to === -1 ? undefined : to).trim() === candidate.code;
}

function accepts(text: string, candidate: Candidate, named: boolean): boolean {
  const end = candidate.at + candidate.code.length;
  const before = text.slice(Math.max(0, candidate.at - CONTEXT_BEFORE), candidate.at);
  const after = text.slice(end, end + CONTEXT_AFTER);
  const window = `${before} ${after}`;

  if (SOMETHING_ELSE.test(window) || LABELS_SOMETHING_ELSE.test(window)) return false;
  if (A_MEASUREMENT.test(after)) return false;
  if (CURRENCY_BEFORE.test(before) || CURRENCY_AFTER.test(after)) return false;
  if (DIGITS_RUN_BEFORE.test(before) || DIGITS_RUN_AFTER.test(after)) return false;

  // The subject can do the naming instead, when it has already said what the number is.
  const names = named || NAMES_A_CODE.test(window);
  // A mixed token is as likely to be a discount or a tracking stub as a code.
  if (candidate.mixed) return names;
  if (LOOKS_LIKE_A_YEAR.test(candidate.code)) return names;
  return names || MENTIONS_A_CODE.test(window);
}

function firstCodeIn(text: string, options: { named?: boolean; alone?: boolean } = {}): string | null {
  if (!text) return null;
  // A long message is a newsletter; the code in a code email is near the top.
  const head = text.slice(0, 4_000);
  for (const candidate of candidatesIn(head)) {
    if (options.alone && !standsAlone(head, candidate)) continue;
    if (accepts(head, candidate, options.named ?? false)) return candidate.code;
  }
  return null;
}

/**
 * The one-time code in a message, if it plainly has one.
 *
 * The subject is read first: a sender who puts the code there has already said what the
 * number is, and it is the line least likely to be carrying anything else.
 */
export function findVerificationCode(subject: string, text: string): VerificationCode | null {
  const fromSubject = firstCodeIn(subject ?? "");
  if (fromSubject) return { code: fromSubject, from: "subject" };

  const fromBody = firstCodeIn(text ?? "");
  if (fromBody) return { code: fromBody, from: "body" };

  /*
   * A subject of "Your verification code" and a body that is the number and little else
   * is one of the commonest layouts there is. The subject supplies the naming the body
   * never bothers with — but only for a number printed on a line of its own, or every
   * figure in a newsletter would qualify.
   */
  if (NAMES_A_CODE.test(subject ?? "") || MENTIONS_A_CODE.test(subject ?? "")) {
    const alone = firstCodeIn(text ?? "", { named: true, alone: true });
    if (alone) return { code: alone, from: "body" };
  }
  return null;
}
