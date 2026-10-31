<script>
	// Citations per dollar against cost, both log (geometry in perDollarLayout): one division
	// filling the stage, or every compared division in a two-column grid. At most one line across each
	// band's measured missions, the zeros on its shelf included: one the story imagines (`would`,
	// dashed, in the lone band only), or the packaged running mean, which `turn` fades in. Bands share
	// one rate scale; division pages use the same running means.
	import { compact as short, moneyTick } from '$lib/format.js';
	import { costTicks, minorDollarTicks } from '$lib/charts/costaxis.js';
	import DollarMinorTicks from '$lib/charts/DollarMinorTicks.svelte';
	import CostAxisLabel from '$lib/charts/CostAxisLabel.svelte';
	import { runningLine, trendBand, trendLine } from '$lib/charts/perdollar.js';

	/**
	 * layout: perDollarLayout(). would: the imagined line, { slope, label, shown }; it keeps its
	 * slope while hidden, so it fades where it stands. turn: the running mean's opacity, 0 to 1;
	 * null draws none. title: the chart's title, over a layout made `titled`.
	 * confidence: shade the packaged 95% intervals on completed curves.
	 */
	let { layout, title = null, would = null, turn = 1, confidence = false, visible = false, compact = false, width, height } = $props();
	const uid = $props.id();

	const single = $derived(layout.rows.length === 1);
	const [x0, x1] = $derived(layout.x.range());
	const costLabels = $derived(single ? layout.ticks : costTicks(layout.x).filter((t) => t.grid && t.label).map((t) => t.value));
	// a lone band on a shared axis with no gutter (a phone's lanes) labels its scale inside the plot
	const inside = $derived(single && x0 < 30);
	const imagined = $derived(single && would ? layout.rows.map((row) => trendLine(layout, row, would.slope)) : []);
	const best = $derived(layout.rows.map((row) => turn == null ? null : runningLine(layout, row)));
	const bands = $derived(confidence && turn === 1 ? layout.rows.map((row) =>
		trendBand(layout, row, row.average?.points.map(([cost, , lo, hi]) => [cost, lo, hi]))) : []);
</script>

<div class="dollar" class:visible class:compact class:single aria-hidden="true">
	{#if !single}
		{#each layout.rows as row (row.slug)}
			<span class="band" style:left="{row.left}px" style:width="{row.width}px" style:top="{row.y}px" style:height="{row.h}px"></span>
		{/each}
	{/if}
	{#each layout.rows as row (row.slug)}
		{@const floor = single ? layout.bottomY : row.shelfY}
		<DollarMinorTicks positions={minorDollarTicks(...row.x.domain()).map(row.x)} top={floor} />
		{#each costLabels as t (t)}
			<span class="tick" style:left="{row.x(t)}px" style:top="{floor + 5}px">{moneyTick(t)}</span>
		{/each}
	{/each}
	<CostAxisLabel x0={single ? x0 : 0} x1={single ? x1 : width} floor={layout.bottomY} {compact} />

	<svg {width} {height}>
		<!-- the chart's title, top right like the overview's other charts -->
		{#if title}<text class="stage-title" x={single ? x1 : width - 8} y={layout.top - 12} text-anchor="end">{title}</text>{/if}
		{#each layout.rows as row, i (row.slug)}
			{@const [rx0, rx1] = row.x.range()}
			{@const band = bands[i]}
			{#each layout.ticks as t (t)}
				<line class="grid" x1={row.x(t)} x2={row.x(t)} y1={single ? layout.top : row.curveTop} y2={single ? layout.bottomY : row.shelfY} />
			{/each}
			{#if band}
				<defs><clipPath id="{uid}-confidence-{i}"><rect x={band.x} y={band.y} width={band.width} height={band.height} /></clipPath></defs>
				<path class="confidence" d={band.path} clip-path="url(#{uid}-confidence-{i})" />
			{/if}
			{#each layout.rateTicks as r (r)}
				<line class="rate" x1={rx0} x2={rx1} y1={row.rateY(r)} y2={row.rateY(r)} />
				{#if single}
					<text class:callout={inside} x={inside ? x0 + 4 : x0 - 10} y={row.rateY(r)} dy={inside ? '-0.4em' : '0.32em'} text-anchor={inside ? 'start' : 'end'}>{short(r)}</text>
				{:else}
					<text class="rate-label" x={rx0 - 6} y={row.rateY(r)} dy="0.32em" text-anchor="end">{short(r)}</text>
				{/if}
			{/each}
			<!-- Each grid panel uses its bottom border as the baseline. -->
			{#if single}<line class="shelf" x1={x0} x2={x1} y1={row.shelfY} y2={row.shelfY} />{/if}
			{#if single}<text class:callout={inside} x={inside ? x0 + 4 : x0 - 10} y={inside ? row.floorY : (row.shelfY + row.floorY) / 2} dy={inside ? '-0.4em' : '0.32em'} text-anchor={inside ? 'start' : 'end'}>None</text>{/if}
			{@const line = imagined[i]}
			{#if line}
				<g class="would" class:shown={would.shown}>
					<line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
				</g>
			{/if}
			{#if best[i]}<path class="fit" d={best[i].path} opacity={turn} />{/if}
		{/each}
	</svg>

	<!-- the lone band's line labels, in HTML so they sit over the squares the stage draws after this
	     chart: the imagined line's at its cheap end, the running average's at its costly end, both above the line -->
	{#if single && imagined[0] && would.label}
		<span class="label would-label" class:shown={would.shown} style:left="{imagined[0].x1 - 4}px" style:top="{imagined[0].y1 - 6}px">{would.label}</span>
	{/if}
	{#if single && best[0] && turn > 0.9}
		<span class="label fit-label" style:left="{best[0].x2 + 4}px" style:top="{best[0].y2 - 6}px">Running average</span>
	{/if}

	{#if !single}
		{#each layout.rows as row (row.slug)}
			<span class="row" style:left="{row.left}px" style:top="{row.y}px" style:width="{row.width}px">
				<span class="name">{row.label}</span>
			</span>
		{/each}
	{/if}
</div>

<style>
	.dollar {
		position: absolute;
		inset: 0;
		opacity: 0;
		transition: opacity 400ms linear;
		pointer-events: none;
	}

	.dollar.visible {
		opacity: 1;
	}

	.dollar > span,
	svg {
		position: absolute;
	}

	svg {
		inset: 0;
		overflow: visible;
	}

	text {
		fill: var(--dust);
		font: 12px var(--sans);
	}

	.compact text {
		font-size: 11px;
	}

	.band {
		border-bottom: 1px solid var(--shadow);
		background: var(--band);
	}

	.tick {
		transform: translateX(-50%);
		font-size: 12px;
		line-height: 16px;
		color: var(--dust);
		white-space: nowrap;
	}

	.compact .tick {
		font-size: 10px;
		line-height: 13px;
	}

	.grid {
		stroke: var(--shadow);
		opacity: 0.6;
	}

	.rate {
		stroke: var(--shadow);
		opacity: 0.7;
	}

	.rate-label {
		font-size: 10px;
		fill: var(--soil);
	}

	.compact .rate-label {
		font-size: 9px;
	}

	.shelf {
		stroke: var(--soil);
	}

	.callout {
		paint-order: stroke;
		stroke: var(--black);
		stroke-width: 3px;
		stroke-linejoin: round;
	}

	/* the imagined line fades in and out; the running average takes its place rather than joining it */
	.would {
		opacity: 0;
		transition: opacity 400ms linear;
	}

	.would.shown {
		opacity: 1;
	}

	.would line {
		stroke: var(--dust);
		stroke-width: 1.5;
		stroke-dasharray: 6 5;
	}

	.confidence {
		fill: var(--neptune);
		fill-opacity: 0.14;
	}

	.fit {
		fill: none;
		stroke: var(--neptune);
		stroke-width: 3;
		stroke-linecap: round;
	}

	.compact:not(.single) .fit {
		stroke-width: 2;
	}

	/* over the squares (z-index), on a black backing so a thumbnail under it can't break it up */
	.label {
		z-index: 3;
		padding: 0 4px;
		transform: translateY(-100%);
		font-size: 12px;
		line-height: 16px;
		color: var(--dust);
		background: var(--black);
		white-space: nowrap;
	}

	.compact .label {
		font-size: 11px;
		line-height: 14px;
	}

	.would-label {
		opacity: 0;
		transition: opacity 400ms linear;
	}

	.would-label.shown {
		opacity: 1;
	}

	.fit-label {
		transform: translate(-100%, -100%);
		color: var(--neptune);
		font-weight: 500;
	}

	.row {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 6px 4px 0;
	}

	.name {
		font-size: 15px;
		line-height: 20px;
		font-weight: 500;
		color: var(--white);
	}

	.compact .row {
		gap: 0;
		padding-top: 3px;
	}

	.compact .name {
		font-size: 12px;
		line-height: 16px;
	}
</style>
