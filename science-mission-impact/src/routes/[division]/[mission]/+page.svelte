<script>
	import Seo from '$lib/ui/Seo.svelte';
	import EntityHeader from '$lib/ui/EntityHeader.svelte';
	import MostCited from '$lib/ui/MostCited.svelte';
	import ViewSentence from '$lib/ui/ViewSentence.svelte';
	import Footnote from '$lib/ui/Footnote.svelte';
	import AccumulationPair from '$lib/charts/AccumulationPair.svelte';
	import RankHistogram from '$lib/charts/RankHistogram.svelte';
	import QueryBlock from '$lib/mission/QueryBlock.svelte';
	import CurationLists from '$lib/mission/CurationLists.svelte';
	import PaperBrowser from '$lib/mission/PaperBrowser.svelte';
	import { hasReconciliation } from '$lib/mission/query.js';
	import { divisionHref, thumbSrc } from '$lib/paths.js';
	import { int, money, yearSpan, plural, longDate, weight } from '$lib/format.js';
	import { fullWindowLabel } from '$lib/copy/window.js';
	import { view } from '$lib/state/view.svelte.js';
	import { viewNotes } from '$lib/copy/footnotes.js';

	let { data } = $props();
	const m = $derived(data.mission);
	const site = $derived(data.site);
	const f = $derived(m.facts);
	const launchYear = $derived(m.meta.dates.launch?.slice(0, 4));
	const description = $derived(
		`${m.fullName}: ${int(f.papers)} tracked peer-reviewed publications and ${int(f.citations)} citations${f.publicationYears ? `, ${yearSpan(f.publicationYears)}` : ''}.`
	);
	// Secondary measures, in the paper's terms. Each part drops out when the mission has no
	// qualifying papers or the figure is not on record, and the separator goes with it.
	const primeEndYear = $derived(m.meta.dates.primeEnd?.slice(0, 4));
	const second = $derived(
		[
			m.meta.type,
			f.papers > 0 && m.indices.h != null ? `h-index ${int(m.indices.h)}` : null,
			f.papers > 0 && m.indices.i100 ? `${int(m.indices.i100)} ${plural(m.indices.i100, 'paper')} with 100+ citations` : null,
			primeEndYear ? `prime mission ended ${primeEndYear}` : null
		]
			.filter(Boolean)
			.join(' · ')
	);
	// Failed missions with no ADS query and no papers were lost before returning science:
	// nothing was searched. (Mars Observer has no query either, but hand-added papers.)
	const noSearch = $derived(m.meta.failed && m.query.arms == null && f.papers === 0);
	// The default comparison scope, stated where it was measured (an assumed zero was not).
	const active = $derived(m.full?.bounds && m.full.outputBasis === 'measured' ? m.full : null);
	const shortfall = $derived(['Failure', 'Partial Failure', 'Partial Success'].includes(m.meta.status));
	const hasProvenance = $derived(
		m.query.arms != null || hasReconciliation(m.query.reconciliation) || m.curation.includes.length > 0 || m.curation.excludes.length > 0
	);
</script>

<Seo title={m.name} {description} />

<div class="wrap page">
	<EntityHeader name={m.name} crumb={{ href: divisionHref(m.division), label: m.divisionName }} thumb={m.hasThumb ? thumbSrc(m.id) : null} {second}>
		{#if f.papers > 0}<b>{int(f.papers)}</b> tracked {plural(f.papers, 'publication')} and <b>{int(f.citations)}</b> {plural(f.citations, 'citation')}{f.publicationYears ? ` from ${yearSpan(f.publicationYears)}` : ''}.{:else if noSearch}{m.name} was lost before returning science, so no publication search was run; it counts as zero in the comparisons.{:else if f.papers === 0}No tracked publications found.{:else}Tracked publication data is unavailable.{/if}
		{#if m.name !== m.fullName}{m.fullName}.{/if}
		{#if launchYear}Launched {launchYear}.{/if}
		{#if m.meta.cost != null}Life-cycle cost: <b>{money(m.meta.cost)}</b> in {site.costBaseYear} dollars.{/if}
		{#if active}{fullWindowLabel} {longDate(active.bounds.start)} to {longDate(active.bounds.end)}: {int(active.papers)} {plural(active.papers, 'publication')}, {weight(active.top10)} top-10% credit.{/if}
		{#if shortfall}Status: {m.meta.status}.{m.meta.failed && !noSearch && m.full?.outputBasis === 'assumed_zero' ? ' With no measured output, it counts as zero in the comparisons.' : ''}{/if}
	</EntityHeader>

	{#if f.papers > 0}
		<AccumulationPair lifetime={m.lifetimeSeries} window={m.windowSeries} policy={site.windowPolicy} dates={m.meta.dates} />

		<MostCited paper={m.mostCited} />

		{#if Object.values(m.ranks).some(Boolean)}
			<section>
				<h2 class="chart-title">
					<ViewSentence lead="Where this mission’s papers rank among all {m.divisionName} mission papers," showTop={false} />
				</h2>
				<RankHistogram ranks={m.ranks[view.scope]} />
				<Footnote ids={['ranks', view.scope, 'shared', 'hindex', 'i100']} />
			</section>
		{/if}
	{/if}

	{#if hasProvenance}
		<section>
			<h2 class="chart-title">How we found these papers</h2>
			<QueryBlock query={m.query} name={m.name} />
			<CurationLists curation={m.curation} />
		</section>
	{/if}

	{#if f.papers > 0}
		<section>
			<h2 class="chart-title">Tracked publications</h2>
			<PaperBrowser missionId={m.id} name={m.name} initial={m.topCited} file={m.papersFile} />
			<Footnote ids={['publications', ...viewNotes(view), 'shared']} />
		</section>
	{/if}
</div>

<style>
	.page > :global(section) {
		margin-top: 88px;
	}
</style>
