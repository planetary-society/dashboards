import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boxMarks, dodge, heatColor, jitter, rateAxis, rateBoxesLayout, rateText, standoutLayout, textOn } from './charts-b.js';

test('the rate axis spans whole decades around the positive values and maps zero into its lane', () => {
	const axis = rateAxis([0, 0.0535, 1.2, 31.9], 10, 300, { lane: 20, gap: 12 });
	assert.deepEqual(axis.y.domain(), [0.01, 100]);
	assert.deepEqual(axis.ticks, [0.01, 0.1, 1, 10, 100]);
	assert.deepEqual(axis.y.range(), [268, 10]);
	assert.equal(axis.at(0), 290); // the middle of the lane, below the break
	assert.equal(axis.breakY, 274);
	assert.ok(axis.at(0.01) < axis.breakY && axis.at(0) > axis.breakY);
	// values on decade lines stay on them; a single decade still gets a decade of room
	assert.deepEqual(rateAxis([0.1, 10], 0, 100).y.domain(), [0.1, 10]);
	assert.deepEqual(rateAxis([1, 1], 0, 100).y.domain(), [1, 10]);
	assert.deepEqual(rateAxis([0, 0], 0, 100).y.domain(), [1, 10]);
});

test('jitter is stable, inside [0, 1), and differs between neighbouring keys', () => {
	const keys = Array.from({ length: 200 }, (_, i) => `0/competed/${i}`);
	const a = keys.map(jitter);
	assert.deepEqual(a, keys.map(jitter));
	assert.ok(a.every((v) => v >= 0 && v < 1));
	assert.ok(new Set(a).size === a.length);
	// spread across the box, not bunched on one side
	assert.ok(a.filter((v) => v < 0.5).length > 70 && a.filter((v) => v < 0.5).length < 130);
});

test('a box with q1 or a whisker at zero runs into the zero lane; whiskers never stop inside the box', () => {
	const axis = rateAxis([0.05, 20], 0, 200);
	const m = boxMarks({ missions: 46, zeros: 20, median: 0.18, q1: 0, q3: 1.31, whiskers: [0, 2.16] }, axis.at, axis.laneBottom);
	assert.equal(m.q1, axis.laneBottom);
	assert.equal(m.lo, axis.laneBottom);
	assert.equal(boxMarks({ missions: 5, zeros: 3, median: 0, q1: 0, q3: 0.4, whiskers: [0, 1] }, axis.at, axis.laneBottom).median, axis.zeroY);
	assert.ok(m.q3 < m.median && m.hi < m.q3);
	// four missions: the farthest value within the fence (0.92) falls short of q3 (2.74)
	const few = boxMarks({ missions: 4, zeros: 0, median: 0.79, q1: 0.66, q3: 2.74, whiskers: [0.65, 0.92] }, axis.at);
	assert.equal(few.hi, few.q3);
	assert.equal(few.lo, axis.y(0.65));
	assert.equal(boxMarks({ missions: 0, zeros: 0, median: null, q1: null, q3: null, whiskers: null }, axis.at), null);
});

const spread = (values) => ({ missions: values.length, zeros: values.filter((v) => v === 0).length, median: 0.5, q1: 0, q3: 1, whiskers: [0, 2] });

test('box dots stay inside their box and the zero lane; labels fall back when boxes get narrow', () => {
	const values = [0, 0, 0, 0.05, 0.5, 1, 2, 9];
	const one = [0, 1, 2].map((i) => ({ label: `G${i}`, boxes: [{ key: 'all', tone: 'light', spread: spread(values), values }] }));
	const wide = rateBoxesLayout(one, 480);
	for (const b of wide.boxes) {
		for (const [i, d] of b.dots.entries()) {
			assert.ok(Math.abs(d.x - b.x) <= wide.bw * 0.4);
			if (values[i] === 0) assert.ok(d.y > wide.axis.laneTop && d.y < wide.axis.laneBottom);
			else assert.equal(d.y, wide.axis.y(values[i]));
		}
	}
	assert.deepEqual(rateBoxesLayout(one, 480).boxes.map((b) => b.dots), wide.boxes.map((b) => b.dots)); // deterministic
	assert.equal(wide.beside, true);
	assert.equal(wide.inline, true);

	const two = [0, 1, 2].map((i) => ({
		label: `G${i}`,
		boxes: ['directed', 'competed'].map((k) => ({ key: k, label: k === 'directed' ? 'Directed' : 'Competed', tone: k, spread: spread(values), values }))
	}));
	const narrow = rateBoxesLayout(two, 340);
	assert.equal(narrow.beside, false); // no room between a cluster's two boxes
	assert.equal(narrow.inline, false);
	assert.deepEqual(narrow.rows.map((r) => r.kind), ['n', 'median', 'zeros']); // box labels left to the legend
	assert.ok(rateBoxesLayout(two, 760).rows.some((r) => r.kind === 'label'));
});

test('rates print two decimals below 10, one above, and never a false zero', () => {
	assert.deepEqual([0, 0.17873, 0.08511, 1.58736, 11.9758, 0.0031].map(rateText), ['0', '0.18', '0.09', '1.59', '12.0', '0.003']);
});

test('heatmap ramp is clamped to [0, 2] with Neptune at 1, and text picks the higher contrast', () => {
	assert.equal(heatColor(1), 'rgb(3, 124, 194)');
	assert.equal(heatColor(2), heatColor(5));
	assert.equal(heatColor(0), heatColor(-1));
	assert.equal(heatColor(2), 'rgb(191, 222, 240)');
	assert.equal(textOn(heatColor(0)), '#fff');
	assert.equal(textOn(heatColor(0.4)), '#fff');
	assert.equal(textOn(heatColor(1.6)), '#000');
	assert.equal(textOn(heatColor(2)), '#000');
	assert.equal(textOn('rgb(255, 255, 255)'), '#000');
	assert.equal(textOn('rgb(0, 0, 0)'), '#fff');
});

test('dodge moves only labels that share horizontal room, and keeps them in bounds', () => {
	const ys = dodge(
		[
			{ x0: 0, x1: 50, y: 20 },
			{ x0: 10, x1: 60, y: 25 }, // overlaps the first
			{ x0: 100, x1: 150, y: 22 } // clear of both: stays put
		],
		13,
		[0, 200]
	);
	assert.deepEqual(ys, [20, 33, 22]);
	assert.deepEqual(dodge([{ x0: 0, x1: 10, y: 195 }, { x0: 0, x1: 10, y: 196 }], 13, [0, 200]), [195, 200]);
	assert.deepEqual(dodge([{ x0: 0, x1: 10, y: -5 }], 13, [4, 200]), [4]);
});

test('standout panels: shared axes, failures in the zero lane, standouts labelled apart', () => {
	const missions = [
		{ id: 'a', name: 'Alpha', division: 'helio', cost: 5, rate: 19, failed: false },
		{ id: 'b', name: 'Beta', division: 'helio', cost: 6, rate: 18, failed: false },
		{ id: 'c', name: 'Gamma', division: 'helio', cost: 3, rate: 0, failed: true },
		{ id: 'd', name: 'Delta', division: 'helio', cost: 900, rate: 2, failed: false },
		{ id: 'e', name: 'Eps', division: 'astro', cost: 2000, rate: 0.5, failed: false },
		{ id: 'f', name: 'Bio', division: 'bio', cost: 0.1, rate: 900, failed: false } // not a compared division: off both axes
	];
	const standouts = [
		{ division: 'helio', overMedian: 2, missions: [{ id: 'a' }, { id: 'b' }] },
		{ division: 'astro', overMedian: 0.5, missions: [] }
	];
	const divisions = [{ division: 'helio', name: 'Heliophysics' }, { division: 'astro', name: 'Astrophysics' }];
	const L = standoutLayout(missions, standouts, divisions, 150, 760);
	assert.equal(L.cols, 2);
	assert.equal(standoutLayout(missions, standouts, divisions, 150, 600).cols, 1);
	assert.deepEqual(L.axis.y.domain(), [0.1, 100]);
	assert.ok(L.x.domain()[0] > 2 / 1.5);
	const [helio] = L.panels;
	const kinds = Object.fromEntries(helio.points.map((p) => [p.id, p.kind]));
	assert.deepEqual(kinds, { a: 'standout', b: 'standout', c: 'failed', d: 'over' });
	assert.equal(helio.points.at(-1).kind, 'standout');
	const gamma = helio.points.find((p) => p.id === 'c');
	assert.ok(gamma.y > L.axis.laneTop && gamma.y < L.axis.laneBottom);
	const [la, lb] = helio.labels;
	assert.ok(Math.abs(la.y - lb.y) >= 13);
	assert.equal(helio.medianY, L.axis.y(2));
});
