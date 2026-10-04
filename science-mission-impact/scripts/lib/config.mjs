/**
 * Validation of smi.config.json. Everything about which runs, divisions and
 * analysis settings exist comes from that file; nothing is hard-coded here.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

/** The app's smi.config.json, parsed and validated. Every entry point uses this. */
export function loadConfig(appDir) {
	return validateConfig(JSON.parse(readFileSync(path.join(appDir, 'smi.config.json'), 'utf8')));
}

/**
 * Throw unless the parsed config has the shape the packager relies on.
 * Returns the config so callers can write `const cfg = validateConfig(raw)`.
 */
export function validateConfig(config) {
	const fail = (message) => {
		throw new Error(`smi.config.json: ${message}`);
	};
	if (!config || typeof config !== 'object') fail('not an object');

	if (!Array.isArray(config.divisions) || config.divisions.length === 0) {
		fail('divisions must be a non-empty array');
	}
	const slugs = new Set();
	const labels = new Set();
	for (const d of config.divisions) {
		for (const key of ['slug', 'name', 'nav', 'statsLabel']) {
			if (typeof d?.[key] !== 'string' || d[key] === '') {
				fail(`division entry is missing a string "${key}": ${JSON.stringify(d)}`);
			}
		}
		if (slugs.has(d.slug)) fail(`duplicate division slug "${d.slug}"`);
		if (labels.has(d.statsLabel)) fail(`duplicate statsLabel "${d.statsLabel}"`);
		slugs.add(d.slug);
		labels.add(d.statsLabel);
	}

	// Which division's time to a first top paper the story walks through is an
	// editorial choice, so it is configuration too; it must name a division.
	if (config.storyTimingDivision !== undefined && !slugs.has(config.storyTimingDivision)) {
		fail(`storyTimingDivision must be a division slug, got ${JSON.stringify(config.storyTimingDivision)}`);
	}

	// The cost line the story compares either side of is an editorial choice ("$150M or less").
	if (!Number.isFinite(config.thresholdCost) || config.thresholdCost <= 0) {
		fail(`thresholdCost must be a positive number ($M), got ${JSON.stringify(config.thresholdCost)}`);
	}
	// The CLPS chart reads a second dataset, named explicitly: never a fallback.
	const clps = config.clps;
	if (typeof clps?.rawDir !== 'string' || clps.rawDir === '') fail('clps.rawDir must be a non-empty string');
	if (!Array.isArray(clps.comparators) || clps.comparators.some((id) => typeof id !== 'string' || id === '')) {
		fail('clps.comparators must be an array of non-empty mission ids');
	}
	if (!Number.isInteger(clps.horizonMonths) || clps.horizonMonths < 1) {
		fail(`clps.horizonMonths must be a whole number of at least 1, got ${JSON.stringify(clps.horizonMonths)}`);
	}
	// The paper-kinds classification is an input file, like costs.
	const kinds = config.paperKinds;
	if (typeof kinds?.file !== 'string' || kinds.file === '') fail('paperKinds.file must be a non-empty string');
	if (!Array.isArray(kinds.examples) || kinds.examples.length === 0 || kinds.examples.some((id) => typeof id !== 'string' || id === '')) {
		fail('paperKinds.examples must be a non-empty array of non-empty mission ids');
	}
	if (!Number.isInteger(kinds.smallMax) || kinds.smallMax < 1) fail('paperKinds.smallMax must be an integer >= 1');
	// Display names for published output; upstream titles stay the lookup keys.
	const names = config.names ?? {};
	if (typeof names !== 'object' || Array.isArray(names)) fail('names must be an object keyed by mission id');
	for (const [id, entry] of Object.entries(names)) {
		const keys = Object.keys(entry ?? {});
		if (typeof entry !== 'object' || Array.isArray(entry) || keys.length === 0 ||
			keys.some((key) => !['name', 'fullName'].includes(key) || typeof entry[key] !== 'string' || entry[key].trim() === '')) {
			fail(`names.${id} must be an object with a non-empty string "name" and/or "fullName", got ${JSON.stringify(entry)}`);
		}
	}
	// Tile images from a URL of our choosing instead of upstream's image_url (scripts/fetch-thumbs.mjs).
	const thumbs = config.thumbnails;
	if (thumbs !== undefined) {
		const overrides = thumbs?.overrides;
		if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) fail('thumbnails.overrides must be an object keyed by mission id');
		for (const [id, url] of Object.entries(overrides)) {
			let protocol = null;
			try { protocol = new URL(url).protocol; } catch { /* not a URL */ }
			if (protocol !== 'http:' && protocol !== 'https:') fail(`thumbnails.overrides.${id} must be an http(s) URL, got ${JSON.stringify(url)}`);
		}
	}
	if (!Number.isFinite(config.rankingMinPapers) || config.rankingMinPapers < 0) {
		fail('rankingMinPapers must be a non-negative number');
	}
	if (config.citationHistory !== undefined && (!Number.isInteger(config.citationHistory?.maxMissing) ||
		config.citationHistory.maxMissing < 0 || !Number.isFinite(config.citationHistory.maxMissingFraction) ||
		config.citationHistory.maxMissingFraction < 0 || config.citationHistory.maxMissingFraction > 1)) {
		fail('citationHistory requires a nonnegative integer maxMissing and maxMissingFraction between 0 and 1');
	}
	if (!Array.isArray(config.tierPercents) || config.tierPercents.length === 0) {
		fail('tierPercents must be a non-empty array');
	}
	for (let i = 1; i < config.tierPercents.length; i += 1) {
		if (!(config.tierPercents[i] > config.tierPercents[i - 1])) {
			fail('tierPercents must be strictly ascending');
		}
	}
	if (config.tierPercents.at(-1) >= 100) fail('tierPercents must all be below 100');
	const versions = config.schemaVersions;
	if (!Number.isFinite(versions?.mission) || !Number.isFinite(versions?.stats)) {
		fail('schemaVersions.mission and schemaVersions.stats must be numbers');
	}
	return config;
}

/**
 * The selected science-mission-citations dataset directory (dist/fixed by default).
 * Explicit overrides name that directory directly; no prefix is appended.
 *
 * An empty string counts as "not given": the Justfile passes `SMI_RAW_DIR=""`
 * when no directory argument is supplied, and `??` would take that literally
 * and resolve the app directory itself.
 */
export function resolveRawDir({ cliArg, env, config, appDir }) {
	const chosen = cliArg || env?.SMI_RAW_DIR || config.rawDirDefault;
	return path.resolve(appDir, chosen);
}

/** A mission's published name and full name: the `names` override where set, else upstream's. */
export const displayNames = (config, id, { name, fullName }) => ({
	name: config.names?.[id]?.name ?? name,
	fullName: config.names?.[id]?.fullName ?? fullName
});

/** Throw unless every mission id a config map names (`names`, `thumbnails.overrides`) is in `known`; an unused entry is a typo. */
export function assertKnownIds(label, ids, known) {
	const unknown = ids.filter((id) => !known.has(id));
	if (unknown.length) throw new Error(`smi.config.json: ${label} has unknown mission id(s): ${unknown.join(', ')}`);
}

/** Tier bounds for the mission percentile bars: the configured percents plus 100. */
export const tierBounds = (config) => [...config.tierPercents, 100];
