<script>
	// Furniture for the cost layout: division bands, one log cost axis, and above each shelf the
	// division's running share of top papers (Neptune) against its running share of spending
	// (grey), both read left to right in cost order.
	import { int, money, moneyTick, plural } from '$lib/format.js';
	import { costCurve } from './layouts.js';
	import { minorDollarTicks, stepAfterPath } from '$lib/charts/costaxis.js';
	import DollarMinorTicks from '$lib/charts/DollarMinorTicks.svelte';

	/**
	 * layout: costLayout() result, whose rows carry their own missions in cost order. bands:
	 * StoryBand-like, one per division ({ division, p25, p50, p75, cheapestWithTop }).
	 * share: (tile) => share of division top papers.
	 * progress: 0..1, how much of each line is drawn. showBands: shade p25..p75. showSpend: draw
	 * the running share of spending. pooled: { p25, p75 } across the divisions, drawn as one
	 * column behind every row.
	 */
	let { layout, bands = [], unranked, share, referenceCost, progress = 1, showBands = false, showSpend = true, pooled = null, visible = true, compact = false, width, height } = $props();

	const bandOf = $derived(new Map(bands.map((b) => [b.division, b])));
	const [x0, x1] = $derived(layout.x.range());
	const referenceX = $derived(referenceCost > 0 ? layout.x(referenceCost) : null);

	// Both lines are steps: a mission adds its papers (or its cost) at the point it sits on the axis.
	function stepPath(points, row, value) {
		const y = (v) => row.shelfY - v * (row.shelfY - row.curveTop);
		return stepAfterPath(points, { x: layout.x, y, x0, x1, value });
	}

	const rows = $derived(
		layout.rows.map((row) => {
			const ranked = !unranked.has(row.slug);
			const points = ranked ? costCurve(row.members, share) : [];
			const hasTop = points.some((p) => p.topShare > 0);
			return {
				...row,
				ranked,
				top: hasTop ? stepPath(points, row, (p) => p.topShare) : null,
				cost: points.length ? stepPath(points, row, (p) => p.costShare) : null,
				span: bandOf.get(row.slug)
			};
		})
	);
</script>

<div class="axis" class:visible class:compact>
	{#each layout.rows as row (row.slug)}
		<span class="band" class:alt={row.band} style:top="{row.y}px" style:height="{row.h}px"></span>
	{/each}
	<span class="band closing" style:top="{layout.bottomY}px"></span>
	<DollarMinorTicks positions={minorDollarTicks(...layout.x.domain()).map(layout.x)} />

	{#each layout.ticks as t (t)}
		<span class="tick" class:reference-tick={t === referenceCost} style:left="{layout.x(t)}px">{moneyTick(t)}</span>
		<span class="grid" style:left="{layout.x(t)}px" style:top="{layout.top}px" style:height="{layout.bottomY - layout.top}px"></span>
	{/each}

	<svg {width} {height} aria-hidden="true">
		{#if showBands && pooled?.p25 != null}
			<rect class="pooled" x={layout.x(pooled.p25)} y={layout.top} width={Math.max(2, layout.x(pooled.p75) - layout.x(pooled.p25))} height={layout.bottomY - layout.top} />
			<line class="pooled-cap" x1={layout.x(pooled.p25)} x2={layout.x(pooled.p75)} y1={layout.top + 0.5} y2={layout.top + 0.5} />
		{/if}
		{#if referenceX != null && referenceX >= x0 && referenceX <= x1}
			<line class="reference" x1={referenceX} x2={referenceX} y1={layout.top} y2={layout.bottomY} />
		{/if}
		{#each rows as row (row.slug)}
			{#if showBands && row.span?.p25 != null}
				<rect class="span" x={layout.x(row.span.p25)} y={row.curveTop} width={Math.max(2, layout.x(row.span.p75) - layout.x(row.span.p25))} height={row.shelfY - row.curveTop} />
			{/if}
			{#if row.cost && showSpend}<path class="cost" d={row.cost} pathLength="1" style:stroke-dashoffset={1 - progress} />{/if}
			{#if row.top}<path class="top" d={row.top} pathLength="1" style:stroke-dashoffset={1 - progress} />{/if}
			<line class="shelf" x1={x0} x2={x1} y1={row.shelfY} y2={row.shelfY} />
		{/each}
	</svg>

	{#each rows as row (row.slug)}
		<span class="row" style:top="{row.y}px" style:width={compact ? null : `${layout.left}px`}>
			<span class="name">{row.label}</span>
			<span class="meta">
				{int(row.missions)} {plural(row.missions, 'mission')}{row.ranked ? '' : ', too few papers to rank'}
			</span>
		</span>
		{#if showBands && row.span?.p25 != null}
			<span class="figure" style:left="{layout.x(row.span.p25)}px" style:top="{row.shelfY}px">
				{money(row.span.p25)} to {money(row.span.p75)}
			</span>
		{/if}
	{/each}
</div>

<style>
	.axis {
		position: absolute;
		inset: 0;
		opacity: 0;
		transition: opacity 400ms linear;
		pointer-events: none;
	}

	.axis.visible {
		opacity: 1;
	}

	.axis > span,
	svg {
		position: absolute;
	}

	svg {
		inset: 0;
		overflow: visible;
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

	.grid {
		width: 1px;
		background: var(--shadow);
		opacity: 0.6;
	}
	.reference { stroke: var(--white); stroke-width: 1; stroke-dasharray: 4 4; opacity: 0.65; }
	.reference-tick { color: var(--white); font-weight: 500; }

	.shelf {
		stroke: var(--soil);
		stroke-width: 1;
	}

	path {
		fill: none;
		stroke-dasharray: 1;
		stroke-linejoin: miter;
	}

	.top {
		stroke: var(--neptune);
		stroke-width: 2;
	}

	.cost {
		stroke: var(--soil);
		stroke-width: 1;
	}

	.span {
		fill: var(--neptune);
		opacity: 0.22;
		transition: opacity 400ms linear;
	}

	/* the one range the divisions share, behind their own */
	.pooled {
		fill: var(--white);
		opacity: 0.06;
	}

	.pooled-cap {
		stroke: var(--white);
		stroke-width: 1;
		opacity: 0.7;
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

	.figure {
		padding-top: 3px;
		font-size: 13px;
		line-height: 16px;
		color: var(--white);
		white-space: nowrap;
	}

	.compact .row {
		flex-direction: row;
		align-items: baseline;
		gap: 8px;
		padding: 2px 0 0 4px;
	}

	.compact .name {
		font-size: 12px;
		line-height: 16px;
	}

	.compact .tick,
	.compact .figure {
		font-size: 10px;
		line-height: 13px;
	}
</style>
