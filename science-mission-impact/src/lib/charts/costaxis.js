/**
 * The cost axis, shared. Four views lay missions out by what each one cost — the story's cost
 * step, a division's cost curve, the index scatter and the social preview — and they have to
 * agree: the same order, the same rule for lifting a square off a crowded neighbour, the same
 * decade ticks, the same step line. One copy of each here so they cannot drift apart.
 *
 * Pure: values in, values out. No DOM, no scale of its own — the caller keeps its own domain,
 * its own padding and its own coordinate rounding.
 */

/** Cheapest first, id as the tiebreak, so equal costs never reshuffle between redraws. */
export const byCostThenId = (a, b) => a.cost - b.cost || (a.id === b.id ? 0 : a.id < b.id ? -1 : 1);

/**
 * Place items at their exact x, moving any that would touch a neighbour up a level. `list` is
 * in cost order; returns each item's level (0 = against the axis) and how many levels deep the
 * stack ends up.
 */
export function stackLevels(list, xOf, s, gap) {
	const ends = []; // right edge of the last item on each level
	const levels = new Map();
	for (const t of list) {
		const px = xOf(t);
		let k = ends.findIndex((end) => px >= end + gap);
		if (k < 0) k = ends.length;
		ends[k] = px + s;
		levels.set(t.id, k);
	}
	return { levels, depth: ends.length };
}

/** The whole powers of ten inside [lo, hi]. Repeated ×10 drifts off the decade, so each is cleaned. */
export function decadeTicks(lo, hi) {
	const out = [];
	for (let v = 10 ** Math.ceil(Math.log10(lo)); v <= hi; v *= 10) out.push(Number(v.toPrecision(12)));
	return out;
}

/**
 * Cost ticks for a log scale `x`. Decades always carry a gridline (`grid`). When every label
 * gets `gap` px of its own, the 2× and 5× values are labelled too; narrower than that they go
 * first, and below one decade per `gap` every other decade loses its label as well.
 */
export function costTicks(x, gap = 44) {
	const [lo, hi] = x.domain();
	const decade = x(lo * 10) - x(lo); // px per decade: the same anywhere on a log scale
	// 1→2 and 5→10 are the closest neighbours, log10(2) of a decade apart
	if (decade * Math.log10(2) < gap) return decadeTicks(lo, hi).map((value, i) => ({ value, grid: true, label: decade >= gap || i % 2 === 0 }));
	const out = [];
	for (let power = Math.floor(Math.log10(lo)); power <= Math.floor(Math.log10(hi)); power++) {
		for (const multiple of [1, 2, 5]) {
			const value = Number((multiple * 10 ** power).toPrecision(12));
			if (value >= lo && value <= hi) out.push({ value, grid: multiple === 1, label: true });
		}
	}
	return out;
}

/** Unlabeled 2–9 subdivisions of each dollar decade, clipped to the actual log domain. */
export function minorDollarTicks(lo, hi) {
	if (!(Number.isFinite(lo) && Number.isFinite(hi) && lo > 0 && hi >= lo)) return [];
	const out = [];
	for (let power = Math.floor(Math.log10(lo)); power <= Math.floor(Math.log10(hi)); power++) {
		for (let multiple = 2; multiple < 10; multiple++) {
			const value = Number((multiple * 10 ** power).toPrecision(12));
			if (value >= lo && value <= hi) out.push(value);
		}
	}
	return out;
}

/**
 * Step after: an item adds its value at the point it sits on the axis. The line starts at zero
 * on the left edge and runs flat to the right edge, so a division with nothing at either end
 * still reads as a line rather than a fragment. `round` is the caller's coordinate rounding,
 * if it has any.
 */
export function stepAfterPath(points, { x, y, x0, x1, value, round = (n) => n }) {
	let d = `M${round(x0)},${round(y(0))}`;
	for (const p of points) d += `H${round(x(p.cost))}V${round(y(value(p)))}`;
	return `${d}H${round(x1)}`;
}
