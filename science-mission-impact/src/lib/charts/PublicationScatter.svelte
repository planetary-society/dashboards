<script>
	import Squares from '$lib/scrolly/Squares.svelte';
	import MissionReadout from '$lib/ui/MissionReadout.svelte';
	import { view } from '$lib/state/view.svelte.js';
	import { int, plural } from '$lib/format.js';
	import { publicationModel, publicationLayout } from './publicationscatter.js';

	// A division too small to rank plots citations instead, with no division reference.
	let { missions, slug, rankable = true, selectedId = '', onselect = null } = $props();
	let width = $state(0);
	const height = 300;
	const measureName = $derived(rankable ? 'top-10% paper credit' : 'citations');
	const model = $derived(publicationModel(missions, view.scope, rankable ? 'top10' : 'citations'));
	const layout = $derived(width > 0 ? publicationLayout(model, width, height) : null);
	const tiles = $derived(model.points.map((p) => ({ ...p, division: slug })));
	const zeros = $derived(model.zeros.map((p) => ({ ...p, division: slug })));
	const selected = $derived([...model.points, ...model.zeros].find((p) => p.id === selectedId));
	const tick = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 3 });
</script>

<figure>
	<p class="guide">{rankable ? 'Above the dashed line: more top-10% credit per publication than the division reference.' : 'Each square is a mission: tracked publications against the citations they have received.'}</p>
	<p class="axis-title meta">{rankable ? 'Top-10% paper credit' : 'Citations'}</p>
	{#if model.points.length}
		<div class="stage" bind:clientWidth={width} style:height="{height}px" role="group" aria-label="Tracked publications versus {measureName}. Both axes use square-root scales.">
			{#if layout}
				<svg width={width} {height} aria-hidden="true">
					{#each layout.yTicks as value (value)}
						<line class="grid" x1={layout.left} x2={layout.right} y1={layout.y(value)} y2={layout.y(value)} />
						<text x={layout.left - 8} y={layout.y(value)} dy="0.32em" text-anchor="end">{tick(value)}</text>
					{/each}
					<path class="axis" d="M{layout.left},{layout.top}V{layout.bottom}H{layout.right}" />
					{#each layout.xTicks as value (value)}
						<line class="axis" x1={layout.x(value)} x2={layout.x(value)} y1={layout.bottom} y2={layout.bottom + 4} />
						<text x={layout.x(value)} y={layout.bottom + 20} text-anchor="middle">{tick(value)}</text>
					{/each}
					{#if layout.reference}
						<line class="reference" x1={layout.x(0)} y1={layout.y(0)} x2={layout.reference.x} y2={layout.reference.y} />
					{/if}
					<text x={layout.right} y={height - 2} text-anchor="end">Tracked publications</text>
				</svg>
				<Squares {tiles} items={layout.items} thumbnailBorders {selectedId} {onselect} />
			{:else}
				<p class="sr-only">{model.points.map((p) => p.label).join('; ')}</p>
			{/if}
		</div>
		<p class="meta scale">Square-root scales · {int(model.points.length)} {plural(model.points.length, 'mission')} plotted</p>
	{:else}
		<p class="meta">No missions with tracked publications and available {rankable ? 'top-10% scores' : 'citation counts'} in this view.</p>
	{/if}
	{#if zeros.length}
		<p class="meta zero-label">No tracked publications: {int(zeros.length)} {plural(zeros.length, 'mission')}</p>
		<div class="stage zero-stage" bind:clientWidth={width} style:height="{layout?.zeroHeight ?? 32}px" role="group" aria-label="Missions with zero tracked publications, separated from the origin to keep each one accessible">
			{#if layout}<Squares tiles={zeros} items={layout.zeroItems} thumbnailBorders {selectedId} {onselect} />{:else}<p class="sr-only">{zeros.map((p) => p.label).join('; ')}</p>{/if}
		</div>
	{/if}
	{#if model.unavailable.length}
		<details><summary class="meta">Scores unavailable: {int(model.unavailable.length)} {plural(model.unavailable.length, 'mission')}</summary><p class="meta">{model.unavailable.join(', ')}.</p></details>
	{/if}
	<MissionReadout id={selectedId} {slug} label={selected?.label ?? 'Selected mission: scores unavailable in this window.'} />
	{#if model.rateLabel}<p class="sr-only">Division reference: {model.rateLabel}.</p>{/if}
</figure>

<style>
	figure { min-width: 0; }
	.guide { color: var(--dust); font-size: 14px; line-height: 1.6; margin-top: 12px; }
	details { margin-top: 12px; }
	summary { cursor: pointer; }
	.stage { position: relative; }
	.axis-title { margin-top: 16px; }
	text { fill: var(--dust); font: 12px var(--sans); }
	.grid { stroke: var(--shadow); }
	.axis { fill: none; stroke: var(--soil); }
	.reference { stroke: var(--dust); stroke-dasharray: 4 4; }
	.scale, .zero-label { margin-top: 12px; }
	.zero-stage { margin-top: 8px; }
</style>
