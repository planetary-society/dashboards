<script>
	// The overview as a scroll: a title, then one argument over one stage of mission squares. The
	// missions, the papers they produced, the citations those drew and what a highly cited paper is; then the $150 million
	// line, failures either side of it, one division's running total built up a step at a time,
	// every compared division at once, per dollar, which missions ever had a top paper, CLPS and the close. Pairs of
	// steps share a graphic state (PAPERS/TOP, SPLIT/FAILURE, ALL/DOLLAR), so long text is split
	// across them. Every figure in the copy comes from site.story (the
	// packager) or site itself; the component only lays out.
	import Scroller from './Scroller.svelte';
	import Squares from './Squares.svelte';
	import Skyline from './Skyline.svelte';
	import SplitLabels from './SplitLabels.svelte';
	import Primer from './Primer.svelte';
	import FocusChart from './FocusChart.svelte';
	import LanesChart from './LanesChart.svelte';
	import ClpsChart from './ClpsChart.svelte';
	import KindBars from './KindBars.svelte';
	import KindExample from './KindExample.svelte';
	import { gridLayout, rugLayout, skylineLayout, skylineHit, splitLayout, focusLayout, costLayout, kindsLayout, exampleLayout } from './layouts.js';
	import { exampleItems, failureItems, firstTopItems, kindsItems, withHidden } from './items.js';
	import { apDate, int, listify, longDate, money, moneyWords, pct, plural, spell, upperFirst } from '$lib/format.js';
	import { fullWindowLabel } from '$lib/copy/window.js';
	import { allSmall, carrier, loneFlip } from '$lib/copy/discussion.js';
	import { asset, methodsHref } from '$lib/paths.js';

	let { site, scrolly } = $props();
	const TITLE = 0, MOTIVATION = 1, OVERVIEW = 2, CORPUS = 3, CITED = 4, PAPERS = 5, TOP = 6, SPLIT = 7, FAILURE = 8, REACHED = 9, ONE = 10, BARS = 11, RUNNING = 12, ALL = 13, DOLLAR = 14;
	// The paper-kinds run (KINDS…CITATIONS) is hidden for now: its sections stay out of the page and its
	// indices match no step. Set SHOW_KINDS to bring the four steps back between DOLLAR and CLPS.
	const SHOW_KINDS = false;
	const [KINDS, KINDS_ALL, EXAMPLE, CITATIONS] = SHOW_KINDS ? [15, 16, 17, 18] : [-1, -1, -1, -1];
	const CLPS = SHOW_KINDS ? 19 : 15, CLPS_COMPARE = CLPS + 1, CLOSE = CLPS + 2;
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
	const comparison = $derived(story.comparison);
	// The gap "holds" in a division only where both sides are measured and the smaller missions' side is lower.
	const byDivision = $derived(comparison.byDivision ?? []);
	const lower = $derived(byDivision.filter((d) => d.under.top10PerMission != null && d.over.top10PerMission != null && d.under.top10PerMission < d.over.top10PerMission).length);
	const everyLower = $derived(byDivision.length > 0 && lower === byDivision.length);
	// The divisions the cross-division figures cover. The others fade out when those come up.
	const compared = $derived(new Set(comparison.divisions));
	const rankable = $derived(site.divisions.filter((d) => compared.has(d.slug)));
	const unranked = $derived(site.divisions.filter((d) => !compared.has(d.slug)));
	// why they're out, as Methods says it: only when every one of a division's missions is small
	const unrankedWhy = $derived(unranked.every((d) => story.divisions.some((r) => r.division === d.slug && allSmall(r))) ? `${unranked.length === 1 ? 'has' : 'have'} no missions over ${money(reference)}` : `${unranked.length === 1 ? 'is' : 'are'} not compared`);
	// TPS style in running prose: "$150 million"; chart labels keep the short "$150M".
	const line = $derived(moneyWords(reference));

	// The walk-through division: its primer, then its running total built up over three steps.
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
	const focusTotal = $derived(focus ? focus.under.top10 + focus.over.top10 : 0);
	const tallest = $derived(focus?.over.largest && (!focus.under.largest || focus.over.largest.top10 >= focus.under.largest.top10) ? focus.over.largest : null);

	// The compared divisions' small sides: their shares of missions, spending and top papers.
	const shares = $derived(story.divisions.filter((d) => compared.has(d.division)));
	// failure rates in whole percents: 8 of 95 is "about 8%", not 8.4%
	const whole = (v) => (v == null ? '—' : `${Math.round(v * 100)}%`);
	const missionRange = $derived([Math.min(...shares.map((d) => d.missionShare)), Math.max(...shares.map((d) => d.missionShare))]);
	const underOne = $derived(shares.filter((d) => d.share != null && d.share < 0.01));
	const overOne = $derived(shares.filter((d) => d.share != null && d.share >= 0.01).map((d) => ({ ...d, largest: carrier(byDivision.find((b) => b.division === d.division)?.under) })));
	const laneNotes = $derived(Object.fromEntries(shares.map((d) => [d.division, { missions: `${pct(d.missionShare)} of missions`, top: `${pct(d.share)} of top-10% papers`, cited: `${pct(d.citationShare)} of citations`, cost: `${pct(d.costShare)} of spending` }])));

	// Per dollar, in citations per $100M, as the chart draws it: a side drew "more" only where the
	// packaged ordering survives dropping any one mission. A gap under a quarter is "small".
	const dollarOver = $derived(story.perDollar.filter((d) => d.favors === 'over'));
	const dollarUnder = $derived(story.perDollar.filter((d) => d.favors === 'under'));
	const dollarClose = $derived(story.perDollar.filter((d) => !d.favors));
	const dollarNear = $derived(dollarOver.filter((d) => d.margin != null && d.margin < 0.25));
	// a close division whose small side leads only because of its own largest mission
	const closeLone = $derived(dollarClose.filter(loneFlip));
	const closeRest = $derived(dollarClose.filter((d) => !loneFlip(d)));
	// the close's headline needs both readings: fewer top-10% papers per mission everywhere, fewer citations per dollar in most
	const verdict = $derived(everyLower && dollarOver.length * 2 > byDivision.length);

	// Whether a mission ever produced a top-10% paper, either side of the line: the comparison's own
	// groups (withTop), with failures counted apart so a lost mission is not counted twice.
	const first = $derived(Object.fromEntries(comparison.groups.map((g) => [g.key, { missions: g.missions, reached: g.withTop, never: g.missions - g.withTop, lost: g.failed }])));
	const worked = (s) => s.missions - s.lost;

	// CLPS: what the landers cost together, and the ones that began work a year or more after the first launch.
	const clpsCost = $derived(clps.missions.every((p) => p.cost != null) ? clps.missions.reduce((t, p) => t + p.cost, 0) : null);
	const clpsLate = $derived(clps.missions.filter((p) => Date.parse(p.primeStart) - Date.parse(clps.start) > 365 * 864e5));
	const clpsCompared = $derived((clps.comparison?.comparators ?? []).map((c) => ({ ...c, cost: clps.comparators.find((k) => k.id === c.id)?.cost ?? null })));

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

	// The icon arrays: outright failures first, then partial outcomes, each in launch order, so the
	// marks the failure step adds sit together at the head of each block. The REACHED step reorders
	// the compared divisions' missions: those with a top-10% paper first, failures last.
	const outcome = (t) => (t.failed ? 0 : t.shortfall ? 1 : 2);
	const under = (t) => t.size === 'under';
	const over = (t) => t.size === 'over';
	const splitGroups = $derived([under, over].map((side, i) => ({ key: i ? 'over' : 'under', ids: tiles.filter(side).sort((a, b) => outcome(a) - outcome(b)).map((t) => t.id) })));
	const reachedFirst = (t) => (t.first[scope].state === 'reached' ? 0 : t.failed ? 2 : 1);
	const timeGroups = $derived([under, over].map((side, i) => ({ key: i ? 'over' : 'under', ids: tiles.filter((t) => compared.has(t.division) && side(t)).sort((a, b) => reachedFirst(a) - reachedFirst(b)).map((t) => t.id) })));

	let index = $state(0);
	let progress = $state(0);
	let W = $state(0);
	let H = $state(0);
	const compact = $derived(W > 0 && W < 600);
	const ready = $derived(W > 0 && H > 0);
	const grid = $derived(ready ? gridLayout(tiles, W, H) : null);
	const rug = $derived(ready ? rugLayout(tiles, W, H, site.launchYears) : null);
	const sky = $derived(rug ? skylineLayout(tiles, rug, { compact }) : null);
	const headH = $derived(compact ? 76 : 104);
	const split = $derived(ready ? splitLayout(W, H, splitGroups, { headH }) : null);
	const timeSplit = $derived(ready ? splitLayout(W, H, timeGroups, { headH }) : null);
	const focusL = $derived(ready && focus ? focusLayout(tiles, W, H, { division: focus.division }) : null);
	const cost = $derived(ready ? costLayout(tiles.filter((t) => compared.has(t.division)), W, H, { divisions: rankable }) : null);
	const kindsL = $derived(ready ? kindsLayout(kinds.missions, W, H, { compact }) : null);
	const exampleL = $derived(ready ? exampleLayout(example.id, W, H, { compact }) : null);

	// Scrubs run while a step's text holds still, between the fractions `a` and `b` of the step.
	const span = (a, b) => (reduced ? 1 : Math.max(0, Math.min(1, (progress - a) / (b - a))));
	const scrub = $derived(reduced ? 1 : Math.min(1, progress * 2.4));
	// the title and the motivation photo stand alone; the squares arrive one by one with the overview, then stay
	const shown = $derived(index <= MOTIVATION ? 0 : index === OVERVIEW ? Math.ceil(scrub * tiles.length) : tiles.length);
	// the skyline holds two steps: papers rise, then the chart zooms out and their citations rise
	const skyline = $derived(index === CORPUS || index === CITED);
	const zoom = $derived(index === CITED ? span(0.1, 0.35) : index > CITED ? 1 : 0);
	const cite = $derived(index === CITED ? span(0.3, 0.65) : index > CITED ? 1 : 0);
	const primed = $derived(index === PAPERS || index === TOP);
	const parted = $derived(index === SPLIT || index === FAILURE);
	const focused = $derived(index === ONE || index === BARS || index === RUNNING);
	const laned = $derived(index === ALL || index === DOLLAR);
	const grow = $derived(index === BARS ? span(0.15, 0.45) : index > BARS ? 1 : 0);
	const stack = $derived(index === RUNNING ? span(0.2, 0.5) : index > RUNNING ? 1 : 0);
	const draw = $derived(index === RUNNING ? span(0.35, 0.65) : index > RUNNING ? 1 : 0);
	const kindsShown = $derived(index === KINDS || index === KINDS_ALL || index === CITATIONS);
	const items = $derived.by(() => {
		if (!grid) return new Map();
		if (index <= OVERVIEW || index >= CLOSE) return solid(grid.pos);
		if (skyline) return withHidden(solid(rug.pos), tiles, grid.pos);
		if (primed) return withHidden(new Map(), tiles, rug.pos);
		if (index === SPLIT) return withHidden(solid(split.pos), tiles, rug.pos);
		if (index === FAILURE) return withHidden(failureItems(tiles, split), tiles, rug.pos);
		if (index === REACHED) return withHidden(firstTopItems(tiles, timeSplit, scope), tiles, split.pos);
		if (focused && focusL) return withHidden(failureItems(tiles, focusL), tiles, timeSplit.pos);
		if (laned) return withHidden(solid(cost.pos), tiles, split.pos);
		if (kindsShown) return withHidden(kindsItems(tiles, kindsL), tiles, cost.pos);
		if (index === EXAMPLE) return withHidden(exampleItems(tiles, exampleL), tiles, kindsL.pos);
		return withHidden(new Map(), tiles, cost.pos);
	});
	// each block's head: the figure, what it counts, then which side of the line the block is
	const sides = $derived([`at ${money(reference)} or less`, `over ${money(reference)}`]);
	const splitHeads = $derived(
		[failure.under, failure.over].map((s, i) =>
			index === FAILURE ? { figure: `${int(s.failed)} of ${int(s.missions)}`, label: 'failed or fell short', side: sides[i] } : { figure: int(s.missions), label: 'missions', side: sides[i] }
		)
	);
	const timeHeads = $derived([first.under, first.over].map((s, i) => ({ figure: `${int(s.reached)} of ${int(s.missions)}`, label: 'had a top-10% paper', side: sides[i] })));
	// the lines draw while the reader scrolls, not inside the 400 ms fade-in
	const clpsDraw = $derived(reduced ? 1 : Math.max(0, Math.min(1, (progress - 0.1) / 0.6)));
	// the CLPS step: its text settles first (about a third of the way through the step), then the
	// chart fades in and the CLPS line draws
	const clpsIn = $derived(reduced || index > CLPS || progress >= 0.3);
	const clpsFirst = $derived(reduced ? 1 : Math.max(0, Math.min(1, (progress - 0.35) / 0.45)));

	// The skyline step: pointing at a square or skimming the columns lights up that mission in both.
	// A touch keeps its highlight after the finger lifts; a mouse clears it on leaving the stage.
	// A first tap on a square only highlights it; tapping it again opens its page, as a click does.
	let pointed = $state(null);
	let follow = true;
	const hot = $derived(skyline ? pointed : null);
	// the skyline names a mission with a column, so its square's own tip stays off
	const skyNamed = $derived(hot && sky?.columns.some((c) => c.id === hot) ? hot : null);
	function skim(e) {
		if (!skyline || !sky) return;
		const id = e.target.closest?.('[data-id]')?.dataset.id;
		if (e.type === 'pointerdown') follow = e.pointerType === 'mouse' || (id != null && id === pointed);
		const r = e.currentTarget.getBoundingClientRect();
		pointed = id ?? skylineHit(sky, e.clientX - r.left, e.clientY - r.top);
	}
	const holdClick = (e) => {
		if (skyline && !follow) e.preventDefault();
	};
	const unskim = (e) => {
		if (e.pointerType === 'mouse') pointed = null;
	};
</script>

<Scroller bind:index bind:progress>
	{#snippet graphic()}
		<div class="frame">
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div class="stage" class:skimming={skyline} bind:clientWidth={W} bind:clientHeight={H} onpointerdown={skim} onpointermove={skim} onpointerleave={unskim} onclickcapture={holdClick}>
				{#if rug && cost && split}
					<Skyline layout={sky} total={site.papersDistinct} cited={site.citationsDistinct} rise={index === CORPUS ? scrub : index > CORPUS ? 1 : 0} {zoom} {cite} visible={skyline} highlight={hot} {compact} width={W} height={H} />
					{#if primer}
						<Primer {primer} years={site.fullPolicy.citationYears + 1} build={index === PAPERS ? span(0.15, 0.5) : index > PAPERS ? 1 : 0} highlight={index === TOP} visible={primed} {compact} width={W} height={H} />
					{/if}
					<SplitLabels layout={split} heads={splitHeads} visible={parted} {compact} />
					{#if focusL}
						<FocusChart layout={focusL} referenceCost={reference} largest={tallest} small={index === BARS && focusShares ? `${upperFirst(spell(focusShares.missions))} small missions: ${int(focus.under.top10)} papers` : ''} total={`${int(focusTotal)} top-10% papers`} {grow} {stack} {draw} bars={index >= BARS} visible={focused} {compact} width={W} height={H} />
					{/if}
					<LanesChart layout={cost} {scope} referenceCost={reference} notes={laneNotes} spending={index === DOLLAR} visible={laned} {compact} width={W} height={H} />
					<SplitLabels layout={timeSplit} heads={timeHeads} visible={index === REACHED} {compact} />
					<KindBars layout={kindsL} {kinds} mode={index === CITATIONS ? 'citations' : 'papers'} visible={kindsShown} {compact} />
					<KindExample layout={exampleL} {example} {kinds} visible={index === EXAMPLE} {compact} />
					<ClpsChart {clps} draw={index === CLPS ? clpsFirst : index > CLPS ? 1 : 0} drawComparators={index === CLPS_COMPARE ? clpsDraw : index > CLPS_COMPARE ? 1 : 0} visible={(index === CLPS && clpsIn) || index === CLPS_COMPARE} {compact} width={W} height={H} />
					<Squares {tiles} {items} {shown} interactive={false} highlightId={hot} quietId={skyNamed} />
				{/if}
				<div class="thesis" class:visible={index === TITLE}>
					<p>Can small missions replace NASA’s larger science missions?</p>
					<p class="byline">A Planetary Society analysis of {int(site.missions)} NASA science missions. Data as of {apDate(site.asOf)}.</p>
				</div>
				<p class="cue" class:visible={index === TITLE} aria-hidden="true">Scroll to begin</p>
			</div>
			<div class="caption meta">
				{#if index === OVERVIEW}
					Each square is a mission, in launch order.
				{:else if index === CORPUS || (index === CITED && !cite)}
					Each column is one mission’s papers to date, rising from its launch year (square-root scale). {compact ? 'Touch' : 'Point at'} a column to see its name.
				{:else if index === CITED}
					Each column is now one mission’s citations to date, with its papers in darker blue on the same square-root scale.
				{:else if primed && primer}
					{focusName} papers published while its missions operated or up to {spell(site.fullPolicy.postEndYears)} years after, by citations in each paper’s first {spell(site.fullPolicy.citationYears + 1)} years. Papers with {int(primer?.counts.length)} or more share the last bar.
				{:else if index === SPLIT}
					Each square is a mission, grouped by inflation-adjusted cost in {site.costBaseYear} dollars.
				{:else if index === FAILURE}
					<i class="swatch mark-lost"></i>Failure <i class="swatch mark-partial"></i>Partial failure or partial success
				{:else if index === ONE && focus}
					{focusName} missions by inflation-adjusted cost. Each gridline is 10 times the one before. <i class="swatch mark-lost"></i>Failure
				{:else if index === BARS && focus}
					Each bar is one mission’s top-10% papers. A paper shared by two missions counts half for each.
				{:else if index === RUNNING && focus}
					Running total of the division’s top-10% papers, cheapest missions first.
				{:else if index === ALL}
					Each line adds up a division’s top-10% papers, cheapest missions first.
				{:else if index === DOLLAR}
					<span class="key"></span>Running share of all citations <span class="key spend"></span>Running share of spending
				{:else if index === KINDS || index === KINDS_ALL}
					Missions at {money(reference)} or less with publications in their {fullWindowLabel}, most first. Bars: each mission’s publications by kind.
				{:else if index === EXAMPLE}
					All {spell(exL.papers)} of {example.name}’s publications to date, most cited first; {spell(example.papers)} {plural(example.papers, 'falls', 'fall')} in its {fullWindowLabel}. {#if exResults > 0}Highlighted: its science {plural(exResults, 'result')}.{/if}
				{:else if index === CITATIONS}
					The same missions. Bars: each mission’s citations by kind, {fullWindowLabel}.
				{:else if index === REACHED}
					{#if unranked.length}Leaves out {listify(unranked.map((d) => d.name))}, which {unrankedWhy}.{/if} <i class="swatch mark-reached"></i>Had a top-10% paper <i class="swatch mark-outline"></i>None <i class="swatch mark-lost"></i>Failure
				{:else if index === CLPS && clpsIn}
					Peer-reviewed papers from CLPS landers, running total by month since {longDate(clps.start.slice(0, 7))}.
				{:else if index === CLPS_COMPARE}
					Peer-reviewed papers, running total by month. CLPS counts from {longDate(clps.start.slice(0, 7))}, the others from the start of their prime missions.
				{:else if index >= CLOSE}
					All {int(site.missions)} missions, in launch order. {compact ? 'Tap a square to open its mission page.' : 'Hover over a square for its name; click to open its page.'}
				{:else}&nbsp;{/if}
			</div>
		</div>
	{/snippet}

	{#snippet steps()}
		<!-- TITLE: the question alone on the stage, no text beside it -->
		<section data-step></section>
		<!-- MOTIVATION: the photo edge to edge, drifting slower than the text that scrolls over it -->
		<section data-step data-bleed class="motivation"><div class="step panel">
			<p>The White House’s 2027 budget request would cut NASA science by 46% and end 53 missions. Mars Sample Return, VERITAS, and the Geospace Dynamics Constellation have been canceled or delayed indefinitely.</p>
			<p><strong>NASA is shifting toward smaller, higher-risk spacecraft.</strong> We looked at whether they can make up for the science of larger missions.</p>
		</div>
			<img class="photo" src={asset('img/story/blue-ghost-4.webp')} alt="" decoding="async" fetchpriority="low" />
			<p class="credit meta">Blue Ghost Mission 4 (artist’s concept). Credit: Firefly Aerospace</p>
		</section>
		<!-- OVERVIEW: the squares arrive one by one -->
		<section data-step data-scrub><div class="step">
			<p>We studied <strong>{int(site.missions)} NASA-led science missions</strong> launched from {site.launchYears[0]} to {site.launchYears[1]}, across all {spell(site.divisions.length)} of the agency’s science divisions.</p>
		</div></section>
		<!-- CORPUS: the skyline -->
		<section data-step data-scrub><div class="step">
			<p>We found <strong>{int(site.papersDistinct)} peer-reviewed papers</strong> associated with these missions over their active lifetimes.</p>
			<p>A peer-reviewed paper is a proxy for <strong>scientific productivity</strong>.</p>
		</div></section>
		<!-- CITED: the same skyline zooms out, and each mission's citations rise behind its papers -->
		<section data-step data-scrub><div class="step">
			<p>Other scientists build on those papers. When one paper references another, it <strong>cites</strong> it.</p>
			<p>Together, these papers have been cited <strong>{int(site.citationsDistinct)} times</strong>. Citations are a measure of <strong>scientific impact</strong>.</p>
		</div></section>
		<!-- PAPERS: the focus division's papers by citations, grey -->
		<section data-step data-scrub><div class="step">
			{#if primer && primerMedian != null}
				<p>Citations pile up unevenly. Take {field}: half of its {int(primer.papers)} papers drew {spell(primerMedian)} or fewer citations in their first {spell(site.fullPolicy.citationYears + 1)} years, and {int(primer.overflow)} drew {primer.counts.length} or more.</p>
				<p>Those few, heavily cited papers are the ones other scientists build on most: the <strong>high-impact</strong> papers.</p>
				<p class="aside">Counting only those first years keeps older papers from looking more impactful just for having had longer to collect citations.</p>
			{/if}
		</div></section>
		<!-- TOP: the same bars, the top 10% in blue -->
		<section data-step><div class="step">
			<p>We measure a mission’s science by its <strong>top-10% papers</strong>, the 10% most cited in its division. Fields cite at different rates, so each paper is ranked only within its own division.</p>
			{#if primer}<p>In {field}, the cutoff is about {primer.cutoff} citations.</p>{/if}
			<p class="aside">Citations show how much other scientists used a result, not a mission’s full value. <a href={methodsHref('citations')}>What citations miss</a></p>
		</div></section>
		<!-- SPLIT: two icon arrays either side of the line -->
		<section data-step><div class="step">
			<p>We call a mission <strong>small</strong> if it cost {line} or less, adjusted for inflation to {site.costBaseYear} dollars. Of the {int(threshold.total)} missions, {int(threshold.missions)} are small{#if threshold.costMedian != null}, and half of those cost less than {moneyWords(threshold.costMedian)}{/if}.</p>
			<p class="aside">The line is our choice, not NASA’s. <a href={methodsHref('threshold')}>Why {line}</a></p>
		</div></section>
		<!-- FAILURE: the same arrays, failures marked -->
		<section data-step><div class="step">
			{#if failure.higher === 'under'}<p><strong>Small missions fail more often.</strong></p>{/if}
			<p>Of the {int(failure.under.missions)} small missions, {int(failure.under.failed)} (about {whole(failure.under.rate)}) failed or fell short of their goals. Of the {int(failure.over.missions)} larger missions, {spell(failure.over.failed)} (about {whole(failure.over.rate)}) did.</p>
			{#if failure.under.lostCostMax != null}<p>{failure.under.lost === 1 ? `The one outright failure cost ${moneyWords(failure.under.lostCostMax)}` : `All ${spell(failure.under.lost)} outright failures cost ${moneyWords(failure.under.lostCostMax)} or less`}. We count a failed mission as producing no science.</p>{/if}
		</div></section>
		<!-- REACHED: the compared divisions' arrays, by whether a mission ever had a top-10% paper -->
		<section data-step><div class="step">
			{#if first.under.never * 2 > first.under.missions}<p><strong>Most small missions produced no top-10% paper.</strong></p>{/if}
			<p>Of the {int(worked(first.under))} small missions that worked, {int(first.under.reached)} had a top-10% paper, compared with {first.over.reached === worked(first.over) ? `all ${int(worked(first.over))}` : `${int(first.over.reached)} of the ${int(worked(first.over))}`} larger ones.</p>
		</div></section>
		<!-- ONE, BARS and RUNNING always render, so later steps keep their numbers; with no focus division they're blank -->
		<!-- ONE: the focus division alone on the cost axis -->
		<section data-step><div class="step">
			{#if focus && focusShares}
				<p>Back to <strong>{field}</strong>, now with each of its {int(focusShares.missionsAll)} missions placed by cost. The {spell(focusShares.missions)} left of the line are small.</p>
			{/if}
		</div></section>
		<!-- BARS: each mission's top-10% papers -->
		<section data-step data-scrub><div class="step">
			{#if focus && focusShares}
				<p>{#if tallest}{tallest.name} alone produced {int(tallest.top10)} <strong>top-10% papers</strong>. The {spell(focusShares.missions)} small missions produced about {spell(Math.round(focus.under.top10))} between them.{:else}The {spell(focusShares.missions)} small missions produced about {spell(Math.round(focus.under.top10))} <strong>top-10% papers</strong> between them.{/if}</p>
			{/if}
		</div></section>
		<!-- RUNNING: the bars stack into the running total -->
		<section data-step data-scrub><div class="step">
			{#if focus && focusShares}
				<p>Stacked from cheapest to costliest, the bars add up to a <strong>running total</strong> of the division’s {int(focusTotal)} top-10% papers.</p>
				{#if focusShares.share != null}<p>The {spell(focusShares.missions)} small missions make up {pct(focusShares.missionShare)} of its missions{focusShares.share < focusShares.missionShare ? ' but' : ' and'} account for <strong>{pct(focusShares.share)}</strong> of those papers.</p>{/if}
			{/if}
		</div></section>
		<!-- ALL: every compared division's running share -->
		<section data-step><div class="step">
			<p>Small missions make up {pct(missionRange[0])} to {pct(missionRange[1])} of each division’s missions{#if underOne.length}{' '}but produced less than 1% of the top-10% papers in {listify(underOne.map((d) => d.name))}{/if}.</p>
			{#each overOne as d (d.division)}
				<p>In {d.name}, they produced {pct(d.share)} of the top-10% papers{#if d.largest}, and {d.largest.name} alone produced {pct(d.largest.share)} of that share{/if}.</p>
			{/each}
		</div></section>
		<!-- DOLLAR: the same lanes, now every citation against spending -->
		<section data-step><div class="step">
			<p>Small missions cost far less, so the fairer test is per dollar.{#if dollarOver.length}{' '}Counting every citation, <strong>larger missions drew more per dollar</strong> in {listify(dollarOver.map((d) => d.name))}, even with any one mission left out{#if dollarNear.length}; in {listify(dollarNear.map((d) => d.name))}, the gap is small{/if}.{/if}{#if dollarUnder.length}{' '}Small missions drew more per dollar in {listify(dollarUnder.map((d) => d.name))}.{/if}</p>
			{#each closeLone as d (d.division)}
				<p>In {d.name}, small missions lead only because of {loneFlip(d).name}; without it, larger missions do.</p>
			{/each}
			{#if closeRest.length}<p>In {listify(closeRest.map((d) => d.name))}, neither side clearly leads.</p>{/if}
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
		<section data-step data-scrub><div class="step">
			<p>Through <strong>CLPS, the Commercial Lunar Payload Services program</strong>, NASA buys rides for its instruments on commercial Moon landers instead of building its own.</p>
			{#if clps.comparison}<p>The first launched in {clps.start.slice(0, 4)}, too recently for citations, so we counted papers. In {clps.comparison.month} months, {landers === clps.missions.length ? spell(landers) : `the ${spell(landers)}`} landers{landers === clps.missions.length ? '' : ' with published papers'} have produced <strong>{int(clps.comparison.clps)} peer-reviewed papers</strong>{#if clpsCost != null && landers === clps.missions.length}, at a combined cost of {moneyWords(clpsCost)}{/if}.</p>{/if}
		</div></section>
		<!-- CLPS_COMPARE -->
		<section data-step data-scrub><div class="step">
			{#if clpsCompared.length}
				{#if clps.comparison.behindAll}<p><strong>{upperFirst(spell(clpsCompared.length))} earlier NASA missions to the Moon and Mars each had more papers on {clpsCompared.length === 1 ? 'its' : 'their'} own than all {spell(landers)} landers combined.</strong></p>{:else}<p>Compare {spell(clpsCompared.length)} earlier NASA missions to the Moon and Mars.</p>{/if}
				<p>In their first {clps.comparison.month} months, {listify(clpsCompared.map((c) => `${c.name}${c.cost != null ? ` (${moneyWords(c.cost)})` : ''} had ${int(c.papers)}`))}.{#if !clps.comparison.behindAll}{' '}All {spell(landers)} CLPS landers combined are keeping pace.{/if}</p>
			{/if}
			{#if clpsLate.length}<p class="aside">{listify(clpsLate.map((p) => p.name))} began work more than a year after the first CLPS launch, so {clpsLate.length === 1 ? 'it has' : 'they’ve'} had less time to publish.</p>{/if}
		</div></section>
		<!-- CLOSE: every mission back in the launch grid, the concession and the verdict -->
		<section data-step><div class="step">
			<p>Small missions are still worth flying. They train scientists and engineers, prove new technology, and give more teams a way into space.</p>
			{#if lower > 0}
				<p>{#if verdict}<strong>But they can’t make up for the science of larger missions.</strong>{' '}{/if}{#if dollarOver.length}Larger missions drew more citations per dollar in {dollarOver.length === byDivision.length ? `all ${spell(byDivision.length)}` : `${spell(dollarOver.length)} of the ${spell(byDivision.length)}`} divisions we compared{:else}Larger missions produced more top-10% papers per mission in {everyLower ? `all ${spell(byDivision.length)}` : `${spell(lower)} of the ${spell(byDivision.length)}`} divisions we compared{/if}{#if failure.higher === 'under'}, and small missions failed more often{/if}.</p>
			{/if}
			<p class="aside">None of this says what a mission should cost. See <a href={methodsHref()}>how we measured it</a> and each division’s record below.</p>
		</div></section>
	{/snippet}
</Scroller>

<style>
	.frame { display: flex; flex-direction: column; height: 100%; }
	.stage { position: relative; flex: 1; min-height: 0; width: 100%; }
	/* a sideways finger skims the columns; an upward one still scrolls the page */
	.stage.skimming { touch-action: pan-y; }
	.caption { min-height: 28px; padding-block: 10px 4px; }
	/* legend swatches inline in the caption, drawn from the same .mark-* classes as the squares */
	.caption :global(.swatch) { display: inline-block; width: 11px; height: 11px; margin: 0 5px -1px 10px; }
	.caption :global(.swatch:first-child) { margin-left: 0; }
	.key { display: inline-block; width: 18px; margin: 0 5px 4px 10px; border-top: 2px solid var(--neptune); }
	.key:first-child { margin-left: 0; }
	.key.spend { border-top: 1px dashed var(--dust); }
	.thesis { position: absolute; inset: 0; z-index: 2; display: flex; flex-direction: column; justify-content: center; margin: 0; font-weight: 300; font-size: clamp(34px, 5.4vw, 76px); line-height: 1.08; letter-spacing: -0.04em; text-shadow: 0 0 24px var(--black), 0 0 8px var(--black); opacity: 0; transition: opacity 400ms linear; pointer-events: none; }
	.thesis.visible { opacity: 1; }
	.cue { position: absolute; left: 0; bottom: 8px; z-index: 2; margin: 0; font-size: 14px; color: var(--dust); opacity: 0; transition: opacity 400ms linear; pointer-events: none; }
	.cue.visible { opacity: 1; }
	.cue::after { content: ''; display: block; width: 1px; height: 28px; margin-top: 8px; background: var(--dust); }
	.byline { margin-top: 24px; font-weight: 400; font-size: 15px; line-height: 1.5; letter-spacing: 0; color: var(--dust); }
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
	.panel { max-width: 34em; padding: clamp(24px, 3vw, 40px); background: color-mix(in srgb, var(--shadow) 85%, transparent); color: var(--white); }
	/* the credit sits bottom right on a fade to black, which keeps it legible over the bright ground */
	.credit { position: absolute; left: 0; right: 0; bottom: 0; padding: 40px var(--gutter) 16px; text-align: right; color: var(--dust); background: linear-gradient(transparent, rgb(0 0 0 / 0.8) 70%); }
	.step { font-size: clamp(17px, 0.6vw + 11px, 19px); line-height: 1.5; }
	.step p + p { margin-top: 1em; }
	.step .aside { font-size: 15px; line-height: 1.5; color: var(--dust); }
</style>
