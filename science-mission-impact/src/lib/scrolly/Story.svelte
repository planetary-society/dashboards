<script>
	// The overview as a scroll: a title, then eighteen steps over one stage of mission squares.
	// Pairs of steps share one graphic state
	// (KINDS/KINDS_ALL, CLOSE/CLOSE_LIMITS). Every figure in the copy comes from site.story (the
	// packager) or site itself; the component only lays out.
	import Scroller from './Scroller.svelte';
	import Squares from './Squares.svelte';
	import Skyline from './Skyline.svelte';
	import ComparisonLabels from './ComparisonLabels.svelte';
	import FailureLabels from './FailureLabels.svelte';
	import TimeScienceAxes from '$lib/charts/TimeScienceAxes.svelte';
	import { timeScienceModel, timeScienceLayout } from '$lib/charts/timetoscience.js';
	import PerDollarAxis from './PerDollarAxis.svelte';
	import ClpsChart from './ClpsChart.svelte';
	import KindBars from './KindBars.svelte';
	import KindExample from './KindExample.svelte';
	import Waffle from './Waffle.svelte';
	import { gridLayout, rugLayout, skylineLayout, skylineHit, failureLayout, costLayout, perDollarLayout, kindsLayout, exampleLayout, waffleLayout } from './layouts.js';
	import { exampleItems, failureItems, kindsItems, perDollarItems, withHidden } from './items.js';
	import { int, listify, longDate, money, pct, plural, spell, upperFirst } from '$lib/format.js';
	import { fullWindowLabel } from '$lib/copy/window.js';
	import { asset } from '$lib/paths.js';

	let { site, scrolly } = $props();
	const TITLE = 0, MOTIVATION = 1, OVERVIEW = 2, CORPUS = 3, THRESHOLD = 4, PUBLICATIONS_ALL = 5, PUBLICATIONS = 6, COMPARE = 7, FAILURE = 8, TIMING = 9, DOLLAR = 10;
	// The paper-kinds run (KINDS…CITATIONS) is hidden for now: its sections stay out of the page and its
	// indices match no step. Set SHOW_KINDS to bring the four steps back between DOLLAR and CLPS.
	const SHOW_KINDS = false;
	const [KINDS, KINDS_ALL, EXAMPLE, CITATIONS] = SHOW_KINDS ? [11, 12, 13, 14] : [-1, -1, -1, -1];
	const CLPS = SHOW_KINDS ? 15 : 11, CLPS_COMPARE = CLPS + 1, CLOSE = CLPS + 2, CLOSE_LIMITS = CLPS + 3;
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
	// The gap "holds" in a division only where both sides are measured and the smaller missions' side is lower.
	const byDivision = $derived(comparison.byDivision ?? []);
	const lower = $derived(byDivision.filter((d) => d.under.top10PerMission != null && d.over.top10PerMission != null && d.under.top10PerMission < d.over.top10PerMission).length);
	const everyLower = $derived(byDivision.length > 0 && lower === byDivision.length);
	// The divisions the cross-division figures cover. The others fade out when those come up.
	const compared = $derived(new Set(comparison.divisions));
	const rankable = $derived(site.divisions.filter((d) => compared.has(d.slug)));
	// Time to a first top-10% paper from science start, every division together: the packaged cost quarters and threshold sides.
	const sci = $derived(story.scienceStart);
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
	// the division pages' time-to-science plot, every division's missions together from their own science start
	const timeModel = $derived(timeScienceModel(tiles, scope, (t) => t.first[scope]));
	const time = $derived(ready ? timeScienceLayout(timeModel.points, W, H) : null);
	const dollar = $derived(cost ? perDollarLayout(tiles, W, H, { divisions: rankable, x: cost.x, left: cost.left }) : null);
	const kindsL = $derived(ready ? kindsLayout(kinds.missions, W, H, { compact }) : null);
	const exampleL = $derived(ready ? exampleLayout(example.id, W, H, { compact }) : null);
	const waffle = $derived(ready ? waffleLayout(threshold.papersAll, threshold.papers, W, H, { top: compact ? 56 : 96, compact }) : null);

	const scrub = $derived(reduced ? 1 : Math.min(1, progress * 2.4));
	// the title and the motivation photo stand alone; the squares arrive one by one with the overview, then stay
	const shown = $derived(index <= MOTIVATION ? 0 : index === OVERVIEW ? Math.ceil(scrub * tiles.length) : tiles.length);
	const comparing = $derived(index === COMPARE);
	const timed = $derived(index === TIMING);
	// the waffle builds grey over the whole corpus, then the threshold missions' papers turn blue
	const waffled = $derived(index === PUBLICATIONS_ALL || index === PUBLICATIONS);
	const kindsShown = $derived(index === KINDS || index === KINDS_ALL || index === CITATIONS);
	const items = $derived.by(() => {
		if (!grid) return new Map();
		if (index <= OVERVIEW || index >= CLOSE) return solid(grid.pos);
		if (index === CORPUS) return withHidden(solid(rug.pos), tiles, grid.pos);
		if (index === THRESHOLD) return withHidden(solid(small.pos), tiles, grid.pos);
		if (waffled) return withHidden(new Map(), tiles, small.pos);
		if (comparing) return withHidden(new Map(), tiles, new Map([...grid.pos, ...small.pos]));
		if (index === FAILURE) return withHidden(failureItems(tiles, failureL), tiles, grid.pos);
		if (timed && time) return withHidden(time.items, tiles, cost.pos);
		if (index === DOLLAR) return withHidden(perDollarItems(tiles, dollar), tiles, cost.pos);
		if (kindsShown) return withHidden(kindsItems(tiles, kindsL), tiles, dollar.pos);
		if (index === EXAMPLE) return withHidden(exampleItems(tiles, exampleL), tiles, kindsL.pos);
		if (index >= CLPS) return withHidden(new Map(), tiles, kindsL.pos);
		return withHidden(new Map(), tiles, cost.pos);
	});
	// the lines draw while the reader scrolls, not inside the 400 ms fade-in
	const clpsDraw = $derived(reduced ? 1 : Math.max(0, Math.min(1, (progress - 0.1) / 0.6)));
	// the CLPS step: its text settles first (about a third of the way through the step), then the
	// chart fades in and the CLPS line draws
	const clpsIn = $derived(reduced || index > CLPS || progress >= 0.3);
	const clpsFirst = $derived(reduced ? 1 : Math.max(0, Math.min(1, (progress - 0.35) / 0.45)));
	const waffleBuild = $derived(reduced ? 1 : Math.max(0, Math.min(1, (progress - 0.05) / 0.6)));

	// The skyline step: pointing at a square or skimming the columns lights up that mission in both.
	// A touch keeps its highlight after the finger lifts; a mouse clears it on leaving the stage.
	// A first tap on a square only highlights it; tapping it again opens its page, as a click does.
	let pointed = $state(null);
	let follow = true;
	const hot = $derived(index === CORPUS ? pointed : null);
	// the skyline names a mission with a column, so its square's own tip stays off
	const skyNamed = $derived(hot && sky?.columns.some((c) => c.id === hot) ? hot : null);
	function skim(e) {
		if (index !== CORPUS || !sky) return;
		const id = e.target.closest?.('[data-id]')?.dataset.id;
		if (e.type === 'pointerdown') follow = e.pointerType === 'mouse' || (id != null && id === pointed);
		const r = e.currentTarget.getBoundingClientRect();
		pointed = id ?? skylineHit(sky, e.clientX - r.left, e.clientY - r.top);
	}
	const holdClick = (e) => {
		if (index === CORPUS && !follow) e.preventDefault();
	};
	const unskim = (e) => {
		if (e.pointerType === 'mouse') pointed = null;
	};
</script>

<Scroller bind:index bind:progress>
	{#snippet graphic()}
		<div class="frame">
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="stage" class:skimming={index === CORPUS} bind:clientWidth={W} bind:clientHeight={H} onpointerdown={skim} onpointermove={skim} onpointerleave={unskim} onclickcapture={holdClick}>
				<img class="photo" class:visible={index === MOTIVATION} src={asset('img/story/im-1-odysseus.webp')} alt="" decoding="async" fetchpriority="low" />
				{#if rug && cost}
					<Skyline layout={sky} total={site.papersDistinct} rise={index === CORPUS ? scrub : index > CORPUS ? 1 : 0} visible={index === CORPUS} highlight={hot} {compact} width={W} height={H} />
					<ComparisonLabels {comparison} referenceCost={reference} visible={comparing} {compact} />
					<FailureLabels layout={failureL} {failure} referenceCost={reference} visible={index === FAILURE} {compact} />
					{#if time}
						<div class="plot" class:visible={timed}><TimeScienceAxes layout={time} width={W} height={H} /></div>
					{/if}
					<PerDollarAxis layout={dollar} perDollar={story.perDollar} ticks={cost.ticks} referenceCost={reference} visible={index === DOLLAR} {compact} width={W} height={H} />
					<KindBars layout={kindsL} {kinds} mode={index === CITATIONS ? 'citations' : 'papers'} visible={kindsShown} {compact} />
					<KindExample layout={exampleL} {example} {kinds} visible={index === EXAMPLE} {compact} />
					<ClpsChart {clps} draw={index === CLPS ? clpsFirst : index > CLPS ? 1 : 0} drawComparators={index === CLPS_COMPARE ? clpsDraw : index > CLPS_COMPARE ? 1 : 0} visible={(index === CLPS && clpsIn) || index === CLPS_COMPARE} {compact} width={W} height={H} />
					<Waffle layout={waffle} referenceCost={reference} build={index === PUBLICATIONS_ALL ? waffleBuild : index > PUBLICATIONS_ALL ? 1 : 0} highlight={index >= PUBLICATIONS} visible={waffled} {compact} width={W} height={H} />
					<Squares {tiles} {items} {shown} interactive={false} highlightId={hot} quietId={skyNamed} />
				{/if}
				<div class="thesis" class:visible={index === TITLE}>
					<p>The role of cost in the scientific productivity of NASA's space science missions</p>
					<p class="byline">The Planetary Society · data as of {longDate(site.asOf)}</p>
				</div>
				<p class="figure" class:visible={index === THRESHOLD || waffled} aria-hidden="true">
					{#if index === PUBLICATIONS_ALL}<b>{int(threshold.papersAll)}</b> <span>mission papers</span>{:else if index === PUBLICATIONS}<b>{int(threshold.papers)}</b> <span>of {int(threshold.papersAll)} mission papers</span>{:else}<b>{int(threshold.missions)}</b> <span>of {int(threshold.total)} missions</span>{/if}
				</p>
			</div>
			<div class="caption meta">
				{#if index === OVERVIEW}
					Missions in launch order, earliest first.
				{:else if index === CORPUS}
					Squares: missions by launch year. Columns: each mission’s publications to date, square-root scale.
				{:else if index === MOTIVATION}
					IM-1’s Odysseus lander, which carried NASA instruments to the Moon under CLPS in 2024. Photo: Intuitive Machines.
				{:else if index === THRESHOLD}
					Missions at {money(reference)} or less in {site.costBaseYear} dollars, by launch date.
				{:else if waffled}
					Every mission paper in the study on the {fullWindowLabel} basis, one box per {int(waffle?.unit)}. {#if index === PUBLICATIONS}Blue: papers from missions at {money(reference)} or less.{/if}
				{:else if index === FAILURE}
					X: failure, partial failure or partial success. Costs in {site.costBaseYear} dollars.
				{:else if timed}
					All {int(timeModel.points.length)} missions with a top-10% paper and a known cost. Up: adjusted mission cost, log scale. Across: months from the start of science operations to the first top-10% paper. Dashed: best fit.
				{:else if index === DOLLAR}
					Citations per $100M of mission cost. {fullWindowLabel}. Dashed: best fit over missions with citations.
				{:else if index === KINDS || index === KINDS_ALL}
					Missions at {money(reference)} or less with publications in their {fullWindowLabel}, most first. Bars: each mission’s publications by kind.
				{:else if index === EXAMPLE}
					All {spell(exL.papers)} of {example.name}’s publications to date, most cited first; {spell(example.papers)} {plural(example.papers, 'falls', 'fall')} in its {fullWindowLabel}. {#if exResults > 0}Highlighted: its science {plural(exResults, 'result')}.{/if}
				{:else if index === CITATIONS}
					The same missions. Bars: each mission’s citations by kind, {fullWindowLabel}.
				{:else if index === CLPS && clpsIn}
					Refereed publications by CLPS missions, running total by month from {longDate(clps.start.slice(0, 7))}.
				{:else if index === CLPS_COMPARE}
					Refereed publications, running total by month: CLPS from {longDate(clps.start.slice(0, 7))}, the others from the start of their prime missions.
				{:else if index >= CLOSE}
					All {int(site.missions)} missions, in launch order. {compact ? 'Tap a square to open its mission page.' : 'Hover over a square for its name; click to open its page.'}
				{:else}&nbsp;{/if}
			</div>
		</div>
	{/snippet}

	{#snippet steps()}
		<!-- TITLE: the question alone on the stage, no text beside it -->
		<section data-step></section>
		<!-- MOTIVATION: the photo alone on the stage -->
		<section data-step><div class="step">
			<p>With proposed science cuts of nearly 50%, <strong>NASA is shifting to smaller, higher-risk spacecraft</strong> and instruments, with greater reliance on commercial partners.</p>
			<p><strong>Costlier missions</strong>, such as Mars Sample Return, VERITAS, and the Geospace Dynamics Constellation <strong>have been canceled or delayed indefinitely.</strong></p>
			<p>Would such a change impact science output for the world’s leading space agency?</p>
			<p><strong>The Planetary Society attempted to find out.</strong></p>
		</div></section>
		<!-- OVERVIEW -->
		<section data-step><div class="step">
			<p>To gain perspective, we looked at <strong> {int(site.missions)} NASA-led science missions launched by all {spell(site.divisions.length)} science divisions between {site.launchYears[0]} and {site.launchYears[1]}</strong>.</p>
		</div></section>
		<!-- CORPUS -->
		<section data-step><div class="step">
			<p>We assembled a dataset of <b>{int(site.papersDistinct)} peer-reviewed publications</b> associated with these missions after the start of their science operations.</p>
			<p>We also collected key metadata, including  inflation-adjusted life-cycle costs, launch and development milestones to gain a fuller picture of cost and time investments.</p>
			
		</div></section>
		<!-- THRESHOLD -->
		<section data-step><div class="step">
			<p>We first looked at very low-cost science missions, those with an <b>inflation-adjusted life-cycle cost of less than {money(reference)}</b>.</p>
			
			<p>{int(threshold.missions)} of the total {int(threshold.total)} missions fall under this cost threshold.</p>

			{#if threshold.launchMedian}<p>Half of them launched in {threshold.launchMedian} or later.</p>{/if}
			
		</div></section>
		<!-- PUBLICATIONS_ALL: the whole corpus as a grey waffle -->
		<section data-step><div class="step">
			<p>Of the <b>{int(threshold.papersAll)}</b> peer-reviewed publications released during all missions’ operating lifetimes…</p>
			<p class="aside">A mission’s {fullWindowLabel} runs from the start of its science operations to {spell(site.fullPolicy.postEndYears)} {plural(site.fullPolicy.postEndYears, 'year')} after it ended, cut where citations are mature. A paper shared by two missions counts once for each, so these are mission papers, not distinct papers.</p>
		</div></section>
		<!-- PUBLICATIONS: the same waffle, the threshold missions' papers in blue -->
		<section data-step><div class="step">
			<p><b>{int(threshold.papers)}</b>, or {pct(threshold.papers / threshold.papersAll)}, came from missions at or below {money(reference)}. {#if kinds.citationRange}These publications range up to {int(kinds.citationRange.max)} citations accrued in a fixed {spell(site.fullPolicy.citationYears + 1)}-year window.{/if}</p>
		</div></section>
		<!-- COMPARE -->
		<section data-step><div class="step">
			{#if byDivision.length}
				<p>In each of the {spell(byDivision.length)} divisions, missions below {money(reference)} averaged significantly fewer top-10% papers per mission than their costlier counterparts.</p>
			{/if}
		</div></section>
		<!-- FAILURE -->
		<section data-step><div class="step">
			<p>Of the {int(failure.under.missions)} missions at {money(reference)} or less, <b>{pct(failure.under.rate)}</b> failed or only partly succeeded. Of the {int(failure.over.missions)} costlier missions, {pct(failure.over.rate)} did.</p>
		</div></section>
		<!-- TIMING -->
		<section data-step><div class="step">
			{#if sci}
				<p>The <strong>time to high-impact science is slower for lower cost missions</strong>. Measured from the start of science operations, lower cost missions, on average, take longer to result in a paper that draws enough citations to reach the top 10% of papers in its division.</p>
				{#if sci.ratio >= 1.5}<p>The cheapest missions took about {spell(Math.round(sci.ratio))} times as long.</p>{/if}
			{/if}
		</div></section>
		<!-- DOLLAR -->
		<section data-step><div class="step">
			<p>When looking at citations per dollar, the story gets a bit more complex. Very low cost missions, even with relatively few citations, can keep pace given their low costs.</p>
			<p>Some missions, like TRACE, excel in providing high-quality results. Low-cost missions can provide excellent value.</p>
		</div></section>
		{#if SHOW_KINDS}
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
		{/if}
		<!-- CLPS -->
		<section data-step><div class="step">
			<p>NASA’s newest bet on low-cost science is <strong>CLPS, the Commercial Lunar Payload Services program</strong>. Instead of building its own landers, NASA buys rides for its instruments on commercial ones.</p>
			<p>The first CLPS lander launched in {clps.start.slice(0, 4)}, too recently to judge by citations, so we counted publications instead.</p>
			{#if clps.comparison}<p>In the {clps.comparison.month} months since, the {spell(landers)} landers with published results have produced <b>{int(clps.comparison.clps)} peer-reviewed papers</b> between them.</p>{/if}
		</div></section>
		<!-- CLPS_COMPARE -->
		<section data-step><div class="step">
			<p>How does that stack up? Compare {spell(clps.comparators.length)} earlier NASA missions to the Moon and Mars: {listify(clps.comparators.map((c) => `${c.name} (${money(c.cost)})`))}.</p>
			{#if clps.comparison}<p>At the same point in their lives, {listify(clps.comparison.comparators.map((c) => `${c.name} had ${int(c.papers)}`))} papers; by the {clps.horizonMonths}-month mark, {listify(clps.comparators.map((c) => int(c.series[clps.horizonMonths])))}. {#if clps.comparison.behindAll}So far, <strong>all the CLPS landers combined have fewer papers than either mission had alone</strong>.{:else}So far, the CLPS landers combined are keeping pace with those missions.{/if} It’s early, and that could change.</p>{/if}
		</div></section>
		<!-- CLOSE: every mission back in the launch grid -->
		<section data-step><div class="step">
			<p>There are many good reasons to fly small missions. They <strong>train the next generation</strong> of scientists and engineers, <strong>try out new technology</strong>, <strong>open access to space</strong> to more teams and institutions, and many are driven by <strong>genuine scientific questions</strong>.</p>
		</div></section>
		<!-- CLOSE_LIMITS: the same grid -->
		<section data-step><div class="step">
			{#if lower > 0}<p>But the data suggests <strong>small missions won’t replace dedicated mid- and large-class science missions</strong>. {#if everyLower}In all {spell(byDivision.length)} divisions we compared{:else}In {spell(lower)} of the {spell(byDivision.length)} divisions we compared{/if}, missions at {money(reference)} or less produced fewer top-10% papers per mission than their costlier counterparts.</p>{/if}
			<p class="aside">With {int(threshold.missions)} missions at or under {money(reference)}, one mission can move a group’s numbers, and none of this sets a right price for a mission. Each division’s record is below, mission by mission.</p>
		</div></section>
	{/snippet}
</Scroller>

<style>
	.frame { display: flex; flex-direction: column; height: 100%; }
	.stage { position: relative; flex: 1; min-height: 0; width: 100%; }
	/* a sideways finger skims the columns; an upward one still scrolls the page */
	.stage.skimming { touch-action: pan-y; }
	.caption { min-height: 28px; padding-block: 10px 4px; }
	.thesis { position: absolute; inset: 0; z-index: 2; display: flex; flex-direction: column; justify-content: center; margin: 0; font-weight: 300; font-size: clamp(36px, 6vw, 82px); line-height: 1.08; letter-spacing: -0.04em; text-shadow: 0 0 24px var(--black), 0 0 8px var(--black); opacity: 0; transition: opacity 400ms linear; pointer-events: none; }
	.thesis.visible { opacity: 1; }
	.byline { margin-top: 24px; font-weight: 400; font-size: 15px; line-height: 1.5; letter-spacing: 0; color: var(--dust); }
	.photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 50% 50%; opacity: 0; transition: opacity 400ms linear; pointer-events: none; }
	.photo.visible { opacity: 1; }
	.plot { position: absolute; inset: 0; opacity: 0; transition: opacity 400ms linear; pointer-events: none; }
	.plot.visible { opacity: 1; }
	.figure { position: absolute; top: 0; left: 0; z-index: 2; margin: 0; opacity: 0; transition: opacity 400ms linear; pointer-events: none; }
	.figure.visible { opacity: 1; }
	.figure b { font-weight: 300; font-size: clamp(40px, 6vw, 68px); line-height: 1; letter-spacing: -0.04em; }
	.figure span { font-size: clamp(15px, 1.6vw, 20px); color: var(--dust); }
	.step { font-size: clamp(17px, 0.6vw + 11px, 19px); line-height: 1.5; }
	.step p + p { margin-top: 1em; }
	.step .aside { font-size: 15px; line-height: 1.5; color: var(--dust); }
</style>
