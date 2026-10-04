<script>
	import Squares from '$lib/scrolly/Squares.svelte';
	import MissionReadout from '$lib/ui/MissionReadout.svelte';
	import { view } from '$lib/state/view.svelte.js';
	import { int, moneyTick, plural } from '$lib/format.js';
	import { timeScienceModel, timeScienceLayout } from './timetoscience.js';

	let { missions, slug, referenceCost, selectedId = '', onselect = null } = $props();
	let width = $state(0);
	const height = 300;
	const model = $derived(timeScienceModel(missions, view.scope));
	const tiles = $derived(model.points.map((m) => ({ ...m, division: slug })));
	const layout = $derived(width > 0 ? timeScienceLayout(model.points, width, height) : null);
	const referenceVisible = $derived(layout && referenceCost >= layout.y.domain()[0] && referenceCost <= layout.y.domain()[1]);
	const summary = $derived(`${int(tiles.length)} of ${int(missions.length)} missions have a recorded time to a first top-10% paper and a known positive cost in this view.`);
	const selected = $derived(model.points.find((p) => p.id === selectedId));
</script>

<p class="sr-only">{summary}</p>
<p class="guide">Each square is a mission: higher costs more; farther left reached its first top-10% paper sooner after science operations began. The overview counts from project start instead.</p>
{#if tiles.length}
	<p class="meta axis-title">Adjusted mission cost · log scale ↑</p>
	<div class="stage" bind:clientWidth={width} style:height="{height}px" role="group" aria-label={summary}>
		{#if layout}
			<svg {width} {height} aria-hidden="true">
				{#each layout.yTicks as value (value)}
					<line class="grid" x1={layout.left} x2={layout.right} y1={layout.y(value)} y2={layout.y(value)} />
					<text x={layout.left - 10} y={layout.y(value)} dy="0.32em" text-anchor="end">{moneyTick(value)}</text>
				{/each}
				{#each layout.minorTicks as value (value)}
					<line class="axis" x1={layout.left - 4} x2={layout.left} y1={layout.y(value)} y2={layout.y(value)} />
				{/each}
				{#each layout.xTicks as value (value)}
					<line class={value === 0 ? 'axis' : 'grid'} x1={layout.x(value)} x2={layout.x(value)} y1={layout.top} y2={layout.bottom + 4} />
					<text x={layout.x(value)} y={layout.bottom + 22} text-anchor="middle">{value}</text>
				{/each}
				<path class="axis" d="M{layout.left},{layout.top}V{layout.bottom}H{layout.right}" />
				{#if referenceVisible}
					<line class="reference" x1={layout.left} x2={layout.right} y1={layout.y(referenceCost)} y2={layout.y(referenceCost)} />
				{/if}
				<text x={(layout.left + layout.right) / 2} y={height - 4} text-anchor="middle">Months from science start →</text>
			</svg>
			<Squares {tiles} items={layout.items} thumbnailBorders {selectedId} {onselect} />
		{:else}
			<p class="sr-only">{tiles.map((p) => p.label).join('; ')}</p>
		{/if}
	</div>
	<p class="meta">{int(tiles.length)} {plural(tiles.length, 'mission')} plotted{referenceVisible ? ` · Dashed line: ${moneyTick(referenceCost)}` : ''}</p>
	{#if tiles.some((p) => p.months < 0)}<p class="meta">Negative months indicate publication before science operations began.</p>{/if}
{:else}
	<p class="meta">No missions with an observed milestone, recorded timing and known positive cost in this view.</p>
{/if}
<MissionReadout id={selectedId} {slug} label={selected?.label ?? 'Selected mission: no recorded timing in this window.'} />
{#if model.excluded.size}
	<details>
		<summary class="meta">Not plotted: {int(missions.length - tiles.length)} {plural(missions.length - tiles.length, 'mission')}</summary>
		{#each [...model.excluded] as [reason, names] (reason)}
			<p class="meta">{reason} ({int(names.length)}): {names.join(', ')}.</p>
		{/each}
	</details>
{/if}

<style>
	.stage { position: relative; }
	.axis-title { margin-top: 16px; }
	.guide { color: var(--dust); font-size: 14px; line-height: 1.6; }
	p, details { margin-top: 12px; }
	summary { cursor: pointer; }
	text { fill: var(--dust); font: 12px var(--sans); }
	.grid { stroke: var(--shadow); }
	.axis { fill: none; stroke: var(--soil); }
	.reference { stroke: var(--dust); stroke-dasharray: 4 4; }
</style>
