#!/usr/bin/env node
/**
 * basemaps.mjs -- the affiliation maps' land and borders, drawn once into
 * static/img/maps/{us,world}.svg in the frames of src/lib/charts/affiliationmap.js.
 *
 *   node scripts/basemaps.mjs
 *
 * Rerun after changing a projection there; scripts/tests/basemaps.test.mjs fails
 * until the committed files match. Outlines are Natural Earth 1:110m (world-atlas)
 * and Census 1:10m (us-atlas), thinned to points at least a pixel apart.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geoPath } from 'd3-geo';
import { feature, mesh } from 'topojson-client';
import { MAPS } from '../src/lib/charts/affiliationmap.js';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const atlas = (name) => JSON.parse(readFileSync(createRequire(import.meta.url).resolve(name), 'utf8'));
const SOURCES = {
	us: () => { const t = atlas('us-atlas/states-10m.json'); return [feature(t, t.objects.nation), mesh(t, t.objects.states, (a, b) => a !== b)]; },
	world: () => { const t = atlas('world-atlas/countries-110m.json'); return [feature(t, t.objects.land), mesh(t, t.objects.countries, (a, b) => a !== b)]; }
};
const MIN_STEP = 1; // px

/** A projection stream that drops points closer than MIN_STEP to the last one kept; a line keeps its last point. */
function thinned(projection) {
	return {
		stream(output) {
			let last = null;
			let held = null;
			const thin = {
				point(x, y) {
					if (last && Math.hypot(x - last[0], y - last[1]) < MIN_STEP) return void (held = [x, y]);
					output.point(x, y);
					last = [x, y];
					held = null;
				},
				lineStart() { last = held = null; output.lineStart(); },
				lineEnd() { if (held) output.point(...held); output.lineEnd(); },
				polygonStart() { output.polygonStart(); },
				polygonEnd() { output.polygonEnd(); },
				sphere() { output.sphere(); }
			};
			return projection.stream(thin);
		}
	};
}

/** The basemap SVG for one map: land filled, internal borders stroked. */
export function basemapSvg(key) {
	const { width, height, projection } = MAPS[key];
	const path = geoPath(thinned(projection)).digits(1);
	const [land, borders] = SOURCES[key]();
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`
		+ `<path d="${path(land)}" fill="#1a1a1a"/>`
		+ `<path d="${path(borders)}" fill="none" stroke="#414141" stroke-width="0.6" stroke-linejoin="round"/>`
		+ '</svg>\n';
}

export const basemapFile = (key) => join(APP_ROOT, 'static', 'img', 'maps', `${key}.svg`);

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	for (const key of Object.keys(MAPS)) {
		const svg = basemapSvg(key);
		writeFileSync(basemapFile(key), svg);
		console.log(`${basemapFile(key)}: ${(svg.length / 1e3).toFixed(1)} kB`);
	}
}
