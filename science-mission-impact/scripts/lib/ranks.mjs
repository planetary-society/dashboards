/**
 * Citation-rank histogram: where a mission's papers fall among every paper from its
 * division's missions, in ten equal bins.
 *
 * Ranking follows the analysis project's tie rule, generalised from one cutoff to any bin.
 * Distinct papers are sorted by citations, so each group of tied papers occupies a span of
 * ranks; a bin takes from each paper in the group the fraction of that span it covers.
 *
 * The bins count a mission's papers whole, so they add up to the paper count its page
 * states. The run's own credit splits a paper shared by several missions between them, so
 * each entry also carries that split `credit` at the edges the tiers know, and
 * `assertRanksMatchTiers` holds the two to each other. `credit` is never published.
 */

import { PackagingError } from './invariants.mjs';
import { weight } from './util.mjs';

export const RANK_BINS = 10;

/** Measured, and measured as none. */
export const emptyRanks = () => ({ bins: new Array(RANK_BINS).fill(0), top1: 0, credit: { 1: 0, 10: 0, 50: 0 } });

/**
 * @param {object[]} rows one row per mission × paper
 * @param {object} keys row field names: { citations, sharedBy }
 * @returns {Map<string, { bins: number[], top1: number, credit: object }>} by `row.mission`;
 *   bins run from the bottom tenth (0) to the top tenth (9), and `top1` is the part of bin 9
 *   inside the top 1%.
 */
export function rankHistograms(rows, { citations, sharedBy }) {
	const byBibcode = new Map();
	for (const row of rows) byBibcode.set(row.bibcode, Number(row[citations] ?? 0));
	const total = byBibcode.size;

	const tied = new Map();
	for (const c of byBibcode.values()) tied.set(c, (tied.get(c) ?? 0) + 1);
	const span = new Map();
	let rank = 0;
	for (const [c, n] of [...tied].sort((a, b) => b[0] - a[0])) {
		span.set(c, [rank, rank + n]);
		rank += n;
	}
	/** Fraction of a paper with `c` citations that lies in ranks [from, to). */
	const inside = (c, from, to) => {
		const [lo, hi] = span.get(c);
		return Math.max(0, Math.min(hi, to) - Math.max(lo, from)) / (hi - lo);
	};

	const out = new Map();
	for (const row of rows) {
		let entry = out.get(row.mission);
		if (!entry) out.set(row.mission, (entry = emptyRanks()));
		const c = byBibcode.get(row.bibcode);
		for (let k = 0; k < RANK_BINS; k += 1) {
			// bin 9 is ranks [0, 10%), bin 0 is ranks [90%, 100%)
			const from = (total * (RANK_BINS - 1 - k)) / RANK_BINS;
			entry.bins[k] += inside(c, from, from + total / RANK_BINS);
		}
		entry.top1 += inside(c, 0, total / 100);
		const share = 1 / (Number(row[sharedBy]) || 1);
		for (const percent of Object.keys(entry.credit)) entry.credit[percent] += inside(c, 0, (total * percent) / 100) * share;
	}
	for (const entry of out.values()) {
		entry.bins = entry.bins.map(weight);
		entry.top1 = weight(entry.top1);
	}
	return out;
}

/** The published part of an entry. */
export const publicRanks = (entry) => (entry ? { bins: entry.bins, top1: entry.top1 } : null);

/**
 * The histogram and the tiers are two readings of one ranking. Where their edges coincide
 * (top 1%, top 10%, top half) the split credit must agree, or the two have drifted apart.
 */
export function assertRanksMatchTiers({ id, scope, ranks, tiers, bounds, tolerance = 0.01 }) {
	if (!ranks || !tiers) return;
	const upTo = (percent) => tiers.reduce((sum, v, i) => (bounds[i] <= percent ? sum + v : sum), 0);
	for (const percent of Object.keys(ranks.credit)) {
		const mine = ranks.credit[percent];
		const theirs = upTo(Number(percent));
		if (Math.abs(mine - theirs) > tolerance) {
			throw new PackagingError(
				`mission "${id}" ${scope}: rank histogram credits ${mine} papers in the top ${percent}%, the run's tie-weighted credit says ${theirs}`
			);
		}
	}
}

/**
 * A division's distinct papers by citation count, for the story's primer: `counts[c]` papers
 * drew exactly c citations, for c below `cap`; `overflow` drew `cap` or more. A shared paper
 * counts once, at the count the ranking read for it. `top` and `topOverflow` hold how many of
 * those papers are top-10% papers (`topWeight`, fractional where a tie straddles the cutoff),
 * so the primer shades exactly the papers the story counts.
 */
export function citationHistogram(rows, { citations, topWeight }, cap = 100) {
	const byBibcode = new Map();
	for (const row of rows) byBibcode.set(row.bibcode, [Number(row[citations] ?? 0), Number(row[topWeight] ?? 0)]);
	const counts = new Array(cap).fill(0);
	const top = new Array(cap).fill(0);
	let overflow = 0;
	let topOverflow = 0;
	for (const [c, w] of byBibcode.values()) {
		if (c >= cap) {
			overflow += 1;
			topOverflow += w;
		} else {
			counts[c] += 1;
			top[c] += w;
		}
	}
	return { counts, overflow, top: top.map(weight), topOverflow: weight(topOverflow), papers: byBibcode.size };
}
