<script>
	// What the division does; then, under one scope switch, the by-year chart, the per-dollar chart and
	// the mission table, all following the switch. The affiliation map, every paper to date, comes
	// after the switch lets go.
	import Seo from '$lib/ui/Seo.svelte';
	import EntityHeader from '$lib/ui/EntityHeader.svelte';
	import MissionTable from '$lib/ui/MissionTable.svelte';
	import ScopeSwitch from '$lib/ui/ScopeSwitch.svelte';
	import Hint from '$lib/ui/Hint.svelte';
	import PerDollarScatter from '$lib/charts/PerDollarScatter.svelte';
	import LifetimeTimeline from '$lib/charts/LifetimeTimeline.svelte';
	import AffiliationMap from '$lib/charts/AffiliationMap.svelte';
	import { int, money, yearSpan } from '$lib/format.js';
	import { view } from '$lib/state/view.svelte.js';
	import { divisionIntro } from '$lib/copy/divisions.js';
	import { FOOTNOTES, noteText } from '$lib/copy/footnotes.js';
	import { methodsHref, mapsUrl } from '$lib/paths.js';

	let { data } = $props();
	const d = $derived(data.division);
	const site = $derived(data.site);
	const f = $derived(d.facts);
	const story = $derived(data.scopes[view.scope]);
	/** Props for the "i" beside a term: one definition each. */
	const tip = (id) => ({ text: noteText([id], site), href: methodsHref(FOOTNOTES[id].anchor) });
	const description = $derived(
		`${int(f.missions)} NASA ${d.name} missions with ${int(f.papers)} tracked peer-reviewed publications and ${int(f.citations)} citations, ${yearSpan(f.publicationYears)}.`
	);
</script>

<Seo title={d.name} {description} />

<div class="wrap page">
	<EntityHeader name={d.name} rule={false}>
		<span class="intro">{divisionIntro[d.slug]}</span>
	</EntityHeader>

	<!-- The scope bar sticks over every section that reads view.scope. -->
	<div class="scoped">
		<ScopeSwitch {site} />

		<section id="stats" class="part pair" aria-label="Output and cost">
			<div class="chart">
				<h3 class="chart-title">Publications and citations by year</h3>
				<LifetimeTimeline series={d.series[view.scope]} />
			</div>

			<!-- A division with nothing to compare (no comparison rows) gets the by-year chart only. -->
			{#if story.comparison}
				<div class="chart">
					<h3 class="chart-title">Citations per {money(100)}, by mission<Hint label="this chart" {...tip('perDollarChart')} /></h3>
					<PerDollarScatter missions={d.missions} slug={d.slug} scope={view.scope} average={story.perDollar?.runningMean ?? null} />
				</div>
			{/if}
		</section>

		<section id="missions" class="part" aria-labelledby="missions-title">
			<h2 id="missions-title" class="part-title">Missions</h2>
			<div class="table">
				<MissionTable missions={d.missions} slug={d.slug} {site} scope={view.scope} rankable={d.rankable} />
			</div>
			<p class="meta source">How we found the papers, counted citations, and set costs: <a href={methodsHref()}>Methods</a>.</p>
		</section>
	</div>

	{#if d.affiliations}
		<section id="affiliations" class="part" aria-labelledby="affiliations-title">
			<h2 id="affiliations-title" class="part-title">Institutional contributions<Hint label="this map" {...tip('affiliations')} /></h2>
			<p class="meta">Every tracked publication to date, each counted once however many {d.name} missions it names.</p>
			<AffiliationMap summary={d.affiliations} url={mapsUrl('divisions', d.slug)} />
		</section>
	{/if}
</div>

<style>
	.intro {
		display: block;
		max-width: 36em;
		color: var(--white);
		font-size: clamp(18px, 1.7vw, 22px);
		line-height: 1.5;
	}

	.part {
		margin-top: 64px;
	}

	.scoped {
		margin-top: 64px;
	}

	.scoped > .part:first-of-type {
		margin-top: 32px;
	}

	.part-title {
		font-weight: 300;
		font-size: clamp(26px, 3vw, 34px);
		line-height: 1.15;
		letter-spacing: -0.015em;
	}

	/* the by-year and per-dollar charts side by side where both fit, stacked on a narrow screen */
	.pair {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 440px), 1fr));
		gap: 56px 48px;
		align-items: start;
	}

	.table {
		margin-top: 20px;
	}

	.source {
		margin-top: 20px;
	}

	@media (max-width: 600px) {
		.part,
		.scoped {
			margin-top: 48px;
		}
	}
</style>
