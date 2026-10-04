<script>
	// Furniture for citations per dollar: division bands on the cost axis, a faint rule per
	// decade of the shared rate scale inside each row, and under each division's name the rate
	// either side of the reference. Rows are read on their own.
	import { compact as short, int, money, moneyTick } from '$lib/format.js';
	import { minorDollarTicks } from '$lib/charts/costaxis.js';
	import DollarMinorTicks from '$lib/charts/DollarMinorTicks.svelte';

	/**
	 * layout: perDollarLayout() result. perDollar: StoryFacts.perDollar. ticks: the cost layout's x ticks.
	 */
	let { layout, perDollar, referenceCost, ticks, visible = false, compact = false, width, height } = $props();

	const [x0, x1] = $derived(layout.x.range());
	const referenceX = $derived(referenceCost > 0 ? layout.x(referenceCost) : null);
	const rates = $derived(new Map(perDollar.map((d) => [d.division, Object.fromEntries(d.groups.map((g) => [g.key, g]))])));
	const rateY = (row, r) => row.shelfY - layout.scale(r) * (row.shelfY - row.curveTop);
	const figure = (g) => (g?.perHundredM == null ? '—' : compact ? short(g.perHundredM) : int(g.perHundredM));
</script>

<div class="axis" class:visible class:compact>
	{#each layout.rows as row (row.slug)}
		<span class="band" class:alt={row.band} style:top="{row.y}px" style:height="{row.h}px"></span>
	{/each}
	<span class="band closing" style:top="{layout.bottomY}px"></span>
	<DollarMinorTicks positions={minorDollarTicks(...layout.x.domain()).map(layout.x)} />

	{#each ticks as t (t)}
		<span class="tick" class:reference-tick={t === referenceCost} style:left="{layout.x(t)}px">{moneyTick(t)}</span>
		<span class="grid" style:left="{layout.x(t)}px" style:top="{layout.top}px" style:height="{layout.bottomY - layout.top}px"></span>
	{/each}

	<svg {width} {height} aria-hidden="true">
		{#if referenceX != null && referenceX >= x0 && referenceX <= x1}
			<line class="reference" x1={referenceX} x2={referenceX} y1={layout.top} y2={layout.bottomY} />
		{/if}
		{#each layout.rows as row (row.slug)}
			{#each layout.rateTicks as r (r)}
				<line class="rate" x1={x0} x2={x1} y1={rateY(row, r)} y2={rateY(row, r)} />
			{/each}
			<line class="shelf" x1={x0} x2={x1} y1={row.shelfY} y2={row.shelfY} />
		{/each}
	</svg>

	{#each layout.rows as row, i (row.slug)}
		{@const g = rates.get(row.slug)}
		<span class="row" class:alt={row.band} style:top="{row.y}px" style:width={compact ? null : `${layout.left}px`}>
			<span class="name">{row.label}</span>
			{#if g}
				<span class="meta">
					{#if compact}≤{money(referenceCost)} {figure(g.under)} · over {figure(g.over)}{:else}{money(referenceCost)} or less: {figure(g.under)} · Over {money(referenceCost)}: {figure(g.over)}{/if}
				</span>
			{/if}
		</span>
		<!-- the rate scale is labelled once, on the first row; a phone has room for its top rule only, inside the plot -->
		{#if i === 0}
			{#each compact ? layout.rateTicks.slice(-1) : layout.rateTicks as r (r)}
				<span class="rate-label" class:inside={compact} style:top="{rateY(row, r)}px" style:left={compact ? null : `${x1 + 4}px`}>{short(r)}</span>
			{/each}
		{/if}
	{/each}
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

	.band {
		left: 0;
		right: 0;
		border-top: 1px solid var(--shadow);
	}

	.band.alt {
		background: var(--band);
	}

	.tick {
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

	.grid {
		width: 1px;
		background: var(--shadow);
		opacity: 0.6;
	}

	.reference {
		stroke: var(--white);
		stroke-width: 1;
		stroke-dasharray: 4 4;
		opacity: 0.65;
	}

	.shelf {
		stroke: var(--soil);
		stroke-width: 1;
	}

	.rate {
		stroke: var(--shadow);
		stroke-width: 1;
		opacity: 0.7;
	}

	.rate-label {
		transform: translateY(-50%);
		font-size: 10px;
		line-height: 12px;
		color: var(--soil);
		white-space: nowrap;
	}

	/* sits just above its rule at the plot's right edge */
	.rate-label.inside {
		right: 8px;
		transform: translateY(-100%);
	}

	.row {
		left: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 10px 12px 0 0;
	}

	.name {
		font-size: 15px;
		line-height: 20px;
		font-weight: 500;
		color: var(--white);
	}

	/* on a phone the label sits inside the plot, on a backing of its band's colour so the
	   gridlines and the reference line stop short of it (as the timing labels do) */
	.compact .row {
		flex-direction: row;
		align-items: baseline;
		gap: 8px;
		margin-top: 1px; /* clear of the band's top rule */
		padding: 1px 6px 2px 4px;
		background: var(--black);
	}

	.compact .row.alt {
		background: var(--band);
	}

	.compact .name {
		font-size: 12px;
		line-height: 16px;
	}

	.compact .tick {
		font-size: 10px;
		line-height: 13px;
	}
</style>
