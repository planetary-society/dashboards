import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { affiliationMaps } from '../lib/affiliations.mjs';

const inst = (id, name, country, latitude, longitude) => ({ id, name, country, latitude, longitude });
const institutions = new Map(
	[
		inst('gsfc', 'NASA Goddard', 'US', 38.99, -76.85),
		inst('umd', 'University of Maryland', 'US', 38.99, -76.94), // same US and world cell as Goddard
		inst('jpl', 'JPL', 'US', 34.2, -118.17),
		inst('estec', 'ESTEC', 'NL', 52.22, 4.42),
		inst('arecibo', 'Arecibo Observatory', 'US', 18.47, -66.72), // US, but outside the US map's projection
		inst('lost', 'Somewhere', 'US', null, null)
	].map((i) => [i.id, i])
);

describe('affiliationMaps', () => {
	const papers = new Map([
		['a', ['gsfc', 'umd', 'gsfc']], // two institutions, one cell: counted once
		['b', ['gsfc', 'estec']],
		['c', ['jpl']],
		['d', ['arecibo']],
		['e', ['lost']],
		['f', []]
	]);
	const { summary, file } = affiliationMaps(papers, institutions, 'fixture');

	it('counts every packaged paper, and those with an institution on each map', () => {
		assert.equal(summary.papers, 6);
		assert.equal(summary.us.mapped, 3); // a, b, c
		assert.equal(summary.world.mapped, 4); // and d
	});

	it('counts a paper once per cell and names the cell for its institution with the most papers', () => {
		const [goddard] = file.us.cells;
		assert.deepEqual(goddard, [-77, 38.5, 2, file.places.indexOf('NASA Goddard'), 2]);
		assert.deepEqual(file.us.cells.map((c) => c[2]), [2, 1]);
		assert.deepEqual(file.world.cells.map((c) => [file.places[c[3]], c[2]]), [['NASA Goddard', 2], ['JPL', 1], ['Arecibo Observatory', 1], ['ESTEC', 1]]); // ties west to east
		assert.equal(file.world.cell, 2);
	});

	it('ranks institutions by papers, then name', () => {
		assert.deepEqual(summary.us.top, [{ name: 'NASA Goddard', papers: 2 }, { name: 'JPL', papers: 1 }, { name: 'University of Maryland', papers: 1 }]);
	});

	it('returns null when nothing can be mapped, and fails on an unknown institution', () => {
		assert.equal(affiliationMaps(new Map([['e', ['lost']]]), institutions, 'fixture'), null);
		assert.throws(() => affiliationMaps(new Map([['x', ['nowhere']]]), institutions, 'fixture'), /fixture: institution nowhere/);
	});

	it('fails, naming the record, on an institution with no name or a non-numeric coordinate', () => {
		const bad = (record) => affiliationMaps(new Map([['x', ['bad']]]), new Map([['bad', record]]), 'fixture');
		assert.throws(() => bad(inst('bad', null, 'US', 38, -77)), /fixture: institution bad has no name/);
		assert.throws(() => bad(inst('bad', 'Somewhere', 'US', '38.9', -77)), /fixture: institution bad has a non-numeric latitude/);
		assert.throws(() => bad(inst('bad', 'Somewhere', 'US', 38, NaN)), /fixture: institution bad has a non-numeric longitude/);
	});
});
