<script>
	// One division's running total, built in three steps over the same axes. First the cost axis
	// alone, the squares hanging under it; then each mission's top-10% papers as a bar rising from
	// the axis (`grow`, 0–1); then the bars climb, cheapest first, until each sits on top of the
	// ones before it, and the running-total line is drawn through them (`stack`, `draw`, 0–1).
	import { compact as short, int, money, moneyTick } from '$lib/format.js';
	import { minorDollarTicks } from '$lib/charts/costaxis.js';
	import DollarMinorTicks from '$lib/charts/DollarMinorTicks.svelte';

	/**
	 * layout: focusLayout(). referenceCost: the threshold. largest: the mission the copy names on its
	 * bar ({ id, name }). small: the label for the threshold side, already worded by the story.
	 */
	let { layout, referenceCost, largest = null, small = '', total = '', grow = 0, stack = 0, draw = 0, bars = false, visible = false, compact = false, width, height } = $props();

	const clamp01 = (v) => Math.max(0, Math.min(1, v));
	const c = $derived(layout.chart);
	const refX = $derived(c.x(referenceCost));
	const credited = $derived(layout.facts.points.filter((p) => p.credit > 0));
	const bw = $derived(compact ? 3 : 5);
	// each bar climbs in its turn, cheapest first; all are in place by stack = 1
	const climbed = (i) => clamp01(stack * 1.5 - (i / Math.max(1, credited.length)) * 0.5);
	const top = $derived(credited.find((p) => p.id === largest?.id));
</script>

<div class="focus" class:visible class:bars class:compact aria-hidden="true">
	<DollarMinorTicks positions={minorDollarTicks(...c.x.domain()).map(c.x)} top={c.y(0)} />
	<svg {width} {height}>
		<rect class="zone" x={c.left} y={c.top} width={Math.max(0, refX - c.left)} height={c.y(0) - c.top} />
		{#each c.ticks as t (t.value)}
			{#if t.grid}<line class="vgrid" x1={c.x(t.value)} x2={c.x(t.value)} y1={c.top} y2={c.y(0)} />{/if}
		{/each}
		<g class="counts">
			{#each c.yTicks as v (v)}
				<line class="grid" x1={c.left} x2={c.right} y1={c.y(v)} y2={c.y(v)} />
				<text x={c.left - 8} y={c.y(v)} dy="0.32em" text-anchor="end">{short(v)}</text>
			{/each}
			<text x={c.left - 8} y={c.top - 16} text-anchor="start">Top-10% papers</text>
		</g>
		<line class="reference" x1={refX} x2={refX} y1={c.top - 4} y2={c.y(0)} />
		<text class="strong" x={refX} y={c.top - 22} text-anchor="middle">{money(referenceCost)}</text>
		{#each credited as p, i (p.id)}
			{@const k = climbed(i)}
			{@const base = (p.total - p.credit) * k}
			{@const h = (c.y(0) - c.y(p.credit)) * clamp01(grow)}
			<rect class="bar" x={c.x(p.cost) - bw / 2} y={c.y(base) - h} width={bw} height={h} />
		{/each}
		{#if c.path}<path d={c.path} pathLength="1" style:stroke-dashoffset={1 - clamp01(draw)} />{/if}
		<line class="base" x1={c.left} x2={c.right} y1={c.y(0)} y2={c.y(0)} />
		{#each c.ticks as t (t.value)}
			{#if t.label}<text x={c.x(t.value)} y={c.axisY} text-anchor="middle">{moneyTick(t.value)}</text>{/if}
		{/each}
		{#if top && grow > 0.5 && stack < 0.2}
			<text class="strong callout" x={c.x(top.cost)} y={c.y(top.credit) - 8} text-anchor="middle">{top.name} {int(top.credit)}</text>
		{/if}
		{#if small && grow > 0.5}
			<text class="strong callout" x={refX - 6} y={c.y(0) - 10} text-anchor="end">{small}</text>
		{/if}
		{#if total && draw > 0.9}
			<text class="strong callout" x={c.right} y={c.y(layout.facts.total) - 10} text-anchor="end">{total}</text>
		{/if}
	</svg>
</div>

<style>
	.focus {
		position: absolute;
		inset: 0;
		opacity: 0;
		transition: opacity 400ms linear;
		pointer-events: none;
	}

	.focus.visible {
		opacity: 1;
	}

	svg {
		position: absolute;
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

	text.strong {
		fill: var(--white);
		font-weight: 500;
	}

	.callout {
		paint-order: stroke;
		stroke: var(--black);
		stroke-width: 3px;
		stroke-linejoin: round;
	}

	/* the threshold side of the axis */
	.zone {
		fill: var(--strip-empty);
	}

	.grid,
	.vgrid {
		stroke: var(--shadow);
	}

	.vgrid {
		opacity: 0.6;
	}

	/* the count scale only matters once there are bars to read against it */
	.counts {
		opacity: 0;
		transition: opacity 400ms linear;
	}

	.bars .counts {
		opacity: 1;
	}

	.reference {
		stroke: var(--white);
		stroke-dasharray: 4 4;
	}

	.base {
		stroke: var(--soil);
	}

	.bar {
		fill: var(--neptune);
	}

	path {
		fill: none;
		stroke: var(--neptune-mid);
		stroke-width: 2;
		stroke-dasharray: 1 1;
	}
</style>
