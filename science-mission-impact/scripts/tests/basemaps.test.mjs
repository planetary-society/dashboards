import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { geoPath } from 'd3-geo';
import { basemapFile, basemapSvg } from '../basemaps.mjs';
import { MAPS } from '../../src/lib/charts/affiliationmap.js';

describe('basemaps', () => {
	it('the world frame is as tall as its projection, so a page can size the map without d3-geo', () => {
		assert.equal(MAPS.world.height, Math.ceil(geoPath(MAPS.world.projection).bounds({ type: 'Sphere' })[1][1]));
	});

	for (const key of ['us', 'world']) {
		it(`${key}.svg matches its projection (rerun node scripts/basemaps.mjs)`, () => {
			assert.equal(readFileSync(basemapFile(key), 'utf8'), basemapSvg(key));
		});
	}
});
