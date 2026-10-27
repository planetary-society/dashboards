<script>
	// The corpus as a skyline: one Neptune column per mission rising from the ground line the
	// rug hangs from, height ∝ √papers, and a running total that counts up as the columns rise.
	// No names until the reader points: the highlighted column turns Rocket Flame and is named.
	// The citation step zooms out in one move (skylineZoom): each mission's citations grow out of
	// its paper column while the √ scale widens to hold the tallest, shrinking the papers under them.
	import { int } from '$lib/format.js';
	import { columnLabel, skylineZoom } from './layouts.js';

	/**
	 * layout: skylineLayout() result. total: distinct papers. cited: their citations. rise: 0..1
	 * column growth. cite: 0..1 from the paper skyline to citations on one scale. highlight: mission id.
	 */
	let { layout, total, cited = 0, rise = 1, cite = 0, visible = false, compact = false, highlight = null, width, height } = $props();

	const ticks = $derived(layout.x.ticks(compact ? 4 : 8));
	const hot = $derived(layout.columns.find((c) => c.id === highlight) ?? null);
	const zoomed = $derived(cite > 0 ? skylineZoom(layout, cite) : null);
	const hp = (c) => (zoomed ? zoomed.get(c.id).hp : c.h);
	const hc = (c) => (zoomed ? zoomed.get(c.id).hc : 0);
	const label = $derived(
		hot && columnLabel(`${hot.name} ${int(cite > 0 ? hot.cited : hot.papers)}`, hot, { left: layout.left, right: layout.right, y: layout.ground - Math.max(hp(hot), hc(hot)) * rise - 4, compact })
	);
</script>

<div class="skyline" class:visible class:compact aria-hidden="true">
	<svg {width} {height}>
		<line class="ground" x1={layout.left} x2={layout.right} y1={layout.ground + 0.5} y2={layout.ground + 0.5} />
		<g style:transform="scaleY({rise})" style:transform-origin="0 {layout.ground}px">
			{#if zoomed}
				<g class="cited">
					{#each layout.columns as c (c.id)}
						<rect class:hot={c.id === highlight} x={c.x} y={layout.ground - hc(c)} width={c.w} height={hc(c)} />
					{/each}
				</g>
			{/if}
			<g class="columns">
				{#each layout.columns as c (c.id)}
					<rect class:hot={c.id === highlight && !zoomed} x={c.x} y={layout.ground - hp(c)} width={c.w} height={hp(c)} />
				{/each}
			</g>
		</g>
		{#if label && rise > 0.9}<text class="label" x={label.x} y={label.y} text-anchor={label.anchor}>{label.text}</text>{/if}
		{#each ticks as t (t)}
			<text class="tick" x={layout.x(t)} y={height - 8} text-anchor="middle">{t}</text>
		{/each}
	</svg>
	<p class="count" style:right="{width - layout.right}px" style:top="{layout.top}px">
		{#if cite > 0}
			<!-- grows with the columns, out of the publication total -->
			<span class="n">{int(total ** (1 - cite) * cited ** cite)}</span>
			<span>citations of {int(total)} publications</span>
		{:else}
			<span class="n">{int(rise * total)}</span>
			<span>publications</span>
		{/if}
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

	/* the citations a paper column carries: the same blue, lighter */
	.cited rect {
		fill: var(--neptune-light);
	}

	.columns rect.hot,
	.cited rect.hot {
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
