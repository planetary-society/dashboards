import { test } from 'node:test';
import assert from 'node:assert/strict';
import { swarm, timeSwarmLayout, timeItems, timeHit, timeLabel, CLOCKS, NONE_OPACITY } from './timeswarm.js';

const tiers = [{ lo: 0, hi: 150 }, { lo: 150, hi: 1000 }, { lo: 1000, hi: null }];
const point = (id, formulation, science) => ({ id, name: id.toUpperCase(), reached: formulation != null, formulation, science });
const median = (median, ci = null) => ({ median, min: null, ci });
// a sparse small group with most of it in the None column, a crowded middle (most papers within a
// year of science starting) and a costly group with long builds and one late straggler
const groups = [
	{
		missions: 12, reached: 4,
		points: [3.3, 4.1, 6.5, 9.2].map((v, i) => point(`s${i}`, v, v / 3)).concat(Array.from({ length: 8 }, (_, i) => point(`n${i}`, null, null))),
		formulation: median(5.3, [3.3, 9.2]), science: median(1.8, [1.1, 3.1])
	},
	{ missions: 40, reached: 40, points: Array.from({ length: 40 }, (_, i) => point(`m${i}`, 4 + (i % 10) * 0.5, (i % 8) * 0.12)), formulation: median(6.2, [5.4, 6.9]), science: median(0.4, [0.3, 0.6]) },
	{ missions: 20, reached: 20, points: Array.from({ length: 20 }, (_, i) => point(`l${i}`, 6 + i * 0.6, i === 0 ? 3.3 : (i % 5) * 0.1)), formulation: median(11.7, [9, 13]), science: median(0.2, [0.1, 0.4]) }
];
const overlap = (a, b) => Math.abs(a.x - b.x) < a.s && Math.abs(a.y - b.y) < a.s;

test('a swarm packs every square without overlap, around the midline', () => {
	const xs = [10, 10, 10, 11, 12, 30, 30.5, 60];
	const ys = swarm(xs, 8, 1);
	for (let i = 0; i < xs.length; i++) {
		for (let j = i + 1; j < xs.length; j++) assert.ok(!overlap({ x: xs[i], y: ys[i], s: 9 - 1e-6 }, { x: xs[j], y: ys[j] }), `${i} and ${j} overlap`);
	}
	// a lone square sits on the midline; a crowd spreads both ways
	assert.equal(ys[7], 0);
	assert.ok(Math.min(...ys) < 0 && Math.max(...ys) > 0);
});

test('bands share the stage between the title and the axis, every square inside its own band', () => {
	for (const [W, H] of [[374, 414], [374, 324], [850, 800]]) {
		const layout = timeSwarmLayout(groups, tiers, W, H);
		const { s } = layout;
		const [first, last] = [layout.rows[0], layout.rows.at(-1)];
		assert.ok(Math.abs(first.y - layout.top) < 1e-6 && Math.abs(last.y + last.h - layout.axisY) < 1e-6, `${W}×${H}: bands don't span the plot`);
		for (const clock of CLOCKS) {
			layout.clocks[clock].rows.forEach((row, i) => {
				for (const m of row.marks) {
					assert.ok(m.y - s / 2 >= layout.rows[i].y0 - 0.5 && m.y + s / 2 <= layout.rows[i].y1 + 0.5, `${W}×${H} ${clock}: ${m.id} spills out of its band`);
					assert.ok(m.x >= layout.x0 && m.x <= layout.x1);
				}
			});
			// no two squares on the stage overlap, the None column's included
			const placed = [...timeItems(layout, clock).values()];
			for (let a = 0; a < placed.length; a++) for (let b = a + 1; b < placed.length; b++) assert.ok(!overlap(placed[a], placed[b]), `${W}×${H} ${clock}: squares overlap`);
		}
		// the None column sits right of the year axis, one square per mission without a paper
		assert.ok(layout.pile.x > layout.x1);
		assert.deepEqual(layout.piles.map((p) => p.marks.length), [8, 0, 0]);
		for (const m of layout.piles[0].marks) assert.ok(m.y >= first.y0 - 0.5 && m.y <= first.y1 + 0.5);
	}
	// the square is smaller on a phone than on a desktop, and a tenth under the largest that fits (never under 3.6px)
	const [phone, desk] = [timeSwarmLayout(groups, tiers, 374, 324), timeSwarmLayout(groups, tiers, 850, 800)];
	assert.ok(phone.s < desk.s && phone.s >= 3.6);
	assert.equal(desk.s, 18 * 0.9);
});

test('the stage squares: every flown mission placed, those without a paper dimmed in the None column', () => {
	const layout = timeSwarmLayout(groups, tiers, 850, 800);
	const items = timeItems(layout, 'formulation');
	assert.equal(items.size, 72);
	assert.equal(items.get('n0').opacity, NONE_OPACITY);
	assert.equal(items.get('m0').opacity, 1);
	assert.ok(items.get('n0').x >= layout.pile.x);
	// both clocks carry the same missions, so the squares glide between them
	assert.deepEqual([...timeItems(layout, 'science').keys()].sort(), [...items.keys()].sort());
	// only papers published once science began count, so both clocks start at zero
	assert.equal(layout.clocks.science.x.domain()[0], 0);
	assert.equal(layout.clocks.formulation.x.domain()[0], 0);
});

test('a phone moves a median value clear of the group name it shares the header with', () => {
	const layout = timeSwarmLayout(groups, tiers, 374, 414);
	for (const clock of CLOCKS) {
		for (const { median } of layout.clocks[clock].rows) if (median.anchor === 'start') assert.ok(median.tx > 4);
	}
});

test('pointing names the nearest mission, in a swarm or the None column', () => {
	const layout = timeSwarmLayout(groups, tiers, 850, 800);
	const mark = layout.clocks.formulation.rows[1].marks[0];
	assert.equal(timeHit(layout, 'formulation', mark.x + 1, mark.y), mark.id);
	assert.match(timeLabel(layout, 'formulation', mark.id).text, /^M\d+: \d+\.\d yr$/);
	const none = layout.piles[0].marks[0];
	assert.equal(timeHit(layout, 'science', none.x, none.y), none.id);
	assert.equal(timeLabel(layout, 'science', none.id).text, 'N0: no high-impact papers');
	assert.equal(timeHit(layout, 'formulation', layout.x0, layout.top - 5), null);
});
