<script>
	// The corpus as a skyline: one Neptune column per mission rising from the ground line the
	// rug hangs from, height ∝ √papers, the largest few named, and a running total that counts
	// up as the columns rise.
	import { int } from '$lib/format.js';

	/** layout: skylineLayout() result. total: distinct papers. rise: 0..1 column growth. */
	let { layout, total, rise = 1, visible = false, compact = false, width, height } = $props();

	const ticks = $derived(layout.x.ticks(compact ? 4 : 8));
</script>

<div class="skyline" class:visible class:compact aria-hidden="true">
	<svg {width} {height}>
		<line class="ground" x1={layout.left} x2={layout.right} y1={layout.ground + 0.5} y2={layout.ground + 0.5} />
		<g class="columns" style:transform="scaleY({rise})" style:transform-origin="0 {layout.ground}px">
			{#each layout.columns as c (c.id)}
				<rect x={c.x} y={c.y} width={c.w} height={c.h} />
			{/each}
		</g>
		<g class="labels" style:opacity={rise > 0.9 ? 1 : 0}>
			{#each layout.labels as l (l.id)}
				{#if l.leader}<line class="leader" x1={l.leader.x} x2={l.leader.x} y1={l.leader.y1} y2={l.leader.y2} />{/if}
				<text x={l.x} y={l.y} text-anchor={l.anchor}>{l.name} {int(l.papers)}</text>
			{/each}
		</g>
		{#each ticks as t (t)}
			<text class="tick" x={layout.x(t)} y={height - 8} text-anchor="middle">{t}</text>
		{/each}
	</svg>
	<p class="count" style:right="{width - layout.right}px" style:top="{layout.top}px">
		<span class="n">{int(rise * total)}</span>
		<span>publications</span>
	</p>
</div>

<style>
	.skyline {
		position: absolute;
		inset: 0;
		opacity: 0;
		transition: opacity 400ms linear;
		pointer-events: none;
	}

	.skyline.visible {
		opacity: 1;
	}

	svg {
		position: absolute;
		inset: 0;
		overflow: visible;
	}

	.ground,
	.leader {
		stroke: var(--soil);
		stroke-width: 1;
	}

	.columns rect {
		fill: var(--neptune);
	}

	.labels {
		transition: opacity 300ms linear;
	}

	.labels text {
		fill: var(--white);
		font-size: 12px;
		paint-order: stroke;
		stroke: var(--black);
		stroke-width: 3px;
	}

	.compact .labels text {
		font-size: 11px;
	}

	.tick {
		fill: var(--soil);
		font-size: 12px;
	}

	.count {
		position: absolute;
		margin: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		color: var(--dust);
		font-size: 13px;
		line-height: 18px;
	}

	.n {
		color: var(--white);
		font-weight: 300;
		font-size: clamp(36px, 5vw, 64px);
		line-height: 1;
		letter-spacing: -0.04em;
		font-variant-numeric: tabular-nums;
	}
</style>
