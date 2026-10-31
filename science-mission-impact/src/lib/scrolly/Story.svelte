<script>
	// The overview as a scroll: a title over the missions' thumbnails rising behind it, then four questions about NASA's
	// shift toward smaller, cheaper missions, answered over one stage of mission squares. The missions;
	// how we measured them (the papers they produced, the citations those drew, what a high-impact paper
	// is); then 1 of 4, cost and scientific productivity: the walk-through division's missions by cost and each
	// one's high-impact papers a year, every division's (then the threshold marked, SMALL), then
	// DOLLAR_DIVISION's citations against cost and per dollar (the line they would follow if small
	// missions did better, then as well, then their running average), then every division's running
	// average. 2 of 4, failure rates by cost tier, then one division's split (FAIL_NOTE). 3 of 4, time to
	// science: the Analysis page's time bars, from project start, then from the start of science. 4 of 4,
	// CLPS. Then the four answers (FINDINGS) and the close over the opening's rising thumbnails.
	// Steps share a graphic state (PAPERS/TOP, FAILURE/FAIL_NOTE, SCATTER/DOWN/FLAT/FIT), so long text
	// is split across them. Every figure in the copy comes from site.story (the packager) or site itself;
	// the component only lays out.
	import Scroller from './Scroller.svelte';
	import Squares from './Squares.svelte';
	import Drift from './Drift.svelte';
	import Skyline from './Skyline.svelte';
	import Primer from './Primer.svelte';
	import FocusChart from './FocusChart.svelte';
	import LanesChart from './LanesChart.svelte';
	import DollarChart from './DollarChart.svelte';
	import ClpsChart from './ClpsChart.svelte';
	import TimeBars from '$lib/analysis/TimeBars.svelte';
	import OutcomeChart from './OutcomeChart.svelte';
	import { gridLayout, rugLayout, skylineLayout, skylineHit, laneHit, primerLayout, tierOutcomeLayout, focusLayout, costLayout, perDollarLayout } from './layouts.js';
	import { failureItems, highlightDivision, withHidden } from './items.js';
	import { int, listify, money, moneyWords, spell, upperFirst } from '$lib/format.js';
	import { largerAnnualMedians, noClearSmallAdvantage, significant } from '$lib/copy/discussion.js';
	import { calendarYears } from '$lib/copy/window.js';
	import { analysisHref, methodsHref } from '$lib/paths.js';
	import { CLOSE_YEARS, clearlyHigher, clpsCosts, divisionShortfalls, mostUnreached, scienceOrder } from '$lib/copy/analysis.js';

	let { site, scrolly } = $props();
	const TITLE = 0, MOTIVATION = 1, QUESTIONS = 2, OVERVIEW = 3;
	// how we measured: the papers, the citations they drew, and the high-impact ones
	const CORPUS = 4, CITED = 5, PAPERS = 6, TOP = 7;
	// 1 of 4: the walk-through division's missions by cost and their high-impact papers a year (ONE,
	// BARS), every compared division's (FLOORS; SMALL: the threshold dashed through them and washed down
	// to the axis's left edge), then per dollar (CITES: DOLLAR_DIVISION's citations against cost;
	// SCATTER…FIT: its missions per dollar, one line per step; FITS: every compared division's line)
	const ONE = 8, BARS = 9, FLOORS = 10, SMALL = 11, CITES = 12, SCATTER = 13, DOWN = 14, FLAT = 15, FIT = 16, FITS = 17;
	// the per-dollar walk-through's division; the primer and the bars follow story.focusDivision (also
	// Planetary). One that isn't compared leaves CITES…FIT blank, as a missing focus division blanks ONE and BARS
	const DOLLAR_DIVISION = 'planetary';
	// 2 of 4: failures by cost tier (FAILURE), then one division washed on the same chart (FAIL_NOTE),
	// with its split at one tier edge ($M) stated only when its intervals say the rates differ (clearlyHigher)
	const FAILURE = 18, FAIL_NOTE = 19;
	const NOTE = { division: 'planetary', edge: 350 };
	// 3 of 4, time to science; 4 of 4, CLPS; then the four answers and the close over the opening's drift
	const TIME_FORM = 20, TIME_SCI = 21, CLPS = 22, CLPS_COMPARE = 23, FINDINGS = 24, CLOSE = 25;
	// Reduced motion: every scrubbed graphic renders complete.
	const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

	// the upstream fixed set's missions, eligible empty failures included: every chart's squares
	const tiles = $derived(scrolly.tiles);
	const drifting = $derived(tiles.filter((t) => t.hasThumb));
	const story = $derived(site.story);
	const failure = $derived(story.failure);
	const clps = $derived(site.clps);
	const comparison = $derived(story.comparison);
	// The gap "holds" in a division only where both sides are measured and the smaller missions' side is lower.
	const byDivision = $derived(comparison.byDivision ?? []);
	const lower = $derived(byDivision.filter((d) => d.under.top10PerMission != null && d.over.top10PerMission != null && d.under.top10PerMission < d.over.top10PerMission).length);
	const everyLower = $derived(byDivision.length > 0 && lower === byDivision.length);
	// The divisions the cross-division figures cover. The others fade out when those come up.
	const compared = $derived(new Set(comparison.divisions));
	const rankable = $derived(site.divisions.filter((d) => compared.has(d.slug)));
	// the divisions those charts leave out (too few missions and papers to rank), named where the lanes first show
	const leftOut = $derived(site.divisions.filter((d) => !compared.has(d.slug)));

	// The walk-through division: its primer, then its missions' high-impact papers a year over two steps.
	const primer = $derived(story.primer);
	// the fewest citations that half the primer's papers stay at or under
	const primerMedian = $derived.by(() => {
		if (!primer) return null;
		let seen = 0;
		const i = primer.counts.findIndex((n) => (seen += n) * 2 >= primer.papers);
		return i < 0 ? null : i;
	});
	const focus = $derived(byDivision.find((d) => d.division === story.focusDivision) ?? null);
	const focusName = $derived(focus?.name ?? '');
	const field = $derived(focusName.toLowerCase()); // "planetary science" mid-sentence
	// ONE counts the squares its chart draws: the walk-through division's costed fixed-cohort missions
	const focusCount = $derived(tiles.filter((t) => t.division === story.focusDivision && t.cost > 0).length);
	// The bars' measure, packaged in story.rate: each mission's high-impact papers a year over its
	// active mission window, with per-division facts
	const rate = $derived(story.rate);
	const rateRows = $derived(rate?.divisions ?? []);
	const tallest = $derived(rateRows.find((d) => d.division === story.focusDivision)?.largest ?? null);
	// FLOORS compares annual medians; SMALL names standouts on the same annual measure.
	const leadsLarger = $derived(largerAnnualMedians(rankable.map((d) => rateRows.find((r) => r.division === d.slug))));
	const smallStandouts = $derived(rateRows.filter((d) => d.bestSmall && d.larger.median != null && d.bestSmall.perYear > d.larger.median));

	// failure rates in whole percents: 8 of 95 is "8%", not 8.4%
	const whole = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
	// The failure answer's gate: small missions fall short more often than larger ones beyond chance (the
	// packaged two-sided Fisher exact test, over every costed mission). Pooled only: per-division
	// rates are too small to compare, so only NOTE's own split is ever stated.
	const failsMore = $derived(failure.higher === 'under' && significant(failure.fisherP));

	// Each mission's citations per dollar, including zeros, averaged across nearby costs.
	const averages = $derived(new Map(story.perDollar.map((d) => [d.division, d.runningMean])));
	const averaged = $derived(story.perDollar.filter((d) => d.runningMean));
	const dollarAverage = $derived(averages.get(DOLLAR_DIVISION) ?? null);
	const dollarName = $derived(story.perDollar.find((d) => d.division === DOLLAR_DIVISION)?.name ?? '');
	const dollarField = $derived(dollarName.toLowerCase()); // "planetary science" mid-sentence
	// The headline tests the small/larger group difference, not the running curve's shape or ribbon.
	const noneSmallBetter = $derived(noClearSmallAdvantage(rankable.map((d) => averages.get(d.slug)?.comparison)));
	// Fewer high-impact papers per mission in every division, and no division where small missions did
	// clearly better per dollar. It gates only the close's line on replacing larger missions.
	const verdict = $derived(everyLower && noneSmallBetter);

	// TIME_FORM and TIME_SCI: the Analysis page's own tiers and gates (src/lib/copy/analysis.js)
	const timed = $derived(index === TIME_FORM || index === TIME_SCI);
	const timeFirst = $derived(site.time.tiers[0]);
	const science = $derived(scienceOrder(site.time) != null);
	// most of the cheapest tier's missions that flew have no high-impact paper yet (the time bars read the lifetime ranking)
	const mostNone = $derived(mostUnreached(timeFirst));
	// the cheapest missions that reached one took about as long from project start as mid-size missions:
	// the cheapest tier's median within CLOSE_YEARS of the quickest of the tiers below the costliest two
	const cheapAsQuick = $derived.by(() => {
		const [first, ...mid] = site.time.tiers.slice(0, -2).map((t) => t.formulation.median);
		const known = mid.filter((m) => m != null);
		return first != null && known.length > 0 && Math.abs(first - Math.min(...known)) < CLOSE_YEARS;
	});
	// FAILURE points at the small side's columns: the tiers at or under the threshold
	const smallColumns = $derived(site.tiers.filter((t) => t.hi != null && t.hi <= story.referenceCost).length);

	// CLPS: each lander against each comparator at the same age (packaged), and which comparator cost
	// about as much as one lander or all of them ("about": within a quarter either way)
	const { compared: clpsCompared, likeOne } = $derived(clpsCosts(clps));
	const behindEach = $derived(clps.comparison?.behindEach === true);

	// FAIL_NOTE: NOTE's division across every tier, and either side of its edge
	const note = $derived.by(() => {
		const f = divisionShortfalls(site.tiers, site.failureTiers, NOTE.division, NOTE.edge);
		// an edge that is no longer a tier edge leaves below/above null: the split drops, never the step
		return { ...f, name: site.divisions.find((d) => d.slug === NOTE.division)?.name ?? '', split: clearlyHigher(f.below, f.above) };
	});

	const solid = (pos) => new Map([...pos].map(([id, p]) => [id, { ...p, variant: 'solid', opacity: 1 }]));

	let index = $state(0);
	let reached = $state(0);
	// Mount each chart just before its first use, then keep its nodes for reverse scrolling.
	$effect(() => {
		if (index > reached) reached = index;
	});
	let progress = $state(0);
	let W = $state(0);
	let H = $state(0);
	const compact = $derived(W > 0 && W < 600);
	const ready = $derived(W > 0 && H > 0);
	const grid = $derived(ready ? gridLayout(tiles, W, H) : null);
	const rug = $derived(ready ? rugLayout(tiles, W, H, site.launchYears) : null);
	const sky = $derived(rug ? skylineLayout(tiles, rug, { compact }) : null);
	const primerL = $derived(ready && primer ? primerLayout(primer, W, H, { compact }) : null);
	// the focus division's chart and the lanes after it span the same costs: the compared divisions'
	const comparedTiles = $derived(tiles.filter((t) => compared.has(t.division)));
	const focusL = $derived(ready && focus ? focusLayout(comparedTiles, W, H, { division: focus.division }) : null);
	const cost = $derived(ready ? costLayout(comparedTiles, W, H, { divisions: rankable, titled: true }) : null);
	// DOLLAR_DIVISION alone, then a two-column grid sharing the lanes' cost domain
	// dollarAverage is set only for a compared division, so the find always lands
	const dollarOne = $derived(ready && dollarAverage ? perDollarLayout(tiles, W, H, { divisions: rankable.filter((d) => d.slug === DOLLAR_DIVISION), averages, titled: true }) : null);
	const dollarAll = $derived(cost ? perDollarLayout(tiles, W, H, { divisions: rankable, averages, x: cost.x, titled: true }) : null);
	// CITES: DOLLAR_DIVISION's citations themselves, on the lanes' cost axis, before dividing by cost
	const citesL = $derived(cost && dollarAverage ? perDollarLayout(tiles, W, H, { divisions: rankable.filter((d) => d.slug === DOLLAR_DIVISION), averages, x: cost.x, citations: true, titled: true }) : null);
	// FAILURE: every costed mission by cost tier, up if it met its goals, down if not
	const outcomeL = $derived(ready ? tierOutcomeLayout(tiles, site.tiers, W, H) : null);
	// Hidden squares wait where the failure chart has them,
	// unless `fallback` places them first; withHidden only looks positions up, so no merged Map is built
	const hidden = (items, fallback) => withHidden(items, tiles, { get: (id) => fallback.get(id) ?? outcomeL.pos.get(id) });

	// Scrubs run while a step's text holds still, between the fractions `a` and `b` of the step.
	const span = (a, b) => (reduced ? 1 : Math.max(0, Math.min(1, (progress - a) / (b - a))));
	const scrub = $derived(reduced ? 1 : Math.min(1, progress * 2.4));
	// the skyline holds two steps: papers rise, then citations grow out of them as the chart zooms
	// out, in one move that eases in and out
	const skyline = $derived(index === CORPUS || index === CITED);
	const ease = (t) => t * t * (3 - 2 * t);
	const cite = $derived(index === CITED ? ease(span(0.1, 0.65)) : index > CITED ? 1 : 0);
	const primed = $derived(index === PAPERS || index === TOP);
	const focused = $derived(index === ONE || index === BARS);
	const laned = $derived(index === FLOORS || index === SMALL);
	const plotted = $derived(index >= SCATTER && index <= FIT);
	// One line at a time over DOLLAR_DIVISION's scatter: the imagined one slopes down at DOWN and
	// swings flat while the FLAT text holds; at FIT the running average fades in to take its place.
	// WOULD_SLOPE is illustrative, steep enough to read at a glance.
	const WOULD_SLOPE = -0.5;
	const flatten = $derived(index === FLAT ? ease(span(0.15, 0.5)) : index > FLAT ? 1 : 0);
	const would = $derived({
		slope: WOULD_SLOPE * (1 - flatten),
		label: index === DOWN ? 'If small missions did better' : index === FLAT && flatten === 1 ? 'If the average were the same' : '',
		shown: index === DOWN || index === FLAT
	});
	const turn = $derived(index === FIT ? ease(span(0.15, 0.5)) : index > FIT ? 1 : null);
	const grow = $derived(index === BARS ? span(0.15, 0.45) : index > BARS ? 1 : 0);
	// the opening's rising thumbnails, behind the title, the motivation and the questions, and again behind the
	// findings and the close
	const backdrop = $derived(index < OVERVIEW || index >= FINDINGS);
	// ...fading out while the close's text holds (from 60% to 80% through it), so it is gone before the story's
	// end scrolls into view
	const ending = $derived(index === CLOSE ? Math.max(0, Math.min(1, (progress - 0.6) / 0.2)) : 0);
	// the mosaic waits unseen under the backdrop, and the overview fades it in while its text holds, on the
	// squares' one shared opacity, so a scroll frame writes one style rather than one per square
	const squaresOpacity = $derived(backdrop ? 0 : index === OVERVIEW ? scrub : 1);
	const items = $derived.by(() => {
		if (!grid) return new Map();
		// the mosaic, held unseen under the drift from the title to the questions and from the findings into the close
		if (index <= OVERVIEW || index >= FINDINGS) return hidden(solid(grid.pos), grid.pos);
		if (skyline) return hidden(solid(rug.pos), grid.pos);
		if (primed) return hidden(new Map(), rug.pos);
		if (index === FAILURE || index === FAIL_NOTE) {
			const marked = failureItems(tiles, outcomeL);
			return hidden(index === FAIL_NOTE ? highlightDivision(marked, tiles, NOTE.division) : marked, rug.pos);
		}
		// the other divisions wait, hidden, on the lanes FLOORS draws
		if (focused && focusL) return hidden(failureItems(tiles, focusL), cost.pos);
		// the rates' bars rise from the shelves the squares sit on: the squares wait there, hidden
		if (laned) return hidden(new Map(), cost.pos);
		// the other divisions stay hidden on the cost axis the bands share
		if (plotted) return hidden(dollarOne ? failureItems(tiles, dollarOne) : new Map(), dollarAll.pos);
		// the other divisions wait, hidden, where FITS brings them in
		if (index === CITES && citesL) return hidden(failureItems(tiles, citesL), dollarAll.pos);
		// the missions FITS leaves out wait, hidden, where FAILURE's tier chart brings them in
		if (index === FITS) return hidden(failureItems(tiles, dollarAll), outcomeL.pos);
		// the time steps and CLPS: no squares, each fades where the tier chart left it
		return hidden(new Map(), outcomeL.pos);
	});
	// the lines draw while the reader scrolls, not inside the 400 ms fade-in
	const clpsDraw = $derived(reduced ? 1 : Math.max(0, Math.min(1, (progress - 0.1) / 0.6)));
	// the CLPS step: its text settles first (about a third of the way through the step), then the
	// chart fades in and the CLPS line draws
	const clpsIn = $derived(reduced || index > CLPS || progress >= 0.3);
	const clpsFirst = $derived(reduced ? 1 : Math.max(0, Math.min(1, (progress - 0.35) / 0.45)));

	// The skyline steps: pointing at a square or skimming the columns lights up that mission in both.
	// The primer steps: skimming the bars names the count under the pointer, found the same way;
	// FLOORS and SMALL: pointing at a bar names its mission and rate (laneHit), and anywhere over the lanes a
	// dashed cursor reads off the cost under the pointer. Only one of them is up at a time.
	// A touch keeps its highlight after the finger lifts; a mouse clears it on leaving the stage.
	// A first tap on a square only highlights it; tapping it again opens its page, as a click does.
	let pointed = $state(null);
	let pointedBar = $state(null);
	let pointedX = $state(null);
	let follow = true;
	const hot = $derived(skyline ? pointed : null);
	const hotBar = $derived(primed ? pointedBar : null);
	const hotLane = $derived(laned ? pointedBar : null);
	const laneCursor = $derived(laned ? pointedX : null);
	// the skyline names a mission with a column, so its square's own tip stays off
	const skyNamed = $derived(hot && sky?.columns.some((c) => c.id === hot) ? hot : null);
	function skim(e) {
		const r = e.currentTarget.getBoundingClientRect();
		if (primed && primerL) {
			pointedBar = skylineHit(primerL, e.clientX - r.left, e.clientY - r.top);
			return;
		}
		if (laned && cost) {
			const [px, py] = [e.clientX - r.left, e.clientY - r.top];
			pointedBar = laneHit(cost, px, py);
			pointedX = py >= cost.top && py <= cost.bottomY ? px : null;
			return;
		}
		if (!skyline || !sky) return;
		const id = e.target.closest?.('[data-id]')?.dataset.id;
		if (e.type === 'pointerdown') follow = e.pointerType === 'mouse' || (id != null && id === pointed);
		pointed = id ?? skylineHit(sky, e.clientX - r.left, e.clientY - r.top);
	}
	const holdClick = (e) => {
		if (skyline && !follow) e.preventDefault();
	};
	const unskim = (e) => {
		if (e.pointerType === 'mouse') pointed = pointedBar = pointedX = null;
	};
</script>

<Scroller bind:index bind:progress>
	{#snippet graphic()}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="stage" class:skimming={skyline || primed || laned} class:resting={backdrop} bind:clientWidth={W} bind:clientHeight={H} onpointerdown={skim} onpointermove={skim} onpointerleave={unskim} onclickcapture={holdClick}>
			{#if rug && cost && outcomeL}
				{#if reached >= OVERVIEW}
					<Skyline layout={sky} total={site.papersDistinct} cited={site.citationsDistinct} rise={index === CORPUS ? scrub : index > CORPUS ? 1 : 0} {cite} visible={skyline} highlight={hot} {compact} width={W} height={H} />
				{/if}
				{#if reached >= CITED && primerL}
					<Primer layout={primerL} {primer} years={calendarYears(site.fullPolicy)} hot={hotBar} build={index === PAPERS ? span(0.15, 0.5) : index > PAPERS ? 1 : 0} highlight={index === TOP} visible={primed} {compact} width={W} height={H} />
				{/if}
				{#if reached >= FITS}
					<OutcomeChart layout={outcomeL} failures={site.failureTiers} visible={index === FAILURE || index === FAIL_NOTE} {compact} width={W} height={H} />
				{/if}
				{#if reached >= FAIL_NOTE}
					<div class="time-panel" class:visible={timed} aria-hidden="true">
						<TimeBars tiers={site.tiers} time={site.time} only={index === TIME_SCI ? 'science' : 'formulation'} title="Median time to first high-impact paper from {index === TIME_SCI ? 'start of science operations' : 'project start'}" height={H} />
					</div>
				{/if}
				{#if reached >= TOP && focusL}
					<FocusChart layout={focusL} name={focusName} largest={tallest} {grow} bars={index >= BARS} visible={focused} {compact} width={W} height={H} />
				{/if}
				<!-- the lanes draw the focus chart's bars too, so at FLOORS they move into their band -->
				{#if reached >= TOP}
					<LanesChart layout={cost} title="High-impact papers published per year, by division and mission" focus={focusL} {focused} {grow} hot={hotLane} cursor={laneCursor} threshold={story.referenceCost} marked={index === SMALL} visible={laned} {compact} width={W} height={H} />
				{/if}
				{#if reached >= CITES && dollarOne}
					<DollarChart layout={dollarOne} title="Citations per {money(100)} in {dollarName}" {would} {turn} visible={plotted} {compact} width={W} height={H} />
				{/if}
				{#if reached >= SMALL && citesL}
					<DollarChart layout={citesL} title="Citations per mission in {dollarName}" visible={index === CITES} {compact} width={W} height={H} />
				{/if}
				{#if reached >= FIT && dollarAll}
					<DollarChart layout={dollarAll} title="Citations per {money(100)} by division" confidence visible={index === FITS} {compact} width={W} height={H} />
				{/if}
				{#if reached >= TIME_SCI}
					<ClpsChart {clps} title="Total papers by month since each mission’s start" draw={index === CLPS ? clpsFirst : index > CLPS ? 1 : 0} drawComparators={index === CLPS_COMPARE ? clpsDraw : index > CLPS_COMPARE ? 1 : 0} visible={(index === CLPS && clpsIn) || index === CLPS_COMPARE} {compact} width={W} height={H} />
				{/if}
				<Squares {tiles} {items} opacity={squaresOpacity} interactive={false} highlightId={hot} quietId={skyNamed} />
			{/if}
			<!-- the title, its rising thumbnails (the backdrop from the title to the questions, and from the findings to the close) and the cue; on a phone they have the whole screen -->
			<div class="opening" style:opacity={ending ? 1 - ending : null}>
				<Drift tiles={drifting} visible={backdrop} />
				<div class="thesis" class:visible={index === TITLE}>
					<p class="title">The impact and productivity of NASA's science missions</p>
					<p class="sub">What can {int(site.missions)} NASA missions launched since {site.launchYears[0]} reveal about cost and scientific output?</p>
				</div>
				<p class="cue" class:visible={index === TITLE} aria-hidden="true">Scroll to begin</p>
			</div>
		</div>
	{/snippet}

	{#snippet steps()}
		<!-- TITLE: the title over the rising thumbnails, no text beside it -->
		<section data-step></section>
		<!-- MOTIVATION: the text rises over the title's thumbnails, still drifting, and takes the title's
		     place; it pauses in the step's frame, centred on the screen. -->
		<section data-step data-bleed><div><div class="step panel">
			<p>NASA has repeatedly experimented with <strong class="neptuneBlue">smaller, cheaper, and riskier science missions</strong>.</p>
			<p>The agency currently faces severe budget cuts to science and has delayed or cancelled major missions. Commercial partnerships (CLPS) are sending small instruments to the Moon.</p>
			<p>But no broad survey of scientific performance has been done to validate these changes.</p>
		</div></div>
		</section>
		<!-- QUESTIONS: the four questions in their own box, over the same drift. They are the four parts'
		     headers and the four answers, in the same order. -->
		<section data-step data-bleed><div><div class="step panel">
			<p>We asked four questions:</p>
			<ol class="questions">
				<li>Is there a relationship between mission cost and scientific impact?</li>
				<li>Does lower cost mean more mission failures?</li>
				<li>Does time-to-science scale with cost?</li>
				<li>Are commercial lunar landers producing similar science to NASA-led missions?</li>
			</ol>
		</div></div>
		</section>
		<!-- OVERVIEW: the mosaic fades in under what we studied -->
		<section data-step data-scrub><div class="step">
			<p>To find out, we studied the output of <strong>{int(site.missions)} NASA-led science missions</strong> launched from {site.launchYears[0]} to {site.launchYears[1]}, across all {spell(site.divisions.length)} of the agency’s science divisions.</p>
		</div></section>
		<!-- CORPUS: the skyline, where the explanation of how we measured begins -->
		<section data-step data-scrub><div class="step">
			<p class="neptuneBlue"><strong>What we did</strong></p>
			<p>We assembled a set of <strong>{int(site.papersDistinct)} peer-reviewed papers</strong> associated with these {int(site.missions)} science missions.</p>
			<p>Papers published in peer-reviewed academic journals are a proxy for <span class="neptuneBlue"><strong><em>scientific productivity</em></strong></span>.</p>
		</div></section>
		<!-- CITED: the same skyline zooms out as each mission's citations grow out of its papers (lifetime
		     totals, an illustration; every comparison of citations reads a fixed window after publication) -->
		<section data-step data-scrub><div class="step">
			<p>When one paper builds on another, it <strong>cites</strong> it. Citations are one measure of <span class="neptuneBlue"><strong><em>scientific impact</em></strong></span>.</p>
		</div></section>
		<!-- PAPERS: the focus division's papers by citations, grey -->
		<section data-step data-scrub><div class="step">
			{#if primer && primerMedian != null}
				<p>Science papers are not cited equally.</p>
				<p>For example, half of all {field} papers in our database accrued {spell(primerMedian)} or fewer citations in their first {spell(calendarYears(site.fullPolicy))} years.</p><p>The most cited paper received {int(primer.counts.length - 1)}.</p>
			{/if}
		</div></section>
		<!-- TOP: the same bars, the top 10% in blue; the one definition every high-impact chart but the time bars uses -->
		<section data-step><div class="step">
			<p>We call a paper <span class="neptuneBlue"><strong><em>high-impact</em></strong></span> when it drew more citations in its first {spell(calendarYears(site.fullPolicy))} years than 90% of the mission papers in its field.</p>
			{#if primer}<p>In {field}, that means {primer.cutoff} or more.</p>{/if}
		</div></section>
		<!-- ONE and BARS always render, so later steps keep their numbers; with no focus division they're blank -->
		<!-- ONE: the focus division alone on the cost axis; the first chart with failure marks, so the key is here -->
		<section data-step><div class="step">
			{#if focus && focusCount}
				<p class="part neptuneBlue"><strong>Cost and Scientific Productivity</strong></p>
				<p>Here {int(focusCount)} {field} missions are ordered by life-cycle cost, adjusted for inflation.</p>
				<p class="key-line"><span class="key mark-lost" role="img" aria-label="A red X"></span> denotes a total mission failure; <span class="key mark-partial" role="img" aria-label="a single red stroke"></span> denotes a partial failure.</p>
			{/if}
		</div></section>
		<!-- BARS: each mission's high-impact papers a year -->
		<section data-step data-scrub><div class="step">
			{#if focus && rate}
				<p>Each bar shows a mission’s average high-impact papers per year over its measured publication window.</p>
			{/if}
		</div></section>
		<!-- FLOORS: the same yearly rate for every compared division, a band each on the lanes' cost axis -->
		<section data-step><div class="step">
			{#if leadsLarger}<p>Across the {spell(rankable.length)} divisions shown, larger missions tend to <strong>produce more high-impact papers per year</strong>.</p>{/if}
			{#if leftOut.length}<p class="aside">The {listify(leftOut.map((d) => d.name))} division {leftOut.length === 1 ? 'has' : 'have'} too few missions, so {leftOut.length === 1 ? 'it isn’t' : 'they aren’t'} shown here.</p>{/if}
		</div></section>
		<!-- SMALL: the same lanes, the threshold dashed through them; where "very low cost" is defined. A division is
		     named as the exception only while its best small mission beats its larger missions' median (smallStandouts) -->
		<section data-step><div class="step">
			<p>Missions below {moneyWords(story.referenceCost)} are considered very low cost.</p>
			{#if smallStandouts.length}<p>Some stand out: {listify(smallStandouts.map((d) => `${d.bestSmall.name} (${d.name})`))} produced high-impact papers at a rate comparable to much more expensive missions.</p>{/if}
			<p>Most produce <strong>little or no high-impact papers.</strong></p>
		</div></section>
		<!-- CITES: DOLLAR_DIVISION's missions by cost and by the citations they drew, before per dollar -->
		<section data-step><div class="step">
			{#if citesL}
				<p><span class="neptuneBlue"><strong>Scientific impact per dollar</strong></span></p>
				<p>Plotting missions by cost and total citations in each publication window shows a clear relationship between total cost and total scientific impact.</p><p>Missions in {dollarField} are shown here.</p>
			{/if}
		</div></section>
		<!-- SCATTER, DOWN, FLAT and FIT always render, so later steps keep their numbers; without DOLLAR_DIVISION data they're blank -->
		<!-- SCATTER: DOLLAR_DIVISION, each mission by cost and by citations per dollar -->
		<section data-step><div class="step">
			{#if dollarAverage}
				<p>Dividing each mission’s citations by cost compares citations by {moneyWords(100)} spent. This can be thought of as <strong>scientific impact per dollar</strong>.</p>
			{/if}
		</div></section>
		<!-- DOWN: the line the missions would follow if small ones got more for their money -->
		<section data-step><div class="step">
			{#if dollarAverage}
				<p>If lower-cost missions consistently returned more impact per dollar, we would expect the average citations to be higher on the left side of the plot.</p>
			{/if}
		</div></section>
		<!-- FLAT: the same line swings flat, for missions that got the same per dollar whatever their size -->
		<section data-step data-scrub><div class="step">
			{#if dollarAverage}
				<p>If average impact per dollar were similar across costs, the line would be approximately flat.</p>
			{/if}
		</div></section>
		<!-- FIT: the running average fades in over the same mission squares -->
		<section data-step data-scrub><div class="step">
			{#if dollarAverage}
				<p>This is the actual running average of impact per dollar. In {dollarField}, very low cost missions returned poor results, primarily due to mission failures.</p>
				<p class="aside"><a href={methodsHref('running-averages')}>How we calculate the averages</a></p>
			{/if}
		</div></section>
		<!-- FITS: every compared division's missions, running average and uncertainty -->
		<section data-step><div class="step">
			{#if averaged.length}
				{#if noneSmallBetter}
					<p><strong class="neptuneBlue">In no science division did very low cost missions demonstrate better impact per dollar than larger ones.</strong></p>
					<p>Conversely, NASA's most expensive science missions did not demonstrate an advantage, either.</p>
				{/if}
				<p class="aside">Shading shows a 95% interval for the average at each cost.</p>
			{/if}
		</div></section>
		<!-- FAILURE: every costed mission by cost tier, up if it met its goals, down if it failed or fell short -->
		<section data-step><div class="step">
			<p class="part neptuneBlue"><strong>Mission failure rates
			</strong></p>
			<p>Very low cost missions (the first {spell(smallColumns)} columns) have full or partial failure rates of {whole(failure.under.rate)}.</p><p>For more expensive missions, that rate is {whole(failure.over.rate)}.</p>
		</div></section>
		<!-- FAIL_NOTE: the same chart, NOTE's division washed; its split either side of the edge only under clearlyHigher -->
		<section data-step><div class="step">
			{#if note.split}
				<p>{note.name} has the highest failure rate for very low cost missions.</p><p>Below {moneyWords(NOTE.edge)}, {spell(note.below.short)} out of {spell(note.below.missions)} {note.name} missions between {site.launchYears[0]} and {site.launchYears[1]} failed.</p><p>The program's most expensive failure, Mars Observer, succumbed to a hardware issue traced to the use of a commercial spacecraft bus designed for Earth orbit.</p>
			{:else}
				<p>{upperFirst(spell(note.all.short))} of {spell(note.all.missions)} <strong class="neptuneBlue">{note.name}</strong> missions failed or fell short of their goals.</p>
			{/if}
		</div></section>
		<!-- TIME_FORM: years to a first high-impact paper, counted from the start of formulation -->
		<section data-step><div class="step">
			<p class="part neptuneBlue"><strong>Time to high-impact science</strong></p>
			<p>Lower cost missions commonly take about 5 1/2 years to produce a high-impact science paper, when measured from the start of project formulation to the paper's publication date.</p>
			<p>More expensive missions tend to take longer due to longer development and transit times before science operations can begin.</p>
		</div></section>
		<!-- TIME_SCI: the same tiers, counted from the start of science operations -->
		<section data-step><div class="step">
			{#if science}<p>If you measure from the start of science operations, more expensive missions tend to lead to high-impact papers almost immediately.</p>{/if}
		</div></section>
		<!-- CLPS: the commercial case study the motivation names -->
		<section data-step data-scrub><div class="step">
			<p class="part neptuneBlue"><strong>Scientific productivity of CLPS missions</strong></p>
			{#if clps.comparison}<p>The {spell(clps.missions.length)} CLPS missions flew too recently to compare scientific impact using citations.</p><p>Instead, we can compare their <strong>scientific productivity</strong> by counting the number of papers published since their first launch.</p>{/if}
		</div></section>
		<!-- CLPS_COMPARE: the comparators by cost and purpose, then each lander at the same age -->
		<section data-step data-scrub><div class="step">
			{#if clpsCompared.length}
				<p>Compare CLPS output to {spell(clpsCompared.length)} science-first NASA missions. These also had short mission durations and mixed experimental technology demonstration and science.</p>
				{#if behindEach && likeOne}<p><strong>So far, CLPS landers are trailing in scientific productivity</strong>.</p>{/if}
			{/if}
		</div></section>
		<!-- FINDINGS: the four answers in one box over the opening's rising thumbnails, in the questions' order; each gated line has a
		     neutral form for when its gate fails, so every question QUESTIONS asks gets an answer -->
		<section id="what-we-found" data-step data-bleed><div><div class="step panel">
			<p class="neptuneBlue"><strong>What we found</strong></p>

			<ul class="answers">
				<li>
					<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M15 8.5c-.6-.9-1.7-1.5-3-1.5-1.9 0-3 1-3 2.4 0 3.2 6 1.8 6 5 0 1.4-1.2 2.6-3 2.6-1.4 0-2.6-.6-3.2-1.6M12 5v2M12 17v2" /></svg>
					<span><strong>Very low cost missions do not provide an advantage in science per dollar, and neither do very expensive ones.</strong> Mid-cost missions tend to be the most efficient in terms of citations.</span>
				</li>
				<li>
					<span class="icon key mark-lost" aria-hidden="true"></span>
					<span>{#if failsMore}<strong>High failure rates.</strong> {whole(failure.under.rate)} of missions below {moneyWords(story.referenceCost)} failed. Only {whole(failure.over.rate)} of larger ones did.{:else if failure.higher === 'under'}<strong>Somewhat more failures:</strong> {whole(failure.under.rate)} of small missions against {whole(failure.over.rate)} of larger ones.{:else if failure.higher === 'over'}<strong>No more failures:</strong> {whole(failure.under.rate)} of small missions against {whole(failure.over.rate)} of larger ones.{:else}<strong>Similar failure rates</strong> for small and larger missions.{/if} Failure rates are not the same across scientific divisions.</span>
				</li>
				<li>
					<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13.5" r="7.5" /><path d="M12 13.5V9.5M10 3h4M12 3v3M18 7l1.5-1.5" /></svg>
					<span>{#if mostNone}<strong>Not reliably faster.</strong> Most low cost missions generate no high-impact science papers. {#if cheapAsQuick}Those that do often take as long as mid-size missions.{/if}{:else if science}<strong>Not faster.</strong> Once science begins, larger missions reach a high-impact paper sooner.{:else}<strong>Speed</strong> varies with cost in no simple way.{/if}</span>
				</li>
				<li>
					<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 10h8l1.5 5h-11zM12 10V6M10 6h4M7 15l-2.5 4M17 15l2.5 4M3 19h4M17 19h4" /></svg>
					<span>{#if behindEach}<strong>CLPS has yet to demonstrate significant scientific productivity.</strong> Each mission has, so far, produced fewer papers than comparable NASA-led science missions. {:else if clps.comparison?.behindAll}<strong>Commercial landers trail so far.</strong> Together they have fewer papers than comparable NASA missions at the same age.{:else if clps.comparison?.behindAll === false}<strong>Commercial landers are keeping pace</strong> with comparable NASA missions so far.{:else}<strong>Commercial landers</strong> are too new to compare with NASA missions yet.{/if}</span>
				</li>
			</ul>
		</div></div>
		</section>
		<!-- CLOSE: over the same thumbnails, the concession, then under `verdict` what the record does and
		     doesn't show (nothing suggests replacement) -->
		<section data-step data-bleed><div><div class="step panel">
			<p><strong>Very low cost missions are worth doing:</strong> they help train future mission leaders, prove out new technology, and can return good science.</p>
			{#if verdict}<p><strong>But nothing in this record demonstrates they can <em>replace</em> the scientific impact of more complex and costly missions.</strong></p>{/if}
			<p>Conversely, flagship missions are worth doing, too. Citation efficiency is not the only measure of value. Larger missions tend to break new ground, provide unique data, and develop technologies that enable subsequent smaller missions.</p>
			<p>Explore the data yourself. Scroll down to access our entire dataset by division.</p>
		</div></div></section>
	{/snippet}
</Scroller>

<style>
	/* the stage is the graphic's whole height: no caption under it, so every chart gets the room */
	.stage { position: relative; height: 100%; width: 100%; }
	/* a sideways finger skims the columns; an upward one still scrolls the page */
	.stage.skimming { touch-action: pan-y; }
	/* the unseen mosaic under the drift (the title to the questions, the findings and the close) is backdrop: no tips, no clicks
	   (Squares sets pointer-events inline only on a square it hides) */
	.stage.resting :global(.sq) { pointer-events: none; }
	/* Phones: the box's --panel fill drops Neptune emphasis to 4.2:1; a quarter of --neptune-mid lifts it past 5:1 */
	@media (max-width: 860px) {
		section:not([data-bleed]) > .step :global(.neptuneBlue) { color: color-mix(in srgb, var(--neptune) 75%, var(--neptune-mid)); }
	}
	/* TIME_FORM/TIME_SCI: the Analysis page's time bars, centred on the stage */
	.time-panel { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; opacity: 0; transition: opacity 400ms linear; pointer-events: none; }
	.time-panel.visible { opacity: 1; }
	/* a soft shade under the title keeps the thumbnails rising behind it from crossing the type */
	.thesis { position: absolute; inset: 0; z-index: 2; display: flex; flex-direction: column; justify-content: center; gap: 0.6em; margin: 0; background: radial-gradient(ellipse 62% 42% at 42% 50%, rgb(0 0 0 / 0.78), rgb(0 0 0 / 0.4) 55%, transparent); text-shadow: 0 0 24px var(--black), 0 0 8px var(--black); opacity: 0; transition: opacity 400ms linear; pointer-events: none; }
	.thesis .title { max-width: 14em; font-weight: 300; font-size: clamp(34px, 5.4vw, 76px); line-height: 1.08; letter-spacing: -0.04em; }
	.thesis .sub { max-width: 32em; font-size: clamp(17px, 0.6vw + 11px, 20px); line-height: 1.45; }
	.thesis.visible { opacity: 1; }
	.cue { position: absolute; left: 0; bottom: 8px; z-index: 2; margin: 0; font-size: 14px; color: var(--dust); opacity: 0; transition: opacity 400ms linear; pointer-events: none; }
	.cue.visible { opacity: 1; }
	.cue::after { content: ''; display: block; width: 1px; height: 28px; margin-top: 8px; background: var(--dust); }
	.opening { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
	/* Phones: the title has the screen to itself, running past the pinned graphic to the screen's foot
	   with its text centred; the next step brings back the graphic on top and the text below */
	@media (max-width: 860px) {
		.opening { bottom: calc(var(--nav-h) + var(--graphic-h) - 100vh); }
		@supports (height: 1svh) {
			.opening { bottom: calc(var(--nav-h) + var(--graphic-h) - 100svh); }
		}
		.thesis { align-items: center; padding-inline: 12px; text-align: center; background: radial-gradient(ellipse 75% 32% at 50% 50%, rgb(0 0 0 / 0.78), rgb(0 0 0 / 0.4) 55%, transparent); }
		.cue { right: 0; text-align: center; }
		.cue::after { margin-inline: auto; }
	}
	/* the clear steps' boxes, centred over the drifting thumbnails: a dark glass rather than a grey card */
	.panel { max-width: 34em; padding: clamp(24px, 3vw, 40px); text-align: center; background: rgb(0 0 0 / 0.72); backdrop-filter: blur(4px); box-shadow: 0 0 0 1px var(--outline); color: var(--white); }
	/* the four questions and the four answers read as lists, left-aligned inside the centred boxes */
	.questions { margin: 0.6em auto 0; padding-left: 1.4em; list-style: decimal; text-align: left; }
	.questions li + li { margin-top: 0.3em; }
	.questions li::marker { color: var(--neptune-mid); font-weight: 500; }
	.answers { margin: 0.8em 0 0; padding: 0; list-style: none; text-align: left; }
	.answers li { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 12px; align-items: start; }
	.answers li + li { margin-top: 0.9em; }
	.icon { width: 24px; height: 24px; margin-top: 2px; fill: none; stroke: var(--neptune-mid); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
	/* the failure marks the squares carry (app.css), at type size: a key in the text, not on the stage */
	.key { display: inline-block; width: 0.85em; height: 0.85em; vertical-align: -0.08em; }
	.answers .key.icon { width: 22px; height: 22px; margin: 3px 1px 0; }
	.step .part { margin-bottom: 0.2em; }
	.step { font-size: clamp(17px, 0.6vw + 11px, 19px); line-height: 1.5; }
	.step p + p { margin-top: 1em; }
	.step .aside { font-size: 15px; line-height: 1.5; color: var(--dust); }
	/* a short phone has little room under the pinned graphic: a size down keeps most steps holding
	   still instead of falling back to scrolling (Scroller's .overflows) */
	@media (max-width: 860px) and (max-height: 820px) {
		.step { font-size: 15px; line-height: 1.45; }
		.step .aside { font-size: 13px; }
	}
</style>
