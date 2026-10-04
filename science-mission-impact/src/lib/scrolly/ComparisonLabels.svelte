<script>
	// One small bar chart per rankable division (comparison.byDivision): top-10% papers per mission
	// either side of the threshold, failures counted as zero, every bar on one linear ruler from
	// zero shared across the panels. No squares behind them; the numbers live in the steps.
	import { int, money, weight } from '$lib/format.js';

	/** comparison: StoryFacts.comparison. referenceCost: the threshold ($M, inclusive below). */
	let { comparison, referenceCost, visible = false, compact = false } = $props();

	const divisions = $derived(comparison.byDivision ?? []);
	const most = $derived(Math.max(1e-9, ...divisions.flatMap((d) => [d.under.top10PerMission ?? 0, d.over.top10PerMission ?? 0])));
	const sides = ['under', 'over'];
</script>

<!-- a 2×2 grid of equal cells; every panel carries the same text under its plot, so all four plots, and the ruler, match -->
<div class="bars" class:visible class:compact aria-hidden="true">
	<div class="head">
		<span class="heading">Top-10% papers per mission</span>
		<span class="legend"><span><i class="under"></i>{money(referenceCost)} or less</span> <span><i class="over"></i>Over {money(referenceCost)}</span></span>
	</div>
	{#each divisions as d (d.division)}
		<div class="panel">
			<div class="plot">
				{#each sides as key (key)}
					<span class="bar {key}" style:height="max(2px, {visible ? ((d[key].top10PerMission ?? 0) / most) * 100 : 0}%)">
						<span class="value">{weight(d[key].top10PerMission)}</span>
					</span>
				{/each}
			</div>
			<span class="name">{d.name}</span>
			{#if !compact}
				<span class="meta">{int(d.under.missions)} and {int(d.over.missions)} missions<br />{int(d.under.failed)} and {int(d.over.failed)} failed</span>
			{/if}
		</div>
	{/each}
</div>

<style>
	.bars {
		position: absolute;
		inset: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		grid-template-rows: minmax(0, 1fr) minmax(0, 1fr);
		column-gap: clamp(12px, 3vw, 40px);
		/* taller than any value label (18px + 6px), so a full-height bottom-row bar still clears the names above */
		row-gap: 40px;
		/* heading and legend end at 66px; the tallest bar's value label (18px + 6px) starts at 96px */
		padding-top: 120px;
		text-align: center;
		opacity: 0;
		transition: opacity 400ms linear;
		pointer-events: none;
	}

	.bars.compact {
		/* taller than a value label (12px + 4px) */
		row-gap: 28px;
		/* heading and legend end at 44px; the value label (12px + 4px) starts at 56px */
		padding-top: 72px;
	}

	.bars.visible {
		opacity: 1;
	}

	.head {
		position: absolute;
		top: 24px;
		left: 0;
		right: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}

	.heading {
		font-size: 14px;
		line-height: 20px;
		color: var(--dust);
	}

	.legend {
		display: flex;
		gap: 16px;
		font-size: 12px;
		line-height: 18px;
		color: var(--dust);
	}

	.legend i {
		display: inline-block;
		width: 10px;
		height: 10px;
		margin-right: 6px;
	}

	.panel {
		display: flex;
		flex-direction: column;
		min-height: 0;
	}

	.plot {
		position: relative;
		flex: 1;
		border-bottom: 1px solid var(--soil);
	}

	.bar {
		position: absolute;
		bottom: 0;
		width: min(64px, 36%);
		transition: height var(--move) var(--ease);
	}

	.bar.under,
	.legend .under {
		background: var(--neptune);
	}

	.bar.over,
	.legend .over {
		background: var(--dust);
	}

	.bar.under {
		right: calc(50% + 3px);
	}

	.bar.over {
		left: calc(50% + 3px);
	}

	.value {
		position: absolute;
		bottom: 100%;
		left: 50%;
		transform: translateX(-50%);
		padding-bottom: 6px;
		font-weight: 300;
		font-size: 18px;
		line-height: 1;
		letter-spacing: -0.02em;
		white-space: nowrap;
	}

	.name {
		margin-top: 8px;
		font-size: 13px;
		line-height: 18px;
		color: var(--dust);
	}

	.meta {
		font-size: 12px;
		line-height: 16px;
		color: var(--soil);
		white-space: nowrap;
	}

	.compact .head {
		top: 12px;
		gap: 2px;
	}

	.compact .heading {
		font-size: 12px;
		line-height: 16px;
	}

	.compact .legend {
		gap: 12px;
		font-size: 11px;
		line-height: 14px;
	}

	.compact .legend i {
		width: 8px;
		height: 8px;
		margin-right: 4px;
	}

	/* about 181px a panel on a 374px stage */
	.compact .bar {
		width: 28px;
	}

	.compact .value {
		padding-bottom: 4px;
		font-size: 12px;
	}

	.compact .name {
		margin-top: 6px;
		font-size: 11px;
		line-height: 14px;
	}
</style>
