/**
 * Small pure helpers shared by the packaging transforms.
 *
 * Nothing here touches the filesystem, the clock, or the network: every
 * function is a plain value -> value transform so an unchanged input always
 * produces byte-identical output.
 */

/** Deterministic string compare (code points, not locale). */
export const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Decimal places used for share-style values (0..1 fractions). */
export const SHARE_DP = 5;
/** Decimal places used for tie-weighted paper counts and year durations. */
export const WEIGHT_DP = 3;

/**
 * Round to `dp` decimal places, preserving `null` (which means "unavailable",
 * never "zero"). Uses the exponent-shift trick so 1.005 -> 1.01 rather than
 * 1.0 (plain `Math.round(x * 100) / 100` trips over binary representation).
 */
export function round(value, dp) {
	if (value === null || value === undefined) return null;
	const n = Number(value);
	if (!Number.isFinite(n)) return null;
	const shifted = Number(`${n}e${dp}`);
	if (!Number.isFinite(shifted)) return n;
	const r = Number(`${Math.round(shifted)}e-${dp}`);
	if (!Number.isFinite(r)) return n;
	return Object.is(r, -0) ? 0 : r;
}

/** Round a 0..1 share. */
export const share = (v) => round(v, SHARE_DP);
/** Round a tie-weighted paper count / year duration. */
export const weight = (v) => round(v, WEIGHT_DP);

/** Coerce to a finite number, or null. `null` in stays `null` out. */
export function num(value) {
	if (value === null || value === undefined) return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

/** Sum treating null/undefined as zero. */
export function sum(values) {
	let total = 0;
	for (const v of values) total += num(v) ?? 0;
	return total;
}

/** Median of the finite values, or null when there are none. */
export function median(values) {
	const sorted = values.map(num).filter((v) => v !== null).sort((a, b) => a - b);
	if (sorted.length === 0) return null;
	const mid = sorted.length >> 1;
	return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** a / b as a share, or null when the denominator is missing or zero. */
export function ratio(a, b) {
	const top = num(a);
	const bottom = num(b);
	if (top === null || bottom === null || bottom === 0) return null;
	return top / bottom;
}

/**
 * Parse a year/month out of the several date spellings the raw data uses:
 * "2004-07-01T00:00:00Z", "2004-07-00", "2004-07", "2004".
 * Returns `{ y, m }` with m in 1..12 (defaulting to 1), or null.
 */
export function parseYearMonth(value) {
	if (typeof value !== 'string') return null;
	const match = /^(\d{4})(?:-(\d{2}))?/.exec(value.trim());
	if (!match) return null;
	const y = Number(match[1]);
	if (!Number.isFinite(y)) return null;
	let m = match[2] === undefined ? 1 : Number(match[2]);
	if (!Number.isFinite(m) || m < 1) m = 1;
	if (m > 12) m = 12;
	return { y, m };
}

/** Calendar year of a date string, or null. */
export function yearOf(value) {
	return parseYearMonth(value)?.y ?? null;
}

/**
 * UTC milliseconds of a date string, for durations. ADS writes "2003-00-00" for a paper dated
 * only by year: an unknown (or missing) month is read at mid-year, 1 July, so the duration is off
 * by at most half a year. An unknown day ("2003-01-00") is the 1st, as upstream reads it.
 * Month buckets (`parseYearMonth`) keep January for an unknown month, because they must agree
 * with the `date` ADS itself derives from the same pubdate.
 */
export function parseDay(value) {
	const match = typeof value === 'string' ? /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?/.exec(value.trim()) : null;
	if (!match) return null;
	const [y, m, d] = match.slice(1).map((part) => Number(part ?? 0));
	if (m < 1) return Date.UTC(y, 6, 1);
	return Date.UTC(y, Math.min(m, 12) - 1, d >= 1 ? d : 1);
}

/**
 * Julian years from one date to another, rounded for output. Null when either
 * date is missing or unparseable; negative values are meaningful.
 */
export function yearsBetween(from, to) {
	const a = parseDay(from);
	const b = parseDay(to);
	if (a === null || b === null) return null;
	return weight((b - a) / 86400000 / 365.25);
}

/** Group array items by a key function into a Map, preserving input order. */
export function groupBy(items, keyFn) {
	const out = new Map();
	for (const item of items) {
		const key = keyFn(item);
		const bucket = out.get(key);
		if (bucket) bucket.push(item);
		else out.set(key, [item]);
	}
	return out;
}

// ---------------------------------------------------------------- formatting
//
// One set of number formatters for every operator-facing string the pipeline
// writes -- the refresh report, the claim details embedded in it, and the
// console summaries. They differ only in how an unavailable value reads, which
// is what `nullText` is for: a markdown table wants an em dash, a sentence of
// prose wants "n/a".

/** A whole number with thousands separators. Non-integers are rounded. */
export function int(value, nullText = '—') {
	const n = num(value);
	return n === null ? nullText : Math.round(n).toLocaleString('en-US');
}

/** Tie-weighted paper counts: one decimal below 10, whole numbers above. */
export function papers(value, nullText = '—') {
	const n = num(value);
	if (n === null) return nullText;
	if (Number.isInteger(n)) return int(n, nullText);
	return n < 10 ? n.toFixed(1) : int(n, nullText);
}

/** "1 paper" / "1.5 papers" / "0 papers": only an exact 1 is singular. */
export const plural = (count, word) => (num(count) === 1 ? word : `${word}s`);
