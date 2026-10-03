/** Read a single namespaced upstream dataset. References are dataset-relative. */
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

import { buildTitleIndex, resolveRunMissions } from './join.mjs';
import { assertSchemaVersion, PackagingError } from './invariants.mjs';

import { fullMissionPolicy, missionWindow, windowPolicy } from './windows.mjs';

const fail = (message) => { throw new PackagingError(message); };
const siblings = {
	records: ['mission_records', 'lifetime'],
	citations: ['mission_citations', 'lifetime'],
	records_window: ['mission_records_window', 'window'],
	citations_window: ['mission_citations_window', 'window']
};
/** The per-paper tables of a run, by the scope name the packager uses. */
const papersFiles = {
	lifetime: { key: 'papers_json', scope: 'lifetime' },
	window: { key: 'papers_window_json', scope: 'window' },
	full: { key: 'papers_full_mission_json', scope: 'full_mission' }
};

function readBytes(file) {
	try { return readFileSync(file); }
	catch (error) { fail(`Cannot read source ${file}: ${error.message}. Regenerate this dataset.`); }
}

function parse(bytes, label) {
	try { return JSON.parse(bytes.toString('utf8')); }
	catch { fail(`${label}: invalid JSON. Regenerate this dataset.`); }
}

function identity(doc, expected, label) {
	for (const [key, value] of Object.entries(expected)) {
		if (doc?.[key] !== value) {
			fail(`${label}: ${key} mismatch: expected ${JSON.stringify(value)}, got ${JSON.stringify(doc?.[key])}`);
		}
	}
}

/** Hash the exact buffer being parsed, including on reads after preflight. */
export function readReferencedJson(rawDir, reference, label) {
	if (!reference || typeof reference.path !== 'string' || !reference.path ||
		!Number.isSafeInteger(reference.bytes) || reference.bytes < 0 ||
		!(/^[a-f0-9]{64}$/i).test(reference.sha256 ?? '')) {
		fail(`${label}: missing or invalid companion reference (path, bytes, sha256). Regenerate this dataset.`);
	}
	const root = path.resolve(rawDir);
	const file = path.resolve(root, reference.path);
	const inside = (base, target) => {
		const relative = path.relative(base, target);
		return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
	};
	if (path.isAbsolute(reference.path) || !inside(root, file)) fail(`${label}: reference escapes dataset root: ${reference.path}`);
	let realFile;
	try { realFile = realpathSync(file); }
	catch { fail(`${label}: companion not found: ${file}. Regenerate this dataset.`); }
	if (!inside(realpathSync(root), realFile)) fail(`${label}: reference escapes dataset root: ${reference.path}`);
	const bytes = readBytes(file);
	if (bytes.length !== reference.bytes || createHash('sha256').update(bytes).digest('hex') !== reference.sha256.toLowerCase()) {
		fail(`${label}: bytes/sha256 mismatch for ${file}; stale or altered companion. Regenerate this dataset.`);
	}
	return parse(bytes, file);
}

/** Shared membership/identity loader for packaging and thumbnails; performs no writes. */
export function loadSourceCatalog(rawDir, config) {
	const indexPath = path.join(rawDir, 'index.json');
	const index = parse(readBytes(indexPath), indexPath);
	assertSchemaVersion(indexPath, index.schema_version, config.schemaVersions.mission);
	identity(index, { kind: 'mission_index' }, indexPath);
	const byTitle = buildTitleIndex(index);
	const missions = new Map();
	const runs = config.divisions.map((division) => {
		const label = division.statsLabel;
		const statsPath = path.join(rawDir, 'stats', label, 'corpus_stats.json');
		const stats = parse(readBytes(statsPath), statsPath);
		assertSchemaVersion(statsPath, stats.schema_version, config.schemaVersions.stats);
		identity(stats, { kind: 'corpus_stats' }, statsPath);
		identity(stats.run, { label }, statsPath);
		if (!Array.isArray(stats.missions)) fail(`${statsPath}: expected a missions array`);
		if (!Array.isArray(stats.run.processing_failures) || stats.run.processing_failures.length ||
			stats.run.processing_failure_count !== 0) {
			fail(`${statsPath}: missing failure audit or upstream processing failures: ${JSON.stringify(stats.run.processing_failures)}. Regenerate this dataset.`);
		}
		const resolved = resolveRunMissions(label, stats.missions, byTitle);
		for (const mission of resolved) {
			const { shortTitle, id, indexEntry, statsMission } = mission;
			if (missions.has(id)) fail(`${statsPath}: mission identity ${id} occurs more than once in the selected statistics`);
			const ref = stats.companion_exports?.missions?.[shortTitle];
			const corpus = readReferencedJson(rawDir, ref, `${label}/${shortTitle} envelope`);
			assertSchemaVersion(ref.path, corpus.schema_version, config.schemaVersions.mission);
			identity(corpus, { kind: 'mission_corpus', mission_id: id, short_title: shortTitle, division: division.name }, ref.path);
			identity(statsMission, { division: division.name }, `${label}/${shortTitle}`);
			identity(indexEntry, { division: division.name }, `index/${shortTitle}`);
			identity(corpus.provenance, { as_of_date: stats.run.as_of_date }, `${ref.path} provenance`);
			const indexed = indexEntry.files?.corpus;
			if (!indexed || ['path', 'bytes', 'sha256'].some((key) => indexed[key] !== ref[key])) {
				fail(`${label}/${shortTitle}: index envelope reference disagrees with statistics companion. Regenerate this dataset.`);
			}
			missions.set(id, { ...mission, corpus, ref, policy: stats.run.policy });
		}
		return { division, stats, resolved };
	});

	// Every read checks bytes, SHA-256, schema and identity, so a companion read once is verified.
	const verified = new Set();

	function readMission(id, kind = 'corpus') {
		const mission = missions.get(id);
		if (!mission) fail(`Mission ${id} is not in the selected statistics`);
		if (kind === 'corpus') return mission.corpus;
		const expected = siblings[kind];
		if (!expected) fail(`Unknown mission companion kind: ${kind}`);
		const doc = readReferencedJson(rawDir, mission.corpus.files?.[kind], `${id}/${kind}`);
		assertSchemaVersion(`${id}/${kind}`, doc.schema_version, config.schemaVersions.mission);
		identity(doc, { mission_id: id, kind: expected[0], scope: expected[1] }, `${id}/${kind}`);
		// Siblings describe the envelope's run. Statistics may legitimately have
		// a different input fingerprint; compare their effective window separately.
		for (const key of ['as_of_date', 'input_fingerprint']) {
			const value = mission.corpus.provenance?.[key];
			if (!value) fail(`${id}: envelope provenance.${key} is missing`);
			identity(doc.provenance, { [key]: value }, `${id}/${kind} provenance`);
		}
		if (expected[1] === 'window') {
			const cohort = mission.statsMission.window_cohort;
			if (!cohort) fail(`${id}: statistics window_cohort is missing`);
			for (const key of ['publication_start_date', 'publication_end_date', 'status']) {
				identity(doc.window, { [key]: cohort[key] }, `${id}/${kind} window`);
			}
			identity(doc.window, { citation_window_years: mission.policy?.citation_years }, `${id}/${kind} window`);
			if (mission.policy?.post_prime_years !== undefined) {
				identity(doc.window, { post_prime_years: mission.policy.post_prime_years }, `${id}/${kind} window`);
			}
		}
		verified.add(`${id}/${kind}`);
		return doc;
	}

	function readPapers(run, scope) {
		const spec = papersFiles[scope];
		if (!spec) fail(`Unknown papers scope: ${scope}`);
		const label = run.division.statsLabel;
		const doc = readReferencedJson(rawDir, run.stats.files?.[spec.key], `${label}/${spec.key}`);
		assertSchemaVersion(`${label}/${spec.key}`, doc.schema_version, config.schemaVersions.stats);
		identity(doc, { kind: 'corpus_stats_papers', label, scope: spec.scope }, `${label}/${spec.key}`);
		if (!Array.isArray(doc.papers)) fail(`${label}/${spec.key}: expected a papers array`);
		verified.add(`${label}/${spec.key}`);
		return doc;
	}

	/** Read every companion not yet verified by an earlier read. */
	function verifyCompanions() {
		for (const run of runs) {
			for (const [scope, spec] of Object.entries(papersFiles)) {
				if (!verified.has(`${run.division.statsLabel}/${spec.key}`)) readPapers(run, scope);
			}
			for (const { id } of run.resolved) {
				for (const kind of Object.keys(siblings)) if (!verified.has(`${id}/${kind}`)) readMission(id, kind);
			}
		}
	}
	return { byTitle, runs, missions, readMission, readPapers, verifyCompanions };
}

/** Validate represented analysis definitions independently of source cost-bin labels. */
export function assertDashboardCompatibility(runs) {
	const issues = [];
	for (const { division, stats } of runs) {
		try {
			const policy = windowPolicy(stats.run?.policy, division.statsLabel);
			const full = fullMissionPolicy(stats.run?.full_mission_policy, division.statsLabel);
			for (const mission of stats.missions) {
				missionWindow(mission.window_cohort, policy, mission.short_title);
				missionWindow(mission.full_mission_cohort, full, `${mission.short_title} (full-mission window)`);
			}
		} catch (error) { issues.push(error.message); }
	}
	if (issues.length) fail(`Dataset compatibility errors:\n- ${issues.join('\n- ')}\nNo dashboard output was changed. --allow-broken-claims does not bypass these checks.`);
}
