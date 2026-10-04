<script>
	// The whole corpus as a waffle: one box per `unit` mission papers in reading order, the boxes
	// of the missions at or under the threshold first and in Neptune, a partial box for the
	// remainder, the rest resting grey. The legend sits in the band waffleLayout reserves.
	// `build` (0..1, scroll-driven) reveals the boxes in reading order from the top-left, so the
	// blue boxes arrive first and the grey corpus fills in behind them; once built, a ring draws round them.
	import { int, money } from '$lib/format.js';

	/** layout: waffleLayout() result. referenceCost: the threshold, $M. build: 0..1. */
	let { layout, referenceCost, build = 1, visible = false, compact = false, width, height } = $props();

	const cells = $derived(Array.from({ length: layout.cells }, (_, i) => ({ x: layout.x0 + (i % layout.cols) * layout.pitch, y: layout.y0 + Math.floor(i / layout.cols) * layout.pitch })));
	const partial = $derived(layout.partial ? cells[layout.full] : null);
	const partialH = $derived(layout.size * layout.fraction);
	// cell i shows once i < shown: reading order
	const shown = $derived(Math.round(build * layout.cells));
	const done = $derived(build >= 0.98);
	const ring = $derived(layout.ring);
</script>

<div class="waffle" class:visible class:compact aria-hidden="true">
	<svg {width} {height}>
		{#each cells as c, i}
			<rect class={i < layout.full ? 'on' : 'off'} class:hidden={i >= shown} x={c.x} y={c.y} width={layout.size} height={layout.size} />
		{/each}
		{#if partial}<rect class="on" class:hidden={layout.full >= shown} x={partial.x} y={partial.y + layout.size - partialH} width={layout.size} height={partialH} />{/if}
		{#if ring}
			<path class="ring" class:done d={ring.d} pathLength="1" stroke-dasharray="1" />
			<text class="count" class:done x={ring.label.x} y={ring.label.y} dominant-baseline={ring.label.below ? 'hanging' : 'central'}>{int(layout.part)} papers</text>
		{/if}
	</svg>
	<p class="legend" style:left="{layout.x0}px" style:right="{width - layout.x0 - layout.width}px" style:bottom="{layout.margin}px">
		<span><i class="on"></i>Missions at {money(referenceCost)} or less</span>
		<span><i></i>All other missions</span>
		<span>{compact ? '' : '· '}1 box = {int(layout.unit)} mission papers</span>
	</p>
</div>

<style>
	.waffle {
		position: absolute;
		inset: 0;
		opacity: 0;
		transition: opacity 400ms linear;
		pointer-events: none;
	}

	.waffle.visible {
		opacity: 1;
	}

	svg {
		position: absolute;
		inset: 0;
		overflow: visible;
	}

	rect {
		shape-rendering: crispEdges;
		transition: opacity 180ms linear;
	}

	rect.hidden {
		opacity: 0;
	}

	rect.on {
		fill: var(--neptune);
	}

	rect.off {
		fill: var(--square);
	}

	/* hidden through the build-out; once built, the ring draws in and the count fades in with it */
	.ring {
		fill: none;
		stroke: var(--white);
		stroke-width: 1.5px;
		stroke-dashoffset: 1;
		opacity: 0;
	}

	.ring.done {
		stroke-dashoffset: 0;
		opacity: 1;
		transition: stroke-dashoffset 600ms ease-out;
	}

	.count {
		fill: var(--white);
		font-size: 12px;
		paint-order: stroke;
		stroke: var(--black);
		stroke-width: 3px;
		opacity: 0;
	}

	.compact .count {
		font-size: 11px;
	}

	.count.done {
		opacity: 1;
		transition: opacity 600ms linear;
	}

	/* one line on a desktop stage; on a phone the unit wraps to a second, inside the reserved band */
	.legend {
		position: absolute;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		column-gap: 14px;
		color: var(--dust);
		font-size: 12px;
		line-height: 16px;
	}

	.compact .legend {
		column-gap: 10px;
		font-size: 11px;
		line-height: 14px;
	}

	.legend span {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		white-space: nowrap;
	}

	.legend i {
		display: inline-block;
		width: 9px;
		height: 9px;
		background: var(--square);
	}

	.legend i.on {
		background: var(--neptune);
	}
</style>
