<script>
	// Labels over the icon arrays: each block's figure, what it counts and which side of the line it
	// is, top-aligned so the figures line up whatever wraps. The story binds and formats them; the
	// legend for the marks on the squares is in the caption under the stage.

	/** layout: splitLayout(). heads: one { figure, label, side } per block, in block order. */
	let { layout, heads, visible = false, compact = false } = $props();
</script>

<div class="labels" class:visible class:compact aria-hidden="true">
	{#each layout.blocks as b, i (b.key)}
		{@const h = heads[i]}
		{#if h}
			<!-- a head may run into the gap after its block, never into the next head -->
			<span class="head" style:left="{b.x}px" style:top="{b.y - layout.headH}px" style:width="{(layout.blocks[i + 1]?.x ?? b.x + Math.max(b.w, 200)) - b.x - 8}px">
				<span class="figure">{h.figure}</span>
				<span class="label">{h.label}</span>
				{#if h.side}<span class="side">{h.side}</span>{/if}
			</span>
		{/if}
	{/each}
</div>

<style>
	.labels {
		position: absolute;
		inset: 0;
		opacity: 0;
		transition: opacity 400ms linear;
		pointer-events: none;
	}

	.labels.visible {
		opacity: 1;
	}

	.head {
		position: absolute;
		display: flex;
		flex-direction: column;
	}

	.figure {
		font-weight: 300;
		font-size: 40px;
		line-height: 1;
		letter-spacing: -0.03em;
	}

	.label {
		margin-top: 8px;
		font-size: 14px;
		line-height: 18px;
	}

	.side {
		font-size: 14px;
		line-height: 18px;
		color: var(--dust);
	}

	.compact .figure {
		font-size: 26px;
	}

	.compact .label {
		margin-top: 4px;
	}

	.compact .label,
	.compact .side {
		font-size: 11px;
		line-height: 14px;
	}
</style>
