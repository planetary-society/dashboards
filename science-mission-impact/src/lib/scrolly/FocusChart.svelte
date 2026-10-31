<script>
	// One division's top-10% papers a year by cost, in two steps over the same axes: first the
	// cost axis alone, the squares hanging under it; then each mission's rate as a bar rising from
	// the axis (`grow`, 0–1), the largest named on its bar, under the chart's title. LanesChart
	// draws the bars, on these axes, so the same bars can move into their band on the lanes.
	import { compact as short, moneyTick, weight } from '$lib/format.js';
	import { COST_AXIS_LABEL, minorDollarTicks } from '$lib/charts/costaxis.js';
	import DollarMinorTicks from '$lib/charts/DollarMinorTicks.svelte';

	/** layout: focusLayout(). name: the division's, for the title. largest: the mission the copy names on its bar ({ id, name }). */
	let { layout, name, largest = null, grow = 0, bars = false, visible = false, compact = false, width, height } = $props();

	const c = $derived(layout.chart);
	// a phone is too narrow for the title on one line: it breaks before the division's name
	const titleLines = $derived(compact ? ['High-impact papers published per year', `in ${name}, by mission`] : [`High-impact papers published per year in ${name}, by mission`]);
	const top = $derived(layout.facts.points.find((p) => p.credit > 0 && p.id === largest?.id));
</script>

<div class="focus" class:visible class:bars class:compact aria-hidden="true">
	<DollarMinorTicks positions={minorDollarTicks(...c.x.domain()).map(c.x)} top={c.y(0)} />
	<svg {width} {height}>
		{#each c.ticks as t (t.value)}
			{#if t.grid}<line class="vgrid" x1={c.x(t.value)} x2={c.x(t.value)} y1={c.top} y2={c.y(0)} />{/if}
		{/each}
		<g class="counts">
			{#each c.yTicks as v (v)}
				<line class="grid" x1={c.left} x2={c.right} y1={c.y(v)} y2={c.y(v)} />
				<text x={c.left - 8} y={c.y(v)} dy="0.32em" text-anchor="end">{short(v)}</text>
			{/each}
			<!-- the chart's title, top right like the primer's -->
			{#each titleLines as line, i (i)}<text class="stage-title" x={c.right} y={c.top - 16 - (titleLines.length - 1 - i) * 15} text-anchor="end">{line}</text>{/each}
		</g>
		<line class="base" x1={c.left} x2={c.right} y1={c.y(0)} y2={c.y(0)} />
		{#each c.ticks as t (t.value)}
			{#if t.label}<text x={c.x(t.value)} y={c.tickY} text-anchor="middle">{moneyTick(t.value)}</text>{/if}
		{/each}
		<text x={(c.x0 + c.x1) / 2} y={c.axisY} text-anchor="middle">{COST_AXIS_LABEL}</text>
		{#if top && grow > 0.5}
			<text class="strong callout" x={c.x(top.cost)} y={c.y(top.credit) - 8} text-anchor="middle">{top.name} {weight(top.credit)}</text>
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

	.base {
		stroke: var(--soil);
	}
</style>
