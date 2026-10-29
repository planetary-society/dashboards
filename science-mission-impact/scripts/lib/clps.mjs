/**
 * CLPS running publications: refereed papers by calendar month since the first
 * CLPS launch, all landers pooled into one line, against comparator missions
 * aligned by months since their own prime-mission start.
 *
 * Mirrors upstream's scripts/plot_clps_running_publications.py: month m counts
 * refereed papers dated in [start, start + m months), and a month is published
 * only once it has fully elapsed at the as-of date (null until then).
 *
 * `surface` (the Analysis page's papers-per-dollar figure) holds config.clps.surface's missions
 * at the CLPS line's last elapsed month, each from its own prime-mission start.
 *
 * Reads a second dataset (config.clps.rawDir, never a fallback), through the
 * same verified loader as the main package. Its runs share one as-of date, at
 * most a day from the site's: the two exports come from separate upstream runs,
 * often one in the evening and the other the next morning.
 */

import { selectionOf } from './analysis.mjs';
import { displayNames } from './config.mjs';
import { isFailure } from './measures.mjs';
import { loadSourceCatalog } from './source.mjs';
import { assertSingleAsOfDate, PackagingError } from './invariants.mjs';
import { byText, num, sum } from './util.mjs';

export const CLPS_PROGRAM = 'Commercial Lunar Payload Services (CLPS)';
/** How far the CLPS export's as-of date may sit from the main package's, either way. */
const MAX_AS_OF_LAG_DAYS = 1;
/** Output bases whose records are a count; anything else (unavailable) is not zero. */
const COUNTED = new Set(['measured', 'assumed_zero']);

/** `iso` (YYYY-MM-DD) plus n calendar months, the day clamped to the month's end. */
export function addMonths(iso, n) {
	const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
	const lastDay = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
	return new Date(Date.UTC(y, m - 1 + n, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

/**
 * Running totals for months 0..horizon: papers dated before start + m months,
 * null until that month has fully elapsed by `asOf`. Throws on a paper dated
 * before `start` (a running total from start would silently drop it).
 */
export function runningTotal(dates, start, asOf, horizon, label = 'series') {
	const sorted = dates.map((d) => d.slice(0, 10)).sort();
	if (sorted.length && sorted[0] < start) {
		throw new PackagingError(`${label}: refereed paper dated ${sorted[0]} before its start ${start}`);
	}
	return Array.from({ length: horizon + 1 }, (_, m) => {
		const end = addMonths(start, m);
		return end <= asOf ? sorted.filter((d) => d < end).length : null;
	});
}

/** Refereed, dated records only, as upstream counts them. */
const refereed = (records) => records.filter((r) => r?.refereed === true && r.date);

/**
 * site.clps from loaded missions. Pure.
 *
 * @param {object} args
 * @param {string} args.asOf YYYY-MM-DD
 * @param {number} args.horizonMonths
 * @param {string[]} args.comparators mission ids, in display order
 * @param {string[]} [args.surface] mission ids for the papers-per-dollar comparison, in display order
 * @param {{id: string, name: string, fullName: string, program: string|null, launchDate: string|null,
 *   primeStart: string|null, status: string|null, cost: number|null, selection?: 'competed'|'directed'|null,
 *   failed?: boolean, records: object[]|null}[]} args.missions
 *   every candidate; `records` null when the mission's output is unavailable
 */
export function buildClps({ asOf, horizonMonths, comparators, surface = [], missions }) {
	const clps = missions.filter((m) => m.program === CLPS_PROGRAM)
		.sort((a, b) => byText(a.launchDate ?? '￿', b.launchDate ?? '￿') || byText(a.name, b.name));
	if (!clps.length) throw new PackagingError(`clps: no missions in program "${CLPS_PROGRAM}"`);
	const start = clps.map((m) => m.launchDate).filter(Boolean).sort()[0];
	if (!start) throw new PackagingError('clps: no CLPS mission has a launch date');
	// A paper two landers claim counts once, at its earliest date.
	const pooled = new Map();
	for (const m of clps) {
		for (const r of refereed(m.records ?? [])) {
			const date = r.date.slice(0, 10);
			if (!pooled.has(r.bibcode) || date < pooled.get(r.bibcode)) pooled.set(r.bibcode, date);
		}
	}
	const series = runningTotal([...pooled.values()], start, asOf, horizonMonths, 'clps');
	// A mission's running total over months 0..months from its prime-mission start (launch when absent).
	const aligned = (id, role, months) => {
		const m = missions.find((c) => c.id === id);
		if (!m) throw new PackagingError(`clps: ${role} ${id} is not in the CLPS dataset`);
		if (!m.records) throw new PackagingError(`clps: ${role} ${id} has no measured output`);
		const from = m.primeStart ?? m.launchDate;
		if (!from) throw new PackagingError(`clps: ${role} ${id} has no prime-mission start or launch date`);
		const series = runningTotal(refereed(m.records).map((r) => r.date), from, asOf, months, id);
		if (series.at(-1) === null) throw new PackagingError(`clps: ${role} ${id} has not reached month ${months} by ${asOf}`);
		return { m, from, series };
	};
	const result = {
		program: CLPS_PROGRAM,
		start,
		horizonMonths,
		missions: clps.map((m) => ({
			id: m.id, name: m.name, fullName: m.fullName, launchDate: m.launchDate, primeStart: m.primeStart,
			status: m.status, cost: m.cost, papers: m.records ? refereed(m.records).length : null
		})),
		series,
		comparators: comparators.map((id) => {
			const { m, from, series } = aligned(id, 'comparator', horizonMonths);
			return { id, name: m.name, fullName: m.fullName, start: from, cost: m.cost, papers: refereed(m.records).length, series };
		})
	};
	const comparison = clpsComparison(result);
	// The Analysis page's papers per dollar: every surface mission at CLPS's age, against the landers pooled.
	const { month } = comparison;
	const costs = clps.map((m) => m.cost);
	const together = { papers: comparison.clps, cost: costs.every((c) => c > 0) ? Number(sum(costs).toPrecision(12)) : null };
	const rows = surface.map((id) => {
		const { m, from, series } = aligned(id, 'surface mission', month);
		return { id, name: m.name, fullName: m.fullName, start: from, cost: m.cost, selection: m.selection ?? null, failed: m.failed === true, papers: series[month] };
	});
	return { ...result, comparison, surface: { month, clps: together, missions: rows, behind: surfaceBehind(together, rows) } };
}

/**
 * Whether the pooled landers trail every successful surface mission at the same age: in papers
 * (`total`), and in papers per dollar over the costed ones (`perDollar`; null when CLPS or none of
 * them has a cost). Failures are left out; null when no mission succeeded.
 */
export function surfaceBehind(clps, missions) {
	const flown = missions.filter((m) => !m.failed);
	if (!flown.length) return null;
	const costed = flown.filter((m) => m.cost > 0);
	return {
		total: flown.every((m) => m.papers > clps.papers),
		perDollar: clps.cost > 0 && costed.length ? costed.every((m) => m.papers / m.cost > clps.papers / clps.cost) : null
	};
}

/**
 * The CLPS line against each comparator at the same age: the last month CLPS has a value for.
 * behindAll only when every comparator is strictly ahead there; null with no comparators.
 */
export function clpsComparison({ series, comparators }) {
	const month = series.findLastIndex((v) => v !== null);
	const clps = series[month];
	const others = comparators.map((c) => ({ id: c.id, name: c.name, papers: c.series[month] }));
	return { month, clps, comparators: others, behindAll: others.length ? others.every((c) => c.papers > clps) : null };
}

/**
 * Load the CLPS dataset and build site.clps. Every envelope and records file is
 * read through loadSourceCatalog, so bytes, SHA-256, schema and identity are checked.
 *
 * @param {object} args
 * @param {string} args.rawDir the resolved config.clps.rawDir
 * @param {object} args.config the validated smi.config.json
 * @param {string} args.asOf the main package's as-of date; the CLPS runs' must be within a day of it
 */
export function loadClps({ rawDir, config, asOf }) {
	const source = loadSourceCatalog(rawDir, config);
	const clpsAsOf = assertSingleAsOfDate(source.runs.map((r) => ({ label: `clps ${r.division.statsLabel}`, asOfDate: r.stats.run?.as_of_date })));
	const lag = Math.abs(Date.parse(clpsAsOf) - Date.parse(asOf)) / 864e5;
	if (!(lag <= MAX_AS_OF_LAG_DAYS)) {
		throw new PackagingError(`clps: as_of_date ${clpsAsOf} is more than ${MAX_AS_OF_LAG_DAYS} day from the main package's ${asOf}`);
	}
	const { comparators, surface, horizonMonths } = config.clps;
	const missions = [...source.missions.values()]
		.filter(({ id, statsMission }) => statsMission.program === CLPS_PROGRAM || comparators.includes(id) || surface.includes(id))
		.map(({ id, shortTitle, statsMission, corpus }) => ({
			id,
			...displayNames(config, id, { name: shortTitle, fullName: corpus.full_name ?? statsMission.full_name ?? shortTitle }),
			program: statsMission.program ?? null,
			launchDate: corpus.mission?.mission_launch_date ?? null,
			primeStart: corpus.mission?.prime_mission_start_date ?? null,
			status: statsMission.mission_status ?? null,
			cost: num(statsMission.adjusted_lcc),
			// read exactly as package-data.mjs reads a mission row's
			selection: selectionOf(corpus.mission?.selection_strategy ?? statsMission.selection_strategy, id),
			failed: isFailure(statsMission.mission_status),
			records: COUNTED.has(statsMission.lifetime_output_basis) ? (source.readMission(id, 'records').records ?? []) : null
		}));
	// a month closes only on a date both exports cover: the earlier of the two
	return buildClps({ asOf: clpsAsOf < asOf ? clpsAsOf : asOf, horizonMonths, comparators, surface, missions });
}
