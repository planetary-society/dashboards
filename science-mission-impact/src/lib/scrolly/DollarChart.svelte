<script>
	// Citations per dollar against cost, both log (geometry in perDollarLayout): one division
	// filling the stage, or every compared division a band each. At most one line through each
	// band's cited missions: one the story imagines (`would`, dashed, in the lone band only), or the
	// best fit, which `turn` swings up from flat to its packaged slope (0–1). Bands share one rate
	// scale, so a line's tilt reads the same in each; the figures beside them come from the
	// packaged fits (each layout row's `fit`).
	import { compact as short, money, moneyTick } from '$lib/format.js';
	import { minorDollarTicks } from '$lib/charts/costaxis.js';
	import DollarMinorTicks from '$lib/charts/DollarMinorTicks.svelte';
	import { trendLine } from './layouts.js';

	/**
	 * layout: perDollarLayout(). would: the imagined line, { slope, label, shown }; it keeps its
	 * slope while hidden, so it fades where it stands. turn: how far the best fit has swung from
	 * flat to its slope; null draws none.
	 */
	let { layout, referenceCost, would = null, turn = 1, visible = false, compact = false, width, height } = $props();

	const single = $derived(layout.rows.length === 1);
	const [x0, x1] = $derived(layout.x.range());
	const refX = $derived(layout.x(referenceCost));
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
	<DollarMinorTicks positions={minorDollarTicks(...layout.x.domain()).map(layout.x)} />
	{#each layout.ticks as t (t)}
		<!-- a decade label that would touch the threshold's own label gives way to it -->
		{#if Math.abs(layout.x(t) - refX) > (compact ? 34 : 44)}<span class="tick" style:left="{layout.x(t)}px">{moneyTick(t)}</span>{/if}
	{/each}

	<svg {width} {height}>
		<rect class="zone" x={x0} y={layout.top} width={Math.max(0, refX - x0)} height={layout.bottomY - layout.top} />
		{#each layout.ticks as t (t)}
			<line class="grid" x1={layout.x(t)} x2={layout.x(t)} y1={layout.top} y2={layout.bottomY} />
		{/each}
		<line class="reference" x1={refX} x2={refX} y1={layout.top} y2={layout.bottomY} />
		{#each layout.rows as row, i (row.slug)}
			{#each layout.rateTicks as r (r)}
				<line class="rate" x1={x0} x2={x1} y1={row.rateY(r)} y2={row.rateY(r)} />
				<!-- the rate scale is labelled once: down the gutter of a lone band, on the first of several -->
				{#if single}
					<text x={x0 - 10} y={row.rateY(r)} dy="0.32em" text-anchor="end">{short(r)}</text>
				{:else if i === 0 && (!compact || r === layout.rateTicks.at(-1))}
					<text class="rate-label" x={compact ? x1 : x1 + 6} y={row.rateY(r)} dy={compact ? '-0.4em' : '0.32em'} text-anchor={compact ? 'end' : 'start'}>{short(r)}</text>
				{/if}
			{/each}
			<line class="shelf" x1={x0} x2={x1} y1={row.shelfY} y2={row.shelfY} />
			{#if single}<text x={x0 - 10} y={(row.shelfY + row.floorY) / 2} dy="0.32em" text-anchor="end">None</text>{/if}
			{@const line = imagined[i]}
			{#if line}
				<g class="would" class:shown={would.shown}>
					<line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
					<!-- labelled at the cheap end, above the line, where cited missions are fewest -->
					{#if would.label}<text class="callout" x={line.x1} y={line.y1 - 10}>{would.label}</text>{/if}
				</g>
			{/if}
			{#if best[i]}
				<line class="fit" x1={best[i].x1} y1={best[i].y1} x2={best[i].x2} y2={best[i].y2} />
				{#if single && turn > 0.9}<text class="callout fit-label" x={best[i].x2} y={best[i].y2 - 10} text-anchor="end">Best fit</text>{/if}
			{/if}
		{/each}
	</svg>
	<span class="tick strong" style:left="{refX}px">{money(referenceCost)}</span>

	{#if !single}
		{#each layout.rows as row (row.slug)}
			<span class="row" class:alt={row.band} style:top="{row.y}px" style:width={compact ? null : `${layout.left - 12}px`}>
				<span class="name">{row.label}</span>
				{#if row.fit}<span class="meta"><span>{row.fit.tenfold.toFixed(1)}× per dollar</span> <span>at 10× the cost</span></span>{/if}
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
		top: 0;
		transform: translateX(-50%);
		font-size: 12px;
		line-height: 16px;
		color: var(--dust);
		white-space: nowrap;
	}

	/* the lanes' threshold label, so the axis doesn't shift when the lanes hand over to the bands */
	.tick.strong {
		color: var(--white);
		font-weight: 500;
		background: var(--black);
		padding-inline: 4px;
	}

	.compact .tick {
		font-size: 10px;
		line-height: 13px;
	}

	/* the threshold side of the axis */
	.zone {
		fill: var(--strip-empty);
		opacity: 0.8;
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

	.reference {
		stroke: var(--white);
		stroke-dasharray: 4 4;
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

	text.fit-label {
		fill: var(--neptune);
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
