import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.mjs';

export const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Small schema-5/11 export with deliberately nonstandard companion paths. */
export function sourceFixture(rawDir, { compatible = true } = {}) {
	const config = loadConfig(APP_DIR);
	const index = { kind: 'mission_index', schema_version: 5, missions: [] };
	const runs = [];
	const write = (relative, doc) => {
		const file = path.join(rawDir, relative);
		fs.mkdirSync(path.dirname(file), { recursive: true });
		const bytes = Buffer.from(JSON.stringify(doc));
		fs.writeFileSync(file, bytes);
		return { path: relative, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
	};
	for (const division of config.divisions) {
		const label = division.statsLabel;
		const id = `fixture_${label}`;
		const shortTitle = `Fixture ${label}`;
		const provenance = { as_of_date: '2026-10-02', input_fingerprint: `envelope-${label}` };
		const cohort = { publication_start_date: '2000-01-01', publication_end_date: '2003-01-01', status: 'available' };
		const corpus = {
			kind: 'mission_corpus', schema_version: 5, mission_id: id, short_title: shortTitle,
			division: division.name, image_url: label === 'bps' ? null : `https://example.test/${id}.jpg`,
			provenance, mission: { mission_launch_date: '2000-01-01' }, files: {}
		};
		for (const kind of ['records', 'citations', 'records_window', 'citations_window']) {
			const scope = kind.endsWith('_window') ? 'window' : 'lifetime';
			corpus.files[kind] = write(`payload/${label}/${kind}.json`, {
				kind: `mission_${kind}`, schema_version: 5, mission_id: id, scope, provenance,
				window: { ...cohort, citation_window_years: 3, ...(compatible ? {} : { post_prime_years: 2 }) }, records: [], citations: {}, window_citations: {}
			});
		}
		const ref = write(`payload/${label}/envelope.json`, corpus);
		index.missions.push({ mission_id: id, short_title: shortTitle, division: division.name, files: { corpus: ref } });
		const stats = {
			kind: 'corpus_stats', schema_version: 11,
			run: { label, as_of_date: '2026-10-02', processing_failures: [], processing_failure_count: 0,
				policy: compatible ? { publication_years: 3, citation_years: 3 } : { post_prime_years: 2, citation_years: 3 },
				full_mission_policy: { post_prime_years: 2, citation_years: 3, maturity_grace_months: 3, anchor: 'mission_end', opens_at: 'mission_start', min_window_years: 2 },
				filter: { description: 'Fixture selection' } },
			provenance: { ...provenance, input_fingerprint: `stats-custom-${label}` },
			// The full-mission cohort carries the same dates as a separate object, so a test can break one cohort alone.
			missions: [{ short_title: shortTitle, division: division.name, adjusted_lcc: 20, mission_status: 'Completed', lifetime_output_basis: 'measured',
				// The planetary fixture is the one CLPS lander, so the CLPS chart has a population.
				program: label === 'psd' ? 'Commercial Lunar Payload Services (CLPS)' : 'Fixture program',
				cost_bin: compatible ? '< $100M' : '< $50M', window_cohort: cohort, lifetime_papers: 0, lifetime_citations: 0, window_papers: 0, window_citations: 0, window_status: 'available', window_output_basis: 'measured',
				full_mission_cohort: { ...cohort }, full_mission_papers: 0, full_mission_citations: 0, full_mission_status: 'available', full_mission_output_basis: 'measured' }],
			summary: { lifetime: { [division.name]: { papers: 0, citations_total: 0 } }, window: { [division.name]: { papers: 0, citations_total: 0 } }, full_mission: { [division.name]: { papers: 0, citations_total: 0 } } },
			scopes: { lifetime: { divisions: { [division.name]: {} } }, window: { divisions: { [division.name]: {} } }, full_mission: { divisions: { [division.name]: {} } } },
			companion_exports: { requested: { missions: true, csv: false }, missions: { [shortTitle]: ref } },
			files: {}
		};
		for (const [key, scope] of [['papers_json', 'lifetime'], ['papers_window_json', 'window'], ['papers_full_mission_json', 'full_mission']]) {
			stats.files[key] = write(`tables/${label}/${scope}.json`, {
				kind: 'corpus_stats_papers', schema_version: 11, label, scope, papers: []
			});
		}
		const statsPath = `stats/${label}/corpus_stats.json`;
		write(statsPath, stats);
		runs.push({ id, shortTitle, corpus, ref, stats, statsPath });
	}
	// Accumulated index inventory does not expand the selected population.
	index.missions.push({ mission_id: 'unused', short_title: 'Unused inventory' });
	write('index.json', index);
	return { rawDir, config, index, runs, write };
}

/** Re-pin run i's envelope after editing `f.runs[i].corpus`: its index entry and statistics companion. */
export function repin(f, i = 0) {
	const m = f.runs[i];
	m.ref = f.write(m.ref.path, m.corpus);
	m.stats.companion_exports.missions[m.shortTitle] = m.ref;
	f.index.missions[i].files.corpus = m.ref;
	f.write('index.json', f.index);
	f.write(m.statsPath, m.stats);
}

/**
 * A throwaway copy of the app's scripts and config whose CLPS dataset is the
 * fixture itself (astro fixture as the comparator, three months), so packaging
 * the fixture never reads the real upstream export.
 */
export function fixtureApp(f, dir, clps = {}) {
	fs.cpSync(path.join(APP_DIR, 'scripts'), path.join(dir, 'scripts'), { recursive: true });
	// Every fixture mission is under the threshold with no papers, so an empty classification is complete.
	const paperKinds = { file: 'data/paper-kinds.json', examples: [f.runs[0].id], smallMax: 10 };
	fs.mkdirSync(path.join(dir, 'data'), { recursive: true });
	fs.writeFileSync(path.join(dir, paperKinds.file), JSON.stringify({ asOf: '2026-10-02', method: 'Fixture.', papers: [] }));
	const config = { ...f.config, paperKinds, clps: { rawDir: f.rawDir, comparators: [f.runs[0].id], horizonMonths: 3, ...clps } };
	fs.writeFileSync(path.join(dir, 'smi.config.json'), JSON.stringify(config, null, 2));
	return dir;
}
