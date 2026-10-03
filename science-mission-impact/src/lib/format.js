import { format } from 'd3-format';

const comma = format(',d');
const one = format(',.1f');

/** Whole number with thousands separators. null → em dash. */
export const int = (n) => (n == null ? '—' : comma(Math.round(n)));

/** Tie-weighted paper counts: one decimal below 10 unless whole, none above. */
export function weight(n) {
	if (n == null) return '—';
	if (n >= 10 || Number.isInteger(n)) return comma(Math.round(n));
	return one(n);
}

/** Share 0..1 → percent; two decimals under 1%, one under 10%, none above. */
export function pct(share) {
	if (share == null) return '—';
	const p = share * 100;
	if (p === 0) return '0%';
	if (p < 1) return `${p.toFixed(2)}%`;
	if (p < 10) return `${p.toFixed(1)}%`;
	return `${Math.round(p)}%`;
}

/** $M (2025 dollars) → "$74M" / "$3.3B". */
export function money(millions) {
	if (millions == null) return '—';
	if (millions >= 1000) {
		const b = millions / 1000;
		return `$${b >= 10 ? Math.round(b) : b.toFixed(1)}B`;
	}
	if (millions < 10) return `$${millions.toFixed(1)}M`;
	return `$${Math.round(millions)}M`;
}

/** Round axis values: "$1B", not "$1.0B". */
export const moneyTick = (millions) => money(millions).replace(/\.0(?=[MB]$)/, '');

/** Years, signed, one decimal. */
export const years = (y) => (y == null ? '—' : `${y < 0 ? '−' : ''}${Math.abs(y).toFixed(1)}`);

export const yearSpan = (range) => (range ? `${range[0]}–${range[1]}` : '');

/** Compact axis ticks: 1200 → 1.2k, 3400000 → 3.4M. */
export function compact(n) {
	if (n == null) return '';
	const a = Math.abs(n);
	if (a >= 1e6) return `${+(n / 1e6).toFixed(1)}M`;
	if (a >= 1e3) return `${+(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
	return String(Math.round(n));
}

export const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** ISO date → "September 18, 2026". ADS writes unknown months and days as 00; those parts are dropped. */
export function longDate(iso) {
	if (!iso) return '';
	const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
	if (!m) return String(y);
	if (!d) return `${MONTHS[m - 1]} ${y}`;
	return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/** "five" → "Five": sentence-cases a spelled number or any other opening word. */
export const upperFirst = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

/** AP style: spell out whole numbers below 10. */
export const spell = (n) => (Number.isInteger(n) && n >= 0 && n < 10 ? NUMBER_WORDS[n] : int(n));

/** "a", "a and b", "a, b and c" (AP: no serial comma). */
export const listify = (items) =>
	items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
