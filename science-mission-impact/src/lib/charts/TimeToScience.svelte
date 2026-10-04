<script>
	import Squares from '$lib/scrolly/Squares.svelte';
	import TimeScienceAxes from './TimeScienceAxes.svelte';
	import MissionReadout from '$lib/ui/MissionReadout.svelte';
	import { view } from '$lib/state/view.svelte.js';
	import { int } from '$lib/format.js';
	import { timeScienceModel, timeScienceLayout } from './timetoscience.js';

	let { missions, slug, selectedId = '', onselect = null } = $props();
	let width = $state(0);
	const height = 300;
	const model = $derived(timeScienceModel(missions, view.scope));
	const tiles = $derived(model.points.map((m) => ({ ...m, division: slug })));
	const layout = $derived(width > 0 ? timeScienceLayout(model.points, width, height) : null);
	const summary = $derived(`${int(tiles.length)} of ${int(missions.length)} missions have a recorded time to a first top-10% paper and a known positive cost in this view.`);
	const selected = $derived(model.points.find((p) => p.id === selectedId));
</script>

<p class="sr-only">{summary}</p>
<p class="guide">Each square is a mission: higher costs more; farther left reached its first top-10% paper sooner after science operations began.</p>
{#if tiles.length}
	<p class="meta axis-title">Adjusted mission cost · log scale ↑</p>
	<div class="stage" bind:clientWidth={width} style:height="{height}px" role="group" aria-label={summary}>
		{#if layout}
			<TimeScienceAxes {layout} {width} {height} />
			<Squares {tiles} items={layout.items} thumbnailBorders {selectedId} {onselect} />
		{:else}
			<p class="sr-only">{tiles.map((p) => p.label).join('; ')}</p>
		{/if}
	</div>
	{#if tiles.some((p) => p.months < 0)}<p class="meta">Negative months indicate publication before science operations began.</p>{/if}
{:else}
	<p class="meta">No missions with an observed milestone, recorded timing and known positive cost in this view.</p>
{/if}
<MissionReadout id={selectedId} {slug} label={selected?.label ?? 'Selected mission: no recorded timing in this window.'} />

<style>
	.stage { position: relative; }
	.axis-title { margin-top: 16px; }
	.guide { color: var(--dust); font-size: 14px; line-height: 1.6; }
	p { margin-top: 12px; }
</style>
