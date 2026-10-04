<script>
	// Furniture for time from project start on the cost axis: the cost ticks along the top, a
	// rule for every few years down from the project-start line, and the lane along the bottom
	// for the missions that never produced a top-10% paper.
	import { int, moneyTick } from '$lib/format.js';
	import { minorDollarTicks } from '$lib/charts/costaxis.js';
	import DollarMinorTicks from '$lib/charts/DollarMinorTicks.svelte';

	/** layout: projectTimeLayout() result. ticks: the cost layout's x ticks. */
	let { layout, ticks, referenceCost, visible = false, compact = false, width, height } = $props();

	const [x0, x1] = $derived(layout.x.range());
	const referenceX = $derived(referenceCost > 0 ? layout.x(referenceCost) : null);
	const label = (t) => (t === 0 ? (compact ? 'Start' : 'Project start') : `${t} yr`);
</script>

<div class="axis" class:visible class:compact>
	<DollarMinorTicks positions={minorDollarTicks(...layout.x.domain()).map(layout.x)} />
	{#each ticks as t (t)}
		<span class="cost" class:reference-tick={t === referenceCost} style:left="{layout.x(t)}px">{moneyTick(t)}</span>
	{/each}

	<svg {width} {height} aria-hidden="true">
		{#if referenceX != null && referenceX >= x0 && referenceX <= x1}
			<line class="reference" x1={referenceX} x2={referenceX} y1={layout.top} y2={height} />
		{/if}
		{#each layout.ticks as t (t)}
			<line class="rule" class:zero={t === 0} x1={x0} x2={x1} y1={layout.y(t)} y2={layout.y(t)} />
		{/each}
		<line class="rule never" x1={x0} x2={x1} y1={layout.neverTop} y2={layout.neverTop} />
	</svg>

	{#each layout.ticks as t (t)}
		<span class="tick meta" class:inside={!layout.left} style:top="{layout.y(t)}px" style:width={layout.left ? `${layout.left - 8}px` : null}>{label(t)}</span>
	{/each}
	<span class="never-label" style:top="{layout.neverTop + 2}px" style:left="{x0 + 4}px">No top-10% paper: {int(layout.never)}</span>
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

	.reference-tick {
		color: var(--white);
		font-weight: 500;
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

	.reference {
		stroke: var(--white);
		stroke-width: 1;
		stroke-dasharray: 4 4;
		opacity: 0.65;
	}

	.tick {
		left: 0;
		text-align: right;
		transform: translateY(-50%);
	}

	/* no gutter on a phone: the year labels sit inside the plot, at its right edge, on a black
	   backing so their rules stop short of them (the squares still draw above it) */
	.tick.inside {
		left: auto;
		right: 0;
		padding-left: 4px;
		background: var(--black);
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
