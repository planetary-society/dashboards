/**
 * refresh-report.md -- the review artifact for one data refresh.
 *
 * Pure formatting: values in, markdown out. The only dates it prints come from
 * the run provenance, so packaging unchanged input twice produces a
 * byte-identical report (the same convention as the packaged JSON).
 */

import { int, num, sum } from './util.mjs';

// ------------------------------------------------------------------ format

const NBSP_FREE = (s) => String(s).replace(/\|/g, '\\|');

/** Any figure, formatted for the delta table. */
export function figure(v) {
	if (v === null || v === undefined) return '—';
	if (typeof v === 'string') return v;
	const n = num(v);
	if (n === null) return String(v);
	return Number.isInteger(n) ? int(n) : n.toFixed(3);
}

/**
 * A GFM table, padded to equal column widths.
 *
 * The padding is not decoration: it is exactly what Prettier's markdown
 * formatter produces, so an editor-on-save or a repo-wide `prettier --write`
 * leaves this file alone instead of re-diffing every refresh.
 */
function table(headers, rows) {
	const all = [headers, ...rows].map((cells) => cells.map((c) => NBSP_FREE(c)));
	const width = headers.map((_, i) =>
		Math.max(3, ...all.map((cells) => [...(cells[i] ?? '')].length)),
	);
	const line = (cells) =>
		`| ${cells.map((c, i) => c + ' '.repeat(width[i] - [...c].length)).join(' | ')} |`;
	const [head, ...body] = all;
	return [line(head), line(width.map((w) => '-'.repeat(w))), ...body.map(line)].join('\n');
}

const listOr = (items, empty) => (items.length ? items.join(', ') : empty);

// ----------------------------------------------------------------- figures

/**
 * Every number worth comparing between two packages, in a stable order.
 * @param {{site: object, divisions: Record<string, object>}} pkg
 * @returns {Map<string, number|string|null>}
 */
export function buildFigures({ site, divisions }) {
	const out = new Map();
	if (!site) return out;
	out.set('missions', num(site.missions));
	out.set('papers · globally distinct', num(site.papersDistinct));
	out.set('citations · globally distinct', num(site.citationsDistinct));
	out.set(
		'launch years',
		Array.isArray(site.launchYears) ? `${site.launchYears[0]}–${site.launchYears[1]}` : null,
	);
	for (const summary of site.divisions ?? []) {
		const doc = divisions?.[summary.slug] ?? null;
		const p = `${summary.name} · `;
		out.set(`${p}missions`, num(summary.missions));
		out.set(`${p}papers`, num(summary.papers));
		out.set(`${p}citations`, num(summary.citations));
		for (const scope of ['full', 'window', 'lifetime']) {
			for (const top of [10, 1]) {
				out.set(`${p}${scope} top-${top}% cutoff`, num(doc?.cutoffs?.[scope]?.[top]));
			}
		}
		for (const key of ['m', 'h']) {
			out.set(`${p}${key}-index vs cost (rho)`, num(doc?.indexCorrelation?.[key]?.rho));
		}
	}
	const story = site.story ?? {};

	out.set('story · threshold', num(story.referenceCost));
	out.set('story · missions at or under threshold', num(story.threshold?.missions));
	out.set('story · mission papers at or under threshold', num(story.threshold?.papers));
	for (const key of ['under', 'over']) {
		const side = story.failure?.[key];
		if (side) out.set(`story · shortfalls · ${key} threshold`, `${side.failed} of ${side.missions}`);
	}
	for (const d of story.divisions ?? []) {
		out.set('story · under-threshold share · ' + d.division, num(d.share));
		out.set('story · measured under-threshold missions · ' + d.division, num(d.measuredMissions));
	}
	for (const b of story.bands ?? []) {
		out.set(`story · top-paper band · ${b.division}`, `${figure(b.p25)}–${figure(b.p75)}`);
		out.set(`story · top-paper band midpoint · ${b.division}`, num(b.p50));
	}
	for (const g of story.comparison?.groups ?? []) {
		out.set(`story · ${g.key} threshold · missions`, num(g.missions));
		out.set(`story · ${g.key} threshold · top-10% papers per mission`, num(g.top10PerMission));
	}
	if (story.pooledBand) {
		out.set('story · pooled top-paper band', `${figure(story.pooledBand.p25)}–${figure(story.pooledBand.p75)}`);
		out.set('story · pooled top-paper band midpoint', num(story.pooledBand.p50));
	}
	for (const d of story.perDollar ?? []) {
		for (const g of d.groups) out.set(`story · citations per $100M · ${d.division} · ${g.key}`, num(g.perHundredM));
	}
	const clps = site.clps;
	if (clps) {
		out.set('clps · papers to date', num(clps.series.filter((v) => v !== null).at(-1)));
		for (const c of clps.comparators) out.set(`clps · ${c.name} · month ${clps.horizonMonths}`, num(c.series.at(-1)));
		if (clps.comparison) out.set('clps · behind every comparator', String(clps.comparison.behindAll));
	}
	const kinds = site.kinds;
	if (kinds) {
		out.set('kinds · papers at or under threshold', num(kinds.total.papers));
		out.set('kinds · non-science share of papers', num(kinds.nonScience.paperShare));
		out.set('kinds · non-science share of citations', num(kinds.nonScience.citationShare));
		if (kinds.small) {
			out.set(`kinds · missions with ≤${kinds.small.maxPapers} papers`, num(kinds.small.missions));
			out.set('kinds · their non-science share of citations', num(kinds.small.nonScience.citationShare));
		}
		out.set('kinds · missions with mostly non-science papers', num(kinds.majorityNonScience));
		for (const e of kinds.examples) {
			for (const k of kinds.kinds) if (e.byKind[k.key].papers) out.set(`kinds · ${e.name} · ${k.label}`, e.byKind[k.key].papers);
			if (e.lifetime) out.set(`kinds · ${e.name} · papers to date`, e.lifetime.papers);
		}
	}
	return out;
}

/** Figures present in either map whose value changed. Stable order: `after` first. */
export function diffFigures(before, after) {
	const changed = [];
	const keys = [...after.keys(), ...[...before.keys()].filter((k) => !after.has(k))];
	for (const key of keys) {
		const a = before.has(key) ? before.get(key) : undefined;
		const b = after.has(key) ? after.get(key) : undefined;
		const same = a === b || (a === undefined && b === undefined);
		if (!same)
			changed.push({
				label: key,
				before: a === undefined ? null : a,
				after: b === undefined ? null : b,
			});
	}
	return changed;
}

/** Missions gained and lost between two index.json arrays. */
export function missionDelta(before, after) {
	const was = new Map((before ?? []).map((e) => [e.id, e]));
	const now = new Map((after ?? []).map((e) => [e.id, e]));
	const label = (e) => `${e.name} (\`${e.id}\`, ${e.division})`;
	return {
		added: [...now.values()]
			.filter((e) => !was.has(e.id))
			.map(label)
			.sort(),
		removed: [...was.values()]
			.filter((e) => !now.has(e.id))
			.map(label)
			.sort(),
	};
}

// ------------------------------------------------------------------ report

/**
 * @param {object} input
 * @param {object} input.site the Site object just written
 * @param {object[]} input.divisions the Division documents just written, config order
 * @param {object[]} input.index the MissionIndexEntry array just written
 * @param {string[]} input.warnings
 * @param {{slug: string, edges: number, citationsTotal: number|null, relative: number|null}[]} input.citationGaps
 * @param {string[]} input.unbalanced missions whose merge_stats did not reconcile
 * @param {{id: string, name: string, division: string}[]} input.missionsWithoutQuery
 * @param {{ok: number, failed: number, none: number, failedIds: string[], file: string}|null} input.thumbs
 * @param {Record<string, number>} input.bytes output sizes
 * @param {{site: object|null, index: object[]|null, divisions: Record<string, object>}|null} input.previous
 */
export function formatReport(input) {
	const {
		site,
		divisions = [],
		index = [],
		warnings = [],
		citationGaps = [],
		unbalanced = [],
		missionsWithoutQuery = [],
		thumbs = null,
		bytes = {},
		previous = null,
	} = input;
	const docsBySlug = Object.fromEntries(divisions.map((d) => [d.slug, d]));
	const out = [];

	out.push('# Science Mission Impact — refresh report');
	out.push('');
	out.push(
		`Snapshot **${site.asOf}** · ADS fetched ${site.fetchedMin ?? '—'} → ${site.fetchedMax ?? '—'} · ` +
			`analysis revision${site.codeRevision?.includes('+') ? 's' : ''} ` +
			`${(site.codeRevision || 'unknown')
				.split('+')
				.map((r) => `\`${r.slice(0, 12)}\``)
				.join(', ')}`,
	);
	out.push('');
	out.push(
		'Generated by `scripts/package-data.mjs`. Every date here comes from the run provenance, ' +
			'never from the clock, so an unchanged input rewrites this file byte for byte.',
	);

	// ---- warnings ---------------------------------------------------------
	out.push('');
	out.push('## Warnings');
	out.push('');
	if (warnings.length === 0) out.push('None.');
	else for (const w of warnings) out.push(`- ⚠︎ ${w}`);

	// ---- divisions --------------------------------------------------------
	out.push('');
	out.push('## Divisions');
	out.push('');
	out.push(
		table(
			[
				'Division',
				'Missions',
				'Papers',
				'Citations',
				'Pub. years',
				'Full-mission 10% / 1% cutoff',
				'Window 10% / 1% cutoff',
				'Lifetime 10% / 1% cutoff',
				'Rankable',
			],
			(site.divisions ?? []).map((d) => {
				const doc = docsBySlug[d.slug] ?? null;
				const cut = (scope) => {
					const c = doc?.cutoffs?.[scope];
					return c ? `${int(c[10])} / ${int(c[1])}` : '—';
				};
				return [
					d.name,
					int(d.missions),
					int(d.papers),
					int(d.citations),
					d.publicationYears ? `${d.publicationYears[0]}–${d.publicationYears[1]}` : '—',
					cut('full'),
					cut('window'),
					cut('lifetime'),
					d.rankable ? 'yes' : 'no',
				];
			}),
		),
	);
	out.push('');
	const divisionPapers = sum((site.divisions ?? []).map((d) => d.papers));
	out.push(
		`**Globally distinct: ${int(site.missions)} missions · ${int(site.papersDistinct)} papers · ` +
			`${int(site.citationsDistinct)} citations.** The divisions sum to ${int(divisionPapers)} papers; ` +
			`${int(divisionPapers - site.papersDistinct)} are claimed by more than one division and are ` +
			'counted once here. Cutoffs are pooled citation counts, for footnotes only.',
	);


	out.push('', '## Validation', '');
	out.push('All source, membership, window, paper-count, rank and citation-coverage checks passed before output replacement. Public discussion values are calculated from individual missions; no class-based narrative claims are required.');

	// ---- deltas -----------------------------------------------------------
	out.push('');
	out.push('## Changes since the previous package');
	out.push('');
	if (!previous?.site) {
		out.push(
			'No previous package was found — this is the first one, so there is nothing to compare.',
		);
	} else {
		const { added, removed } = missionDelta(previous.index, index);
		out.push(`- Missions added: ${listOr(added, 'none')}`);
		out.push(`- Missions removed: ${listOr(removed, 'none')}`);
		out.push('');
		const changed = diffFigures(
			buildFigures({ site: previous.site, divisions: previous.divisions ?? {} }),
			buildFigures({ site, divisions: docsBySlug }),
		);
		if (changed.length === 0) {
			out.push('No change in totals, cutoffs or story figures.');
		} else {
			out.push(
				table(
					['Figure', 'Before', 'After'],
					changed.map((c) => [c.label, figure(c.before), figure(c.after)]),
				),
			);
		}
	}

	// ---- data notes -------------------------------------------------------
	out.push('');
	out.push('## Data notes');
	out.push('');
	out.push(
		`- Missions with no ADS query: ${
			missionsWithoutQuery.length === 0
				? 'none'
				: `${missionsWithoutQuery.length} — ` +
					missionsWithoutQuery.map((m) => `${m.name} (\`${m.id}\`)`).join(', ')
		}`,
	);
	out.push(
		`- \`merge_stats\` reconciliation: ${
			unbalanced.length === 0
				? 'balanced for every mission'
				: `unbalanced for ${listOr(unbalanced, '')}`
		}`,
	);
	out.push('');
	out.push(
		'Citation timelines are checked against reported counts. Only source-declared, small missing sets within the configured limit are retained and visibly labelled incomplete. Excess or larger discrepancies are fatal.',
	);
	out.push('');
	out.push(
		table(
			['Division', 'Citation edges', 'ADS citations', 'Missing'],
			citationGaps.map((g) => [
				g.slug,
				int(g.edges),
				int(g.citationsTotal),
				g.citationsTotal === null ? '—' : int(g.citationsTotal - g.edges),
			]),
		),
	);

	out.push('');
	for (const gap of citationGaps) {
		for (const paper of gap.papers ?? []) out.push('- ' + gap.slug + ': ' + paper.bibcode + ' (' + paper.mission + '), ' + paper.missing + ' missing dated citation(s); ' + paper.observed + '/' + paper.expected + ' observed.');
	}

	// ---- thumbnails -------------------------------------------------------
	out.push('');
	out.push('## Thumbnails');
	out.push('');
	if (!thumbs) {
		out.push(
			'No `static/img/missions/manifest.json` — run `node scripts/fetch-thumbs.mjs`. ' +
				'Missions without a tile fall back to a flat square.',
		);
	} else {
		out.push(
			`ok ${thumbs.ok} · failed ${thumbs.failed} · no image URL ${thumbs.none} ` +
				`(from \`${thumbs.file}\`)`,
		);
		if (thumbs.failed > 0) {
			out.push('');
			out.push(
				`Failed: ${thumbs.failedIds.map((id) => `\`${id}\``).join(', ')}. These render as flat ` +
					'squares; re-run `node scripts/fetch-thumbs.mjs` to retry them.',
			);
		}
	}

	// ---- sizes ------------------------------------------------------------
	out.push('');
	out.push('## Output');
	out.push('');
	const names = {
		site: '`generated/site.json`',
		index: '`generated/index.json`',
		scrolly: '`generated/scrolly.json`',
		divisions: '`generated/divisions/`',
		missions: '`generated/missions/`',
		papers: '`static/data/papers/`',
	};
	const total = Object.values(bytes).reduce((a, b) => a + b, 0);
	out.push(
		table(
			['File', 'Bytes'],
			[
				...Object.entries(names)
					.filter(([key]) => bytes[key] !== undefined)
					.map(([key, label]) => [label, int(bytes[key])]),
				['**total**', `**${int(total)}**`],
			],
		),
	);
	out.push('');
	return out.join('\n');
}
