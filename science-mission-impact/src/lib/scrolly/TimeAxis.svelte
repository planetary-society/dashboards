<script>
	// Furniture for time on the cost axis: years run down from the start of science, build time
	// rises above it as one hairline per mission, and the "never" lane closes the bottom.
	import { int, moneyTick } from '$lib/format.js';
	import { minorDollarTicks } from '$lib/charts/costaxis.js';
	import DollarMinorTicks from '$lib/charts/DollarMinorTicks.svelte';

	/** layout: timeLayout() result. ticks: the cost layout's x ticks. */
	let { layout, ticks, referenceCost, visible = true, compact = false, width, height } = $props();

	const y0 = $derived(layout.y(0));
	const [x0, x1] = $derived(layout.x.range());
	const referenceX = $derived(referenceCost > 0 ? layout.x(referenceCost) : null);
	// above the line the years are build time, below it years of science
	const label = (t) => (t === 0 ? (compact ? 'Start' : 'Science starts') : t < 0 ? `${-t} yr build` : `${t} yr`);
</script>

<div class="axis" class:visible class:compact>
	<DollarMinorTicks positions={minorDollarTicks(...layout.x.domain()).map(layout.x)} />
	{#each ticks as t (t)}
		<span class="cost" style:left="{layout.x(t)}px">{moneyTick(t)}</span>
	{/each}

	<svg {width} {height} aria-hidden="true">
		{#if referenceX != null && referenceX >= x0 && referenceX <= x1}
			<line class="reference" x1={referenceX} x2={referenceX} y1={24} y2={height} />
		{/if}
		{#each layout.ticks as t (t)}
			<line class="rule" class:zero={t === 0} x1={x0} x2={x1} y1={layout.y(t)} y2={layout.y(t)} />
		{/each}
		{#each layout.hairlines as h (h.id)}
			<line class="build" x1={h.x} x2={h.x} y1={y0} y2={h.y} />
			<line class="build cap" x1={h.x - 2} x2={h.x + 2} y1={h.y} y2={h.y} />
		{/each}
		<line class="rule never" x1={x0} x2={x1} y1={layout.neverTop} y2={layout.neverTop} />
	</svg>

	{#each layout.ticks as t (t)}
		<span class="tick meta" class:inside={!layout.left} style:top="{layout.y(t)}px" style:width={layout.left ? `${layout.left - 8}px` : null}>{label(t)}</span>
	{/each}
	<span class="never-label" style:top="{layout.neverTop + 2}px" style:left="{x0 + 4}px">No observed milestone: {int(layout.never)}</span>
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

	.cost {
		top: 0;
		transform: translateX(-50%);
		font-size: 12px;
		line-height: 16px;
		color: var(--dust);
		white-space: nowrap;
	}

	.rule {
		stroke: var(--shadow);
		stroke-width: 1;
	}

	.rule.zero {
		stroke: var(--soil);
	}

	.rule.never {
		stroke: var(--flame);
		opacity: 0.6;
	}

	.build {
		stroke: var(--outline-filled);
		stroke-width: 1;
	}
	.reference { stroke: var(--white); stroke-width: 1; stroke-dasharray: 4 4; opacity: 0.65; }

	.tick {
		left: 0;
		text-align: right;
		transform: translateY(-50%);
	}

	/* no gutter on a phone: the year labels sit inside the plot, at its right edge */
	.tick.inside {
		left: auto;
		right: 0;
	}

	.never-label {
		font-size: 12px;
		line-height: 16px;
		color: var(--flame);
	}

	.compact .cost,
	.compact .never-label {
		font-size: 10px;
		line-height: 13px;
	}
</style>
