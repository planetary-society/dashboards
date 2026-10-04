<script>
	// The corpus as a skyline: one Neptune column per mission rising from the ground line the
	// rug hangs from, height ∝ √papers, and a running total that counts up as the columns rise.
	// No names until the reader points: the highlighted column turns Rocket Flame and is named.
	import { int } from '$lib/format.js';

	/** layout: skylineLayout() result. total: distinct papers. rise: 0..1 column growth. highlight: mission id. */
	let { layout, total, rise = 1, visible = false, compact = false, highlight = null, width, height } = $props();

	const ticks = $derived(layout.x.ticks(compact ? 4 : 8));
	const hot = $derived(layout.columns.find((c) => c.id === highlight) ?? null);
	// centred over its column unless that would run it off either end of the chart (width estimated per character)
	const label = $derived.by(() => {
		if (!hot) return null;
		const text = `${hot.name} ${int(hot.papers)}`;
		const cx = hot.x + hot.w / 2;
		const half = ((text.length + 1) * (compact ? 6 : 7)) / 2;
		const anchor = cx - half < layout.left ? 'start' : cx + half > layout.right ? 'end' : 'middle';
		return { text, x: anchor === 'start' ? hot.x : anchor === 'end' ? hot.x + hot.w : cx, y: hot.y - 4, anchor };
	});
</script>

<div class="skyline" class:visible class:compact aria-hidden="true">
	<svg {width} {height}>
		<line class="ground" x1={layout.left} x2={layout.right} y1={layout.ground + 0.5} y2={layout.ground + 0.5} />
		<g class="columns" style:transform="scaleY({rise})" style:transform-origin="0 {layout.ground}px">
			{#each layout.columns as c (c.id)}
				<rect class:hot={c.id === highlight} x={c.x} y={c.y} width={c.w} height={c.h} />
			{/each}
		</g>
		{#if label && rise > 0.9}<text class="label" x={label.x} y={label.y} text-anchor={label.anchor}>{label.text}</text>{/if}
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

	.ground {
		stroke: var(--soil);
		stroke-width: 1;
	}

	.columns rect {
		fill: var(--neptune);
	}

	.columns rect.hot {
		fill: var(--flame);
	}

	.label {
		fill: var(--white);
		font-size: 12px;
		paint-order: stroke;
		stroke: var(--black);
		stroke-width: 3px;
	}

	.compact .label {
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
