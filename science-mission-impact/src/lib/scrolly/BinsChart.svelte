<script>
	// BINS: the FITS grid's per-dollar rates in the Analysis page's cost groups (geometry in
	// binsLayout): in each division's panel a bar per group, its missions' mean citations per $100M
	// with a 95% interval, and under the panel's bottom border the group and its missions. The
	// highest mean is solid, so the leading group reads at a glance. No cost axis: the groups are the x.
	import { compact as short } from '$lib/format.js';

	/** layout: binsLayout(). title: the chart's title, over the grid's title strip. */
	let { layout, title = null, visible = false, compact = false, width, height } = $props();
	// half a whisker cap
	const cap = $derived(compact ? 3 : 5);
</script>

<div class="bins" class:visible class:compact aria-hidden="true">
	{#each layout.rows as row (row.slug)}
		<span class="band" style:left="{row.left}px" style:width="{row.width}px" style:top="{row.y}px" style:height="{row.h}px"></span>
	{/each}

	<svg {width} {height}>
		<!-- the chart's title, top right like the overview's other charts -->
		{#if title}<text class="stage-title" x={width - 8} y={layout.top - 12} text-anchor="end">{title}</text>{/if}
		{#each layout.rows as row (row.slug)}
			{#each row.bars as bar (bar.lo)}
				{@const cx = bar.x + bar.w / 2}
				{#if bar.mean != null}
					<rect class="bar" class:best={bar.best} x={bar.x} y={bar.y} width={bar.w} height={bar.h} />
					<path class="ci" d="M{cx - cap},{bar.ciY0}H{cx + cap}M{cx},{bar.ciY0}V{bar.ciY1}M{cx - cap},{bar.ciY1}H{cx + cap}" />
					<text class="value" x={cx} y={bar.ciY1 - 4} text-anchor="middle">{short(bar.mean)}</text>
				{/if}
				<text class="group" x={cx} y={row.footY} text-anchor="middle">{bar.label}</text>
				<text class="count" x={cx} y={row.footY + layout.lineH} text-anchor="middle">n = {bar.missions}</text>
			{/each}
		{/each}
	</svg>

	{#each layout.rows as row (row.slug)}
		<span class="row" style:left="{row.left}px" style:top="{row.y}px" style:width="{row.width}px">
			<span class="name">{row.label}</span>
		</span>
	{/each}
</div>

<style>
	.bins {
		position: absolute;
		inset: 0;
		opacity: 0;
		transition: opacity 400ms linear;
		pointer-events: none;
	}

	.bins.visible {
		opacity: 1;
	}

	.bins > span,
	svg {
		position: absolute;
	}

	svg {
		inset: 0;
		overflow: visible;
	}

	text {
		fill: var(--dust);
		font: 12px var(--sans);
	}

	.value {
		fill: var(--white);
	}

	.count {
		fill: var(--soil);
	}

	.compact .value {
		font-size: 10px;
	}

	/* 9px keeps a phone's "$150M–$1B" clear of its neighbours on one line (binsLayout's two-line footer) */
	.compact .group,
	.compact .count {
		font-size: 9px;
	}

	.bar {
		fill: var(--neptune);
		opacity: 0.55;
	}

	.bar.best {
		opacity: 1;
	}

	.ci {
		fill: none;
		stroke: var(--white);
		stroke-width: 1.5;
	}

	.band {
		border-bottom: 1px solid var(--shadow);
		background: var(--band);
	}

	.row {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 6px 4px 0;
	}

	.name {
		font-size: 15px;
		line-height: 20px;
		font-weight: 500;
		color: var(--white);
	}

	.compact .row {
		gap: 0;
		padding-top: 3px;
	}

	.compact .name {
		font-size: 12px;
		line-height: 16px;
	}
</style>
