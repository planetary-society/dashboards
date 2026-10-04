#!/usr/bin/env node
/**
 * package-data.mjs -- raw science-mission-citations dist/ -> the site's data.
 *
 *   node scripts/package-data.mjs [rawDir] [--check] [--out <dir>] [--allow-broken-claims]
 *   SMI_RAW_DIR=... SMI_OUT_DIR=... node scripts/package-data.mjs
 *
 * Writes, exactly per src/lib/data/types.d.ts:
 *   src/lib/data/generated/site.json
 *   src/lib/data/generated/index.json
 *   src/lib/data/generated/scrolly.json
 *   src/lib/data/generated/divisions/<slug>.json
 *   src/lib/data/generated/missions/<id>.json
 *   src/lib/data/generated/refresh-report.md
 *   static/data/papers/<id>.json
 *
 * `--out <dir>` (or $SMI_OUT_DIR) puts all of that under another root, keeping
 * the same relative layout. It exists so a doctored input can be packaged for
 * inspection without touching the committed data; the report's "previous
 * package" is always read from the app's own generated/ directory.
 *
 * --check runs the full packaging validation without writing files.
 * All validation finishes before clearing any output. --allow-broken-claims
 * remains accepted for old commands but has no effect; public copy is derived.
 *
 * Shape of the run: `loadRuns` reads every configured stats run and settles the
 * one snapshot they must agree on; `buildDivisionDoc` turns one run into a
 * division document, calling `buildMissionDoc` per mission; `buildSite`
 * (scripts/lib/site.mjs) assembles what spans divisions. `main`
 * is the order those happen in and the files they land in.
 *
 * Every transform lives in scripts/lib/*.mjs and is a pure function over parsed
 * JSON. No output depends on the current date -- every date comes from the run
 * provenance -- so an unchanged input gives byte-identical output.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { combineWindows, fullMissionPolicy, missionWindow, windowPolicy } from './lib/windows.mjs';
import { assertKnownIds, displayNames, loadConfig, resolveRawDir, tierBounds } from './lib/config.mjs';
import { citationCoverage, citationRepresentatives } from './lib/citations.mjs';
import { buildCostCurve } from './lib/costcurve.mjs';
import { formatReport } from './lib/report.mjs';
import { buildIndexCorrelation } from './lib/stats.mjs';
import { resolveRunMissions } from './lib/join.mjs';
import { assertDashboardCompatibility, loadSourceCatalog } from './lib/source.mjs';
import {
	assertDivisionTotals,
	assertMissionPaperRows,
	assertSchemaVersion,
	assertSingleAsOfDate,
	citationGap,
	PackagingError,
	Warnings
} from './lib/invariants.mjs';
import {
	buildCitationSpread,
	buildDivisionScopeStats,
	buildMissionScopeStats,
	buildTiers,
	firstEraTop,
	divisionTotal,
	isFailure,
	isRankable,
	isShortfall,
	missionCitations,
	missionPapers,
	missionTop1,
	missionTop10,
	scopeField,
	SCOPES
} from './lib/measures.mjs';
import { assertColumnLengths, buildPapersFile, topPapers } from './lib/papers.mjs';
import { assertRanksMatchTiers, emptyRanks, publicRanks, rankHistograms } from './lib/ranks.mjs';
import { buildReconciliation } from './lib/reconcile.mjs';
import { splitQuery } from './lib/query.mjs';
import {
	accumulateCitationYears,
	buildLifetimeSeries,
	buildStrip,
	citationsByYearOffset,
	papersByMonth,
	papersByYearMap
} from './lib/series.mjs';
import { buildSite, byCost, byLaunch, tileSort } from './lib/site.mjs';
import { loadClps } from './lib/clps.mjs';
import { buildKinds, loadPaperKinds } from './lib/kinds.mjs';
import { underThreshold } from './lib/public.mjs';
import { cleanTitle } from './lib/text.mjs';
import { byText, groupBy, int, num, weight, yearOf, yearsBetween } from './lib/util.mjs';

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GENERATED_REL = join('src', 'lib', 'data', 'generated');
const PAPERS_REL = join('static', 'data', 'papers');
const THUMBS_DIR = join(APP_ROOT, 'static', 'img', 'missions');
const REPORT_NAME = 'refresh-report.md';
const STRIP_CAP = 20;
const TOP_CITED_LIMIT = 20;

/** `[rawDir] [--check] [--out <dir>] [--allow-broken-claims]`. */
export function parseArgs(argv) {
	const opts = { rawDir: null, outDir: null, allowBrokenClaims: false, check: false };
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === '--allow-broken-claims') opts.allowBrokenClaims = true;
		else if (arg === '--check') opts.check = true;
		else if (arg === '--out') opts.outDir = argv[++i] ?? '';
		else if (arg.startsWith('--out=')) opts.outDir = arg.slice('--out='.length);
		else if (arg.startsWith('--')) throw new PackagingError(`unknown flag: ${arg}`);
		else if (opts.rawDir === null) opts.rawDir = arg;
		else throw new PackagingError(`unexpected argument: ${arg}`);
	}
	return opts;
}

// ---------------------------------------------------------------- file I/O

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const readJsonIfExists = (path) => (existsSync(path) ? readJson(path) : null);

const pendingFiles = new Map();

function writeJson(path, value, { pretty }) {
	const text = pretty ? `${JSON.stringify(value, null, 2)}\n` : `${JSON.stringify(value)}\n`;
	pendingFiles.set(path, text);
	return Buffer.byteLength(text);
}

const formatBytes = (bytes) =>
	bytes >= 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${(bytes / 1e3).toFixed(1)} kB`;

/**
 * The package we are about to replace, for the report's delta section. Always
 * read from the app's own generated/ directory, even when --out sends this
 * run's output elsewhere: "previous" means the data the site ships today.
 */
function readPreviousPackage() {
	const dir = join(APP_ROOT, GENERATED_REL);
	const site = readJsonIfExists(join(dir, 'site.json'));
	if (!site) return null;
	const divisions = {};
	try {
		for (const file of readdirSync(join(dir, 'divisions'))) {
			if (!file.endsWith('.json')) continue;
			const doc = readJsonIfExists(join(dir, 'divisions', file));
			if (doc?.slug) divisions[doc.slug] = doc;
		}
	} catch {
		/* a site.json without divisions/ still gives useful totals */
	}
	return { site, index: readJsonIfExists(join(dir, 'index.json')) ?? [], divisions };
}

/** ok/failed/none counts from the thumbnail manifest, or null when there is none. */
function readThumbSummary() {
	const file = join(THUMBS_DIR, 'manifest.json');
	const manifest = readJsonIfExists(file);
	if (!manifest || typeof manifest !== 'object') return null;
	const ids = Object.keys(manifest).sort();
	const of = (status) => ids.filter((id) => manifest[id]?.status === status);
	return {
		file: 'static/img/missions/manifest.json',
		ok: of('ok').length,
		failed: of('failed').length,
		none: of('none').length,
		failedIds: of('failed')
	};
}

// ------------------------------------------------------------ small helpers

/** The one division key a run reports; more than one would break every lookup. */
function soleDivisionKey(stats, label) {
	const keys = Object.keys(stats?.summary?.lifetime ?? {});
	if (keys.length !== 1) {
		throw new PackagingError(
			`stats run "${label}": expected exactly one division in summary.lifetime, found ${keys.length}`
		);
	}
	return keys[0];
}

/** Publication-year pair, with the tail folded into the as-of year. */
function publicationYearsPair(years, asOfYear) {
	const first = num(years?.first);
	const last = num(years?.last);
	if (first === null || last === null) return null;
	return [first, Math.min(last, asOfYear)];
}

/** A record's first four authors (ADS "Last, First") and how many it has, for a byline; null without a list. */
function recordAuthors(record) {
	if (!Array.isArray(record?.author) || !record.author.length) return null;
	return { names: record.author.slice(0, 4).map((a) => cleanTitle(a)), count: num(record.author_count) ?? record.author.length };
}

/** PaperRef byline fields from a recordAuthors() entry. */
const byline = (b) => ({ authors: b?.names ?? null, authorCount: b?.count ?? null });

/** PaperRef from a `top_cited` entry; authors from the mission's records (bibcode -> recordAuthors). */
function paperRefFromTopCited(entry, authors = new Map()) {
	if (!entry?.bibcode) return null;
	return {
		bibcode: entry.bibcode,
		title: cleanTitle(entry.title_text ?? null),
		firstAuthor: cleanTitle(entry.first_author ?? null),
		...byline(authors.get(entry.bibcode)),
		year: num(entry.year),
		citations: num(entry.citation_count) ?? 0
	};
}

/** CurationItem from a raw include/exclude entry. */
function curationItem(entry, titleByBibcode) {
	const bibcode = entry?.bibcode ?? null;
	return {
		bibcode,
		doi: entry?.doi ?? entry?.record_summary?.doi_primary ?? null,
		title:
			cleanTitle(entry?.record_summary?.title_text ?? null) ?? (bibcode ? (titleByBibcode.get(bibcode) ?? null) : null),
		reason: entry?.reason ?? '',
		authority: entry?.authority ?? 'unknown',
		date: entry?.date ?? null
	};
}

/** A scrolly tile's slice of a FirstTopPaper: only what the two layouts read. */
const laneFirst = (first) => ({
	state: first.state,
	yearsFromScienceStart: first.yearsFromScienceStart,
	yearsFromFormulation: first.yearsFromFormulation
});

/** One full-mission paper row's top-10% credit to its mission: the era-adjusted weight split between the missions sharing it. */
const fullCredit = (row) => Number(row.window_cohort_top10_weight ?? 0) / (Number(row.window_shared_by) || 1);

/** One division's cost curve at one scope and percentile. */
function costCurveFor(resolved, slug, scope, top, config) {
	const credit = top === 1 ? missionTop1 : missionTop10;
	return buildCostCurve(
		resolved.map(({ id, shortTitle, statsMission }) => ({
			id,
			name: displayNames(config, id, { name: shortTitle }).name,
			cost: statsMission.adjusted_lcc > 0 ? num(statsMission.adjusted_lcc) : null,
			top: credit(statsMission, scope)
		})),
		{ division: slug, scope, top }
	);
}

// -------------------------------------------------------------- load stage

/**
 * Read every configured stats run and settle the facts the whole package
 * inherits from them: the snapshot date, the window policy, the analysis
 * revision and the per-division mission-selection sentence.
 *
 * Throws when the runs disagree about anything the site presents as one truth.
 * Softer findings (a dirty working tree, mixed revisions) become warnings.
 *
 * @param {string} rawDir the raw dist/ directory
 * @param {object} config the validated smi.config.json
 * @param {Warnings} warnings collected, not thrown
 * @returns {{runs: object[], snapshot: object}}
 */
export function loadRuns(rawDir, config, warnings, source = loadSourceCatalog(rawDir, config)) {
	assertDashboardCompatibility(source.runs, config);
	const runs = source.runs.map((run) => ({
		...run, statsKey: soleDivisionKey(run.stats, run.division.statsLabel)
	}));
	for (const { division, stats, statsKey } of runs) {
		for (const scope of ['lifetime', 'window', 'full_mission']) {
			if (!stats.summary?.[scope]?.[statsKey] || !stats.scopes?.[scope]?.divisions?.[statsKey]) {
				throw new PackagingError(
					`stats run "${division.statsLabel}": missing ${scope} summary/scope for division "${statsKey}"` +
						(scope === 'full_mission' ? '; regenerate the statistics with the full-mission scope (process.py --full-mission-window)' : '')
				);
			}
		}
	}

	const asOf = assertSingleAsOfDate(
		runs.map((r) => ({ label: r.division.statsLabel, asOfDate: r.stats.run?.as_of_date }))
	);


	const policies = runs.map((r) => windowPolicy(r.stats.run.policy, r.division.statsLabel));
	if (new Set(policies.map((p) => JSON.stringify(p))).size !== 1) {
		throw new PackagingError('stats runs disagree on the window policy');
	}
	const fullPolicies = runs.map((r) => fullMissionPolicy(r.stats.run.full_mission_policy, r.division.statsLabel));
	if (new Set(fullPolicies.map((p) => JSON.stringify(p))).size !== 1) {
		throw new PackagingError('stats runs disagree on the full-mission window policy');
	}

	for (const run of runs) {
		if (run.stats.provenance?.code?.working_tree_dirty) {
			warnings.add(
				`stats run "${run.division.statsLabel}" was produced from a dirty working tree ` +
					`(revision ${run.stats.provenance?.code?.revision ?? 'unknown'})`
			);
		}
	}
	const revisions = [...new Set(runs.map((r) => r.stats.provenance?.code?.revision).filter(Boolean))].sort();
	if (revisions.length > 1) {
		warnings.add(`stats runs were produced by different code revisions: ${revisions.join(', ')}`);
	}

	// The mission-selection sentence, verbatim per run. /methods prints it as the
	// authoritative statement of what is in and out of each division.
	const filters = {};
	for (const run of runs) {
		const description = run.stats.run?.filter?.description;
		if (typeof description !== 'string' || description === '') {
			throw new PackagingError(
				`stats run "${run.division.statsLabel}": run.filter.description is missing`
			);
		}
		filters[run.division.slug] = description;
	}

	return {
		runs,
		snapshot: {
			asOf,
			asOfYear: Number(asOf.slice(0, 4)),
			windowPolicy: policies[0],
			fullPolicy: fullPolicies[0],
			codeRevision: revisions.join('+'),
			codeRevisionDirty: runs.some((r) => Boolean(r.stats.provenance?.code?.working_tree_dirty)),
			attribution: runs[0].stats.attribution ?? {},
			fetchedMin: runs.map((r) => r.stats.run?.fetched_at_min).filter(Boolean).sort()[0] ?? null,
			fetchedMax: runs.map((r) => r.stats.run?.fetched_at_max).filter(Boolean).sort().at(-1) ?? null,
			yearCohortMinN: runs[0]?.stats?.config?.year_cohort_min_n ?? null,
			filters
		}
	};
}

// ----------------------------------------------------------- mission stage

/**
 * One mission: its generated/missions/<id>.json (written here, because the
 * document is the biggest thing in the run and nothing else needs it in
 * memory), its static/data/papers/<id>.json, and the rows that carry the
 * mission into the division, index and scrolly documents.
 *
 * `divisionCitations` is the one deliberately shared accumulator: a paper
 * claimed by two missions of the same division counts once towards the
 * division's citing-year series, which only a set held across the missions can
 * decide. `citationOverrides` makes that claim safe to award to any of them —
 * see `citationRepresentatives`. `ownCitations` is what the division's single
 * pass over the citation and record companions kept of this mission's own.
 *
 * @param {object} args
 * @param {{shortTitle: string, id: string, indexEntry: object, statsMission: object}} args.mission
 * @param {object} args.division the configured division entry
 * @param {object} args.snapshot from loadRuns
 * @param {object} args.config the validated smi.config.json
 * @param {{rawDir: string, generatedDir: string, papersDir: string}} args.paths
 * @param {object} args.run per-division blocks: scopes, summary and share denominators
 * @param {{into: Map<number, number>, seen: Set<string>}} args.divisionCitations
 * @param {Map<string, string[]>} args.citationOverrides rebuilt citing lists
 * @param {{cited: string[], curated: Set<string>, pubdates: Map<string, string>, authors: Map<string, object>}} args.ownCitations the mission's
 *   own cited bibcodes (file order, packaged papers only), its curated records, every record's ADS pubdate and byline authors
 */
export function buildMissionDoc({
	mission,
	division,
	snapshot,
	config,
	paths,
	run,
	divisionCitations,
	citationOverrides,
	ownCitations
}) {
	const { shortTitle, id, indexEntry, statsMission } = mission;
	const { asOf, asOfYear } = snapshot;
	const { scopeLifetime, scopeWindow, scopeFull, summaryLifetime, divisionTop10, divisionTop1 } = run;

	const corpus = paths.source.readMission(id);
	assertSchemaVersion(`${id}.json`, corpus.schema_version, config.schemaVersions.mission);
	// Published names (smi.config.json names); `shortTitle` stays the key into every stats table.
	const display = displayNames(config, id, { name: shortTitle, fullName: corpus.full_name ?? statsMission.full_name ?? null });
	const name = display.name;
	const fullName = display.fullName ?? name;

	const lifetimeRows = run.rowsByMission.get(shortTitle) ?? [];
	assertMissionPaperRows({
		id,
		shortTitle,
		rows: lifetimeRows.length,
		lifetimePapers: statsMission.lifetime_papers
	});
	const windowRows = new Map(
		(run.windowRowsByMission.get(shortTitle) ?? []).map((row) => [row.bibcode, row])
	);
	const fullRows = new Map(
		(run.fullRowsByMission.get(shortTitle) ?? []).map((row) => [row.bibcode, row])
	);

	const paperYears = new Map(lifetimeRows.map((row) => [row.bibcode, num(row.year)]));
	const titleByBibcode = new Map(lifetimeRows.map((row) => [row.bibcode, row.title ?? null]));

	// --- lifetime citations by citing year (aggregates only) ------------------
	const missionCitationYears = new Map();
	const { cited, curated: curatedBibcodes, pubdates } = ownCitations;
	let divisionEdges = 0;
	if (lifetimeRows.length > 0) {
		// One pass, two sinks: the mission's own citing years, and the
		// division's with shared papers counted once.
		[, divisionEdges] = accumulateCitationYears({
			citations: Object.fromEntries(cited.map((bibcode) => [bibcode, citationOverrides.get(bibcode)])),
			paperYears,
			asOfYear,
			sinks: [
				{ into: missionCitationYears },
				{ into: divisionCitations.into, seen: divisionCitations.seen }
			]
		});
	}

	const missionPapersByYear = papersByYearMap(corpus.corpus?.publications_by_year);
	const lifetimeSeries =
		missionPapersByYear.size > 0 || missionCitationYears.size > 0
			? buildLifetimeSeries({
					papers: missionPapersByYear,
					citations: missionCitationYears,
					asOfYear
				})
			: null;

	if (missionCitations(statsMission, 'lifetime') !== null) {
		const coverage = citationCoverage({
			expected: missionCitations(statsMission, 'lifetime'), observed: [...missionCitationYears.values()].reduce((a, b) => a + b, 0),
			historyStatus: run.historyStatus, limits: config.citationHistory
		});
		if (lifetimeSeries) lifetimeSeries.citationCoverage = coverage;
	}
	if (statsMission.lifetime_output_basis === 'measured') {
		const count = (lifetimeSeries?.papers ?? []).reduce((a, b) => a + b, 0);
		if (count !== statsMission.lifetime_papers) throw new PackagingError(`${id}: lifetime publication timeline has ${count} papers, statistics report ${statsMission.lifetime_papers}`);
	}

	// --- window series --------------------------------------------------------
	const windowCohort = statsMission.window_cohort;
	const bounds = missionWindow(windowCohort, snapshot.windowPolicy, id);
	const windowStatus = statsMission.window_status ?? windowCohort?.status ?? 'unknown';
	const windowStart = windowCohort?.publication_start_date ?? null;
	let windowSeries = null;
	if (windowStart && bounds.months > 0) {
		const recordsWindow = paths.source.readMission(id, 'records_window');
		const citationsWindow = paths.source.readMission(id, 'citations_window');
		windowSeries = {
			...bounds,
			outputBasis: statsMission.window_output_basis ?? (statsMission.window_papers == null ? 'unavailable' : 'measured'),
			papersByMonth: papersByMonth(recordsWindow?.records ?? [], windowStart, bounds.months),
			citationsByYearOffset: citationsByYearOffset(
				citationsWindow?.window_citations ?? {},
				yearOf(windowStart),
				bounds.citationBuckets
			),
			status: windowStatus
		};
		if (windowSeries.status === 'available' && windowSeries.outputBasis === 'measured') {
			for (const [metric, values] of [['papers', windowSeries.papersByMonth], ['citations', windowSeries.citationsByYearOffset]]) {
				const count = values.reduce((a, b) => a + b, 0);
				if (count !== statsMission[`window_${metric}`]) throw new PackagingError(`${id}: window timeline has ${count} ${metric}, statistics report ${statsMission[`window_${metric}`]}. Repair the window companions and re-export.`);
			}
		}
	}

	// --- measures --------------------------------------------------------------
	// The agency commits at formulation, and formulation dates cover more of the
	// set than implementation dates do: build time and the project-start reading
	// of a first top paper both run from here.
	const formulation = corpus.mission?.formulation_start_date ?? null;
	const launchDate = corpus.mission?.mission_launch_date ?? indexEntry.mission_launch_date ?? null;
	// Science starts at the prime-mission start, else at launch, as upstream reads it.
	const scienceStart = corpus.mission?.prime_mission_start_date ?? launchDate;
	const percentileView = (block) => block.percentile_view?.mission_stats?.[shortTitle] ?? null;
	const pvLifetime = percentileView(scopeLifetime);
	const pvWindow = percentileView(scopeWindow);
	const pvFull = percentileView(scopeFull);
	// A first top-10% paper is era-adjusted like every top-10% count: read from the paper rows,
	// not from the pooled view's first_qualifying (which ranks against the division's pooled cutoff).
	const firstTop = {
		full: firstEraTop(fullRows.values(), 'window_cohort_top10_weight', pubdates),
		window: firstEraTop(windowRows.values(), 'window_cohort_top10_weight', pubdates),
		lifetime: firstEraTop(lifetimeRows, 'cohort_top10_weight', pubdates)
	};
	const scopeStats = (scope) =>
		buildMissionScopeStats({
			statsMission,
			scope,
			first: firstTop[scope],
			divisionTop10: divisionTop10[scope],
			divisionTop1: divisionTop1[scope],
			scienceStart,
			formulation
		});
	const lifetimeStats = scopeStats('lifetime');
	const windowStats = { ...scopeStats('window'), status: windowStatus, bounds };
	// The full-mission window has no month-by-month companions: its cohort dates and measures only.
	const fullCohort = statsMission.full_mission_cohort;
	const fullStats = {
		...scopeStats('full'),
		status: statsMission.full_mission_status ?? fullCohort?.status ?? 'unknown',
		bounds: missionWindow(fullCohort, snapshot.fullPolicy, `${id} (full-mission window)`)
	};

	const failed = isFailure(statsMission.mission_status);
	const shortfall = isShortfall(statsMission.mission_status);
	const launchYear = yearOf(launchDate);
	const hasThumb = existsSync(join(THUMBS_DIR, `${id}.webp`));
	const yearsToBuild = yearsBetween(formulation, launchDate);
	const indices = {
		h: num(corpus.metrics?.lifetime?.local?.h_index),
		m: weight(corpus.metrics?.lifetime?.local?.m_index),
		i100: num(corpus.metrics?.lifetime?.thresholds?.i100?.count),
		g: num(corpus.metrics?.lifetime?.local?.g_index),
		// No citation graph for some missions: null, not zero.
		tori: weight(corpus.metrics?.lifetime?.graph?.tori_index),
		riq: num(corpus.metrics?.lifetime?.graph?.riq_index)
	};

	// --- the mission's paper table ---------------------------------------------
	const tiers = {
		bounds: tierBounds(config),
		full: buildTiers({ percentileView: pvFull, papers: statsMission.full_mission_papers, tierPercents: config.tierPercents }),
		window: buildTiers({ percentileView: pvWindow, papers: statsMission.window_papers, tierPercents: config.tierPercents }),
		lifetime: buildTiers({ percentileView: pvLifetime, papers: statsMission.lifetime_papers, tierPercents: config.tierPercents })
	};
	// A scope the run did not measure has no tiers, and gets no histogram either (null is not zero).
	const ranks = {};
	for (const scope of SCOPES) {
		const entry = tiers[scope] ? (run.ranks[scope].get(shortTitle) ?? emptyRanks()) : null;
		assertRanksMatchTiers({ id, scope, ranks: entry, tiers: tiers[scope], bounds: tiers.bounds });
		ranks[scope] = publicRanks(entry);
	}

	const papersFile = buildPapersFile({
		id,
		asOf,
		lifetimeRows,
		windowRows,
		fullRows,
		curatedBibcodes,
		top1Cutoff: scopeWindow.pooled_cutoffs?.weights?.['1'] ?? null,
		fullTop1Cutoff: scopeFull.pooled_cutoffs?.weights?.['1'] ?? null
	});
	assertColumnLengths(papersFile);
	// Per-paper citations by scope; null in f/w marks a row outside that cohort.
	const columnOf = { lifetime: 'c', full: 'f', window: 'w' };
	const spreads = {};
	for (const scope of SCOPES) {
		const citations = papersFile.columns[columnOf[scope]].filter((c) => c !== null);
		const papers = missionPapers(statsMission, scope);
		// The median and uncited count come from the rows, so they must be the rows the totals count.
		if (papers !== null && scopeField(statsMission, scope, 'output_basis') === 'measured' && citations.length !== papers) {
			throw new PackagingError(`${id} (${scope}): ${citations.length} paper rows in scope, statistics report ${papers} papers. Repair the ${scope} paper rows upstream and re-export.`);
		}
		spreads[scope] = buildCitationSpread({
			citations,
			papers,
			citationsTotal: missionCitations(statsMission, scope),
			thresholds: scopeField(statsMission, scope, 'thresholds')
		});
	}
	// The reader only needs to know how many rows are waiting; the URL comes from
	// the mission id via src/lib/paths.js, not from a path written into the doc.
	let papersFileRef = null;
	let papersBytes = 0;
	if (papersFile.rows > 0) {
		papersBytes = writeJson(join(paths.papersDir, `${id}.json`), papersFile, { pretty: false });
		papersFileRef = { rows: papersFile.rows };
	}

	// --- the mission's reconciliation --------------------------------------------
	const { reconciliation, balanced } = buildReconciliation(
		corpus.corpus?.merge_stats,
		corpus.corpus?.record_count
	);
	const { arms, filters: queryFilters } = splitQuery(corpus.query?.source_query);

	const byMissionSummary = summaryLifetime.by_mission?.[shortTitle] ?? null;
	const scienceStartYear = yearOf(corpus.mission?.prime_mission_start_date) ?? num(byMissionSummary?.publication_years?.first);

	// --- generated/missions/<id>.json ---------------------------------------------
	const missionDoc = {
		id,
		name,
		fullName,
		division: division.slug,
		divisionName: division.name,
		hasThumb,
		meta: {
			status: statsMission.mission_status ?? corpus.mission?.mission_status ?? 'unknown',
			failed,
			cost: num(statsMission.adjusted_lcc),
			type: corpus.mission?.mission_type ?? statsMission.mission_type ?? null,
			dates: {
				formulation,
				launch: launchDate,
				scienceStart: corpus.mission?.prime_mission_start_date ?? null,
				primeEnd: corpus.mission?.prime_mission_end_date ?? null,
				missionEnd: corpus.mission?.mission_end_date ?? null
			}
		},
		indices,
		facts: {
			papers: missionPapers(statsMission, 'lifetime'),
			citations: missionCitations(statsMission, 'lifetime'),
			publicationYears: publicationYearsPair(byMissionSummary?.publication_years, asOfYear)
		},
		lifetimeSeries,
		windowSeries,
		mostCited: paperRefFromTopCited(corpus.corpus?.top_cited?.[0], ownCitations.authors),
		ranks,
		full: { ...fullStats, spread: spreads.full },
		window: { ...windowStats, spread: spreads.window },
		lifetime: { ...lifetimeStats, spread: spreads.lifetime },
		query: {
			arms,
			filters: queryFilters,
			url: corpus.query?.query_url ?? null,
			fetchedAt: corpus.query?.fetched_at ?? null,
			reconciliation
		},
		curation: {
			includes: (corpus.curation?.include_items ?? []).map((item) =>
				curationItem(item, titleByBibcode)
			),
			excludes: (corpus.curation?.exclude_items ?? []).map((item) =>
				curationItem(item, titleByBibcode)
			)
		},
		topCited: (corpus.corpus?.top_cited ?? [])
			.slice(0, TOP_CITED_LIMIT)
			.map((entry) => paperRefFromTopCited(entry))
			.filter(Boolean),
		papersFile: papersFileRef
	};
	const missionBytes = writeJson(join(paths.generatedDir, 'missions', `${id}.json`), missionDoc, {
		pretty: true
	});

	// --- rows shared with the division, index, scrolly and story ------------------
	return {
		missionDoc,
		missionRow: {
			id,
			name,
			cost: num(statsMission.adjusted_lcc),
			launchYear,
			failed,
			shortfall,
			type: missionDoc.meta.type,
			indices,
			yearsToBuild,
			papers: missionDoc.facts.papers,
			citations: missionDoc.facts.citations,
			hasThumb,
			full: fullStats,
			window: windowStats,
			lifetime: lifetimeStats,
			strip: buildStrip({
				papersByYear: missionPapersByYear,
				startYear: scienceStartYear,
				asOfYear,
				cap: STRIP_CAP
			})
		},
		indexEntry: {
			id,
			name,
			fullName: missionDoc.fullName,
			cost: num(statsMission.adjusted_lcc),
			division: division.slug,
			launchYear,
			hasThumb
		},
		scrollyTile: {
			id,
			name,
			division: division.slug,
			launchYear,
			launchDate,
			cost: num(statsMission.adjusted_lcc),
			// The story reads output in its default scope; the per-dollar step divides these citations by cost.
			papers: fullStats.papers,
			// The mission page headline: every paper on record, for the overview's corpus graphic.
			papersLifetime: missionDoc.facts.papers,
			citations: fullStats.citations,
			yearsToBuild,
			hasThumb,
			failed,
			shortfall,
			share: {
				full: { 10: fullStats.top10ShareOfDivision, 1: fullStats.top1ShareOfDivision },
				window: { 10: windowStats.top10ShareOfDivision, 1: windowStats.top1ShareOfDivision },
				lifetime: { 10: lifetimeStats.top10ShareOfDivision, 1: null }
			},
			// The story's squares and lanes only ever ask a tile which state it is in
			// and how long it took; the bibcode and date live on the mission page.
			first: { full: laneFirst(fullStats.first), window: laneFirst(windowStats.first), lifetime: laneFirst(lifetimeStats.first) }
		},
		// Every lifetime paper with its full-scope standing, for site.kinds; never written to the mission doc.
		kindRows: lifetimeRows.map((row) => ({
			bibcode: row.bibcode,
			title: row.title ?? null,
			year: num(row.year),
			firstAuthor: row.first_author ?? null,
			inScope: fullRows.has(row.bibcode),
			citations: fullRows.has(row.bibcode) ? Number(fullRows.get(row.bibcode).window_citations ?? 0) : null,
			// The mission's share of the paper's era-adjusted top-10% weight: summed, these are full.top10.
			top10Credit: fullRows.has(row.bibcode) ? fullCredit(fullRows.get(row.bibcode)) : null,
			citationsLifetime: Number(row.citations ?? 0)
		})),
		// What the division folds in afterwards.
		divisionEdges,
		windowSeries,
		bytes: { missions: missionBytes, papers: papersBytes },
		notes: {
			unbalanced: balanced ? null : `${id} (${name})`,
			missingQuery: corpus.query?.source_query ? null : { id, name, division: division.slug }
		}
	};
}

// ---------------------------------------------------------- division stage

/**
 * One stats run -> generated/divisions/<slug>.json (written here) plus
 * everything that division contributes to the site-wide documents.
 *
 * @param {object} args
 * @param {object} args.run one entry from loadRuns
 * @param {object} args.snapshot from loadRuns
 * @param {object} args.config the validated smi.config.json
 * @param {{rawDir: string, generatedDir: string, papersDir: string}} args.paths
 * @param {Map<string, object>} args.byTitle the short_title -> index entry join
 * @param {Map<string, number>} args.globalBest bibcode -> highest citation count,
 *   accumulated across divisions so the site's distinct totals count a shared
 *   paper once
 */
export function buildDivisionDoc({ run, snapshot, config, paths, byTitle, globalBest }) {
	const { division, stats, statsKey } = run;
	const { asOfYear } = snapshot;

	const summaryLifetime = stats.summary.lifetime?.[statsKey];
	const summaryWindow = stats.summary.window?.[statsKey];
	const summaryFull = stats.summary.full_mission?.[statsKey];
	const scopeLifetime = stats.scopes?.lifetime?.divisions?.[statsKey];
	const scopeWindow = stats.scopes?.window?.divisions?.[statsKey];
	const scopeFull = stats.scopes?.full_mission?.divisions?.[statsKey]; // every block checked by loadRuns

	const papersJson = paths.source.readPapers(run, 'lifetime');
	assertSchemaVersion(
		`stats/${division.statsLabel}/papers.json`,
		papersJson.schema_version,
		config.schemaVersions.stats
	);
	// Every published title and author comes from these rows: clean the ADS markup once, here.
	for (const row of papersJson.papers) {
		row.title = cleanTitle(row.title ?? null);
		row.first_author = cleanTitle(row.first_author ?? null);
	}
	const windowPapersJson = paths.source.readPapers(run, 'window');
	assertSchemaVersion(
		`stats/${division.statsLabel}/papers.window.json`,
		windowPapersJson.schema_version,
		config.schemaVersions.stats
	);
	// Same keys as the window table; its window_* values are the full-mission scope's.
	const fullPapersJson = paths.source.readPapers(run, 'full');
	assertSchemaVersion(
		`stats/${division.statsLabel}/papers.full_mission.json`,
		fullPapersJson.schema_version,
		config.schemaVersions.stats
	);

	const rowsByMission = groupBy(papersJson.papers, (row) => row.mission);
	const lifetimeByBibcode = new Map(papersJson.papers.map((row) => [row.bibcode, row]));
	const windowRowsByMission = groupBy(windowPapersJson.papers, (row) => row.mission);
	const fullRowsByMission = groupBy(fullPapersJson.papers, (row) => row.mission);
	const windowed = { citations: 'window_citations', sharedBy: 'window_shared_by' };
	const ranks = {
		full: rankHistograms(fullPapersJson.papers, windowed),
		window: rankHistograms(windowPapersJson.papers, windowed),
		lifetime: rankHistograms(papersJson.papers, { citations: 'citations', sharedBy: 'shared_by' })
	};

	// Division-distinct papers and citations, and the division's most cited paper.
	const divisionBest = new Map();
	let mostCitedRow = null;
	for (const row of papersJson.papers) {
		const citations = num(row.citations) ?? 0;
		const previous = divisionBest.get(row.bibcode);
		if (previous === undefined || citations > previous) divisionBest.set(row.bibcode, citations);
		const globalPrevious = globalBest.get(row.bibcode);
		if (globalPrevious === undefined || citations > globalPrevious) {
			globalBest.set(row.bibcode, citations);
		}
		if (
			mostCitedRow === null ||
			citations > (num(mostCitedRow.citations) ?? 0) ||
			(citations === (num(mostCitedRow.citations) ?? 0) && row.bibcode < mostCitedRow.bibcode)
		) {
			mostCitedRow = row;
		}
	}
	let divisionCitations = 0;
	for (const value of divisionBest.values()) divisionCitations += value;
	assertDivisionTotals({
		slug: division.slug,
		packagedPapers: divisionBest.size,
		packagedCitations: divisionCitations,
		summary: summaryLifetime
	});

	const resolved = resolveRunMissions(division.statsLabel, stats.missions ?? [], byTitle);
	const idByTitle = new Map(resolved.map((m) => [m.shortTitle, m.id]));
	const statsMissions = resolved.map((m) => m.statsMission);

	// The division's most cited papers in each scope; windows rank by in-window citations.
	const TOP_PAPERS = 10;
	const topByScope = {
		full: topPapers(fullPapersJson.papers, 'window_citations', TOP_PAPERS),
		window: topPapers(windowPapersJson.papers, 'window_citations', TOP_PAPERS),
		lifetime: topPapers(papersJson.papers, 'citations', TOP_PAPERS)
	};

	const divisionTop10 = {
		full: divisionTotal(statsMissions, (m) => missionTop10(m, 'full')),
		window: divisionTotal(statsMissions, (m) => missionTop10(m, 'window')),
		lifetime: divisionTotal(statsMissions, (m) => missionTop10(m, 'lifetime'))
	};
	const divisionTop1 = {
		full: divisionTotal(statsMissions, (m) => missionTop1(m, 'full')),
		window: divisionTotal(statsMissions, (m) => missionTop1(m, 'window')),
		lifetime: 0
	};

	// Judged in the default scope: the one every cost comparison opens in.
	const rankable = isRankable({
		poolPapers: summaryFull.papers,
		missions: statsMissions,
		rankingMinPapers: config.rankingMinPapers,
		scope: 'full'
	});


	// Follow the upstream representative-record rule, including deterministic ties.
	// The one read of each mission's records and citations; buildMissionDoc gets what it needs from here.
	const ownCitations = new Map();
	function* citationSources() {
		for (const { id, shortTitle } of resolved) {
			const included = new Set((rowsByMission.get(shortTitle) ?? []).map((row) => row.bibcode));
			const records = paths.source.readMission(id, 'records').records ?? [];
			const citations = paths.source.readMission(id, 'citations').citations ?? {};
			// Bylines are read only for the mission's and the division's most-cited paper.
			const bylined = new Set([
				paths.source.readMission(id).corpus?.top_cited?.[0]?.bibcode,
				mostCitedRow?.bibcode,
				...Object.values(topByScope).flatMap((list) => list.map((p) => p.bibcode))
			]);
			ownCitations.set(id, {
				cited: Object.keys(citations).filter((bibcode) => included.has(bibcode)),
				curated: new Set(records.filter((r) => r?.source && r.source !== 'query').map((r) => r.bibcode)),
				pubdates: new Map(records.map((r) => [r.bibcode, r.pubdate])),
				authors: new Map(records.filter((r) => bylined.has(r.bibcode)).map((r) => [r.bibcode, recordAuthors(r)]))
			});
			yield { name: shortTitle, records: records.filter((r) => included.has(r.bibcode)), citations };
		}
	}
	const citationAudit = citationRepresentatives(citationSources(), divisionBest, { historyStatus: scopeLifetime.history_status, limits: config.citationHistory });
	const citationOverrides = citationAudit.lists;

	// Accumulators for the division's own series.
	const citationSink = { into: new Map(), seen: new Set() };
	let divisionEdges = 0;
	const windowSeries = [];
	const missionsImmature = [];

	const missionRows = [];
	const indexEntries = [];
	const scrollyTiles = [];
	const kindInputs = new Map(); // mission id -> { fullName, top10, rows } for site.kinds
	const unbalanced = [];
	const missionsWithoutQuery = [];
	const bytes = { missions: 0, papers: 0 };

	const missionRun = {
		scopeLifetime,
		scopeWindow,
		scopeFull,
		summaryLifetime,
		divisionTop10,
		divisionTop1,
		rowsByMission,
		windowRowsByMission,
		fullRowsByMission,
		ranks,
		rankable,
		historyStatus: scopeLifetime.history_status
	};

	for (const mission of resolved) {
		const built = buildMissionDoc({
			mission,
			division,
			snapshot,
			config,
			paths,
			run: missionRun,
			divisionCitations: citationSink,
			citationOverrides,
			ownCitations: ownCitations.get(mission.id)
		});

		missionRows.push(built.missionRow);
		indexEntries.push(built.indexEntry);
		scrollyTiles.push(built.scrollyTile);
		kindInputs.set(built.scrollyTile.id, { fullName: built.missionDoc.fullName, top10: built.missionRow.full.top10, rows: built.kindRows });
		divisionEdges += built.divisionEdges;
		bytes.missions += built.bytes.missions;
		bytes.papers += built.bytes.papers;
		if (built.notes.unbalanced) unbalanced.push(built.notes.unbalanced);
		if (built.notes.missingQuery) missionsWithoutQuery.push(built.notes.missingQuery);

		const series = built.windowSeries;
		if (series) windowSeries.push(series);
		if (built.missionRow.window.status !== 'available') missionsImmature.push(built.missionRow.id);
	}


	const coverage = citationCoverage({ expected: summaryLifetime.citations_total, observed: divisionEdges,
		historyStatus: scopeLifetime.history_status, limits: config.citationHistory });

	// Continuous costs and per-mission credit; upstream bins are not consumed.
	const costCurves = rankable
		? {
				full: {
					10: costCurveFor(resolved, division.slug, 'full', 10, config),
					1: costCurveFor(resolved, division.slug, 'full', 1, config)
				},
				window: {
					10: costCurveFor(resolved, division.slug, 'window', 10, config),
					1: costCurveFor(resolved, division.slug, 'window', 1, config)
				},
				lifetime: { 10: costCurveFor(resolved, division.slug, 'lifetime', 10, config), 1: null }
			}
		: null;

	// --- division document --------------------------------------------------------
	const divisionPapersYears = papersByYearMap(summaryLifetime.publication_years?.papers_by_year);
	const divisionLifetimeSeries = buildLifetimeSeries({
		papers: divisionPapersYears,
		citations: citationSink.into,
		asOfYear
	});

	if (divisionLifetimeSeries) divisionLifetimeSeries.citationCoverage = coverage;

	missionRows.sort(byCost);

	const { tierPercents } = config;
	const divisionStats = {
		full: buildDivisionScopeStats({ summary: summaryFull, scopeBlock: scopeFull, tierPercents }),
		window: buildDivisionScopeStats({ summary: summaryWindow, scopeBlock: scopeWindow, tierPercents }),
		lifetime: buildDivisionScopeStats({ summary: summaryLifetime, scopeBlock: scopeLifetime, tierPercents })
	};
	// The same lifetime pool reported twice; a difference means the blocks drifted.
	const pool = divisionStats.lifetime;
	if (pool && (pool.papers !== num(summaryLifetime.papers) || pool.citations !== num(summaryLifetime.citations_total))) {
		throw new PackagingError(`${division.slug}: lifetime pool has ${pool.papers} papers / ${pool.citations} citations, summary reports ${summaryLifetime.papers} / ${summaryLifetime.citations_total}`);
	}

	const divisionDoc = {
		slug: division.slug,
		name: division.name,
		facts: {
			missions: resolved.length,
			papers: num(summaryLifetime.papers) ?? 0,
			citations: num(summaryLifetime.citations_total) ?? 0,
			publicationYears: publicationYearsPair(summaryLifetime.publication_years, asOfYear)
		},
		rankable,
		lifetimeSeries: divisionLifetimeSeries,
		windowSeries: {
			...combineWindows(windowSeries),
			missionsImmature: [...missionsImmature].sort(byText)
		},
		mostCited: mostCitedRow
			? {
					bibcode: mostCitedRow.bibcode,
					title: mostCitedRow.title ?? null,
					firstAuthor: mostCitedRow.first_author ?? null,
					...byline(ownCitations.get(idByTitle.get(mostCitedRow.mission))?.authors.get(mostCitedRow.bibcode)),
					year: num(mostCitedRow.year),
					citations: num(mostCitedRow.citations) ?? 0,
					missionId: idByTitle.get(mostCitedRow.mission) ?? null
				}
			: null,
		// Titles and authors from the cleaned lifetime rows; the window tables are not cleaned.
		topPapers: Object.fromEntries(
			Object.entries(topByScope).map(([scope, list]) => [
				scope,
				list.map((p) => {
					const missions = p.missions.map((title) => idByTitle.get(title)).filter(Boolean);
					const clean = lifetimeByBibcode.get(p.bibcode);
					return {
						bibcode: p.bibcode,
						title: clean?.title ?? p.title,
						firstAuthor: clean?.first_author ?? p.firstAuthor,
						...byline(ownCitations.get(missions[0])?.authors.get(p.bibcode)),
						year: p.year,
						citations: p.citations,
						missions
					};
				})
			])
		),
		stats: divisionStats,
		costCurves,
		indexCorrelation: buildIndexCorrelation(missionRows),
		missions: missionRows
	};
	const divisionBytes = writeJson(
		join(paths.generatedDir, 'divisions', `${division.slug}.json`),
		divisionDoc,
		{ pretty: true }
	);

	return {
		divisionDoc,
		divisionSummary: {
			slug: division.slug,
			name: division.name,
			nav: division.nav,
			missions: resolved.length,
			papers: divisionDoc.facts.papers,
			citations: divisionDoc.facts.citations,
			publicationYears: divisionDoc.facts.publicationYears,
			rankable
		},
		indexEntries,
		scrollyTiles,
		kindInputs,
		citationGap: {
			slug: division.slug,
			...citationGap({ edges: divisionEdges, citationsTotal: summaryLifetime.citations_total }),
			coverage,
			papers: citationAudit.gaps
		},
		unbalanced,
		missionsWithoutQuery,
		bytes: { ...bytes, divisions: divisionBytes }
	};
}

// ------------------------------------------------------------------- main

/** What the operator reads on stdout when a run finishes. */
function consoleSummary({ site, bytes, citationGaps, unbalanced, warnings, reportPath, elapsedMs }) {
	const total = Object.values(bytes).reduce((a, b) => a + b, 0);
	const lines = [
		`packaged ${site.missions} missions across ${site.divisions.length} divisions ` +
			`(as of ${site.asOf}, revision ${site.codeRevision || 'unknown'})`,
		`${int(site.papersDistinct)} globally distinct papers, ` +
			`${int(site.citationsDistinct)} citations of them`,
		`site.json ${formatBytes(bytes.site)} · index.json ${formatBytes(bytes.index)} · ` +
			`scrolly.json ${formatBytes(bytes.scrolly)} · divisions ${formatBytes(bytes.divisions)} · ` +
			`missions ${formatBytes(bytes.missions)} · papers ${formatBytes(bytes.papers)} ` +
			`(total ${formatBytes(total)})`,
		'citation lists vs ADS citation_count, by division:',
		...citationGaps.map(
			(g) =>
				`  ${g.slug.padEnd(20)} edges ${String(g.edges).padStart(9)} vs ` +
				`${String(g.citationsTotal).padStart(9)} ` +
				`(${g.coverage.status}; ${g.coverage.missing} missing)`
		)
	];
	if (unbalanced.length > 0) {
		lines.push(
			`merge_stats reconciliation did not balance for ${unbalanced.length} mission(s): ` +
				unbalanced.join(', ')
		);
	}
	lines.push(`report: ${reportPath}`);
	for (const warning of warnings) lines.push(`warning: ${warning}`);
	lines.push(`done in ${(elapsedMs / 1000).toFixed(1)}s`);
	return lines;
}

function main() {
	const started = Date.now();
	const warnings = new Warnings();
	const opts = parseArgs(process.argv.slice(2));
	const config = loadConfig(APP_ROOT);
	const rawDir = resolveRawDir({
		cliArg: opts.rawDir,
		env: process.env,
		config,
		appDir: APP_ROOT
	});
	const outRoot = resolve(APP_ROOT, opts.outDir || process.env.SMI_OUT_DIR || APP_ROOT);
	const paths = {
		rawDir,
		generatedDir: join(outRoot, GENERATED_REL),
		papersDir: join(outRoot, PAPERS_REL)
	};
	if (!existsSync(rawDir)) {
		throw new PackagingError(`raw data directory not found: ${rawDir}`);
	}
	const source = loadSourceCatalog(rawDir, config);
	const { runs, snapshot } = loadRuns(rawDir, config, warnings, source);
	// The CLPS chart's dataset is checked with everything else, before any output changes.
	const clps = loadClps({ rawDir: resolve(APP_ROOT, config.clps.rawDir), config, asOf: snapshot.asOf });
	assertKnownIds('names', Object.keys(config.names ?? {}), new Set([...source.missions.keys(), ...clps.missions.map((m) => m.id), ...clps.comparators.map((m) => m.id)]));
	const kindsFile = loadPaperKinds(resolve(APP_ROOT, config.paperKinds.file));
	paths.source = source;
	const byTitle = source.byTitle;
	pendingFiles.clear();

	// ---- one division at a time -------------------------------------------
	const bytes = { site: 0, index: 0, scrolly: 0, divisions: 0, missions: 0, papers: 0 };
	const globalBest = new Map(); // bibcode -> highest lifetime citation count seen
	const errors = [];
	const built = runs.map((run) => {
		try {
		const division = buildDivisionDoc({
			run,
			snapshot,
			config,
			paths,
			byTitle,
			globalBest
		});
		for (const key of ['missions', 'papers', 'divisions']) bytes[key] += division.bytes[key];
		return division;
		} catch (error) { errors.push(run.division.slug + ': ' + error.message); return null; }
	});
	if (errors.length) throw new PackagingError('Packaging validation failed:\n- ' + errors.join('\n- ') + '\nNo dashboard output was changed.');
	// Packaging verified what it read; this covers the companions it had no use for.
	source.verifyCompanions();

	const flat = (pick) => built.flatMap(pick);
	const indexEntries = flat((d) => d.indexEntries).sort(tileSort({ config }));
	const scrollyTiles = flat((d) => d.scrollyTiles).sort(byLaunch);
	const divisionDocs = built.map((d) => d.divisionDoc);
	const citationGaps = built.map((d) => d.citationGap);
	const unbalanced = flat((d) => d.unbalanced);

	// ---- site.json, index.json, scrolly.json --------------------------------
	let citationsDistinct = 0;
	for (const value of globalBest.values()) citationsDistinct += value;

	// ---- paper kinds: missions at or under the threshold, full-mission scope ----
	const kindInputs = new Map(built.flatMap((d) => [...d.kindInputs]));
	const kinds = buildKinds({
		kindsFile,
		missions: scrollyTiles.filter(underThreshold(config.thresholdCost)).map((t) => ({
			id: t.id,
			name: t.name,
			division: t.division,
			cost: t.cost,
			papers: t.papers,
			citations: t.citations,
			...kindInputs.get(t.id)
		})),
		examples: config.paperKinds.examples,
		smallMax: config.paperKinds.smallMax,
		warnings
	});

	const site = buildSite({
		snapshot,
		config,
		indexEntries,
		divisionSummaries: built.map((d) => d.divisionSummary),
		divisionDocs,
		papersDistinct: globalBest.size,
		citationsDistinct,
		yearCohortMinN: snapshot.yearCohortMinN,
		clps,
		kinds
	});
	bytes.site = writeJson(join(paths.generatedDir, 'site.json'), site, { pretty: true });
	bytes.index = writeJson(join(paths.generatedDir, 'index.json'), indexEntries, { pretty: true });
	bytes.scrolly = writeJson(
		join(paths.generatedDir, 'scrolly.json'),
		{ tiles: scrollyTiles },
		{ pretty: true }
	);


	if (opts.check) {
		console.log('Source check passed: ' + source.missions.size + ' missions across ' + runs.length + ' divisions; all packaging calculations validated. No files written.');
		for (const gap of citationGaps.filter((g) => g.coverage.missing > 0)) console.log(`${gap.slug}: incomplete citation timeline, ${gap.coverage.missing} missing of ${gap.coverage.expected} reported citations.`);
		return;
	}
	const previous = readPreviousPackage();
	// The classification input, published byte-for-byte for the methods page; overwritten each run.
	pendingFiles.set(join(outRoot, 'static', 'data', 'paper-kinds.json'), readFileSync(resolve(APP_ROOT, config.paperKinds.file)));

	// ---- refresh-report.md -------------------------------------------------
	const reportPath = join(paths.generatedDir, REPORT_NAME);
	pendingFiles.set(
		reportPath,
		formatReport({
			site,
			divisions: divisionDocs,
			index: indexEntries,
			warnings: warnings.items,
			citationGaps,
			unbalanced,
			missionsWithoutQuery: flat((d) => d.missionsWithoutQuery),
			thumbs: readThumbSummary(),
			bytes,
			previous
		})
	);


	// Every calculation and serialization passed before replacing generated files.
	for (const dir of [paths.generatedDir, paths.papersDir]) rmSync(dir, { recursive: true, force: true });
	for (const [file, text] of pendingFiles) {
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, text);
	}
	pendingFiles.clear();

	// ---- summary -----------------------------------------------------------
	console.log(
		consoleSummary({
			site,
			bytes,
			citationGaps,
			unbalanced,
			warnings: warnings.items,
			reportPath,
			elapsedMs: Date.now() - started
		}).join('\n')
	);

}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		main();
	} catch (error) {
		console.error(`\npackage-data failed: ${error.message}`);
		if (!(error instanceof PackagingError)) console.error(error.stack);
		process.exitCode = 1;
	}
}
