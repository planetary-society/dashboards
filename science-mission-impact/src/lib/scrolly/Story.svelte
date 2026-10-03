<script>
	// The overview as a scroll: a title, then fifteen steps over one stage of mission squares.
	// Every figure in the copy comes from site.story (the packager) or site itself; the
	// component only lays out.
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
	import { gridLayout, rugLayout, skylineLayout, failureLayout, costLayout, projectTimeLayout, perDollarLayout, kindsLayout, exampleLayout } from './layouts.js';
	import { costItems, exampleItems, failureItems, kindsItems, lanesItems, papersItems, perDollarItems, withHidden } from './items.js';
	import { int, listify, longDate, money, pct, plural, spell, upperFirst, weight, years } from '$lib/format.js';
	import { fullWindowLabel } from '$lib/copy/window.js';
	import { asset } from '$lib/paths.js';

	let { site, scrolly } = $props();
	const TITLE = 0, OVERVIEW = 1, CORPUS = 2, MOTIVATION = 3, THRESHOLD = 4, PUBLICATIONS = 5, COMPARE = 6, FAILURE = 7, RANGE = 8, TIMING = 9, DOLLAR = 10, KINDS = 11, EXAMPLE = 12, CITATIONS = 13, CLPS = 14, CLPS_COMPARE = 15;
	// Reduced motion: every scrubbed graphic renders complete.
	const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

	const tiles = $derived(scrolly.tiles);
	const story = $derived(site.story);
	const scope = $derived(story.scope);
	const reference = $derived(story.referenceCost);
	const threshold = $derived(story.threshold);
	const failure = $derived(story.failure);
	const clps = $derived(site.clps);
	// CLPS against each comparator at the same age; "behind" only when every comparator is ahead.
	const against = $derived(listify((clps.comparison?.comparators ?? []).map((c) => `${c.name}’s ${int(c.papers)}`)));
	const thresholdIds = $derived(new Set(threshold.ids));
	const underTiles = $derived(tiles.filter((t) => thresholdIds.has(t.id)));
	// the ruler for the publications fill: the largest full-window paper count in the study
	const top = $derived(tiles.reduce((a, t) => ((t.papers ?? -1) > (a?.papers ?? -1) ? t : a), null));
	const comparison = $derived(story.comparison);
	const under = $derived(comparison.groups.find((g) => g.key === 'under'));
	const over = $derived(comparison.groups.find((g) => g.key === 'over'));
	// The divisions the cross-division figures cover. The others fade out when those come up.
	const compared = $derived(new Set(comparison.divisions));
	const rankable = $derived(site.divisions.filter((d) => compared.has(d.slug)));
	const timing = $derived(story.timing.find((t) => t.division === story.timingDivision) ?? null);
	const third = (key) => timing?.byCostThird?.find((t) => t.key === key) ?? null;
	// Per dollar: "favors" only where the ordering survives dropping any one mission.
	const favors = (key) => story.perDollar.filter((d) => d.favors === key).map((d) => d.name);
	const close = $derived(story.perDollar.filter((d) => d.favors === null && d.margin != null && d.largestUnder));
	const costs = $derived(tiles.map((t) => t.cost).filter((c) => c > 0));
	const topShare = (t) => t.share[scope][10];
	const none = new Set();
	const count = (n) => (n === 0 ? 'none' : spell(n));
	// Paper kinds: placeholder prose binds every number and name to site.kinds.
	const kinds = $derived(site.kinds);
	const example = $derived(kinds.examples[0]);
	const second = $derived(kinds.examples[1] ?? null);
	const exL = $derived(example.lifetime);
	const kindPhrase = { results: 'a science result', data: 'a data or calibration paper', mission: 'a description of the mission or an instrument', review: 'a review or commentary', future: 'a paper anticipating results', other: 'a paper that only mentions the mission' };
	const science = $derived(new Set(kinds.kinds.filter((k) => k.science).map((k) => k.key)));
	const kindNouns = { results: ['science result', 'science results'], data: ['data or calibration paper', 'data or calibration papers'], mission: ['paper about the mission or an instrument', 'papers about the mission or an instrument'], review: ['review or commentary', 'reviews or commentary'], future: ['paper anticipating results', 'papers anticipating results'], other: ['paper that only mentions the mission', 'papers that only mention the mission'] };
	const restCounts = (byKind) => listify(kinds.kinds.filter((k) => k.key !== 'results' && byKind[k.key].papers > 0).map((k) => `${spell(byKind[k.key].papers)} ${plural(byKind[k.key].papers, ...kindNouns[k.key])}`));
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

	const scrub = $derived(reduced ? 1 : Math.min(1, progress * 2.4));
	// the title stands alone; the squares arrive one by one with the overview, then stay
	const shown = $derived(index === TITLE ? 0 : index === OVERVIEW ? Math.ceil(scrub * tiles.length) : tiles.length);
	const items = $derived.by(() => {
		if (!grid) return new Map();
		if (index <= OVERVIEW) return solid(grid.pos);
		if (index === CORPUS) return withHidden(solid(rug.pos), tiles, grid.pos);
		if (index === MOTIVATION) return withHidden(new Map(), tiles, rug.pos);
		if (index === THRESHOLD) return withHidden(solid(small.pos), tiles, grid.pos);
		if (index === PUBLICATIONS) return withHidden(papersItems(tiles, small, { max: top.papers }), tiles, grid.pos);
		if (index === COMPARE) return withHidden(new Map(), tiles, new Map([...grid.pos, ...small.pos]));
		if (index === FAILURE) return withHidden(failureItems(tiles, failureL), tiles, grid.pos);
		if (index === TIMING && time) return withHidden(lanesItems(tiles, time, { scope }), tiles, cost.pos);
		if (index === DOLLAR) return withHidden(perDollarItems(tiles, dollar), tiles, cost.pos);
		if (index === KINDS || index === CITATIONS) return withHidden(kindsItems(tiles, kindsL), tiles, dollar.pos);
		if (index === EXAMPLE) return withHidden(exampleItems(tiles, exampleL), tiles, kindsL.pos);
		if (index >= CLPS) return withHidden(new Map(), tiles, kindsL.pos);
		return withHidden(costItems(tiles, cost, { scope, top: 10, unranked: none, referenceCost: reference }), tiles, failureL.pos);
	});
	const costVisible = $derived(index === RANGE);
	// the lines draw while the reader scrolls, not inside the 400 ms fade-in
	const clpsDraw = $derived(reduced ? 1 : Math.max(0, Math.min(1, (progress - 0.1) / 0.6)));
</script>

<Scroller bind:index bind:progress>
	{#snippet graphic()}
		<div class="frame">
			<div class="stage" bind:clientWidth={W} bind:clientHeight={H}>
				<img class="photo" class:visible={index === MOTIVATION} src={asset('img/story/im-2-athena.webp')} alt="" decoding="async" fetchpriority="low" />
				{#if rug && cost}
					<Skyline layout={sky} total={site.papersDistinct} rise={index === CORPUS ? scrub : index > CORPUS ? 1 : 0} visible={index === CORPUS} {compact} width={W} height={H} />
					<ComparisonLabels {comparison} referenceCost={reference} visible={index === COMPARE} {compact} />
					<FailureLabels layout={failureL} {failure} referenceCost={reference} visible={index === FAILURE} {compact} />
					<CostAxis layout={cost} bands={story.bands} pooled={story.pooledBand} unranked={none} share={topShare} referenceCost={reference} progress={index === RANGE ? scrub : index > RANGE ? 1 : 0} showBands visible={costVisible} {compact} width={W} height={H} />
					{#if time}
						<ProjectTimeAxis layout={time} ticks={cost.ticks} referenceCost={reference} visible={index === TIMING} {compact} width={W} height={H} />
					{/if}
					<PerDollarAxis layout={dollar} perDollar={story.perDollar} ticks={cost.ticks} referenceCost={reference} visible={index === DOLLAR} {compact} width={W} height={H} />
					<KindBars layout={kindsL} {kinds} mode={index === CITATIONS ? 'citations' : 'papers'} visible={index === KINDS || index === CITATIONS} {compact} />
					<KindExample layout={exampleL} {example} {kinds} visible={index === EXAMPLE} {compact} />
					<ClpsChart {clps} draw={index === CLPS ? clpsDraw : index > CLPS ? 1 : 0} drawComparators={index === CLPS_COMPARE ? clpsDraw : index > CLPS_COMPARE ? 1 : 0} visible={index >= CLPS} {compact} width={W} height={H} />
					<Squares {tiles} {items} {shown} interactive={false} />
				{/if}
				<p class="thesis" class:visible={index === TITLE}>How does science impact and productivity scale with cost?</p>
				<p class="figure" class:visible={index === THRESHOLD || index === PUBLICATIONS} aria-hidden="true">
					{#if index === PUBLICATIONS}<b>{int(threshold.papers)}</b> <span>of {int(threshold.papersAll)} publications</span>{:else}<b>{int(threshold.missions)}</b> <span>of {int(threshold.total)} missions</span>{/if}
				</p>
			</div>
			<div class="caption meta">
				{#if index === OVERVIEW}
					Missions in launch order, earliest first.
				{:else if index === CORPUS}
					Squares: missions by launch year. Columns: each mission’s publications to date, square-root scale.
				{:else if index === MOTIVATION}
					IM-2’s Athena lander before launch. Photo: Intuitive Machines.
				{:else if index === THRESHOLD}
					Missions at {money(reference)} or less in {site.costBaseYear} dollars, by launch date.
				{:else if index === PUBLICATIONS}
					Fill area: each mission’s publications in its {fullWindowLabel}; a full square is {top.name}’s {int(top.papers)}.
				{:else if index === COMPARE}
					Top-10% papers per mission, failures counted as zero, across {spell(rankable.length)} divisions.
				{:else if index === FAILURE}
					X: failure, partial failure or partial success. Costs in {site.costBaseYear} dollars.
				{:else if index === TIMING && timing}
					{timing.name} missions by cost. Down: years from project start to the first top-10% paper, including build, launch and any cruise.
				{:else if index === DOLLAR}
					Citations per $100M of mission cost. {fullWindowLabel}.
				{:else if index === KINDS}
					Missions at {money(reference)} or less with publications in their {fullWindowLabel}, most first. Bars: each mission’s publications by kind.
				{:else if index === EXAMPLE}
					All of {example.name}’s publications to date, most cited first. Highlighted: the paper reporting its own science data.
				{:else if index === CITATIONS}
					The same missions. Bars: each mission’s citations by kind, {fullWindowLabel}.
				{:else if index === CLPS}
					Refereed publications by CLPS missions, running total by month from {longDate(clps.start.slice(0, 7))}.
				{:else if index === CLPS_COMPARE}
					Refereed publications, running total by month: CLPS from {longDate(clps.start.slice(0, 7))}, the others from the start of their prime missions.
				{:else if costVisible}
					<span class="keyline"><i class="top"></i>Running share of each division’s top-10% papers</span>
					<span class="keyline"><i class="spend"></i>Running share of its spending</span>
					<span class="keyline"><i class="span"></i>Middle half of the papers</span>
					<span>Lighter column: the range shared across divisions. {fullWindowLabel}, costs in {site.costBaseYear} dollars.</span>
				{:else}&nbsp;{/if}
			</div>
		</div>
	{/snippet}

	{#snippet steps()}
		<!-- the title: the question alone on the stage, no text beside it -->
		<section data-step></section>
		<section data-step><div class="step">
			<p>The {int(site.missions)} NASA science missions in this study launched between {site.launchYears[0]} and {site.launchYears[1]}, and cost from {money(Math.min(...costs))} to {money(Math.max(...costs))} in {site.costBaseYear} dollars.</p>
			<p>What did that investment produce, and does the pattern hold from one field to the next?</p>
		</div></section>
		<section data-step><div class="step">
			<p>To find out, we analyzed the <b>{int(site.papersDistinct)}</b> peer-reviewed publications these missions have produced to date, across {spell(site.divisions.length)} science divisions.</p>
			<p>Each square is a mission at its launch year; the column above it is that mission’s publications to date.</p>
		</div></section>
		<!-- placeholder prose from packaged facts; Casey rewrites -->
		<section data-step><div class="step">
			<p>NASA policy has shifted to pursue very low-cost science missions and commercial ride-alongs.</p>
			<p>We wanted to know how those projects delivered.</p>
		</div></section>
		<section data-step><div class="step">
			<p>We looked at NASA missions with inflation-adjusted life-cycle costs of <b>{money(reference)} or less</b>. That is {int(threshold.missions)} missions out of {int(threshold.total)}.</p>
			{#if threshold.launchMedian}<p>Half of them launched in {threshold.launchMedian} or later.</p>{/if}
		</div></section>
		<section data-step><div class="step">
			<p>These missions produced <b>{int(threshold.papers)}</b> publications across their active lives, out of {int(threshold.papersAll)} from all missions on the same basis.</p>
			<p class="aside">Counted in each mission’s {fullWindowLabel}; a paper shared by two missions counts for each.</p>
		</div></section>
		<section data-step><div class="step">
			<p>We found that very low-cost missions produce very few publications of any kind, and so very few high-impact ones.</p>
			<p>Across the {spell(rankable.length)} largest divisions, missions at {money(reference)} or less averaged <b>{weight(under.top10PerMission)}</b> high-impact papers each. Missions over {money(reference)} averaged <b>{weight(over.top10PerMission)}</b>.</p>
			<p>{#if under.withTop === 0}None of the {int(under.missions)} smaller missions produced a high-impact paper{:else}Only {count(under.withTop)} of the {int(under.missions)} smaller missions produced a high-impact paper at all{/if}{#if under.largest}, and one of them, {under.largest.name}, accounts for {pct(under.largest.share)} of that group’s total{/if}.</p>
			<p class="aside">A high-impact paper is in the most-cited tenth of its division’s mission papers, compared with papers published around the same time. Failed missions count as zero.</p>
		</div></section>
		<section data-step><div class="step">
			<p>They suffered partial or total failure at a rate of <b>{pct(failure.under.rate)}</b>{#if failure.higher === 'under'}, higher than{:else}, against{/if} the {pct(failure.over.rate)} for costlier projects.</p>
			<p class="aside">Partial or total failure: a mission status of {listify(failure.statuses.map((s) => s.toLowerCase()))}.</p>
		</div></section>
		<section data-step><div class="step">
			{#if story.pooledBand}
				<p>Across those divisions, the middle half of high-impact publications comes from missions costing roughly <b>{money(story.pooledBand.p25)} to {money(story.pooledBand.p75)}</b>.{#if story.pooledBand.costShare != null} That range also holds {pct(story.pooledBand.costShare)} of the spending.{/if}</p>
			{:else}
				<p>Place the missions at their actual costs and follow where each division’s high-impact publications come from.</p>
			{/if}
			<p>Each blue line adds up a division’s top-10% papers from its cheapest mission to its most expensive; the grey line does the same for its spending. The shaded span is the middle half of the papers.</p>
			<p class="aside">Observed ranges in this sample, not a minimum cost or an optimal price.</p>
		</div></section>
		<section data-step><div class="step">
			<p>Among missions that produced a high-impact paper, cheaper ones usually got there sooner, mostly because they were built faster.</p>
			{#if timing && third('low')?.medianYears != null && third('high')?.medianYears != null}
				<p>In {timing.name}, the cheapest third of those missions took a median {years(third('low').medianYears)} years from project start to a top-10% paper; the most expensive third took {years(third('high').medianYears)}{#if third('low').medianBuildYears != null && third('high').medianBuildYears != null}, including a longer build ({years(third('high').medianBuildYears)} years against {years(third('low').medianBuildYears)}){/if}.</p>
			{/if}
			{#if timing && timing.under.missions > 0}
				<p>{upperFirst(spell(timing.under.missions))} {plural(timing.under.missions, 'mission')} here cost {money(reference)} or less: {count(timing.under.failed)} failed, and {count(timing.under.reached)} produced a top-10% paper.</p>
			{/if}
			<p class="aside">Time runs from the recorded start of formulation to the publication date of the first top-10% paper.</p>
		</div></section>
		<section data-step><div class="step">
			<p>Per dollar, the picture is less clear.</p>
			<p>
				{#if favors('over').length || favors('under').length}
					Citations per $100M favor
					{#if favors('over').length}the larger missions in {listify(favors('over'))}{/if}{#if favors('over').length && favors('under').length} and {/if}{#if favors('under').length}the smaller missions in {listify(favors('under'))}{/if}.
				{/if}
				{#each close as d (d.division)}
					In {d.name} the two sides are within {pct(d.margin)}, and the small missions’ rate rests on one mission, {d.largestUnder.name}.
				{/each}
			</p>
			{#if under.noPapers != null}
				<p>Of the {int(under.missions)} missions at {money(reference)} or less on this chart, {int(under.noPapers)} produced no publications at all.</p>
			{/if}
			<p class="aside">With a denominator of a few million dollars, one well-cited mission can swing a whole group.</p>
		</div></section>
		<section data-step><div class="step">
			{#if kinds.small.nonScience.citationShare != null}
				<p>For the smallest missions, citations overstate science output, and citations per dollar overstate it most.</p>
				<p>Papers that describe an instrument, review a field, anticipate results or only mention a mission earn citations like any other. Among the {int(kinds.small.missions)} missions with {spell(kinds.small.maxPapers)} or fewer publications in their {fullWindowLabel}, <b>{pct(kinds.small.nonScience.citationShare)}</b> of all citations go to such papers.</p>
			{/if}
			<p>Across all {int(kinds.total.papers)} publications from missions at {money(reference)} or less, {pct(kinds.nonScience.paperShare)} are of these kinds{#if kinds.majorityNonScience > 0}; for {spell(kinds.majorityNonScience)} of the {int(kinds.withPapers)} missions with any publications they are the majority{/if}.</p>
			<p class="aside">Each paper was sorted by the role the mission’s own flight data play in it. See the methods page.</p>
		</div></section>
		<section data-step><div class="step">
			<p>{example.name}{#if example.cost != null}, a {money(example.cost)} mission,{/if} has {spell(exL.papers)} {plural(exL.papers, 'publication')} to date{#if exL.byKind.results.papers === 1}, and only one reports its own science data{:else if exL.byKind.results.papers > 1}, of which {spell(exL.byKind.results.papers)} report its own science data{:else}, none of which reports its own science data{/if}.</p>
			{#if exL.firstResult && exL.top && exL.top.kind !== 'results' && exL.top.citations > exL.firstResult.citations}
				<p>That paper has <b>{int(exL.firstResult.citations)}</b> citations. {upperFirst(kindPhrase[exL.top.kind])} that mentions {example.name} has <b>{int(exL.top.citations)}</b>, {pct(exL.top.citationShare)} of the mission’s total.</p>
			{/if}
			{#if restCounts(exL.byKind)}<p>The rest are {restCounts(exL.byKind)}.</p>{/if}
			<p class="aside">{upperFirst(spell(example.papers))} of the {spell(exL.papers)} fall in its {fullWindowLabel}, the basis of the bars before and after this.</p>
		</div></section>
		<section data-step><div class="step">
			<p>Weighted by citations, <b>{pct(kinds.nonScience.citationShare)}</b> of the citations to these missions’ publications go to papers that are not science results.</p>
			<p>In the per-dollar comparison, every one of those citations counts for the small missions.</p>
			{#if second}<p>{second.name}{#if second.cost != null}, a {money(second.cost)} mission,{/if} has {spell(second.lifetime.papers)} {plural(second.lifetime.papers, 'publication')} to date{#if second.lifetime.top && !science.has(second.lifetime.top.kind)}: {kindPhrase[second.lifetime.top.kind]}{/if}.</p>{/if}
			<p class="aside">One review can hold most of a small mission’s citations. For missions this small, citation counts say little about the science.</p>
		</div></section>
		<section data-step><div class="step">
			<p>CLPS missions had their first successes in 2024, too recent to compare citations, so we look at publications.</p>
			{#if clps.comparison}<p>In their first {clps.comparison.month} months, the {spell(clps.missions.filter((p) => p.papers != null).length)} commercial missions with any publications produced <b>{int(clps.comparison.clps)}</b> refereed papers between them.</p>{/if}
			<p class="aside">Counted from {longDate(clps.start.slice(0, 7))}, the first CLPS launch; many of these papers are still recent.</p>
		</div></section>
		<section data-step><div class="step">
			<p>Science-directed missions of similar cost show what such a record can look like.</p>
			{#if clps.comparison}<p>At the same age the counts were {against}.</p>{/if}
			{#if clps.comparison?.behindAll}
				<p>Future outcomes could change, but the initial results show CLPS missions returning less science than science-directed missions.</p>
			{:else if clps.comparison}
				<p>Future outcomes could change; so far the CLPS record sits among those of the science-directed missions.</p>
			{/if}
		</div></section>
	{/snippet}
</Scroller>

<style>
	.frame { display: flex; flex-direction: column; height: 100%; }
	.stage { position: relative; flex: 1; min-height: 0; width: 100%; }
	.caption { min-height: 28px; padding-block: 10px 4px; }
	.thesis { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; margin: 0; font-weight: 300; font-size: clamp(36px, 6vw, 82px); line-height: 1.08; letter-spacing: -0.04em; text-shadow: 0 0 24px var(--black), 0 0 8px var(--black); opacity: 0; transition: opacity 400ms linear; pointer-events: none; }
	.thesis.visible { opacity: 1; }
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
