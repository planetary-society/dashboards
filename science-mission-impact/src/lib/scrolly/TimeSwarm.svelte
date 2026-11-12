<script>
	// TIME_FORM and TIME_SCI: years to each mission's first high-impact paper, one band per cost group
	// (geometry in timeSwarmLayout). The stage's mission squares are the marks (`timeItems`, drawn by
	// Squares over this chart): each mission that reached one at its own years, each without one in the
	// None column, dimmed. This draws what goes under them (bands, gridlines, each median's 95%
	// interval, the None strip, the axis) and what goes over them: each median's line and
	// value, and the pointed-at mission's name, on a layer stacked above the squares.
	import CostAxisLabel from '$lib/charts/CostAxisLabel.svelte';
	import { CLOCKS, timeLabel } from './timeswarm.js';
	import { breakTitle } from './layouts.js';

	/**
	 * layout: timeSwarmLayout(). clock: 'formulation' or 'science'. title: over the plot, top right
	 * (on a phone it breaks after its comma). axis: the label under the year axis. hot: the
	 * pointed-at mission's id.
	 */
	let { layout, clock = 'formulation', title = null, axis = '', hot = null, visible = false, compact = false, width, height } = $props();
	const active = $derived(layout.clocks[clock]);
	const titleLines = $derived(breakTitle(title, compact));
	const tag = $derived(timeLabel(layout, clock, hot));
	const plotH = $derived(layout.axisY - layout.top);
	const uid = $props.id();
	// Every tick of both clocks, each placed on the active clock's scale and keyed by its year, so a
	// change of clock slides each gridline and label from its old place to its new one: going to the
	// science clock, the 5-to-20-year lines sweep out past the plot's right edge while the 1-to-3-year
	// ones spread out from zero, a zoom into the first few years (and back out going the other way).
	// The plot clips what runs off it; a tick the active clock doesn't label fades as it goes.
	const ticks = $derived([...new Set(CLOCKS.flatMap((c) => layout.clocks[c].ticks))].sort((a, b) => a - b));
	const shown = $derived(new Set(active.ticks));
	// the labels' strip runs this far past either end of the plot, so an end label isn't clipped
	const overhang = 16;
</script>

<div class="time-swarm" class:visible class:compact aria-hidden="true">
	{#each layout.rows as row, i (i)}
		<span class="band" style:top="{row.y}px" style:height="{row.h}px"></span>
		<span class="name" style:top="{compact ? row.headY : row.y + 8}px" style:width={compact ? null : `${layout.left - 12}px`}>{row.label}</span>
	{/each}
	<!-- the None column: off the year axis, a strip of its own through every band -->
	<span class="none-strip" style:left="{layout.pile.x}px" style:width="{layout.pile.w}px" style:top="{layout.top}px" style:height="{plotH}px"></span>

	<div class="tick-strip" style:left="{layout.x0 - overhang}px" style:width="{layout.x1 - layout.x0 + 2 * overhang}px" style:top="{layout.axisY + 5}px">
		{#each ticks as t (t)}
			<span class="tick glide" class:off={!shown.has(t)} style:transform="translateX({active.x(t) - layout.x0 + overhang}px) translateX(-50%)">{t}</span>
		{/each}
	</div>
	<span class="tick none-tick" style:left="{layout.pile.cx}px" style:top="{layout.axisY + 5}px">None</span>
	<CostAxisLabel x0={layout.x0} x1={layout.x1} floor={layout.axisY} {compact} text={axis} />

	<svg {width} {height}>
		{#each titleLines as line, i (i)}<text class="stage-title" x={width - layout.right} y={layout.top - 12 - (titleLines.length - 1 - i) * 15} text-anchor="end">{line}</text>{/each}

		<!-- the grid on the active clock's scale, clipped to the plot; the zero line (the clock's start) a step brighter -->
		<defs><clipPath id="grid-{uid}"><rect x={layout.x0 - 1} y={layout.top} width={layout.x1 - layout.x0 + 2} height={plotH} /></clipPath></defs>
		<g clip-path="url(#grid-{uid})">
			{#each ticks as t (t)}
				<line class="grid glide" class:zero={t === 0} class:off={!shown.has(t)} y1={layout.top} y2={layout.axisY} style:transform="translateX({active.x(t)}px)" />
			{/each}
		</g>

		{#each layout.rows as row, i (i)}
			{@const { median } = active.rows[i]}
			<!-- the interval's shading through the whole band, under the squares; it glides with the clock -->
			{#if median?.ci}<rect class="ci" width="1" height={row.h} style:transform="translate({median.ci[0]}px, {row.y}px) scaleX({Math.max(1, median.ci[1] - median.ci[0])})" />{/if}
		{/each}
	</svg>

	<!-- over the squares: each median's line and value, so a crowd of squares never hides them -->
	<svg class="over" {width} {height}>
		{#each layout.rows as row, i (i)}
			{@const { median } = active.rows[i]}
			{#if median}
				<rect class="median" x="-1" width="2" height="1" style:transform="translate({median.x}px, {median.y0}px) scaleY({median.y1 - median.y0})" />
				<!-- both clocks' values ride with the line: the old one fades as it leaves, the new one as it lands -->
				{#each CLOCKS as c (c)}
					{@const own = layout.clocks[c].rows[i].median}
					{#if own}<text class="value" class:on={c === clock} dy="0.32em" text-anchor={median.anchor} style:transform="translate({median.tx}px, {median.ty}px)">{own.text}</text>{/if}
				{/each}
			{/if}
		{/each}
	</svg>
	<!-- the pointed-at mission's name, on a black backing so it reads over a crowded swarm -->
	{#if tag}<span class="tag {tag.anchor}" style:left="{tag.x}px" style:top="{tag.y}px">{tag.text}</span>{/if}
</div>

<style>
	.time-swarm {
		position: absolute;
		inset: 0;
		opacity: 0;
		transition: opacity 400ms linear;
		pointer-events: none;
	}

	.time-swarm.visible {
		opacity: 1;
	}

	.time-swarm > span,
	svg {
		position: absolute;
	}

	svg {
		inset: 0;
		overflow: visible;
	}

	/* The squares follow this chart on the stage, and a pointed-at square rises to z-index 2: the
	   medians and the name tag stack above both (only while the chart is fully shown, since a fading
	   chart makes its own stacking context, which is fine: nothing is pointed at mid-fade). */
	.over,
	.tag {
		z-index: 3;
	}

	.band {
		left: 0;
		right: 0;
		border-bottom: 1px solid var(--shadow);
	}

	/* Rocket Flame marks a true negative (app.css): the missions that never reached a high-impact paper */
	.none-strip {
		background: color-mix(in srgb, var(--flame) 8%, var(--black));
		border: 1px solid var(--flame);
		border-radius: 4px;
		box-sizing: border-box;
	}

	.tick {
		transform: translateX(-50%);
		font-size: 11px;
		line-height: 14px;
		color: var(--soil);
		white-space: nowrap;
	}

	/* the year labels ride on a strip the width of the plot that clips them as they sweep off it */
	.tick-strip {
		position: absolute;
		height: 14px;
		overflow: hidden;
	}

	.tick-strip .tick {
		position: absolute;
		left: 0;
		top: 0;
	}

	/* the zoom: gridlines and labels move and fade on the squares' own clock (--move, --ease), so the
	   axis, the squares, the medians and the intervals change scale as one */
	.glide {
		transition:
			transform var(--move) var(--ease),
			opacity var(--move) var(--ease);
	}

	.none-tick {
		color: var(--dust);
	}

	.name {
		left: 4px;
		font-size: 15px;
		line-height: 20px;
		font-weight: 500;
		color: var(--white);
	}

	/* on a phone, the band's header strip: the name centred on it, the median's value beside */
	.compact .name {
		font-size: 12px;
		line-height: 16px;
		transform: translateY(-50%);
	}

	text {
		font: 12px var(--sans);
	}

	.grid {
		stroke: var(--shadow);
	}

	.grid.zero {
		stroke: var(--outline-filled);
	}

	.off {
		opacity: 0;
	}

	/* the running-average charts' 95% band (DollarChart's .confidence) */
	.ci {
		fill: var(--neptune);
		fill-opacity: 0.14;
	}

	.median {
		fill: var(--white);
	}

	.ci,
	.median {
		transition: transform var(--move) var(--ease);
	}

	/* a median's value, on a black halo so a gridline or a square under it can't break it up: out at
	   once when the clock changes, in again as the line settles (with no motion, --move is 0 and the
	   delay goes negative: an immediate swap) */
	.value {
		fill: var(--white);
		paint-order: stroke;
		stroke: var(--black);
		stroke-width: 3px;
		stroke-linejoin: round;
		opacity: 0;
		transition:
			transform var(--move) var(--ease),
			opacity 200ms linear;
	}

	.value.on {
		opacity: 1;
		transition-delay: 0s, calc(var(--move) - 300ms);
	}

	.compact .value {
		font-size: 11px;
	}

	/* its bottom edge on the label's line, 6px over the square; columnLabel's anchor keeps it on the stage */
	.tag {
		padding: 2px 6px;
		border-radius: 3px;
		background: var(--black);
		box-shadow: 0 0 0 1px var(--shadow);
		font-size: 12px;
		line-height: 16px;
		color: var(--white);
		white-space: nowrap;
		transform: translate(-50%, -100%);
	}

	.tag.start {
		transform: translate(0, -100%);
	}

	.tag.end {
		transform: translate(-100%, -100%);
	}

	.compact .tag {
		font-size: 11px;
		line-height: 14px;
	}
</style>
