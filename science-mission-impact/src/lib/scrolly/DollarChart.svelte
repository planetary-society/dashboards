<script>
	// Citations per dollar against cost, both log (geometry in perDollarLayout): one division
	// filling the stage, or every compared division a band each. At most one line through each
	// band's cited missions: one the story imagines (`would`, dashed, in the lone band only), or the
	// best fit, which `turn` swings up from flat to its packaged slope (0–1). Bands share one rate
	// scale, so a line's tilt reads the same in each; the figures beside them come from the
	// packaged fits (each layout row's `fit`). Every fit is drawn alike, flat or not; a nearly flat
	// one says so in its band's label.
	import { compact as short, moneyTick } from '$lib/format.js';
	import { minorDollarTicks } from '$lib/charts/costaxis.js';
	import DollarMinorTicks from '$lib/charts/DollarMinorTicks.svelte';
	import { flat } from '$lib/copy/discussion.js';
	import { trendLine } from '$lib/charts/perdollar.js';

	/**
	 * layout: perDollarLayout(). would: the imagined line, { slope, label, shown }; it keeps its
	 * slope while hidden, so it fades where it stands. turn: how far the best fit has swung from
	 * flat to its slope; null draws none. title: the chart's title, over a layout made `titled`.
	 */
	let { layout, title = null, would = null, turn = 1, visible = false, compact = false, width, height } = $props();

	const single = $derived(layout.rows.length === 1);
	const [x0, x1] = $derived(layout.x.range());
	// a lone band on a shared axis with no gutter (a phone's lanes) labels its scale inside the plot
	const inside = $derived(single && x0 < 30);
	const imagined = $derived(single && would ? layout.rows.map((row) => trendLine(layout, row, would.slope)) : []);
	const best = $derived(layout.rows.map((row) => (row.fit && turn != null ? trendLine(layout, row, row.fit.slope * turn) : null)));
</script>

<div class="dollar" class:visible class:compact class:single aria-hidden="true">
	{#if !single}
		{#each layout.rows as row (row.slug)}
			<span class="band" class:alt={row.band} style:top="{row.y}px" style:height="{row.h}px"></span>
		{/each}
		<span class="band" style:top="{layout.bottomY}px"></span>
	{/if}
	<DollarMinorTicks positions={minorDollarTicks(...layout.x.domain()).map(layout.x)} top={layout.bottomY} />
	{#each layout.ticks as t (t)}
		<span class="tick" style:left="{layout.x(t)}px" style:top="{layout.bottomY + 5}px">{moneyTick(t)}</span>
	{/each}

	<svg {width} {height}>
		<!-- the chart's title, top right like the overview's other charts -->
		{#if title}<text class="stage-title" x={x1} y={layout.top - 12} text-anchor="end">{title}</text>{/if}
		{#each layout.ticks as t (t)}
			<line class="grid" x1={layout.x(t)} x2={layout.x(t)} y1={layout.top} y2={layout.bottomY} />
		{/each}
		{#each layout.rows as row, i (row.slug)}
			{#each layout.rateTicks as r (r)}
				<line class="rate" x1={x0} x2={x1} y1={row.rateY(r)} y2={row.rateY(r)} />
				<!-- the rate scale is labelled once: down the gutter of a lone band, on the first of several -->
				{#if single}
					<text class:callout={inside} x={inside ? x0 + 4 : x0 - 10} y={row.rateY(r)} dy={inside ? '-0.4em' : '0.32em'} text-anchor={inside ? 'start' : 'end'}>{short(r)}</text>
				{:else if i === 0 && (!compact || r === layout.rateTicks.at(-1))}
					<text class="rate-label" x={compact ? x1 : x1 + 6} y={row.rateY(r)} dy={compact ? '-0.4em' : '0.32em'} text-anchor={compact ? 'end' : 'start'}>{short(r)}</text>
				{/if}
			{/each}
			<line class="shelf" x1={x0} x2={x1} y1={row.shelfY} y2={row.shelfY} />
			{#if single}<text class:callout={inside} x={inside ? x0 + 4 : x0 - 10} y={inside ? row.floorY : (row.shelfY + row.floorY) / 2} dy={inside ? '-0.4em' : '0.32em'} text-anchor={inside ? 'start' : 'end'}>None</text>{/if}
			{@const line = imagined[i]}
			{#if line}
				<g class="would" class:shown={would.shown}>
					<line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
				</g>
			{/if}
			{#if best[i]}
				<line class="fit" x1={best[i].x1} y1={best[i].y1} x2={best[i].x2} y2={best[i].y2} />
			{/if}
		{/each}
	</svg>

	<!-- the lone band's line labels, in HTML so they sit over the squares the stage draws after this
	     chart: the imagined line's at its cheap end, the best fit's at its costly end, both above the line -->
	{#if single && imagined[0] && would.label}
		<span class="label would-label" class:shown={would.shown} style:left="{imagined[0].x1 - 4}px" style:top="{imagined[0].y1 - 6}px">{would.label}</span>
	{/if}
	{#if single && best[0] && turn > 0.9}
		<span class="label fit-label" style:left="{best[0].x2 + 4}px" style:top="{best[0].y2 - 6}px">Best fit</span>
	{/if}

	{#if !single}
		{#each layout.rows as row (row.slug)}
			<span class="row" class:alt={row.band} style:top="{row.y}px" style:width={compact ? null : `${layout.left - 12}px`}>
				<span class="name">{row.label}</span>
				{#if row.fit}<span class="meta">{#if flat(row.fit)}<span>Nearly flat</span>{:else}<span>{row.fit.tenfold.toFixed(1)}× per dollar</span> <span>at 10× the cost</span>{/if}</span>{/if}
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
		left: 0;
		right: 0;
		border-top: 1px solid var(--shadow);
	}

	.band.alt {
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

	.shelf {
		stroke: var(--soil);
	}

	.callout {
		paint-order: stroke;
		stroke: var(--black);
		stroke-width: 3px;
		stroke-linejoin: round;
	}

	/* the imagined line fades in and out; the best fit takes its place rather than joining it */
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

	.fit {
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
		left: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px 12px 0 0;
	}

	.name {
		font-size: 15px;
		line-height: 20px;
		font-weight: 500;
		color: var(--white);
	}

	/* two unbroken lines, which fit the narrow side gutter */
	.meta {
		font-size: 11px;
		line-height: 15px;
		color: var(--dust);
	}

	.meta > span {
		display: block;
		white-space: nowrap;
	}

	.compact .meta > span {
		display: inline;
	}

	/* on a phone the label sits inside the plot, on a backing of its band's colour */
	.compact .row {
		flex-direction: row;
		align-items: baseline;
		gap: 8px;
		margin-top: 1px;
		padding: 1px 6px 2px 4px;
		background: var(--black);
	}

	.compact .row.alt {
		background: var(--band);
	}

	.compact .name {
		font-size: 12px;
		line-height: 16px;
	}
</style>
