/**
 * Where a mission's or division's publications were written: each paper's author
 * institutions (upstream's ADS canonical affiliations, located through ROR), binned
 * on each map's latitude/longitude grid (`MAPS` in src/lib/charts/affiliationmap.js).
 *
 * A cell counts a paper once however many of its authors or institutions fall in it,
 * so it reads "papers with an author here". Each cell is named for its institution
 * with the most papers. The page doc gets the small summary; the cells go in a file
 * the page fetches, as the paper list does.
 */

import { MAPS, onMap } from '../../src/lib/charts/affiliationmap.js';
import { PackagingError } from './invariants.mjs';

const TOP = 3;
const increment = (map, key) => map.set(key, (map.get(key) ?? 0) + 1);
const byPapersThenName = (a, b) => b.papers - a.papers || a.name.localeCompare(b.name);

/**
 * An institution record checked once and placed on each map: its cell key there, or null when the
 * map can't place it. Keyed by the record itself, so an id still has to be in each caller's own
 * institutions file, while a division's papers reuse what their missions already placed.
 */
function placeOf(id, institutions, label, placed) {
	const inst = institutions.get(id);
	if (!inst) throw new PackagingError(`${label}: institution ${id} is not in the institutions file`);
	let p = placed.get(inst);
	if (p) return p;
	if (typeof inst.name !== 'string' || !inst.name) throw new PackagingError(`${label}: institution ${id} has no name`);
	// a coordinate is a number or absent; anything else would project to NaN
	for (const k of ['latitude', 'longitude']) {
		if (inst[k] != null && !Number.isFinite(inst[k])) throw new PackagingError(`${label}: institution ${id} has a non-numeric ${k}`);
	}
	const at = Object.fromEntries(Object.entries(MAPS).map(([key, { cell }]) => [key, onMap(key, inst) ? `${Math.floor(inst.longitude / cell)},${Math.floor(inst.latitude / cell)}` : null]));
	placed.set(inst, (p = { inst, at }));
	return p;
}

/**
 * @param {Map<string, string[]>} papers bibcode -> institution ids, every packaged paper ([] when it has none)
 * @param {Map<string, {id: string, name: string, country: string, latitude: number|null, longitude: number|null}>} institutions
 * @param {string} label names the mission or division in errors
 * @param {WeakMap} [placed] placements to share between calls over the same records (a division and its missions)
 * @returns {{summary: object, file: object} | null} null when no paper has a mapped institution
 */
export function affiliationMaps(papers, institutions, label, placed = new WeakMap()) {
	// every reference is checked before anything is counted
	const byPaper = [...papers.values()].map((ids) => [...new Set(ids)].map((id) => placeOf(id, institutions, label, placed)));
	const summary = { papers: papers.size };
	const file = { places: [] };
	const place = new Map(); // name -> index in file.places, shared by both maps
	for (const [key, { cell }] of Object.entries(MAPS)) {
		const perInstitution = new Map();
		const perCell = new Map();
		let mapped = 0;
		for (const all of byPaper) {
			const here = all.filter((p) => p.at[key] != null);
			if (!here.length) continue;
			mapped += 1;
			for (const p of here) increment(perInstitution, p);
			for (const k of new Set(here.map((p) => p.at[key]))) increment(perCell, k);
		}
		const ranked = [...perInstitution].map(([p, n]) => ({ name: p.inst.name, k: p.at[key], papers: n })).sort(byPapersThenName);
		const named = new Map(); // cell -> [its institution with the most papers, how many institutions]
		for (const { name, k } of ranked) named.set(k, named.has(k) ? [named.get(k)[0], named.get(k)[1] + 1] : [name, 1]);
		file[key] = {
			cell,
			// [west, south, papers, place index, institutions], the most papers first
			cells: [...perCell]
				.map(([k, n]) => {
					const [i, j] = k.split(',').map(Number);
					return [i * cell, j * cell, n, ...named.get(k)];
				})
				.sort((a, b) => b[2] - a[2] || a[0] - b[0] || a[1] - b[1])
				.map(([west, south, n, name, count]) => {
					if (!place.has(name)) place.set(name, file.places.push(name) - 1);
					return [west, south, n, place.get(name), count];
				})
		};
		summary[key] = { mapped, top: ranked.slice(0, TOP).map(({ name, papers: n }) => ({ name, papers: n })) };
	}
	return summary.world.mapped ? { summary, file } : null;
}
