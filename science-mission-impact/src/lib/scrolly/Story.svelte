<script>
	// The overview as a scroll: a title, then twenty steps over one stage of mission squares.
	// Pairs of steps share one graphic state (COMPARE/COMPARE_DIVISIONS, TIMING/TIMING_UNDER,
	// KINDS/KINDS_ALL, CLOSE/CLOSE_LIMITS). Every figure in the copy comes from site.story (the
	// packager) or site itself; the component only lays out.
	import Scroller from './Scroller.svelte';
	import Squares from './Squares.svelte';
	import Skyline from './Skyline.svelte';
	import ComparisonLabels from './ComparisonLabels.svelte';
	import FailureLabels from './FailureLabels.svelte';
	import CostAxis from './CostAxis.svelte';
	import ProjectTimeAxis from './ProjectTimeAxis.svelte';
	import PerDollarAxis from './PerDollarAxis.svelte';
	import ClpsChart from './ClpsChart.svelte';
	import KindBars from './KindBars.svelte';
	import KindExample from './KindExample.svelte';
	import Waffle from './Waffle.svelte';
	import { gridLayout, rugLayout, skylineLayout, failureLayout, costLayout, projectTimeLayout, perDollarLayout, kindsLayout, exampleLayout, waffleLayout } from './layouts.js';
	import { costItems, exampleItems, failureItems, kindsItems, lanesItems, perDollarItems, withHidden } from './items.js';
	import { int, listify, longDate, money, pct, plural, spell, upperFirst, weight, years } from '$lib/format.js';
	import { fullWindowLabel } from '$lib/copy/window.js';
	import { asset } from '$lib/paths.js';

	let { site, scrolly } = $props();
	const TITLE = 0, OVERVIEW = 1, CORPUS = 2, MOTIVATION = 3, THRESHOLD = 4, PUBLICATIONS = 5, COMPARE = 6, COMPARE_DIVISIONS = 7, FAILURE = 8, RANGE = 9, TIMING = 10, TIMING_UNDER = 11, DOLLAR = 12, KINDS = 13, KINDS_ALL = 14, EXAMPLE = 15, CITATIONS = 16, CLPS = 17, CLPS_COMPARE = 18, CLOSE = 19, CLOSE_LIMITS = 20;
	// Reduced motion: every scrubbed graphic renders complete.
	const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

	const tiles = $derived(scrolly.tiles);
	const story = $derived(site.story);
	const scope = $derived(story.scope);
	const reference = $derived(story.referenceCost);
	const threshold = $derived(story.threshold);
	const failure = $derived(story.failure);
	const clps = $derived(site.clps);
	const landers = $derived(clps.missions.filter((p) => p.papers > 0).length);
	const thresholdIds = $derived(new Set(threshold.ids));
	const underTiles = $derived(tiles.filter((t) => thresholdIds.has(t.id)));
	const comparison = $derived(story.comparison);
	const under = $derived(comparison.groups.find((g) => g.key === 'under'));
	const over = $derived(comparison.groups.find((g) => g.key === 'over'));
	const equal = $derived(comparison.equalWeight ?? {});
	// The gap "holds" in a division only where both sides are measured and the smaller missions' side is lower.
	const byDivision = $derived(comparison.byDivision ?? []);
	const lower = $derived(byDivision.filter((d) => d.under.top10PerMission != null && d.over.top10PerMission != null && d.under.top10PerMission < d.over.top10PerMission).length);
	const everyLower = $derived(byDivision.length > 0 && lower === byDivision.length);
	// The divisions the cross-division figures cover. The others fade out when those come up.
	const compared = $derived(new Set(comparison.divisions));
	const rankable = $derived(site.divisions.filter((d) => compared.has(d.slug)));
	const timing = $derived(story.timing.find((t) => t.division === story.timingDivision) ?? null);
	const low = $derived(timing?.byCostThird?.find((t) => t.key === 'low') ?? null);
	const high = $derived(timing?.byCostThird?.find((t) => t.key === 'high') ?? null);
	// how much of the gap in years to a first top paper the gap in build time covers; named only when both gaps run the same way
	const buildPortion = $derived.by(() => {
		if (!low || !high || [low.medianYears, high.medianYears, low.medianBuildYears, high.medianBuildYears].some((v) => v == null)) return null;
		if (!(low.medianYears < high.medianYears && low.medianBuildYears < high.medianBuildYears)) return null;
		return (high.medianBuildYears - low.medianBuildYears) / (high.medianYears - low.medianYears) >= 0.5 ? 'most' : 'part';
	});
	const count = (n) => (n === 0 ? 'none' : spell(n));
	const lanes = $derived.by(() => {
		const u = timing?.under;
		if (!(u?.missions > 0)) return null;
		const neither = u.missions - u.failed - u.reached;
		return listify([`${count(u.failed)} failed`, `${count(u.reached)} produced a top-10% paper`, ...(neither > 0 ? [`${count(neither)} did neither`] : [])]);
	});
	// Per dollar: "favors" only where the ordering survives dropping any one mission.
	const favors = (key) => story.perDollar.filter((d) => d.favors === key).map((d) => d.name);
	const favorText = $derived(
		listify([favors('over').length ? `the larger missions in ${listify(favors('over'))}` : null, favors('under').length ? `the smaller missions in ${listify(favors('under'))}` : null].filter(Boolean))
	);
	const rate = (d, key) => d.groups.find((g) => g.key === key)?.perHundredM ?? null;
	const close = $derived(story.perDollar.filter((d) => d.favors === null && rate(d, 'under') != null && rate(d, 'over') != null));
	// The closing sentence restates only packaged facts; a serial comma once the last part carries its own list.
	const closing = $derived.by(() => {
		if (!(lower > 0)) return null;
		const n = spell(byDivision.length);
		const parts = [`produced fewer top-10% papers per mission ${everyLower ? `in all ${n} divisions compared` : `in ${spell(lower)} of the ${n} divisions compared`}`];
		if (failure.higher === 'under') parts.push('failed or partly succeeded more often');
		if (favors('over').length) parts.push(`in ${listify(favors('over'))} returned fewer citations per dollar`);
		return parts.length < 3 ? parts.join(' and ') : `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`;
	});
	// listify has no "or"; the failure statuses are the one list that needs it
	const orList = (items) => (items.length < 3 ? items.join(' or ') : `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`);
	const costs = $derived(tiles.map((t) => t.cost).filter((c) => c > 0));
	const topShare = (t) => t.share[scope][10];
	const none = new Set();
	// Paper kinds: every number and name binds to site.kinds.
	const kinds = $derived(site.kinds);
	const example = $derived(kinds.examples[0]);
	const second = $derived(kinds.examples[1] ?? null);
	const exL = $derived(example.lifetime);
	const exResults = $derived(exL.byKind.results.papers);
	const kindPhrase = { results: 'a science result', data: 'a data or calibration paper', mission: 'a description of the mission or an instrument', review: 'a review or commentary', future: 'a paper anticipating results', other: 'a paper that only mentions the mission' };
	const science = $derived(new Set(kinds.kinds.filter((k) => k.science).map((k) => k.key)));
	const kindNouns = { results: ['science result', 'science results'], data: ['data or calibration paper', 'data or calibration papers'], mission: ['paper about the mission or an instrument', 'papers about the mission or an instrument'], review: ['review or commentary', 'reviews or commentary'], future: ['paper anticipating results', 'papers anticipating results'], other: ['paper that only mentions the mission', 'papers that only mention the mission'] };
	// the papers not yet named: the science results, and the one top paper the copy names when it is not a result
	const restCounts = (byKind, named = null) =>
		listify(
			kinds.kinds
				.filter((k) => k.key !== 'results')
				.map((k) => ({ k, n: byKind[k.key].papers - (named === k.key ? 1 : 0) }))
				.filter(({ n }) => n > 0)
				.map(({ k, n }) => `${spell(n)} ${plural(n, ...kindNouns[k.key])}`)
		);
	const exNamed = $derived(exL.top && exL.top.kind !== 'results' && exL.firstResult && exL.top.citations > exL.firstResult.citations ? exL.top.kind : null);
	// the nearest costs either side of the line, to a tenth of a million: money() would round $149.7M up onto the line itself
	const gapMoney = (m) => (m < 1000 ? `$${m.toFixed(1)}M` : money(m));
	const solid = (pos) => new Map([...pos].map(([id, p]) => [id, { ...p, variant: 'solid' }]));

	let index = $state(0);
	let progress = $state(0);
	let W = $state(0);
	let H = $state(0);
	const compact = $derived(W > 0 && W < 600);
	const ready = $derived(W > 0 && H > 0);
	const grid = $derived(ready ? gridLayout(tiles, W, H) : null);
	const rug = $derived(ready ? rugLayout(tiles, W, H, site.launchYears) : null);
	const sky = $derived(rug ? skylineLayout(tiles, rug, { compact }) : null);
	const small = $derived(ready ? gridLayout(underTiles, W, H, { top: compact ? 56 : 96 }) : null);
	const failureL = $derived(ready ? failureLayout(tiles, W, H, { divisions: failure.byDivision, threshold: reference }) : null);
	const cost = $derived(ready ? costLayout(tiles.filter((t) => compared.has(t.division)), W, H, { divisions: rankable }) : null);
	const time = $derived(cost && timing ? projectTimeLayout(tiles, W, H, { scope, x: cost.x, left: cost.left, division: timing.division }) : null);
	const dollar = $derived(cost ? perDollarLayout(tiles, W, H, { divisions: rankable, x: cost.x, left: cost.left }) : null);
	const kindsL = $derived(ready ? kindsLayout(kinds.missions, W, H, { compact }) : null);
	const exampleL = $derived(ready ? exampleLayout(example.id, W, H, { compact }) : null);
	const waffle = $derived(ready ? waffleLayout(threshold.papersAll, threshold.papers, W, H, { top: compact ? 56 : 96, compact }) : null);

	const scrub = $derived(reduced ? 1 : Math.min(1, progress * 2.4));
	// the title stands alone; the squares arrive one by one with the overview, then stay
	const shown = $derived(index === TITLE ? 0 : index === OVERVIEW ? Math.ceil(scrub * tiles.length) : tiles.length);
	const comparing = $derived(index === COMPARE || index === COMPARE_DIVISIONS);
	const timed = $derived(index === TIMING || index === TIMING_UNDER);
	const kindsShown = $derived(index === KINDS || index === KINDS_ALL || index === CITATIONS);
	const items = $derived.by(() => {
		if (!grid) return new Map();
		if (index <= OVERVIEW || index >= CLOSE) return solid(grid.pos);
		if (index === CORPUS) return withHidden(solid(rug.pos), tiles, grid.pos);
		if (index === MOTIVATION) return withHidden(new Map(), tiles, rug.pos);
		if (index === THRESHOLD) return withHidden(solid(small.pos), tiles, grid.pos);
		if (index === PUBLICATIONS) return withHidden(new Map(), tiles, small.pos);
		if (comparing) return withHidden(new Map(), tiles, new Map([...grid.pos, ...small.pos]));
		if (index === FAILURE) return withHidden(failureItems(tiles, failureL), tiles, grid.pos);
		if (timed && time) return withHidden(lanesItems(tiles, time, { scope }), tiles, cost.pos);
		if (index === DOLLAR) return withHidden(perDollarItems(tiles, dollar), tiles, cost.pos);
		if (kindsShown) return withHidden(kindsItems(tiles, kindsL), tiles, dollar.pos);
		if (index === EXAMPLE) return withHidden(exampleItems(tiles, exampleL), tiles, kindsL.pos);
		if (index >= CLPS) return withHidden(new Map(), tiles, kindsL.pos);
		return withHidden(costItems(tiles, cost, { scope, top: 10, unranked: none, referenceCost: reference }), tiles, failureL.pos);
	});
	const costVisible = $derived(index === RANGE);
	// the lines draw while the reader scrolls, not inside the 400 ms fade-in
	const clpsDraw = $derived(reduced ? 1 : Math.max(0, Math.min(1, (progress - 0.1) / 0.6)));
	const waffleBuild = $derived(reduced ? 1 : Math.max(0, Math.min(1, (progress - 0.05) / 0.6)));
</script>

<Scroller bind:index bind:progress>
	{#snippet graphic()}
		<div class="frame">
			<div class="stage" bind:clientWidth={W} bind:clientHeight={H}>
				<img class="photo" class:visible={index === MOTIVATION} src={asset('img/story/im-2-athena.webp')} alt="" decoding="async" fetchpriority="low" />
				{#if rug && cost}
					<Skyline layout={sky} total={site.papersDistinct} rise={index === CORPUS ? scrub : index > CORPUS ? 1 : 0} visible={index === CORPUS} {compact} width={W} height={H} />
					<ComparisonLabels {comparison} referenceCost={reference} visible={comparing} {compact} />
					<FailureLabels layout={failureL} {failure} referenceCost={reference} visible={index === FAILURE} {compact} />
					<CostAxis layout={cost} bands={story.bands} pooled={story.pooledBand} unranked={none} share={topShare} referenceCost={reference} progress={index === RANGE ? scrub : index > RANGE ? 1 : 0} showBands visible={costVisible} {compact} width={W} height={H} />
					{#if time}
						<ProjectTimeAxis layout={time} ticks={cost.ticks} referenceCost={reference} visible={timed} {compact} width={W} height={H} />
					{/if}
					<PerDollarAxis layout={dollar} perDollar={story.perDollar} ticks={cost.ticks} referenceCost={reference} visible={index === DOLLAR} {compact} width={W} height={H} />
					<KindBars layout={kindsL} {kinds} mode={index === CITATIONS ? 'citations' : 'papers'} visible={kindsShown} {compact} />
					<KindExample layout={exampleL} {example} {kinds} visible={index === EXAMPLE} {compact} />
					<ClpsChart {clps} draw={index === CLPS ? clpsDraw : index > CLPS ? 1 : 0} drawComparators={index === CLPS_COMPARE ? clpsDraw : index > CLPS_COMPARE ? 1 : 0} visible={index === CLPS || index === CLPS_COMPARE} {compact} width={W} height={H} />
					<Waffle layout={waffle} referenceCost={reference} build={index === PUBLICATIONS ? waffleBuild : index > PUBLICATIONS ? 1 : 0} visible={index === PUBLICATIONS} {compact} width={W} height={H} />
					<Squares {tiles} {items} {shown} interactive={false} />
				{/if}
				<div class="thesis" class:visible={index === TITLE}>
					<p>How does science impact and productivity scale with cost?</p>
					<p class="byline">The Planetary Society · data as of {longDate(site.asOf)}</p>
				</div>
				<p class="figure" class:visible={index === THRESHOLD || index === PUBLICATIONS} aria-hidden="true">
					{#if index === PUBLICATIONS}<b>{int(threshold.papers)}</b> <span>of {int(threshold.papersAll)} mission papers</span>{:else}<b>{int(threshold.missions)}</b> <span>of {int(threshold.total)} missions</span>{/if}
				</p>
			</div>
			<div class="caption meta">
				{#if index === OVERVIEW}
					Missions in launch order, earliest first.
				{:else if index === CORPUS}
					Squares: missions by launch year. Columns: each mission’s publications to date, square-root scale.
				{:else if index === MOTIVATION}
					IM-2’s Athena lander, which carried NASA instruments to the Moon under CLPS in 2025. Photo: Intuitive Machines.
				{:else if index === THRESHOLD}
					Missions at {money(reference)} or less in {site.costBaseYear} dollars, by launch date.
				{:else if index === PUBLICATIONS}
					Every mission paper in the study on the {fullWindowLabel} basis, one box per {int(waffle?.unit)}. Blue: papers from missions at {money(reference)} or less.
				{:else if comparing}
					Top-10% papers per mission either side of {money(reference)}, by division, failures counted as zero. One scale for all {spell(byDivision.length)}.
				{:else if index === FAILURE}
					X: failure, partial failure or partial success. Costs in {site.costBaseYear} dollars.
				{:else if timed && timing}
					{timing.name} missions by cost. Down: years from project start to the first top-10% paper, including build, launch and any cruise.
				{:else if index === DOLLAR}
					Citations per $100M of mission cost. {fullWindowLabel}.
				{:else if index === KINDS || index === KINDS_ALL}
					Missions at {money(reference)} or less with publications in their {fullWindowLabel}, most first. Bars: each mission’s publications by kind.
				{:else if index === EXAMPLE}
					All {spell(exL.papers)} of {example.name}’s publications to date, most cited first; {spell(example.papers)} {plural(example.papers, 'falls', 'fall')} in its {fullWindowLabel}. {#if exResults > 0}Highlighted: its science {plural(exResults, 'result')}.{/if}
				{:else if index === CITATIONS}
					The same missions. Bars: each mission’s citations by kind, {fullWindowLabel}.
				{:else if index === CLPS}
					Refereed publications by CLPS missions, running total by month from {longDate(clps.start.slice(0, 7))}.
				{:else if index === CLPS_COMPARE}
					Refereed publications, running total by month: CLPS from {longDate(clps.start.slice(0, 7))}, the others from the start of their prime missions.
				{:else if index >= CLOSE}
					All {int(site.missions)} missions, in launch order. {compact ? 'Tap a square to open its mission page.' : 'Hover over a square for its name; click to open its page.'}
				{:else if costVisible}
					<span class="keyline"><i class="top"></i>Running share of each division’s top-10% papers</span>
					<span class="keyline"><i class="spend"></i>Running share of its spending</span>
					<span class="keyline"><i class="span"></i>Middle half of the papers</span>
					<span>Lighter column: the same middle half with the {spell(rankable.length)} divisions weighted equally. Cost on a log scale, {site.costBaseYear} dollars, {fullWindowLabel}.</span>
				{:else}&nbsp;{/if}
			</div>
		</div>
	{/snippet}

	{#snippet steps()}
		<!-- TITLE: the question alone on the stage, no text beside it -->
		<section data-step></section>
		<!-- OVERVIEW -->
		<section data-step><div class="step">
			<p>The {int(site.missions)} NASA science missions in this study launched between {site.launchYears[0]} and {site.launchYears[1]}, and cost from {money(Math.min(...costs))} to {money(Math.max(...costs))} in {site.costBaseYear} dollars.</p>
			<p>What did that investment produce, and does the pattern hold from one field to the next?</p>
		</div></section>
		<!-- CORPUS -->
		<section data-step><div class="step">
			<p>To find out, we analyzed the <b>{int(site.papersDistinct)}</b> peer-reviewed publications these missions have produced to date, across {spell(site.divisions.length)} science divisions.</p>
			<p>Each square is a mission at its launch year; the column above it is that mission’s publications to date.</p>
		</div></section>
		<!-- MOTIVATION -->
		<section data-step><div class="step">
			<p>NASA now flies more science on small budgets: CubeSats, small explorers and instruments carried on commercial lunar landers.</p>
			<p>We wanted to know what missions at that price have returned.</p>
		</div></section>
		<!-- THRESHOLD -->
		<section data-step><div class="step">
			<p>We drew a line at an inflation-adjusted life-cycle cost of <b>{money(reference)}</b>. That takes in {int(threshold.missions)} of the {int(threshold.total)} missions.</p>
			{#if threshold.launchMedian}<p>Half of them launched in {threshold.launchMedian} or later.</p>{/if}
			<p>The line is ours, for comparison. {#if comparison.gap}The nearest missions either side cost {gapMoney(comparison.gap.below)} and {gapMoney(comparison.gap.above)}.{/if}</p>
		</div></section>
		<!-- PUBLICATIONS -->
		<section data-step><div class="step">
			<p>In their {fullWindowLabel}s, these {int(threshold.missions)} missions produced <b>{int(threshold.papers)}</b> mission papers, out of {int(threshold.papersAll)} from all {int(site.missions)} missions on the same basis.</p>
			<p class="aside">A mission’s {fullWindowLabel} runs from the start of its science operations to {spell(site.fullPolicy.postEndYears)} {plural(site.fullPolicy.postEndYears, 'year')} after it ended, cut where citations are mature. A paper shared by two missions counts once for each, so these are mission papers, not distinct papers.</p>
		</div></section>
		<!-- COMPARE -->
		<section data-step><div class="step">
			{#if byDivision.length}
				<p>{#if everyLower}In each of the {spell(byDivision.length)} divisions with enough papers to rank, missions at {money(reference)} or less averaged fewer top-10% papers per mission{:else}In the {spell(byDivision.length)} divisions with enough papers to rank, missions at {money(reference)} or less averaged these top-10% papers per mission against those over {money(reference)}{/if}: {listify(byDivision.map((d) => `${d.name} ${weight(d.under.top10PerMission)} against ${weight(d.over.top10PerMission)}`))}.</p>
			{/if}
			<p class="aside">A top-10% paper is in the most-cited tenth of its own division’s mission papers, compared with papers published around the same time; we also call these high-impact papers. Failed missions count as zero.</p>
		</div></section>
		<!-- COMPARE_DIVISIONS: the same bars -->
		<section data-step><div class="step">
			{#if equal.under != null && equal.over != null}
				<p>Weighting the {spell(rankable.length)} divisions equally, that is <b>{weight(equal.under)}</b> top-10% papers per mission at {money(reference)} or less against <b>{weight(equal.over)}</b> over it.</p>
			{/if}
			<p>{#if under.withTop === 0}None of the {int(under.missions)} missions at {money(reference)} or less produced a top-10% paper{:else}Of the {int(under.missions)} missions at {money(reference)} or less in those divisions, {count(under.withTop)} produced a top-10% paper at all{/if}{#if under.largest}, and one of them, {under.largest.name}, accounts for {pct(under.largest.share)} of all the top-10% papers from that group{/if}{#if over.largest}; {over.largest.name} accounts for {pct(over.largest.share)} of the larger group’s{/if}.</p>
		</div></section>
		<!-- FAILURE -->
		<section data-step><div class="step">
			<p>Of the {int(failure.under.missions)} missions at {money(reference)} or less, <b>{pct(failure.under.rate)}</b> failed or only partly succeeded. Of the {int(failure.over.missions)} costlier missions, {pct(failure.over.rate)} did.</p>
			<p class="aside">Failed or partly succeeded: a recorded mission status of {orList(failure.statuses.map((s) => s.toLowerCase()))}. All {spell(failure.byDivision.length)} divisions.</p>
		</div></section>
		<!-- RANGE -->
		<section data-step><div class="step">
			{#if story.pooledBand}
				<p>Across the {spell(rankable.length)} divisions, the middle half of top-10% papers comes from missions costing <b>{money(story.pooledBand.p25)} to {money(story.pooledBand.p75)}</b>. {#if story.pooledBand.costShare != null}That range also holds {pct(story.pooledBand.costShare)} of the spending.{/if}</p>
			{:else}
				<p>Place the missions at their actual costs and follow where each division’s high-impact publications come from.</p>
			{/if}
			<p>Each blue line adds up a division’s top-10% papers from its cheapest mission to its most expensive; the grey line does the same for its spending. The shaded span is the middle half of the papers.</p>
			<p class="aside">Observed ranges in this sample, not a minimum cost or an optimal price.</p>
		</div></section>
		<!-- TIMING -->
		<section data-step><div class="step">
			{#if timing && low?.medianYears != null && high?.medianYears != null}
				<p>In {timing.name}, among missions that produced a top-10% paper, the cheapest third took a median {years(low.medianYears)} years from project start to reach one; the most expensive third took {years(high.medianYears)} years.</p>
				{#if low.medianBuildYears != null && high.medianBuildYears != null}
					<p>Median build time, from formulation to launch, was {years(low.medianBuildYears)} years for the cheapest third and {years(high.medianBuildYears)} for the most expensive{#if buildPortion}, {buildPortion} of the difference{/if}.</p>
				{/if}
			{/if}
		</div></section>
		<!-- TIMING_UNDER: the same lanes -->
		<section data-step><div class="step">
			{#if lanes}<p>{upperFirst(spell(timing.under.missions))} {plural(timing.under.missions, 'mission')} here cost {money(reference)} or less: {lanes}.</p>{/if}
			<p class="aside">Time runs from the recorded start of formulation to the publication date of the first paper in the division’s top 10%.</p>
		</div></section>
		<!-- DOLLAR -->
		<section data-step><div class="step">
			{#if favorText}<p>Citations per $100M favor {favorText}.</p>{/if}
			{#each close as d (d.division)}
				{@const u = rate(d, 'under')}
				{@const o = rate(d, 'over')}
				<p>In {d.name} the missions at {money(reference)} or less {u > o ? 'come out ahead' : 'fall behind'}, {int(u)} to {int(o)} citations per $100M{#if d.largestUnder}, but {pct(d.largestUnder.share)} of their citations come from {d.largestUnder.name}{#if d.flipsOn?.length === 1 && d.flipsOn[0].id === d.largestUnder.id}, and the ordering depends on that one mission{/if}{/if}.</p>
			{/each}
			{#if under.noPapers != null}
				<p>Of the {int(under.missions)} missions at {money(reference)} or less on this chart, {int(under.noPapers)} produced no publications in their {fullWindowLabel}.</p>
			{/if}
		</div></section>
		<!-- KINDS -->
		<section data-step><div class="step">
			{#if kinds.small.nonScience.citationShare != null}
				<p>Among the {int(kinds.small.missions)} missions with one to {spell(kinds.small.maxPapers)} publications in their {fullWindowLabel}, <b>{pct(kinds.small.nonScience.citationShare)}</b> of citations go to papers that do not report the mission’s own science: descriptions of an instrument, reviews, plans, or papers that only mention the mission.</p>
				<p>Citations per dollar count those papers like any other.</p>
			{/if}
			<p class="aside">Only missions at {money(reference)} or less were sorted this way; the larger missions were not classified.</p>
		</div></section>
		<!-- KINDS_ALL: the same bars -->
		<section data-step><div class="step">
			<p>Across all {int(kinds.total.papers)} mission papers from missions at {money(reference)} or less, {pct(kinds.nonScience.paperShare)} are of these kinds{#if kinds.majorityNonScience > 0}; for {spell(kinds.majorityNonScience)} of the {int(kinds.withPapers)} missions with any publications they are the majority{/if}.</p>
			{#if kinds.topCredit?.share != null}<p>They also hold {pct(kinds.topCredit.share)} of this group’s top-10% paper credit.</p>{/if}
			<p class="aside">Each paper was sorted by the role the mission’s own flight data play in it.</p>
		</div></section>
		<!-- EXAMPLE -->
		<section data-step><div class="step">
			<p>{example.name}{#if example.cost != null}, a {money(example.cost)} mission,{/if} has {spell(exL.papers)} {plural(exL.papers, 'publication')} to date. {#if exResults === 1}One is a science result{#if exL.firstResult}, with <b>{int(exL.firstResult.citations)}</b> citations{/if}.{:else if exResults > 1}{upperFirst(spell(exResults))} are science results.{:else}None is a science result.{/if}</p>
			{#if exL.top && exL.top.kind !== 'results' && exL.firstResult && exL.top.citations > exL.firstResult.citations}
				<p>{upperFirst(kindPhrase[exL.top.kind])} that mentions {example.name} has <b>{int(exL.top.citations)}</b>, {pct(exL.top.citationShare)} of the mission’s total.</p>
			{/if}
			{#if restCounts(exL.byKind, exNamed)}<p>The rest are {restCounts(exL.byKind, exNamed)}.</p>{/if}
		</div></section>
		<!-- CITATIONS: the kind bars again, by citations -->
		<section data-step><div class="step">
			<p>Counting citations instead of papers, <b>{pct(kinds.nonScience.citationShare)}</b> of the citations to these missions’ publications go to papers that do not report a mission’s own science.</p>
			{#if second}<p>{second.name}{#if second.cost != null}, a {money(second.cost)} mission,{/if} has {spell(second.lifetime.papers)} {plural(second.lifetime.papers, 'publication')} to date{#if second.lifetime.papers === 1 && second.lifetime.top && !science.has(second.lifetime.top.kind)}: {kindPhrase[second.lifetime.top.kind]}{/if}.</p>{/if}
			<p class="aside">One review can hold most of a small mission’s citations, so for missions this small, citation counts are a weak guide to the science returned.</p>
		</div></section>
		<!-- CLPS -->
		<section data-step><div class="step">
			<p>CLPS, NASA’s Commercial Lunar Payload Services program, buys rides for NASA instruments on commercial lunar landers. The first flew in {clps.start.slice(0, 4)}, too recently to compare citations, so we count publications.</p>
			{#if clps.comparison}<p>In the {clps.comparison.month} months since the first CLPS launch, the {spell(landers)} landers with any publications produced <b>{int(clps.comparison.clps)}</b> peer-reviewed papers between them.</p>{/if}
			<p class="aside">Counted from {longDate(clps.start.slice(0, 7))}; many of these papers are recent.</p>
		</div></section>
		<!-- CLPS_COMPARE -->
		<section data-step><div class="step">
			<p>For comparison, {spell(clps.comparators.length)} earlier NASA missions to the Moon and Mars: {listify(clps.comparators.map((c) => `${c.name} (${money(c.cost)})`))}.</p>
			{#if clps.comparison}<p>At the same age, {listify(clps.comparison.comparators.map((c, i) => (i === 0 ? `${c.name} had ${int(c.papers)} papers` : `${c.name} ${int(c.papers)}`)))}; by {clps.horizonMonths} months, {listify(clps.comparators.map((c) => int(c.series[clps.horizonMonths])))}.</p>{/if}
			{#if clps.comparison?.behindAll}
				<p>So far the landers together have published fewer peer-reviewed papers than either mission did alone at the same age. Future outcomes could change.</p>
			{:else if clps.comparison}
				<p>So far the landers’ combined record sits among those of the {spell(clps.comparators.length)} earlier missions. Future outcomes could change.</p>
			{/if}
		</div></section>
		<!-- CLOSE: every mission back in the launch grid -->
		<section data-step><div class="step">
			{#if closing}<p>In this record, missions at {money(reference)} or less {closing}.</p>{/if}
			{#if story.pooledBand}<p>The middle half of top-10% papers came from missions costing {money(story.pooledBand.p25)} to {money(story.pooledBand.p75)}.</p>{/if}
		</div></section>
		<!-- CLOSE_LIMITS: the same grid -->
		<section data-step><div class="step">
			<p>The sample is small: {int(threshold.missions)} missions at or under the line across {spell(site.divisions.length)} divisions, where one mission can move a group’s figures. Small missions also serve purposes citations do not measure, such as technology demonstration and training.</p>
			<p>None of this sets a right price for a mission. Each division’s record is below, mission by mission.</p>
		</div></section>
	{/snippet}
</Scroller>

<style>
	.frame { display: flex; flex-direction: column; height: 100%; }
	.stage { position: relative; flex: 1; min-height: 0; width: 100%; }
	.caption { min-height: 28px; padding-block: 10px 4px; }
	.thesis { position: absolute; inset: 0; z-index: 2; display: flex; flex-direction: column; justify-content: center; margin: 0; font-weight: 300; font-size: clamp(36px, 6vw, 82px); line-height: 1.08; letter-spacing: -0.04em; text-shadow: 0 0 24px var(--black), 0 0 8px var(--black); opacity: 0; transition: opacity 400ms linear; pointer-events: none; }
	.thesis.visible { opacity: 1; }
	.byline { margin-top: 24px; font-weight: 400; font-size: 15px; line-height: 1.5; letter-spacing: 0; color: var(--dust); }
	.photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 50%; opacity: 0; transition: opacity 400ms linear; pointer-events: none; }
	.photo.visible { opacity: 1; }
	.figure { position: absolute; top: 0; left: 0; z-index: 2; margin: 0; opacity: 0; transition: opacity 400ms linear; pointer-events: none; }
	.figure.visible { opacity: 1; }
	.figure b { font-weight: 300; font-size: clamp(40px, 6vw, 68px); line-height: 1; letter-spacing: -0.04em; }
	.figure span { font-size: clamp(15px, 1.6vw, 20px); color: var(--dust); }
	.step { font-size: clamp(17px, 0.6vw + 11px, 19px); line-height: 1.5; }
	.step p + p { margin-top: 1em; }
	.step .aside { font-size: 15px; line-height: 1.5; color: var(--dust); }
	.keyline { display: inline-flex; align-items: center; gap: 6px; margin-right: 14px; }
	.keyline i { display: inline-block; width: 20px; height: 2px; background: var(--soil); }
	.keyline .top { background: var(--neptune); }
	.keyline .spend { height: 1px; }
	.keyline .span { height: 10px; width: 10px; background: var(--neptune); opacity: 0.3; }
	.caption > span:last-child { display: block; }
</style>
