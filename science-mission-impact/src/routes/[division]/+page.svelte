<script>
	// What the division does and every mission in it; then, under one scope switch, the division's
	// summary, its per-dollar chart and the mission table. Every figure below the switch follows it,
	// except the by-year chart, which is every paper to date. The affiliation map, also every paper
	// to date, comes after the switch lets go.
	import Seo from '$lib/ui/Seo.svelte';
	import EntityHeader from '$lib/ui/EntityHeader.svelte';
	import MissionThumbs from '$lib/ui/MissionThumbs.svelte';
	import MissionTable from '$lib/ui/MissionTable.svelte';
	import ScopeSwitch from '$lib/ui/ScopeSwitch.svelte';
	import Hint from '$lib/ui/Hint.svelte';
	import PerDollarScatter from '$lib/charts/PerDollarScatter.svelte';
	import LifetimeTimeline from '$lib/charts/LifetimeTimeline.svelte';
	import AffiliationMap from '$lib/charts/AffiliationMap.svelte';
	import { int, money, plural, yearSpan } from '$lib/format.js';
	import { view } from '$lib/state/view.svelte.js';
	import { scopeLabel, scopeGloss } from '$lib/copy/window.js';
	import { divisionIntro } from '$lib/copy/divisions.js';
	import { statsLede, statRows } from '$lib/copy/discussion.js';
	import { FOOTNOTES, noteText } from '$lib/copy/footnotes.js';
	import { methodsHref, mapsUrl } from '$lib/paths.js';

	let { data } = $props();
	const d = $derived(data.division);
	const site = $derived(data.site);
	const f = $derived(d.facts);
	const story = $derived({ referenceCost: site.referenceCost, ...data.scopes[view.scope] });
	const rows = $derived(statRows(story));
	const scopeName = $derived(scopeLabel(view.scope));
	/** Props for the "i" beside a term: one definition each. */
	const tip = (id) => ({ text: noteText([id], site), href: methodsHref(FOOTNOTES[id].anchor) });
	const description = $derived(
		`${int(f.missions)} NASA ${d.name} missions with ${int(f.papers)} tracked peer-reviewed publications and ${int(f.citations)} citations, ${yearSpan(f.publicationYears)}.`
	);
</script>

<Seo title={d.name} {description} />

<div class="wrap page">
	<EntityHeader
		name={d.name}
		second="{int(f.missions)} {plural(f.missions, 'mission')} in this study, with {int(f.papers)} tracked publications and {int(f.citations)} citations to date."
	>
		<span class="intro">{divisionIntro[d.slug]}</span>
	</EntityHeader>

	<section id="all-missions" class="part" aria-label="Every mission in this study">
		<MissionThumbs missions={d.missions} slug={d.slug} />
	</section>

	<!-- The scope bar sticks over every section that reads view.scope. -->
	<div class="scoped">
		<ScopeSwitch {site} />

		<section id="stats" class="part" aria-labelledby="stats-title">
			<h2 id="stats-title" class="part-title">Output and cost</h2>
			<p class="lede">{statsLede(story, d)}</p>

			<div class="compare" class:single={!rows.length}>
				{#if rows.length}
					<table class="stats">
						<caption class="meta">{d.name} missions · {scopeName}<Hint label="the {scopeName}" text={scopeGloss(view.scope, site)} href={methodsHref(FOOTNOTES[view.scope].anchor)} /></caption>
						<tbody>
							{#each rows as r (r.label)}
								<tr>
									<th scope="row">{r.label}{#if r.note}<Hint label={r.label.toLowerCase()} {...tip(r.note)} />{/if}</th>
									<td>{r.value}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
				<div class="chart">
					<h3 class="chart-title">Publications and citations by year</h3>
					<p class="meta">Every tracked publication to date, whatever window is chosen above.</p>
					<LifetimeTimeline lifetime={d.lifetimeSeries} />
				</div>
			</div>

			{#if rows.length}
				<div class="chart dollar">
					<h3 class="chart-title">Citations per {money(100)}, by mission<Hint label="this chart" {...tip('perDollarChart')} /></h3>
					<PerDollarScatter missions={d.missions} slug={d.slug} scope={view.scope} fit={story.perDollar?.fit ?? null} />
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
			<h2 id="affiliations-title" class="part-title">Where the authors worked<Hint label="this map" {...tip('affiliations')} /></h2>
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

	#all-missions {
		margin-top: 40px;
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

	.lede {
		margin-top: 16px;
		max-width: 40em;
		font-size: 17px;
		line-height: 1.6;
	}

	.compare {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 40px 64px;
		align-items: start;
		margin-top: 32px;
	}

	.compare.single {
		grid-template-columns: minmax(0, 1fr);
	}

	.dollar {
		margin-top: 56px;
	}

	.chart .meta {
		margin-top: 4px;
	}

	.stats {
		width: 100%;
		border-collapse: collapse;
		font-size: 15px;
		line-height: 20px;
	}

	.stats caption {
		text-align: left;
		padding-bottom: 8px;
	}

	.stats tbody th {
		padding: 10px 0;
		text-align: left;
		font-weight: 400;
		color: var(--dust);
	}

	.stats td {
		padding: 10px 0 10px 16px;
		text-align: right;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	.stats tbody tr {
		border-top: 1px solid var(--shadow);
	}

	.table {
		margin-top: 20px;
	}

	.source {
		margin-top: 20px;
	}

	@media (max-width: 960px) {
		.compare {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	@media (max-width: 600px) {
		.part,
		.scoped {
			margin-top: 48px;
		}

		.stats {
			font-size: 14px;
		}
	}
</style>
