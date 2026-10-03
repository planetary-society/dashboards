<script>
	import Seo from '$lib/ui/Seo.svelte';
	import EntityHeader from '$lib/ui/EntityHeader.svelte';
	import MostCited from '$lib/ui/MostCited.svelte';
	import MissionTable from '$lib/ui/MissionTable.svelte';
	import ComparisonControls from '$lib/ui/ComparisonControls.svelte';
	import Choice from '$lib/ui/Choice.svelte';
	import Footnote from '$lib/ui/Footnote.svelte';
	import LifetimeTimeline from '$lib/charts/LifetimeTimeline.svelte';
	import PublicationScatter from '$lib/charts/PublicationScatter.svelte';
	import CostCurve from '$lib/charts/CostCurve.svelte';
	import TimeToScience from '$lib/charts/TimeToScience.svelte';
	import IndexScatter from '$lib/charts/IndexScatter.svelte';
	import { int, yearSpan, plural } from '$lib/format.js';
	import { view, setTop } from '$lib/state/view.svelte.js';
	import { scopeLabel } from '$lib/copy/window.js';
	import { divisionIntro } from '$lib/copy/divisions.js';

	let { data } = $props();
	let picked = $state('');
	const d = $derived(data.division);
	const site = $derived(data.site);
	const f = $derived(d.facts);
	const selectedId = $derived(d.missions.some((m) => m.id === picked) ? picked : '');
	const selectMission = (id) => { picked = id; };
	const scopeName = $derived(scopeLabel(view.scope, site));
	const paperMission = $derived(d.missions.find((m) => m.id === d.mostCited?.missionId)?.name);
	const description = $derived(
		`${int(f.missions)} NASA ${d.name} missions with ${int(f.papers)} tracked peer-reviewed publications and ${int(f.citations)} citations, ${yearSpan(f.publicationYears)}.`
	);
</script>

<Seo title={d.name} {description} />

<div class="wrap page">
	<EntityHeader name={d.name} second={divisionIntro[d.slug]}>
		<b>{int(f.missions)}</b> {plural(f.missions, 'mission')} in this study.
		<b>{int(f.papers)}</b> tracked publications and <b>{int(f.citations)}</b> citations over their lifetimes.
	</EntityHeader>

	<section aria-labelledby="research-title">
		<h2 id="research-title" class="chart-title">Research over time</h2>
		<LifetimeTimeline lifetime={d.lifetimeSeries} />
		<details class="notes">
			<summary>About this study</summary>
			<p>Tracked publications are the research papers we found for these missions; the list may not be complete. Citations are references to those papers by other papers—a measure of research attention, not a complete measure of scientific value.</p>
			<p>Publication years: {yearSpan(f.publicationYears)}. Mission selection: {data.selectionFilter}</p>
		</details>
	</section>

	<MostCited paper={d.mostCited} slug={d.slug} missionName={paperMission} />

	<section aria-labelledby="compare-title">
		<h2 id="compare-title" class="chart-title">Compare missions</h2>
		<p class="guide">Top-10% papers are highly cited relative to similarly dated papers in this division. Shared papers split credit between missions.</p>
		<ComparisonControls missions={d.missions} slug={d.slug} windowPolicy={site.windowPolicy} {selectedId} onselect={selectMission} />
		<p class="meta scope-note">Window applies to the comparison charts and the table’s top-paper credit.</p>
		<details class="notes">
			<summary>About the comparison window</summary>
			<p>{view.scope === 'lifetime' ? 'All tracked publications to date; recent papers may be too new to rank.' : 'Publication windows follow each mission’s history. Papers need enough citation follow-up to enter these comparisons.'}</p>
			<Footnote ids={[view.scope, 'shared', 'never']} />
		</details>

		<div class="comparison-grid">
			<div>
				<h3 class="chart-title">Highly cited research</h3>
				<PublicationScatter missions={d.missions} slug={d.slug} {selectedId} onselect={selectMission} />
				<Footnote ids={['publicationImpact']} collapsed />
			</div>
			{#if d.rankable}
				<div>
					<h3 class="chart-title">Time to a first top-10% paper</h3>
					<TimeToScience missions={d.missions} slug={d.slug} referenceCost={site.referenceCost} {selectedId} onselect={selectMission} />
					<Footnote ids={['firstTop', 'never', 'cost']} collapsed />
				</div>
			{/if}
		</div>
		{#if !d.rankable}<p class="guide">Too few tracked publications for reliable cost and timing comparisons.</p>{/if}
	</section>

	{#if d.costCurves}
		<section aria-labelledby="cost-title">
			<div class="section-heading">
				<h2 id="cost-title" class="chart-title">Research contribution by cost</h2>
				<div class="threshold">Top <Choice label="Cost curve and table percentile" value={view.top} onchange={setTop} options={view.scope === 'lifetime' ? [{ value: 10, label: '10%' }] : [{ value: 10, label: '10%' }, { value: 1, label: '1%' }]} /></div>
			</div>
			<CostCurve costCurves={d.costCurves} missions={d.missions} slug={d.slug} referenceCost={site.referenceCost} {selectedId} onselect={selectMission} />
			<Footnote ids={[view.top === 1 ? 'top1' : 'top10', 'costAxis', 'cost']} collapsed />
		</section>
	{/if}

	<section aria-labelledby="missions-title">
		<h2 id="missions-title" class="chart-title">Explore missions</h2>
		<div class="table">
			<MissionTable missions={d.missions} slug={d.slug} {selectedId} scopeLabel={scopeName} />
		</div>
		<Footnote ids={['publications', 'cost', 'strip']} collapsed />
	</section>

	<details class="other">
		<summary class="chart-title">Other citation measures</summary>
		<IndexScatter missions={d.missions} correlation={d.indexCorrelation} slug={d.slug} asOf={site.asOf} {selectedId} onselect={selectMission} />
		<Footnote ids={['mindex', 'hindex', 'cost']} collapsed />
	</details>
</div>

<style>
	.page > section, .other { margin-top: 56px; }
	.guide { margin-top: 12px; max-width: 62ch; color: var(--dust); font-size: 14px; line-height: 1.6; }
	.scope-note { margin-top: 8px; }
	.notes { margin-top: 16px; color: var(--dust); font-size: 12px; line-height: 1.6; max-width: 90ch; }
	summary { cursor: pointer; }
	.notes p { margin-top: 12px; }
	.comparison-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 40px; margin-top: 36px; }
	.section-heading { display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px 24px; }
	.threshold { color: var(--dust); font-size: 14px; }
	.table { margin-top: 8px; overflow-x: auto; overscroll-behavior-x: contain; }
	.other { padding-top: 24px; border-top: 1px solid var(--shadow); }
	.other[open] > summary { margin-bottom: 24px; }
	@media (max-width: 860px) { .comparison-grid { grid-template-columns: 1fr; } }
</style>
