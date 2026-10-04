/**
 * Paper kinds: what role a mission's own flight data play in each refereed
 * paper attributed to it, for the missions at or under the cost threshold.
 * The classification is a curated input file; every number is computed here.
 */

import { readFileSync } from 'node:fs';
import { byText, ratio, share, sum, weight } from './util.mjs';

export const KINDS = [
	{ key: 'results', label: 'Science results', short: 'Science', science: true },
	{ key: 'data', label: 'Data and calibration', short: 'Data', science: true },
	{ key: 'mission', label: 'Mission and instrument', short: 'Mission', science: false },
	{ key: 'review', label: 'Reviews and commentary', short: 'Reviews', science: false },
	{ key: 'future', label: 'Planned or expected results', short: 'Planned', science: false },
	{ key: 'other', label: 'Mentions only', short: 'Mentions', science: false }
];
const KIND_KEYS = new Set(KINDS.map((k) => k.key));

/** Read and validate the classification file. */
export function loadPaperKinds(path) {
	return validatePaperKinds(JSON.parse(readFileSync(path, 'utf8')), path);
}

export function validatePaperKinds(raw, label = 'paper-kinds') {
	const fail = (message) => {
		throw new Error(`${label}: ${message}`);
	};
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('not an object');
	if (typeof raw.asOf !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.asOf)) fail(`asOf must be YYYY-MM-DD, got ${JSON.stringify(raw.asOf)}`);
	if (typeof raw.method !== 'string') fail('method must be a string');
	if (!Array.isArray(raw.papers)) fail('papers must be an array');
	const byMission = new Map();
	raw.papers.forEach((entry, i) => {
		const name = `papers[${i}] ${JSON.stringify(entry)}`;
		for (const key of ['mission', 'bibcode', 'kind']) {
			if (typeof entry?.[key] !== 'string' || entry[key] === '') fail(`${name} is missing "${key}"`);
		}
		if (!KIND_KEYS.has(entry.kind)) fail(`${name} has unknown kind "${entry.kind}"`);
		const note = entry.note;
		if (typeof note !== 'string') fail(`${name} has a non-string note`);
		if (entry.confidence !== undefined && entry.confidence !== 'high' && entry.confidence !== 'low') {
			fail(`${name} has confidence ${JSON.stringify(entry.confidence)}; expected "high" or "low"`);
		}
		if (!byMission.has(entry.mission)) byMission.set(entry.mission, new Map());
		const papers = byMission.get(entry.mission);
		if (papers.has(entry.bibcode)) fail(`${name} duplicates (${entry.mission}, ${entry.bibcode})`);
		papers.set(entry.bibcode, { kind: entry.kind, note });
	});
	return { asOf: raw.asOf, method: raw.method, byMission };
}

const emptyByKind = () => Object.fromEntries(KINDS.map((k) => [k.key, { papers: 0, citations: 0 }]));
const nonScience = (byKind) => KINDS.filter((k) => !k.science).reduce((n, k) => n + byKind[k.key].papers, 0);

/**
 * A mission's whole record (every row, any scope, lifetime citations), for the
 * example step: the mission page lists every paper, so the example does too.
 * Unclassified out-of-scope rows are skipped (buildKinds warns about them).
 */
function lifetimeOf(m, classes) {
	const byKind = emptyByKind();
	const list = [];
	for (const row of m.rows) {
		const c = classes.get(row.bibcode);
		if (!c) continue;
		const citations = row.citationsLifetime ?? 0;
		byKind[c.kind].papers += 1;
		byKind[c.kind].citations += citations;
		list.push({ bibcode: row.bibcode, title: row.title, year: row.year, firstAuthor: row.firstAuthor, citations, inScope: row.inScope, kind: c.kind, note: c.note });
	}
	list.sort((x, y) => y.citations - x.citations || byText(x.bibcode, y.bibcode));
	const citations = list.reduce((n, r) => n + r.citations, 0);
	const shareOf = (r) => share(ratio(r.citations, citations));
	const first = list[0];
	const result = list.find((r) => r.kind === 'results');
	return {
		papers: list.length,
		citations,
		byKind,
		list,
		top: first ? { bibcode: first.bibcode, title: first.title, citations: first.citations, kind: first.kind, note: first.note, citationShare: shareOf(first) } : null,
		firstResult: result ? { bibcode: result.bibcode, title: result.title, citations: result.citations, citationShare: shareOf(result) } : null
	};
}

/**
 * Count each mission's in-scope (full-mission window) papers by kind, with their top-10% credit.
 * Each mission carries its full-scope `top10` (null when unavailable) and rows with `top10Credit`
 * (the in-window row's share of the mission's top10); the two must agree.
 * @param {{kindsFile: ReturnType<typeof validatePaperKinds>, missions: object[], examples: string[], smallMax: number, warnings: {add(m: string): void}}} args
 */
export function buildKinds({ kindsFile, missions, examples, smallMax, warnings }) {
	if (missions.length === 0) throw new Error('paper kinds: no missions at or under the threshold');
	const ids = new Set(missions.map((m) => m.id));
	const missingExamples = examples.filter((id) => !ids.has(id));
	if (missingExamples.length) throw new Error(`paper kinds: example missions not at or under the threshold: ${missingExamples.join(', ')}`);

	// Every classification must name a row of a mission at or under the threshold.
	const stale = [];
	for (const [missionId, papers] of kindsFile.byMission) {
		const mission = missions.find((m) => m.id === missionId);
		if (!mission) {
			stale.push(`unknown mission "${missionId}" (${papers.size} entries)`);
			continue;
		}
		const bibcodes = new Set(mission.rows.map((r) => r.bibcode));
		for (const bibcode of papers.keys()) if (!bibcodes.has(bibcode)) stale.push(`${missionId} ${bibcode}`);
	}
	if (stale.length) throw new Error(`paper kinds: stale classification entries:\n- ${stale.join('\n- ')}`);

	const missing = [];
	const built = missions.map((m) => {
		const classes = kindsFile.byMission.get(m.id) ?? new Map();
		const byKind = emptyByKind();
		const credit = Object.fromEntries(KINDS.map((k) => [k.key, 0]));
		const list = [];
		let unclassifiedOut = 0;
		for (const row of m.rows) {
			const c = classes.get(row.bibcode);
			if (!row.inScope) {
				if (!c) unclassifiedOut += 1;
				continue;
			}
			if (!c) {
				missing.push(`(${m.id}, ${row.bibcode}, ${row.title})`);
				continue;
			}
			byKind[c.kind].papers += 1;
			byKind[c.kind].citations += row.citations;
			if (!Number.isFinite(row.top10Credit)) throw new Error(`paper kinds: ${m.id} ${row.bibcode} has no top-10% credit`);
			credit[c.kind] += row.top10Credit;
			list.push({ bibcode: row.bibcode, title: row.title, year: row.year, firstAuthor: row.firstAuthor, citations: row.citations, kind: c.kind, note: c.note });
		}
		if (unclassifiedOut) warnings.add(`paper kinds: ${m.id} has ${unclassifiedOut} unclassified paper(s) outside the full-mission window`);
		const papers = list.length;
		const citations = list.reduce((n, r) => n + r.citations, 0);
		return { m, byKind, credit, list, papers, citations };
	});
	if (missing.length) throw new Error(`paper kinds: ${missing.length} in-window paper(s) have no classification:\n- ${missing.join('\n- ')}`);

	for (const { m, papers, citations, credit } of built) {
		if (papers !== m.papers || citations !== m.citations) {
			throw new Error(`paper kinds: ${m.id} in-window rows give ${papers} papers / ${citations} citations, the tile says ${m.papers} / ${m.citations}`);
		}
		const top10 = sum(Object.values(credit));
		if (m.top10 !== null && !(Math.abs(top10 - m.top10) <= 0.001)) {
			throw new Error(`paper kinds: ${m.id} in-window rows give ${top10} top-10% credit, the mission says ${m.top10}`);
		}
	}
	// Top-10% credit by kind: the same tie-weighted, era-adjusted credit the comparison counts.
	const creditByKind = Object.fromEntries(KINDS.map((k) => [k.key, sum(built.map((b) => b.credit[k.key]))]));
	const creditTotal = sum(Object.values(creditByKind));
	const creditNonScience = sum(KINDS.filter((k) => !k.science).map((k) => creditByKind[k.key]));

	const toMission = ({ m, byKind, papers, citations }) => ({
		id: m.id,
		name: m.name,
		division: m.division,
		cost: m.cost ?? null,
		papers,
		citations,
		byKind,
		nonScienceShare: share(ratio(nonScience(byKind), papers))
	});
	const all = built.map(toMission).sort((a, b) => b.papers - a.papers || b.citations - a.citations || byText(a.name, b.name));

	const tally = (list) => {
		const byKind = emptyByKind();
		for (const mission of list) {
			for (const k of KINDS) {
				byKind[k.key].papers += mission.byKind[k.key].papers;
				byKind[k.key].citations += mission.byKind[k.key].citations;
			}
		}
		const papers = list.reduce((n, m) => n + m.papers, 0);
		const citations = list.reduce((n, m) => n + m.citations, 0);
		const nsPapers = nonScience(byKind);
		const nsCitations = KINDS.filter((k) => !k.science).reduce((n, k) => n + byKind[k.key].citations, 0);
		return {
			total: { papers, citations, byKind },
			nonScience: {
				papers: nsPapers,
				paperShare: share(ratio(nsPapers, papers)),
				citations: nsCitations,
				citationShare: share(ratio(nsCitations, citations))
			}
		};
	};
	const overall = tally(all);
	// The spread of in-window citations over those mission papers (a shared paper is one row per mission).
	const paperCitations = built.flatMap((b) => b.list.map((r) => r.citations));
	// The smallest corpora, where a single review can dominate the citations.
	const smallList = all.filter((m) => m.papers > 0 && m.papers <= smallMax);
	const smallTally = tally(smallList);

	return {
		scope: 'full',
		asOf: kindsFile.asOf,
		method: kindsFile.method,
		kinds: KINDS.map((k) => ({ ...k })),
		missions: all,
		withPapers: all.filter((m) => m.papers > 0).length,
		withoutPapers: all.filter((m) => m.papers === 0).length,
		total: overall.total,
		citationRange: paperCitations.length ? { min: Math.min(...paperCitations), max: Math.max(...paperCitations) } : null,
		nonScience: overall.nonScience,
		small: {
			maxPapers: smallMax,
			missions: smallList.length,
			papers: smallTally.total.papers,
			citations: smallTally.total.citations,
			nonScience: smallTally.nonScience
		},
		majorityNonScience: all.filter((m) => m.papers > 0 && nonScience(m.byKind) > m.papers - nonScience(m.byKind)).length,
		topCredit: {
			total: weight(creditTotal),
			nonScience: weight(creditNonScience),
			share: share(ratio(creditNonScience, creditTotal)),
			byKind: Object.fromEntries(KINDS.map((k) => [k.key, weight(creditByKind[k.key])]))
		},
		examples: examples.map((id) => {
			const b = built.find((x) => x.m.id === id);
			return { ...toMission(b), fullName: b.m.fullName, lifetime: lifetimeOf(b.m, kindsFile.byMission.get(id) ?? new Map()) };
		})
	};
}
