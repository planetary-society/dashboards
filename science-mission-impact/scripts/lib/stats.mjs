/**
 * Rank statistics.
 *
 * The site never fits a curve to a scatter -- it reports the rank correlation
 * and the n behind it, which is all a monotone "does this index rise with
 * cost?" reading can honestly carry.
 *
 * Pure: values in, values out.
 */

import { num, share } from './util.mjs';

/** Below this many pairs a rank correlation says nothing, so it says null. */
export const MIN_PAIRS = 3;

/** Ranks 1..n, tied values sharing their average rank. */
export function averageRanks(values) {
	const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
	const ranks = new Array(values.length);
	let i = 0;
	while (i < order.length) {
		let j = i;
		while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j += 1;
		const rank = (i + j) / 2 + 1;
		for (let k = i; k <= j; k += 1) ranks[order[k][1]] = rank;
		i = j + 1;
	}
	return ranks;
}

/**
 * Spearman's rho over paired values, ties taking their average rank.
 *
 * Null when there are fewer than MIN_PAIRS pairs, when the two arrays disagree
 * in length, or when either side is constant (no ranking to correlate).
 */
export function spearman(xs, ys) {
	const x = (xs ?? []).map(num);
	const y = (ys ?? []).map(num);
	if (x.length !== y.length || x.length < MIN_PAIRS) return null;
	if (x.some((v) => v === null) || y.some((v) => v === null)) return null;
	const rx = averageRanks(x);
	const ry = averageRanks(y);
	const mean = (a) => a.reduce((t, v) => t + v, 0) / a.length;
	const mx = mean(rx);
	const my = mean(ry);
	let cov = 0;
	let varX = 0;
	let varY = 0;
	for (let i = 0; i < rx.length; i += 1) {
		const a = rx[i] - mx;
		const b = ry[i] - my;
		cov += a * b;
		varX += a * a;
		varY += b * b;
	}
	if (varX === 0 || varY === 0) return null;
	return cov / Math.sqrt(varX * varY);
}

/**
 * How each citation index tracks cost within one division.
 *
 * Failures are left out: a mission that never returned data has an index of
 * zero for a reason that has nothing to do with what it cost. So is a mission
 * with no recorded cost, or one the index was not computed for (`m` needs a
 * first refereed paper to date from).
 *
 * @param {{failed?: boolean, cost: number|null, indices?: {m: number|null, h: number|null}}[]} rows
 * @returns {{m: {rho: number|null, n: number}, h: {rho: number|null, n: number}}}
 */
export function buildIndexCorrelation(rows) {
	const eligible = (rows ?? []).filter((row) => !row?.failed && num(row?.cost) !== null);
	const out = {};
	for (const key of ['m', 'h']) {
		const pairs = eligible.filter((row) => num(row.indices?.[key]) !== null);
		out[key] = {
			rho: share(spearman(pairs.map((r) => r.cost), pairs.map((r) => r.indices[key]))),
			n: pairs.length
		};
	}
	return out;
}
