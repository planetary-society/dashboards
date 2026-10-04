<script>
	// The time-to-science plot's furniture: log cost up, months from science start across, and the
	// least-squares trend. Shared by the division chart and the overview's timing step.
	import { moneyTick } from '$lib/format.js';

	/** layout: timeScienceLayout() result. */
	let { layout, width, height } = $props();
</script>

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
	{#if layout.fit}
		<line class="fit" x1={layout.fit.x1} y1={layout.fit.y1} x2={layout.fit.x2} y2={layout.fit.y2} />
		{@const end = layout.fit.x2 >= layout.fit.x1 ? [layout.fit.x2, layout.fit.y2] : [layout.fit.x1, layout.fit.y1]}
		<text class="fit-label" x={end[0] - 6} y={end[1] - 8} text-anchor="end">Best fit</text>
	{/if}
	<text x={(layout.left + layout.right) / 2} y={height - 4} text-anchor="middle">Months from science start →</text>
</svg>

<style>
	svg { position: absolute; inset: 0; overflow: visible; }
	text { fill: var(--dust); font: 12px var(--sans); }
	.grid { stroke: var(--shadow); }
	.axis { fill: none; stroke: var(--soil); }
	.fit { stroke: var(--soil); stroke-dasharray: 4 4; opacity: 0.7; }
	.fit-label { fill: var(--soil); }
</style>
