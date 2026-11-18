<script>
	// The charts, mission table and affiliation map follow the scope switch;
	// awaiting missions below them always show lifetime totals.
	import Seo from '$lib/ui/Seo.svelte';
	import EntityHeader from '$lib/ui/EntityHeader.svelte';
	import MissionTable from '$lib/ui/MissionTable.svelte';
	import ScopeSwitch from '$lib/ui/ScopeSwitch.svelte';
	import Hint from '$lib/ui/Hint.svelte';
	import PerDollarScatter from '$lib/charts/PerDollarScatter.svelte';
	import LifetimeTimeline from '$lib/charts/LifetimeTimeline.svelte';
	import AffiliationMap from '$lib/charts/AffiliationMap.svelte';
	import { apDate, int, money } from '$lib/format.js';
	import { scopeLabel } from '$lib/copy/window.js';
	import { divisionIntro } from '$lib/copy/divisions.js';
	import { FOOTNOTES, noteText } from '$lib/copy/footnotes.js';
	import { methodsHref, mapsUrl } from '$lib/paths.js';

	let { data } = $props();
	const d = $derived(data.division);
	const site = $derived(data.site);
	const f = $derived(d.facts);
	const stats = $derived(d.stats); // this scope only, like the series
	/** Props for the "i" beside a term: one definition each. */
	const tip = (id) => ({ text: noteText([id], site, data.scope), href: methodsHref(FOOTNOTES[id].anchor) });
	const description = $derived(
		`${int(f.missions)} NASA ${d.name} missions: ${int(stats.papers)} tracked peer-reviewed publications and ${int(stats.citations)} citations in the ${scopeLabel(data.scope)} scope. Data as of ${site.asOf}.`
	);
</script>

<Seo title={`${d.name} Mission Costs and Scientific Impact — ${scopeLabel(data.scope)}`} {description} />

<div class="wrap page">
	<EntityHeader name={d.name} rule={false}>
		<span class="intro">{divisionIntro[d.slug]}</span>
	</EntityHeader>

	<!-- The scope bar sticks over every section that reads the scope. -->
	<div class="scoped">
		<ScopeSwitch {site} />

		<section id="stats" class="part pair" aria-label="Output and cost">
			<div class="chart">
				<h3 class="chart-title">Publications and citations by year</h3>
				<LifetimeTimeline series={d.series} />
			</div>

			<!-- A division with nothing to compare (no comparison rows) gets the by-year chart only. -->
			{#if data.compare}
				<div class="chart">
					<h3 class="chart-title">Citations per {money(100)}, by mission<Hint label="this chart" {...tip('perDollarChart')} /></h3>
					<PerDollarScatter missions={d.missions} slug={d.slug} scope={data.scope} average={data.compare.average} />
				</div>
			{/if}
		</section>

		<section id="missions" class="part" aria-labelledby="missions-title">
			<h2 id="missions-title" class="part-title">Missions</h2>
			<div class="table">
				<MissionTable missions={d.missions} slug={d.slug} {site} scope={data.scope} rankable={d.rankable} />
			</div>
		</section>

		{#if d.affiliations}
			<section id="affiliations" class="part" aria-labelledby="affiliations-title">
				<h2 id="affiliations-title" class="part-title">Institutional contributions<Hint label="this map" {...tip('affiliations')} /></h2>
				<AffiliationMap summary={d.affiliations} url={mapsUrl('divisions', d.slug, data.scope)} scope={data.scope} />
			</section>
		{/if}
	</div>

	{#if d.awaitingMissions?.length}
		<section id="awaiting-inclusion" class="part" aria-labelledby="awaiting-title">
			<h2 id="awaiting-title" class="part-title">Missions awaiting inclusion</h2>
			<p class="meta source">These launched missions are not yet ready for comparison under our <a href={methodsHref('windows')}>maturity rules</a>. Only lifetime totals as of {apDate(d.awaitingMissions[0].inclusion.asOf)}, are shown.</p>
			<div class="table">
				<MissionTable missions={d.awaitingMissions} slug={d.slug} {site} scope="lifetime" awaiting />
			</div>
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
		overflow-x: auto;
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
