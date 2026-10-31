<script>
	import Seo from '$lib/ui/Seo.svelte';
	import EntityHeader from '$lib/ui/EntityHeader.svelte';
	import MostCited from '$lib/ui/MostCited.svelte';
	import ScopeSwitch from '$lib/ui/ScopeSwitch.svelte';
	import LifetimeTimeline from '$lib/charts/LifetimeTimeline.svelte';
	import AffiliationMap from '$lib/charts/AffiliationMap.svelte';
	import Hint from '$lib/ui/Hint.svelte';
	import MeasureTable from '$lib/ui/MeasureTable.svelte';
	import QueryBlock from '$lib/mission/QueryBlock.svelte';
	import CurationLists from '$lib/mission/CurationLists.svelte';
	import PaperBrowser from '$lib/mission/PaperBrowser.svelte';
	import { hasReconciliation } from '$lib/mission/query.js';
	import { divisionHref, thumbSrc, mapsUrl, methodsHref } from '$lib/paths.js';
	import { FOOTNOTES, noteText } from '$lib/copy/footnotes.js';
	import { int, yearSpan } from '$lib/format.js';
	import { view } from '$lib/state/view.svelte.js';
	import { missionLine, missionMeasureGroups, scopeSpans } from '$lib/copy/measures.js';

	let { data } = $props();
	const m = $derived(data.mission);
	const site = $derived(data.site);
	const f = $derived(m.facts);
	const description = $derived(
		`${m.fullName}: ${int(f.papers)} tracked peer-reviewed publications and ${int(f.citations)} citations${f.publicationYears ? `, ${yearSpan(f.publicationYears)}` : ''}.`
	);
	// Under the name, one quiet line of catalog facts, the cost last with its definition.
	const line = $derived(missionLine(m.meta, site));
	// Failed missions with no SciX query and no papers were lost before returning science:
	// nothing was searched. (Mars Observer has no query either, but hand-added papers.)
	const noSearch = $derived(m.meta.failed && m.query.arms == null && f.papers === 0);
	// Why a page has no charts, or why a failure counts as zero; a mission with measured papers needs no note.
	const note = $derived(
		noSearch
			? `${m.name} was lost before returning science, so no publication search was run; it counts as zero in the comparisons.`
			: f.papers === 0
				? 'No tracked publications found.'
				: f.papers == null
					? 'Tracked publication data is unavailable.'
					: m.meta.failed && m.full?.outputBasis === 'assumed_zero'
						? 'With no measured output, it counts as zero in the comparisons.'
						: null
	);
	const hasProvenance = $derived(
		m.query.arms != null || hasReconciliation(m.query.reconciliation) || m.curation.includes.length > 0 || m.curation.excludes.length > 0
	);
</script>

<Seo title={m.name} {description} />

<div class="wrap page">
	<EntityHeader name={m.name} crumb={{ href: divisionHref(m.division), label: m.divisionName }} thumb={m.hasThumb ? thumbSrc(m.id) : null} second={line.lead || line.cost ? secondLine : null} rule={false} children={note ? noteLine : null} />
	{#snippet noteLine()}{note}{/snippet}
	<!-- the cost and its "i" never wrap apart -->
	{#snippet secondLine()}{line.lead}{#if line.cost}<span class="nowrap">{line.cost}<Hint label="life-cycle cost" text={noteText(['cost'], site)} href={methodsHref(FOOTNOTES.cost.anchor)} /></span>{/if}{/snippet}

	<!-- The scope bar sticks over the whole column; the charts and provenance don't read view.scope and simply scroll under it. -->
	<div class="scoped">
		{#if f.papers > 0}
			<ScopeSwitch {site} spans={scopeSpans(m, site)} />

			<section class="measures" aria-label="Key measures">
				<MeasureTable groups={missionMeasureGroups(m, view.scope, site)} />
			</section>
		{/if}

		<!-- the by-year chart and the map side by side where both fit, stacked on a narrow screen -->
		{#if f.papers > 0 || m.affiliations}
			<div class="pair">
				{#if f.papers > 0}
					<section>
						<h2 class="chart-title">Publications and citations by year</h2>
						<LifetimeTimeline series={m.lifetimeSeries} />
					</section>
				{/if}
				{#if m.affiliations}
					<section>
						<h2 class="chart-title">Institutional contributions<Hint label="this map" text={noteText(['affiliations'], site)} href={methodsHref(FOOTNOTES.affiliations.anchor)} /></h2>
						<!-- the by-year chart's 300px beside it, less the map's toggle row and its gaps -->
						<AffiliationMap summary={m.affiliations} url={mapsUrl('missions', m.id)} maxHeight={262} />
					</section>
				{/if}
			</div>
		{/if}

		{#if f.papers > 0}
			<MostCited paper={m.mostCited} />

			<section>
				<h2 class="chart-title">Tracked publications ({int(f.papers)})</h2>
				<PaperBrowser missionId={m.id} name={m.name} initial={m.topCited} file={m.papersFile} />
			</section>
		{/if}

		{#if hasProvenance}
			<section>
				<h2 class="chart-title">How we found these papers</h2>
				<QueryBlock query={m.query} name={m.name} />
				<CurationLists curation={m.curation} />
			</section>
		{/if}
	</div>
</div>

<style>
	/* one rhythm down the page: 56px between blocks, the measures tucked under the scope bar */
	.scoped {
		margin-top: 40px;
	}

	.scoped > :global(* + *) {
		margin-top: 56px;
	}

	.scoped > .measures {
		margin-top: 24px;
	}

	.nowrap {
		white-space: nowrap;
	}

	.pair {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 440px), 1fr));
		gap: 56px 48px;
		align-items: start;
	}
</style>
