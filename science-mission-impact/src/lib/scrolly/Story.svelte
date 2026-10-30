<script>
	// The overview as a scroll: a title, then one argument over one stage of mission squares. The
	// missions, then the four findings in one box over a photo; then how we measured them: the
	// papers the missions produced, the citations those drew and what a highly cited paper is, then
	// that division's missions by cost and each one's highly cited papers a year. Finding 1 then
	// widens that to every division: each one's missions' top-10% papers a year, then one
	// division's citations against cost to set up per dollar (DOLLAR_DIVISION), then its missions per dollar (the
	// line they would follow if small missions did better, then as well, then the line they do
	// follow), then each division's per-dollar trend. Finding 2: failures by cost tier, then each
	// division's own failures on the same chart.
	// Finding 3, time to science: the Analysis page's time bars, from formulation, then from the
	// start of science (TIME_FORM, TIME_SCI). Finding 4, CLPS. Then
	// the close over the launch grid. Steps share a graphic state (PAPERS/TOP,
	// FAILURE and its division steps, SCATTER/DOWN/FLAT/FIT), so long text is
	// split across them. Every figure in the copy comes from site.story (the packager) or site
	// itself; the component only lays out.
	import Scroller from './Scroller.svelte';
	import Squares from './Squares.svelte';
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
	import { int, listify, money, moneyWords, spell, upperFirst, weight, years } from '$lib/format.js';
	import { flat, soft, firm, direction, times, tenfold, TIPS } from '$lib/copy/discussion.js';
	import { asset, methodsHref } from '$lib/paths.js';
	import { MIN_REACHED, apart, clearlyHigher, divisionShortfalls, edgeWords, scienceOrder, shortestTier, slowestBuild as slowest, tierWords } from '$lib/copy/analysis.js';

	let { site, scrolly } = $props();
	// the four findings in one box over a photo, before the explainer
	const TITLE = 0, MOTIVATION = 1, OVERVIEW = 2, FINDINGS = 3;
	// how we measured: the papers, the citations they drew, and the highly cited ones; then the focus
	// division's missions by cost, and each one's highly cited papers a year
	const CORPUS = 4, CITED = 5, PAPERS = 6, TOP = 7, ONE = 8, BARS = 9;
	// finding 1, every division after the focus division's walk-through: the rate lanes, then per dollar
	// (CITES: DOLLAR_DIVISION's citations against cost, setting up per dollar; SCATTER…FIT: its
	// missions per dollar, one line per step; FITS: every compared division's line)
	const FLOORS = 10, CITES = 11, SCATTER = 12, DOWN = 13, FLAT = 14, FIT = 15, FITS = 16;
	// the per-dollar walk-through's own division, apart from the focus division the primer and bars follow;
	// one that isn't compared leaves CITES…FIT blank, as a missing focus division blanks ONE and BARS
	const DOLLAR_DIVISION = 'astrophysics';
	// finding 2: failures by cost tier (FAILURE), then one step per division (FAIL_BY…FAIL_LAST)
	// washing that division's squares over the same chart
	const FAILURE = 17, FAIL_BY = 18;
	// the step count is fixed at build time, like the rest of the packaged props
	// svelte-ignore state_referenced_locally
	const FAIL_LAST = FAIL_BY + site.divisions.length - 1;
	// the one division step with a note: its failures either side of this tier edge ($M), stated
	// only when its intervals say the rates differ (clearlyHigher)
	const FAIL_NOTE = { division: 'planetary', edge: 350 };
	// finding 3, time to science: the Analysis page's time bars, from formulation, then from the start of science
	const TIME_FORM = FAIL_LAST + 1, TIME_SCI = TIME_FORM + 1;
	// finding 4, CLPS; then the close, every mission back in the launch grid
	const CLPS = TIME_SCI + 1, CLPS_COMPARE = CLPS + 1, CLOSE = CLPS + 2;
	// Reduced motion: every scrubbed graphic renders complete.
	const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

	const tiles = $derived(scrolly.tiles);
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

	// The walk-through division: its primer, then its missions' top-10% papers a year over two steps.
	const primer = $derived(story.primer);
	// the fewest citations that half the primer's papers stay at or under
	const primerMedian = $derived.by(() => {
		if (!primer) return null;
		let seen = 0;
		const i = primer.counts.findIndex((n) => (seen += n) * 2 >= primer.papers);
		return i < 0 ? null : i;
	});
	const focus =$derived(byDivision.find((d) => d.division === story.focusDivision) ?? null);
	const focusShares = $derived(story.divisions.find((d) => d.division === story.focusDivision) ?? null);
	const focusName = $derived(focus?.name ?? '');
	const field = $derived(focusName.toLowerCase()); // "planetary science" mid-sentence
	// The bars' measure, packaged in story.rate: each mission's lifetime top-10% papers a year from
	// its prime start through `through`, the data's last publication year, with per-division facts
	const rate = $derived(story.rate);
	const rateRows = $derived(rate?.divisions ?? []);
	const tallest = $derived(rateRows.find((d) => d.division === story.focusDivision)?.largest ?? null);
	// FLOORS' claims: a larger mission leads every division; most small missions in each had no
	// top-10% paper; and any division whose best small mission beat its larger missions' median
	const leadsLarger = $derived(rateRows.length > 1 && rateRows.every((d) => d.largest?.size === 'over'));
	const smallMostlyNone = $derived(rateRows.length > 1 && rateRows.every((d) => d.small.missions > 0 && d.small.none * 2 > d.small.missions));
	const smallStandouts = $derived(rateRows.filter((d) => d.bestSmall && d.larger.median != null && d.bestSmall.perYear > d.larger.median));

	// failure rates in whole percents: 8 of 95 is "about 8%", not 8.4%
	const whole = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
	// FINDING_TWO's gate: pooled small missions fall short more often than larger ones, beyond chance
	// (the packaged Wilson intervals don't overlap). Pooled only: per-division rates are too small to compare.
	const failsMore = $derived(apart(failure.under.interval, failure.over.interval));

	// Per dollar, in citations per $100M: larger missions drew "more" only where the packaged
	// ordering survives dropping any one mission.
	const dollarOver = $derived(story.perDollar.filter((d) => d.favors === 'over'));
	// the close's headline needs both readings: fewer top-10% papers per mission everywhere, fewer citations per dollar in most
	const verdict = $derived(everyLower && dollarOver.length * 2 > byDivision.length);

	// Per dollar, mission by mission: each compared division's packaged trend line, threshold ignored.
	const fits = $derived(new Map(story.perDollar.map((d) => [d.division, d.fit])));
	const dollarFit = $derived(fits.get(DOLLAR_DIVISION) ?? null);
	const dollarName = $derived(story.perDollar.find((d) => d.division === DOLLAR_DIVISION)?.name ?? '');
	const dollarField = $derived(dollarName.toLowerCase()); // "astrophysics" mid-sentence
	// CITES: how many times the citations at ten times the cost, from the packaged fit; whole above 10
	const citesTimes = $derived(!(dollarFit?.citesTenfold > 1) ? null : dollarFit.citesTenfold >= 10 ? `${int(dollarFit.citesTenfold)} times` : times(dollarFit.citesTenfold));
	// the rises the copy sizes with no caveat; every other line is named with its direction
	const firmRising = $derived(story.perDollar.filter((d) => d.fit && firm(d.fit)));
	const plainFits = $derived(story.perDollar.filter((d) => d.fit && !soft(d.fit) && !firm(d.fit)));
	// every compared division rises firmly: the only reading that earns the bold
	const steady = $derived(firmRising.length === story.perDollar.length);

	// The findings, worded for the box. The first is stated only under `verdict`,
	// the second only under `failsMore`, the third only when the median wait from the start of
	// science to a first top-10% paper shortens with cost (`scienceOrder`, the Analysis page's gate),
	// the fourth's "not matching" only when CLPS is behind every comparator.
	const FINDING_ONE = 'Replacing larger missions with more low-cost missions will not maintain scientific output.';
	const FINDING_THREE = 'Once science operations begin, larger missions produce high-impact science faster than smaller missions.';
	const faster = $derived(scienceOrder(site.time) != null);
	// TIME_FORM and TIME_SCI: the Analysis page's own gates and figures (src/lib/copy/analysis.js)
	const timed = $derived(index === TIME_FORM || index === TIME_SCI);
	const shortest = $derived(shortestTier(site.time));
	const [timeFirst, timeLast] = $derived([site.time.tiers[0], site.time.tiers.at(-1)]);
	const slowestBuild = $derived(slowest(site.time));
	// TIME_SCI singles out the cheapest and costliest tiers' medians only when each rests on MIN_REACHED missions
	const endsRanked = $derived(timeFirst.reached >= MIN_REACHED && timeLast.reached >= MIN_REACHED);
	const findingFour = $derived(`The science output of NASA’s commercial lunar missions ${clps.comparison?.behindAll ? 'has not matched the productivity of' : 'is keeping pace with'} science-focused missions.`);

	// CLPS: the landers that began work a year or more after the first launch.
	const clpsLate = $derived(clps.missions.filter((p) => Date.parse(p.primeStart) - Date.parse(clps.start) > 365 * 864e5));
	const clpsCompared = $derived((clps.comparison?.comparators ?? []).map((c) => ({ ...c, cost: clps.comparators.find((k) => k.id === c.id)?.cost ?? null })));

	const solid = (pos) => new Map([...pos].map(([id, p]) => [id, { ...p, variant: 'solid' }]));

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
	// DOLLAR_DIVISION alone, then every compared division on the lanes' own cost axis
	// dollarFit is set only for a compared division, so the find always lands
	const dollarOne = $derived(ready && dollarFit ? perDollarLayout(tiles, W, H, { divisions: rankable.filter((d) => d.slug === DOLLAR_DIVISION), fits, titled: true }) : null);
	const dollarAll = $derived(cost ? perDollarLayout(tiles, W, H, { divisions: rankable, fits, x: cost.x, titled: true }) : null);
	// CITES: DOLLAR_DIVISION's citations themselves, on the lanes' cost axis, before dividing by cost
	const citesL = $derived(cost && dollarFit ? perDollarLayout(tiles, W, H, { divisions: rankable.filter((d) => d.slug === DOLLAR_DIVISION), fits, x: cost.x, citations: true, titled: true }) : null);
	// FAILURE: every division's missions by cost tier, up if they met their goals, down if not
	const outcomeL = $derived(ready ? tierOutcomeLayout(tiles, site.tiers, W, H) : null);
	// the division the current FAIL_BY step washes, and every division's outcomes for those steps
	const failDiv = $derived(index >= FAIL_BY && index <= FAIL_LAST ? site.divisions[index - FAIL_BY] : null);
	const failByDivision = $derived(
		site.divisions.map((d) => {
			// a FAIL_NOTE edge that is no longer a tier edge leaves below/above null: the note drops, never the step
			const f = divisionShortfalls(site.tiers, site.failureTiers, d.slug, FAIL_NOTE.edge);
			return { slug: d.slug, name: d.name, ...f, note: d.slug === FAIL_NOTE.division && clearlyHigher(f.below, f.above) };
		})
	);
	// FINDING_TWO names a division only where its FAIL_BY note holds (Wilson intervals apart at FAIL_NOTE's edge)
	const failNoted = $derived(failByDivision.find((f) => f.note) ?? null);
	const findingTwo = $derived(`Small missions fail at higher rates than large ones${failNoted ? `, particularly in ${failNoted.name}` : ''}.`);

	// Scrubs run while a step's text holds still, between the fractions `a` and `b` of the step.
	const span = (a, b) => (reduced ? 1 : Math.max(0, Math.min(1, (progress - a) / (b - a))));
	const scrub = $derived(reduced ? 1 : Math.min(1, progress * 2.4));
	// the title and the motivation photo stand alone; the squares arrive one by one with the overview, then stay
	const shown = $derived(index <= MOTIVATION ? 0 : index === OVERVIEW ? Math.ceil(scrub * tiles.length) : tiles.length);
	// the skyline holds two steps: papers rise, then citations grow out of them as the chart zooms
	// out, in one move that eases in and out
	const skyline = $derived(index === CORPUS || index === CITED);
	const ease = (t) => t * t * (3 - 2 * t);
	const cite = $derived(index === CITED ? ease(span(0.1, 0.65)) : index > CITED ? 1 : 0);
	const primed = $derived(index === PAPERS || index === TOP);
	const focused = $derived(index === ONE || index === BARS);
	const plotted = $derived(index >= SCATTER && index <= FIT);
	// One line at a time over DOLLAR_DIVISION's scatter: the imagined one slopes down at DOWN and
	// swings flat while the FLAT text holds; at FIT the best fit takes its place and swings up off
	// flat to its own slope. WOULD_SLOPE is illustrative, steep enough to read at a glance.
	const WOULD_SLOPE = -0.5;
	const flatten = $derived(index === FLAT ? ease(span(0.15, 0.5)) : index > FLAT ? 1 : 0);
	const would = $derived({
		slope: WOULD_SLOPE * (1 - flatten),
		label: index === DOWN ? 'If small missions did better' : index === FLAT && flatten === 1 ? 'If size made no difference' : '',
		shown: index === DOWN || index === FLAT
	});
	const turn = $derived(index === FIT ? ease(span(0.15, 0.5)) : index > FIT ? 1 : null);
	const grow = $derived(index === BARS ? span(0.15, 0.45) : index > BARS ? 1 : 0);
	const items = $derived.by(() => {
		if (!grid) return new Map();
		// the findings box covers the stage, so the grid holds under it
		if (index <= FINDINGS || index >= CLOSE) return solid(grid.pos);
		if (skyline) return withHidden(solid(rug.pos), tiles, grid.pos);
		if (primed) return withHidden(new Map(), tiles, rug.pos);
		if (index === FAILURE || failDiv) {
			const marked = failureItems(tiles, outcomeL);
			return withHidden(failDiv ? highlightDivision(marked, tiles, failDiv.slug) : marked, tiles, rug.pos);
		}
		// the other divisions wait, hidden, on the lanes FLOORS draws
		if (focused && focusL) return withHidden(failureItems(tiles, focusL), tiles, cost.pos);
		// the rates' bars rise from the shelves the squares sit on: the squares wait there, hidden
		if (index === FLOORS) return withHidden(new Map(), tiles, cost.pos);
		// the other divisions stay hidden on the cost axis the bands share
		if (plotted) return withHidden(dollarOne ? failureItems(tiles, dollarOne) : new Map(), tiles, dollarAll.pos);
		// the other divisions wait, hidden, where FITS brings them in
		if (index === CITES && citesL) return withHidden(failureItems(tiles, citesL), tiles, dollarAll.pos);
		// the missions FITS leaves out wait, hidden, where FAILURE's tier chart brings them in
		if (index === FITS) return withHidden(failureItems(tiles, dollarAll), tiles, outcomeL.pos);
		// the time steps and CLPS: no squares, each fades where the tier chart left it
		return withHidden(new Map(), tiles, outcomeL.pos);
	});
	// the lines draw while the reader scrolls, not inside the 400 ms fade-in
	const clpsDraw = $derived(reduced ? 1 : Math.max(0, Math.min(1, (progress - 0.1) / 0.6)));
	// the CLPS step: its text settles first (about a third of the way through the step), then the
	// chart fades in and the CLPS line draws
	const clpsIn = $derived(reduced || index > CLPS || progress >= 0.3);
	const clpsFirst = $derived(reduced ? 1 : Math.max(0, Math.min(1, (progress - 0.35) / 0.45)));

	// The skyline steps: pointing at a square or skimming the columns lights up that mission in both.
	// The primer steps: skimming the bars names the count under the pointer, found the same way;
	// FLOORS: pointing at a bar names its mission and rate (laneHit), and anywhere over the lanes a
	// dashed cursor reads off the cost under the pointer. Only one of them is up at a time.
	// A touch keeps its highlight after the finger lifts; a mouse clears it on leaving the stage.
	// A first tap on a square only highlights it; tapping it again opens its page, as a click does.
	let pointed = $state(null);
	let pointedBar = $state(null);
	let pointedX = $state(null);
	let follow = true;
	const hot = $derived(skyline ? pointed : null);
	const hotBar = $derived(primed ? pointedBar : null);
	const hotLane = $derived(index === FLOORS ? pointedBar : null);
	const laneCursor = $derived(index === FLOORS ? pointedX : null);
	// the skyline names a mission with a column, so its square's own tip stays off
	const skyNamed = $derived(hot && sky?.columns.some((c) => c.id === hot) ? hot : null);
	function skim(e) {
		const r = e.currentTarget.getBoundingClientRect();
		if (primed && primerL) {
			pointedBar = skylineHit(primerL, e.clientX - r.left, e.clientY - r.top);
			return;
		}
		if (index === FLOORS && cost) {
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
		<div class="stage" class:skimming={skyline || primed || index === FLOORS} bind:clientWidth={W} bind:clientHeight={H} onpointerdown={skim} onpointermove={skim} onpointerleave={unskim} onclickcapture={holdClick}>
			{#if rug && cost && outcomeL}
				{#if reached >= FINDINGS}
					<Skyline layout={sky} total={site.papersDistinct} cited={site.citationsDistinct} rise={index === CORPUS ? scrub : index > CORPUS ? 1 : 0} {cite} visible={skyline} highlight={hot} {compact} width={W} height={H} />
				{/if}
				{#if reached >= CITED && primerL}
					<Primer layout={primerL} {primer} hot={hotBar} build={index === PAPERS ? span(0.15, 0.5) : index > PAPERS ? 1 : 0} highlight={index === TOP} visible={primed} {compact} width={W} height={H} />
				{/if}
				{#if reached >= FITS}
					<OutcomeChart layout={outcomeL} failures={site.failureTiers} visible={index === FAILURE || failDiv != null} {compact} width={W} height={H} />
				{/if}
				{#if reached >= FAIL_LAST}
					<div class="time-panel" class:visible={timed} aria-hidden="true">
						<TimeBars tiers={site.tiers} time={site.time} only={index === TIME_SCI ? 'science' : 'formulation'} title="Median time to first high-impact paper from {index === TIME_SCI ? 'start of science operations' : 'project start'}" height={H} />
					</div>
				{/if}
				{#if reached >= TOP && focusL}
					<FocusChart layout={focusL} name={focusName} largest={tallest} {grow} bars={index >= BARS} visible={focused} {compact} width={W} height={H} />
				{/if}
				<!-- the lanes draw the focus chart's bars too, so at FLOORS they move into their band -->
				{#if reached >= TOP}
					<LanesChart layout={cost} title="High-impact papers published per year, by division and mission" focus={focusL} {focused} {grow} hot={hotLane} cursor={laneCursor} visible={index === FLOORS} {compact} width={W} height={H} />
				{/if}
				{#if reached >= CITES && dollarOne}
					<DollarChart layout={dollarOne} title="Citations per {money(100)} in {dollarName}" {would} {turn} visible={plotted} {compact} width={W} height={H} />
				{/if}
				{#if reached >= FLOORS && citesL}
					<DollarChart layout={citesL} title="Citations per mission in {dollarName}" visible={index === CITES} {compact} width={W} height={H} />
				{/if}
				{#if reached >= FIT && dollarAll}
					<DollarChart layout={dollarAll} title="Citations per {money(100)} by division" visible={index === FITS} {compact} width={W} height={H} />
				{/if}
				{#if reached >= TIME_SCI}
					<ClpsChart {clps} title="Total papers published after science operations start" draw={index === CLPS ? clpsFirst : index > CLPS ? 1 : 0} drawComparators={index === CLPS_COMPARE ? clpsDraw : index > CLPS_COMPARE ? 1 : 0} visible={(index === CLPS && clpsIn) || index === CLPS_COMPARE} {compact} width={W} height={H} />
				{/if}
				<Squares {tiles} {items} {shown} interactive={false} highlightId={hot} quietId={skyNamed} loadImages={reached >= MOTIVATION} />
			{/if}
			<div class="thesis" class:visible={index === TITLE}>
				<p>Exploring the scientific productivity of NASA's science missions</p>
			</div>
			<p class="cue" class:visible={index === TITLE} aria-hidden="true">Scroll to begin</p>
		</div>
	{/snippet}

	{#snippet steps()}
		<!-- TITLE: the question alone on the stage, no text beside it -->
		<section data-step></section>
		<!-- MOTIVATION: the photo edge to edge, drifting slower than the text that scrolls over it; the
		     text pauses in the step's frame while the photo covers the screen -->
		<section data-step data-bleed class="motivation"><div><div class="step panel">
			<p><strong>NASA policy is moving to smaller, higher-risk, commercial-supported science missions.</strong></p><p>We decided to investigate: Can smaller missions produce high scientific productivity? Can they return science faster? Can they replace larger projects?</p>
		</div></div>
			<img class="photo" src={asset('img/story/blue-ghost-4.webp')} alt="" loading="lazy" decoding="async" fetchpriority="low" />
			<p class="credit meta">Blue Ghost Mission 4 (artist’s concept). Credit: Firefly Aerospace</p>
		</section>
		<!-- OVERVIEW: the squares arrive one by one -->
		<section data-step data-scrub><div class="step">
			<p>To find out, we studied the output of <strong>{int(site.missions)} NASA-led science missions</strong> launched from {site.launchYears[0]} to {site.launchYears[1]}, across all {spell(site.divisions.length)} of the agency’s science divisions.</p>
		</div></section>
		<!-- FINDINGS: the four findings in one box over a photo, before the steps that explain how they
		     were measured, so they gloss the terms they use. Each line holds only under its finding's guard;
		     the gloss of "small" stands whatever the facts, so the box never uses the word undefined. -->
		<section data-step data-bleed class="motivation findings"><div><div class="step panel">
			<p class="neptuneBlue"><strong>What we found</strong></p>
			<ol>
				{#if verdict}<li><strong>{FINDING_ONE}</strong></li>{/if}
				{#if failsMore}<li><strong>{findingTwo}</strong></li>{/if}
				{#if faster}<li><strong>{FINDING_THREE}</strong></li>{/if}
				{#if clps.comparison}<li><strong>{findingFour}</strong></li>{/if}
			</ol>
		</div></div>
			<img class="photo" src={asset('img/story/cubesats-iss.webp')} alt="" loading="lazy" decoding="async" fetchpriority="low" />
			<p class="credit meta">CubeSats deployed from the International Space Station, Feb. 3, 2026. Credit: NASA</p>
		</section>
		<!-- CORPUS: the skyline, where the explanation of how we measured begins -->
		<section data-step data-scrub><div class="step">
			<p class="neptuneBlue"><strong>What we did</strong></p>
			<p>We assembled a set of <strong>{int(site.papersDistinct)} peer-reviewed papers</strong> associated with these {int(site.missions)} science missions published over their active lifetimes.</p>
			<p>Papers published in peer-reviewed academic journals are a proxy for <span class="neptuneBlue"><strong><em>scientific productivity</em></strong></span>.</p>
		</div></section>
		<!-- CITED: the same skyline zooms out as each mission's citations grow out of its papers -->
		<section data-step data-scrub><div class="step">
			<p>When one paper builds off the work of another, it <strong>cites</strong> the original work. Citations are one measure of <span class="neptuneBlue"><strong><em>scientific impact</em></strong></span>.</p>
			<p>Together, the mission papers have been cited <strong>{int(site.citationsDistinct)} times</strong>.</p>
		</div></section>
		<!-- PAPERS: the focus division's papers by citations, grey -->
		<section data-step data-scrub><div class="step">
			{#if primer && primerMedian != null}
				<p>Science papers are not cited equally.</p>
				<p>For example, half of all {field} papers in our database accrued {spell(primerMedian)} or fewer citations in their first {spell(site.fullPolicy.citationYears + 1)} years.</p><p>The most cited paper received {int(primer.counts.length - 1)}.</p>
			{/if}
		</div></section>
		<!-- TOP: the same bars, the top 10% in blue -->
		<section data-step><div class="step">
			<p>A paper is considered <span class="neptuneBlue"><strong><em>high-impact</em></strong></span> if it has more citations than 90% of its peers.</p>
			{#if primer}<p>For example, in {field}, papers with {primer.cutoff} or more citations within their first {spell(site.fullPolicy.citationYears + 1)} years are <span class="neptuneBlue"><strong><em>high impact</em></strong></span>.</p>{/if}
		</div></section>
		<!-- ONE and BARS always render, so later steps keep their numbers; with no focus division they're blank -->
		<!-- ONE: the focus division alone on the cost axis -->
		<section data-step><div class="step">
			{#if focus && focusShares}
				<p>Midsize and larger mission classes contribute the overwhelming volume of high impact papers.</p>
				<p>On this chart, the {int(focusShares.missionsAll)} <strong>{field}</strong> missions are ordered by their cost, adjusted for inflation.</p>
			{/if}
		</div></section>
		<!-- BARS: each mission's top-10% papers a year -->
		<section data-step data-scrub><div class="step">
			{#if focus && focusShares && rate}
				<p>Each bar is a mission’s average yearly output of high impact papers, counting every paper from the start of its prime mission through {rate.through}.</p>{#if tallest}<p>{tallest.name} produced the most: about {weight(tallest.perYear)} <strong>top-10% papers</strong> a year.</p>{/if}
			{/if}
		</div></section>
		<!-- FLOORS: the same yearly rate for every compared division, a band each on the lanes' cost axis -->
		<section data-step><div class="step">
			{#if rateRows.length > 1}
				{#if leadsLarger}<p>Larger missions <strong>generate more high impact papers per year </strong> in every science division.</p>{/if}
				{#if smallMostlyNone}<p>Most small missions in each division produced no top-10% papers at all.</p>{/if}
			{/if}
		</div></section>
		<!-- CITES: DOLLAR_DIVISION's missions by cost and by the citations they drew, before per dollar -->
		<section data-step><div class="step">
			{#if citesL}
				<p>Here each {dollarField} mission is placed by its cost and by how often its papers were cited.</p>
				{#if citesTimes}<p><strong>Costlier missions drew more citations:</strong> a mission that cost 10 times as much drew about {citesTimes} as many.</p>{/if}
				<p>They cost more, too. To compare what each dollar bought, we divide each mission’s citations by its cost: <strong>citations per dollar</strong>.</p>
			{/if}
		</div></section>
		<!-- SCATTER, DOWN, FLAT and FIT always render, so later steps keep their numbers; with no DOLLAR_DIVISION fit they're blank -->
		<!-- SCATTER: DOLLAR_DIVISION, each mission by cost and by citations per dollar -->
		<section data-step><div class="step">
			{#if dollarFit}
				<p>Here, each {dollarField} mission is placed by its cost and by the citations it drew for every {moneyWords(100)}.</p>
			{/if}
		</div></section>
		<!-- DOWN: the line the missions would follow if small ones got more for their money -->
		<section data-step><div class="step">
			{#if dollarFit}
				<p>If small missions had greater productivity for their money, the trend line would slope downward.</p>
			{/if}
		</div></section>
		<!-- FLAT: the same line swings flat, for missions that got the same per dollar whatever their size -->
		<section data-step data-scrub><div class="step">
			{#if dollarFit}
				<p>If size made no difference, the line would be flat: overall citations per dollar would be the same.</p>
			{/if}
		</div></section>
		<!-- FIT: the best fit takes the flat line's place and swings up off it -->
		<section data-step data-scrub><div class="step">
			{#if dollarFit}
				<p>The best-fit line through the {spell(dollarFit.missions)} {dollarField} missions with citations is <strong class="neptuneBlue">{direction(dollarFit)}</strong>.{#if firm(dollarFit)}{' '}More expensive missions, on average, resulted in more citations per dollar.{/if}</p>
			{/if}
		</div></section>
		<!-- FITS: every compared division's missions and best fit, one band each -->
		<section data-step><div class="step">
			<p>The overall trendlines show a modestly positive relationship between cost and citations per dollar across all four major divisions.</p>
		</div></section>
		<!-- FAILURE: every division's missions by cost tier, up if they met their goals, down if they failed or fell short -->
		<section data-step><div class="step">
			{#if failure.higher === 'under'}<p>Cheaper missions fail more often than more expensive ones.</p>{/if}
			<p>Of the {int(failure.under.missions)} costing {moneyWords(story.referenceCost)} or less, {int(failure.under.failed)} (about {whole(failure.under.rate)}) failed or fell short of their goals. More expensive missions failed {spell(failure.over.failed)} times (about {whole(failure.over.rate)}).</p>
			<p>Failure rates vary across NASA's science divisions.</p>
		</div></section>
		<!-- FAIL_BY…: the same chart, one division's squares washed per step -->
		{#each failByDivision as f (f.slug)}
			<section data-step><div class="step">
				<p>{f.all.short ? upperFirst(spell(f.all.short)) : 'None'} out of {spell(f.all.missions)} <strong class="neptuneBlue">{f.name}</strong> missions failed or fell short of {f.all.short === 1 ? 'its' : 'their'} goals.</p>
				{#if f.note}<p><strong>Below {edgeWords(FAIL_NOTE.edge)}, {f.name}</strong> {f.below.short} out of {spell(f.below.missions)} failed.</p>{/if}
			</div></section>
		{/each}
		<!-- TIME_FORM: years to a first top-10% paper, counted from the start of formulation -->
		<section data-step><div class="step">
			<p><span class="neptuneBlue"><strong>Time-to-science</strong></span></p>
			{#if shortest}<p>Measured from the start of project formulation to the publication date of the first high-impact paper, missions of {tierWords(site.tiers[shortest.index])} returned high-impact science in a median duration of {years(shortest.median)} years{#if shortest.close}, with missions of {tierWords(site.tiers[shortest.close.index])} close behind at {years(shortest.close.median)}{/if}.</p>{/if}
		</div></section>
		<!-- TIME_SCI: the same tiers, counted from the start of science operations -->
		<section data-step><div class="step">
			{#if faster}<p><strong>{FINDING_THREE}</strong></p>{/if}
			{#if endsRanked}<p>Counted from the start of science operations, missions of {tierWords(site.tiers.at(-1))} took a median of {years(timeLast.science.median)} years to a first top-10% paper, against {years(timeFirst.science.median)} for missions of {tierWords(site.tiers[0])}.</p>{/if}	
		</div></section>
		<!-- CLPS -->
		<section data-step data-scrub><div class="step">
			<p>NASA's <strong>Commercial Lunar Payload Services</strong> program purchases space on commercial lunar landers for science instruments.</p>
			{#if clps.comparison}<p>The first mission launched in {clps.start.slice(0, 4)}, too recent to evaluate scientific impact through citations. So instead, we looked at scientific productivity.</p><p>In the {clps.comparison.month} months since the first attempt, <strong>{int(clps.comparison.clps)} peer-reviewed papers</strong> were published.</p>{/if}
		</div></section>
		<!-- CLPS_COMPARE -->
		<section data-step data-scrub><div class="step">
			{#if clpsCompared.length}
				{#if clps.comparison.behindAll}<p>For comparison, <strong>{upperFirst(spell(clpsCompared.length))} previous NASA science missions to the Moon and Mars resulted in more publications by this same point.</strong></p>{:else}<p>Compare {spell(clpsCompared.length)} earlier NASA missions to the Moon and Mars.</p>{/if}
				<p>So far, CLPS mission science productivity is falling short of prior science missions.</p>
			{/if}
		</div></section>
		<!-- CLOSE: every mission back in the launch grid, the concession, then the first finding's evidence, per dollar first -->
		<section data-step><div class="step">
			<p>Small missions are still worth flying. They train scientists and engineers, prove new technology, and give more teams a way into space.</p>
			{#if lower > 0}
				<p>{#if dollarOver.length}But larger missions drew more citations per dollar in {dollarOver.length === byDivision.length ? `all ${spell(byDivision.length)}` : `${spell(dollarOver.length)} of the ${spell(byDivision.length)}`} divisions we compared{:else}But larger missions produced more top-10% papers per mission in {everyLower ? `all ${spell(byDivision.length)}` : `${spell(lower)} of the ${spell(byDivision.length)}`} divisions we compared{/if}{#if failure.higher === 'under'}, and small missions failed more often{/if}.</p>
			{/if}
			<p class="aside">None of this says what a mission should cost. See <a href={methodsHref()}>how we measured it</a> and each division’s record below.</p>
		</div></section>
	{/snippet}
</Scroller>

<style>
	/* the stage is the graphic's whole height: no caption under it, so every chart gets the room */
	.stage { position: relative; height: 100%; width: 100%; }
	/* a sideways finger skims the columns; an upward one still scrolls the page */
	.stage.skimming { touch-action: pan-y; }
	/* Phones: the box's --panel fill drops Neptune emphasis to 4.2:1; a quarter of --neptune-mid lifts it past 5:1 */
	@media (max-width: 860px) {
		section:not([data-bleed]) > .step :global(.neptuneBlue) { color: color-mix(in srgb, var(--neptune) 75%, var(--neptune-mid)); }
	}
	/* TIME_FORM/TIME_SCI: the Analysis page's time bars, centred on the stage */
	.time-panel { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; opacity: 0; transition: opacity 400ms linear; pointer-events: none; }
	.time-panel.visible { opacity: 1; }
	.thesis { position: absolute; inset: 0; z-index: 2; display: flex; flex-direction: column; justify-content: center; margin: 0; font-weight: 300; font-size: clamp(34px, 5.4vw, 76px); line-height: 1.08; letter-spacing: -0.04em; text-shadow: 0 0 24px var(--black), 0 0 8px var(--black); opacity: 0; transition: opacity 400ms linear; pointer-events: none; }
	.thesis.visible { opacity: 1; }
	.cue { position: absolute; left: 0; bottom: 8px; z-index: 2; margin: 0; font-size: 14px; color: var(--dust); opacity: 0; transition: opacity 400ms linear; pointer-events: none; }
	.cue.visible { opacity: 1; }
	.cue::after { content: ''; display: block; width: 1px; height: 28px; margin-top: 8px; background: var(--dust); }
	/* MOTIVATION: the photo overhangs its band by 13% each way and drifts through that overhang
	   as the band crosses the screen, so it moves a little slower than the text */
	.motivation { position: relative; isolation: isolate; overflow: clip; }
	.photo { position: absolute; top: -13%; left: 0; z-index: -1; width: 100%; height: 126%; object-fit: cover; }
	@media (prefers-reduced-motion: no-preference) {
		@supports (animation-timeline: view()) {
			.photo { animation: drift linear both; animation-timeline: view(); }
		}
	}
	@keyframes drift { from { transform: translateY(-10%); } to { transform: translateY(10%); } }
	.motivation .panel { text-align: center; }
	.panel { max-width: 34em; padding: clamp(24px, 3vw, 40px); background: color-mix(in srgb, var(--shadow) 85%, transparent); color: var(--white); }
	/* FINDINGS: the box centred like MOTIVATION's, and the photo shifted so its CubeSats show around it */
	.findings .photo { object-position: 65% 50%; }
	.findings ol { margin: 0.6em 0 0; padding-left: 1.1em; }
	.findings li + li { margin-top: 1em; }
	.findings li::marker { color: var(--neptune-mid); font-weight: 500; }
	/* the credit sits bottom right on a fade to black, which keeps it legible over the bright ground */
	.credit { position: absolute; left: 0; right: 0; bottom: 0; padding: 40px var(--gutter) 16px; text-align: right; color: var(--dust); background: linear-gradient(transparent, rgb(0 0 0 / 0.8) 70%); }
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
