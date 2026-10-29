// Labels for the Analysis page's cost tiers and groups (AnalysisFacts.tiers / .groups).
// Membership is lo < cost <= hi, so the first tier reads "≤", the open last one ">".

/** A tier edge as a chart label, printed exactly rather than rounded like money(): 50 → "$50M", 1000 → "$1B", 1550 → "$1.55B". */
export const edgeMoney = (millions) => (millions >= 1000 ? `$${+(millions / 1000).toFixed(2)}B` : `$${+millions.toFixed(1)}M`);

/** "≤$50M", "$50M–$150M", ">$1.55B". `short` drops the first unit when both edges share it: "$50–150M". */
export function tierLabel({ lo, hi }, { short = false } = {}) {
	if (hi == null) return `>${edgeMoney(lo)}`;
	if (lo === 0) return `≤${edgeMoney(hi)}`;
	const a = edgeMoney(lo);
	const b = edgeMoney(hi);
	return short && a.at(-1) === b.at(-1) ? `${a.slice(0, -1)}–${b.slice(1)}` : `${a}–${b}`;
}
