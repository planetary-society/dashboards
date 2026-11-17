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
	import { measured } from '$lib/mission/papers.js';
	import { divisionHref, thumbSrc, mapsUrl, methodsHref } from '$lib/paths.js';
	import { FOOTNOTES, noteText } from '$lib/copy/footnotes.js';
	import { apDate, int } from '$lib/format.js';
	import { scopeLabel } from '$lib/copy/window.js';
	import { missionLine, missionMeasureGroups, scopeSpans } from '$lib/copy/measures.js';

	let { data } = $props();
	const m = $derived(data.mission);
	const site = $derived(m.inclusion ? { ...data.site, asOf: m.inclusion.asOf } : data.site);
	const f = $derived(m.facts);
	const scoped = $derived(m[data.scope]);
	const heading = $derived(m.fullName.toLowerCase().includes(m.name.toLowerCase()) ? m.fullName : `${m.fullName} (${m.name})`);
	const description = $derived(
		`${m.fullName}: ${!measured(scoped) || scoped.papers == null || scoped.citations == null ? 'publication and citation measures unavailable' : `${int(scoped.papers)} tracked peer-reviewed publications and ${int(scoped.citations)} citations`} in the ${scopeLabel(data.scope)} scope. Data as of ${site.asOf}.`
	);
	// Under the name, one quiet line of catalog facts, the cost last with its definition.
	const line = $derived(missionLine(m.meta, site));
	// Failed missions with no SciX query and no papers were lost before returning science:
	// nothing was searched. (Mars Observer has no query either, but hand-added papers.)
	const noSearch = $derived(m.meta.failed && m.query.arms == null && f.papers === 0);
	// Why a page has no charts, or why a failure counts as zero; a mission with measured papers needs no note.
	const note = $derived(
		noSearch
			? `${m.name} was lost before returning science, so no publication search was run${m.inclusion ? '.' : '; it counts as zero in the comparisons.'}`
			: f.papers === 0
				? 'No tracked publications found.'
				: f.papers == null
					? 'Tracked publication data is unavailable.'
					: !m.inclusion && m.meta.failed && m.full?.outputBasis === 'assumed_zero'
						? 'With no measured output, it counts as zero in the comparisons.'
						: null
	);
	const hasProvenance = $derived(
		m.query.arms != null || hasReconciliation(m.query.reconciliation) || m.curation.includes.length > 0 || m.curation.excludes.length > 0
	);
</script>

<Seo title={`${m.fullName}: Cost, Publications and Citations — ${scopeLabel(data.scope)}`} {description} />

<div class="wrap page">
	<EntityHeader name={heading} crumb={{ href: divisionHref(m.division, data.scope), label: m.divisionName }} thumb={m.hasThumb ? thumbSrc(m.id) : null} second={line.lead || line.cost || m.meta.wikipedia || m.meta.bibliography ? secondLine : null} rule={false} children={note ? noteLine : null} />
	{#snippet noteLine()}
		{note ?? ''}
	{/snippet}
	<!-- the cost and its "i" never wrap apart -->
	{#snippet secondLine()}
		{line.lead}{#if line.cost}<span class="nowrap">{line.cost}<Hint label="life-cycle cost" text={noteText(['cost'], site)} href={methodsHref(FOOTNOTES.cost.anchor)} /></span>{/if}{#if m.meta.wikipedia}{line.lead || line.cost ? ' · ' : ''}<a href={m.meta.wikipedia} rel="external">Wikipedia</a>{/if}{#if m.meta.bibliography}{line.lead || line.cost || m.meta.wikipedia ? ' · ' : ''}<span class="nowrap"><a href={m.meta.bibliography} rel="external">Mission-curated bibliography</a><Hint label="mission-curated bibliography" text={noteText(['bibliography'], site)} href={methodsHref(FOOTNOTES.bibliography.anchor)} /></span>{/if}
	{/snippet}

	<!-- The scope bar sticks over the column; the timeline and provenance remain lifetime-only. -->
	<div class="scoped">
		{#if !m.inclusion && f.papers > 0}<ScopeSwitch {site} spans={scopeSpans(m, site)} />{/if}
		{#if m.inclusion}
			<p class="inclusion-notice" role="note" aria-label="Awaiting inclusion">
				{#if m.inclusion.basis === 'failure'}
					This mission is not yet included in the analysis: the waiting period for a failed mission with no recorded publications has not ended.
				{:else}
					This mission is not yet included in the analysis because its publication and citation windows have not matured for comparison.
				{/if}
				{#if m.inclusion.date}Expected inclusion date: <time datetime={m.inclusion.date}>{apDate(m.inclusion.date)}</time>.{:else}The inclusion date is not yet known.{/if}
				Only lifetime data is shown. <a href={methodsHref('windows')}>Maturity rules</a>.
			</p>
		{/if}
		{#if f.papers > 0}
			<section class="measures" aria-label={`Key measures: ${scopeLabel(data.scope)}`}>
				<MeasureTable groups={missionMeasureGroups(m, data.scope, site)} />
			</section>
		{/if}

		<!-- the by-year chart and the map side by side where both fit, stacked on a narrow screen -->
		{#if f.papers > 0 || m.affiliations}
			<div class="pair">
				{#if f.papers > 0}
					<section>
						<h2 class="chart-title">Publications and citations by year (lifetime)</h2>
						<LifetimeTimeline series={m.lifetimeSeries} />
					</section>
				{/if}
				{#if m.affiliations}
					<section>
						<h2 class="chart-title">Institutional contributions<Hint label="this map" text={noteText(['affiliations'], site, data.scope)} href={methodsHref(FOOTNOTES.affiliations.anchor)} /></h2>
						<!-- the by-year chart's 300px beside it, less the map's toggle row and its gaps -->
						<AffiliationMap summary={m.affiliations} url={mapsUrl('missions', m.id, data.scope)} scope={data.scope} maxHeight={262} />
					</section>
				{/if}
			</div>
		{/if}

		{#if f.papers > 0}
			<MostCited paper={m.mostCited} />

			<section>
				<h2 class="chart-title">Tracked publications over the lifetime ({int(f.papers)})</h2>
				<PaperBrowser missionId={m.id} name={m.name} initial={m.topCited} file={m.papersFile} />
			</section>
		{/if}

		{#if hasProvenance}
			<section>
				<h2 class="chart-title">The SciX Query</h2>
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

	.inclusion-notice {
		padding: 16px 20px;
		border-left: 3px solid #d6ad5c;
		background: rgb(214 173 92 / 10%);
		color: var(--dust);
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
