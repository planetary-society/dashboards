<script>
	import Seo from '$lib/ui/Seo.svelte';
	import EntityHeader from '$lib/ui/EntityHeader.svelte';
	import MostCited from '$lib/ui/MostCited.svelte';
	import MissionTable from '$lib/ui/MissionTable.svelte';
	import ScopeSwitch from '$lib/ui/ScopeSwitch.svelte';
	import MeasureTable from '$lib/ui/MeasureTable.svelte';
	import Choice from '$lib/ui/Choice.svelte';
	import Hint from '$lib/ui/Hint.svelte';
	import LifetimeTimeline from '$lib/charts/LifetimeTimeline.svelte';
	import TopShareBars from '$lib/charts/TopShareBars.svelte';
	import CostCurve from '$lib/charts/CostCurve.svelte';
	import TimeToScience from '$lib/charts/TimeToScience.svelte';
	import { int, yearSpan, plural } from '$lib/format.js';
	import { view } from '$lib/state/view.svelte.js';
	import { scopeLabel } from '$lib/copy/window.js';
	import { divisionMeasureGroups } from '$lib/copy/measures.js';
	import { divisionIntro } from '$lib/copy/divisions.js';
	import { noteText } from '$lib/copy/footnotes.js';
	import { methodsHref } from '$lib/paths.js';

	let { data } = $props();
	let picked = $state('');
	// Which tier the two top-paper charts show. Page-local on purpose: the Explore table keeps
	// its top-10% column whatever is chosen here. Lifetime has no top 1%.
	let pickedTop = $state(10);
	const top = $derived(view.scope === 'lifetime' ? 10 : pickedTop);
	const tiers = $derived(view.scope === 'lifetime' ? [{ value: 10, label: '10%' }] : [{ value: 10, label: '10%' }, { value: 1, label: '1%' }]);
	const d = $derived(data.division);
	const site = $derived(data.site);
	const f = $derived(d.facts);
	const selectedId = $derived(d.missions.some((m) => m.id === picked) ? picked : '');
	const selectMission = (id) => { picked = id; };
	const scopeName = $derived(scopeLabel(view.scope, site));
	// Every definition a chart leans on sits behind an "i" by its title; nothing is folded away.
	const note = (...ids) => noteText(ids, site);
	const paperMission = $derived(d.missions.find((m) => m.id === d.mostCited?.missionId)?.name);
	const description = $derived(
		`${int(f.missions)} NASA ${d.name} missions with ${int(f.papers)} tracked peer-reviewed publications and ${int(f.citations)} citations, ${yearSpan(f.publicationYears)}.`
	);
</script>

{#snippet tier(label)}
	<div class="threshold">Top <Choice {label} value={top} onchange={(v) => (pickedTop = v)} options={tiers} /></div>
{/snippet}

<Seo title={d.name} {description} />

<div class="wrap page">
	<EntityHeader name={d.name} second={divisionIntro[d.slug]}>
		<b>{int(f.missions)}</b> {plural(f.missions, 'mission')} in this study.
		<b>{int(f.papers)}</b> tracked publications and <b>{int(f.citations)}</b> citations over their lifetimes.
	</EntityHeader>

	<section aria-labelledby="research-title">
		<h2 id="research-title" class="chart-title">Research over time</h2>
		<LifetimeTimeline lifetime={d.lifetimeSeries} />
	</section>

	<div class="scoped">
		<ScopeSwitch {site} />

		<section aria-labelledby="measures-title">
			<h2 id="measures-title" class="chart-title">Key measures</h2>
			<MeasureTable groups={divisionMeasureGroups(d, view.scope, site)} />
		</section>

		<MostCited paper={d.mostCited} slug={d.slug} missionName={paperMission} />

		<section aria-labelledby="share-title">
			<div class="section-heading">
				<h2 id="share-title" class="chart-title">{d.rankable ? 'Highly cited papers per mission' : 'Publications per mission'}<Hint label="this chart" text={d.rankable ? note(top === 1 ? 'top1' : 'top10', 'shared', 'never') : note('publications')} href={methodsHref(d.rankable ? 'high-impact' : 'mission-papers')} /></h2>
				{#if d.rankable}{@render tier('Highly cited share percentile')}{/if}
			</div>
			<TopShareBars missions={d.missions} slug={d.slug} rankable={d.rankable} {top} {selectedId} onselect={selectMission} />
		</section>

		{#if d.rankable}
			<section aria-labelledby="timing-title">
				<h2 id="timing-title" class="chart-title">Time to a first top-10% paper<Hint label="this chart" text={note('firstTop', 'never', 'cost')} href={methodsHref()} /></h2>
				<TimeToScience missions={d.missions} slug={d.slug} {selectedId} onselect={selectMission} />
			</section>
		{/if}

		{#if d.costCurves}
			<section aria-labelledby="cost-title">
				<h2 id="cost-title" class="chart-title">Running total of all top <Choice label="Cost curve percentile" value={top} onchange={(v) => (pickedTop = v)} options={tiers} /> papers, contributed by mission<Hint label="this chart" text={note(top === 1 ? 'top1' : 'top10', 'costAxis', 'cost')} href={methodsHref('cost')} /></h2>
				<CostCurve costCurves={d.costCurves} missions={d.missions} slug={d.slug} referenceCost={site.referenceCost} {top} {selectedId} onselect={selectMission} />
			</section>
		{/if}

		<section aria-labelledby="missions-title">
			<h2 id="missions-title" class="chart-title">Explore missions</h2>
			<div class="table">
				<MissionTable missions={d.missions} slug={d.slug} costBaseYear={site.costBaseYear} rankable={d.rankable} {selectedId} scopeLabel={scopeName} />
			</div>
		</section>
	</div>
</div>

<style>
	.page > section, .scoped, .scoped > section { margin-top: 56px; }
	.scoped > section:first-of-type { margin-top: 32px; }
	.section-heading { display: flex; flex-wrap: wrap; align-items: baseline; gap: 12px 24px; }
	.threshold { color: var(--dust); font-size: 14px; }
	.table { margin-top: 8px; overflow-x: auto; overscroll-behavior-x: contain; }
</style>
