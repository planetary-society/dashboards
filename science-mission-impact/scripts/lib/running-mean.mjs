import { quantile } from './analysis.mjs';
import { byText } from './util.mjs';

const HALF_WIDTH = 1; // one log10-cost unit: neighbours within a factor of ten
const RESAMPLES = 2000;
const GRID_STEPS = 80;
const MIN_MISSIONS = 3;
const MIN_EFFECTIVE = 2; // allow three unequal weights while rejecting windows dominated by one mission

/** Separate, fixed streams keep the curve and group comparison reproducible and independent of each other's work. */
function random() {
	let state = 0x5eeda11;
	return () => ((state = (Math.imul(1664525, state) + 1013904223) >>> 0) / 4294967296);
}

const mean = (values) => values.reduce((total, value) => total + value, 0) / values.length;
const interval = (values) => {
	values.sort((a, b) => a - b);
	return [quantile(values, 0.025), quantile(values, 0.975)];
};

/** Arithmetic mean mission rates either side of the editorial threshold; resample missions within each group. */
function compare(missions, thresholdCost) {
	const under = missions.filter((m) => m.cost <= thresholdCost).map((m) => m.rate);
	const over = missions.filter((m) => m.cost > thresholdCost).map((m) => m.rate);
	if (under.length < 3 || over.length < 3) return null;
	const u = mean(under), o = mean(over), difference = u - o;
	// Roundoff between equal fractional rates is not a direction of effect.
	const tolerance = 8 * Number.EPSILON * Math.max(1, ...under, ...over);
	const direction = (v) => Math.abs(v) <= tolerance ? 0 : Math.sign(v);
	const sign = direction(difference);
	const holds = sign !== 0 && under.every((_, i) => direction(mean(under.filter((__, j) => j !== i)) - o) === sign)
		&& over.every((_, i) => direction(u - mean(over.filter((__, j) => j !== i))) === sign);
	const draw = random();
	const sampledMean = (values) => {
		let total = 0;
		for (let i = 0; i < values.length; i++) total += values[Math.floor(draw() * values.length)];
		return total / values.length;
	};
	const ci = interval(Array.from({ length: RESAMPLES }, () => sampledMean(under) - sampledMean(over)));
	return {
		under: { missions: under.length, mean: u }, over: { missions: over.length, mean: o }, difference, ci, holds,
		favors: holds && direction(ci[0]) > 0 ? 'under' : holds && direction(ci[1]) < 0 ? 'over' : null
	};
}

/**
 * Local arithmetic mean of mission citations per $100M, including measured zeros. Fixed tricube
 * weights in log10 cost; a point needs three neighbours and Kish effective sample size >= 2.
 * The 95% pointwise percentile intervals resample whole mission pairs, retaining the original
 * weights and support rule. A zero-weight bootstrap draw is undefined; an interval needs 95% of
 * the 2,000 draws defined. Unsupported grid points stay null so clients preserve gaps and tails.
 * The separate group comparison never reads the curve or its bandwidth.
 */
export function runningMean(points, thresholdCost) {
	if (!(thresholdCost > 0) || !Number.isFinite(thresholdCost)) throw new Error('running mean: thresholdCost must be positive and finite');
	const missions = points.map(({ id, cost, citations }) => {
		const rate = citations / cost * 100;
		if (typeof id !== 'string' || !(cost > 0) || !Number.isFinite(cost) || !Number.isFinite(citations) || citations < 0 || !Number.isFinite(rate)) {
			throw new Error(`running mean: invalid mission ${id}`);
		}
		return { id, cost, rate, x: Math.log10(cost) };
	}).sort((a, b) => a.cost - b.cost || byText(a.id, b.id));
	const comparison = compare(missions, thresholdCost);
	const result = { halfWidth: HALF_WIDTH, resamples: RESAMPLES, points: [], comparison };
	if (missions.length < MIN_MISSIONS || missions[0].cost === missions.at(-1).cost) return result;
	const lo = missions[0].x, hi = missions.at(-1).x;
	const windows = Array.from({ length: GRID_STEPS + 1 }, (_, i) => {
		const x = lo + (hi - lo) * i / GRID_STEPS;
		const cost = i === 0 ? missions[0].cost : i === GRID_STEPS ? missions.at(-1).cost : 10 ** x;
		const weights = missions.map((m) => {
			const distance = Math.abs(m.x - x) / HALF_WIDTH;
			return distance < 1 ? (1 - distance ** 3) ** 3 : 0;
		});
		const total = weights.reduce((a, w) => a + w, 0);
		const effective = total * total / weights.reduce((a, w) => a + w * w, 0);
		const supported = weights.filter((w) => w > 0).length >= MIN_MISSIONS && effective >= MIN_EFFECTIVE;
		const value = supported ? weights.reduce((a, w, j) => a + w * missions[j].rate, 0) / total : null;
		return { cost, weights, value, samples: [] };
	});
	const supported = windows.filter((w) => w.value !== null);
	const draw = random();
	for (let b = 0; supported.length && b < RESAMPLES; b++) {
		const counts = new Uint32Array(missions.length);
		for (let i = 0; i < missions.length; i++) counts[Math.floor(draw() * missions.length)]++;
		for (const window of supported) {
			let total = 0, weighted = 0;
			for (let i = 0; i < missions.length; i++) {
				const w = window.weights[i] * counts[i];
				total += w;
				weighted += w * missions[i].rate;
			}
			if (total > 0) window.samples.push(weighted / total);
		}
	}
	result.points = windows.map(({ cost, value, samples }) => {
		const [lower, upper] = samples.length >= 0.95 * RESAMPLES ? interval(samples) : [null, null];
		return [cost, value, lower, upper];
	});
	return result;
}
