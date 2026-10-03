<script>
	// Furniture for the failure rows: division bands, the dashed threshold divider, each side's
	// failure rate at the head, and per row the division's name and "n of m" either side.
	import { int, money, pct } from '$lib/format.js';

	/** layout: failureLayout() result. failure: StoryFacts.failure. referenceCost: the threshold. */
	let { layout, failure, referenceCost, visible = false, compact = false } = $props();

	const byDivision = $derived(new Map(failure.byDivision.map((d) => [d.division, d])));
</script>

<div class="labels" class:visible class:compact aria-hidden="true">
	{#each layout.rows as row (row.division)}
		<span class="band" class:alt={row.band} style:top="{row.y}px" style:height="{row.h}px"></span>
	{/each}
	<span class="divider" style:left="{layout.dividerX}px" style:height="{layout.bottomY}px"></span>

	<span class="head under" style:right="calc(100% - {layout.underRight}px)">
		<span class="title">{money(referenceCost)} or less</span>
		<span class="rate">{pct(failure.under.rate)}</span>
	</span>
	<span class="head" style:left="{layout.overLeft}px">
		<span class="title">Over {money(referenceCost)}</span>
		<span class="rate">{pct(failure.over.rate)}</span>
	</span>

	{#each layout.rows as row (row.division)}
		{@const d = byDivision.get(row.division)}
		<span class="name" style:top="{row.nameY}px" style:max-width={layout.stacked ? null : `${layout.left - 12}px`}>{row.label}</span>
		{#if d?.under.missions}
			<span class="figures under" style:top="{row.figuresY}px" style:right="calc(100% - {layout.underRight}px)">{int(d.under.failed)} of {int(d.under.missions)}</span>
		{/if}
		{#if d?.over.missions}
			<span class="figures" style:top="{row.figuresY}px" style:left="{layout.overLeft}px">{int(d.over.failed)} of {int(d.over.missions)}</span>
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

	.labels > span {
		position: absolute;
	}

	.band {
		left: 0;
		right: 0;
		border-top: 1px solid var(--shadow);
	}

	.band.alt {
		background: var(--band);
	}

	.divider {
		top: 0;
		width: 0;
		border-left: 1px dashed var(--white);
		opacity: 0.65;
	}

	.head {
		top: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
	}

	.head.under {
		align-items: flex-end;
	}

	.title {
		font-size: 13px;
		line-height: 18px;
		color: var(--dust);
	}

	.rate {
		font-weight: 300;
		font-size: clamp(28px, 4vw, 44px);
		line-height: 1;
		letter-spacing: -0.04em;
		color: var(--white);
	}

	.name {
		left: 0;
		font-size: 15px;
		line-height: 20px;
		font-weight: 500;
		color: var(--white);
	}

	.figures {
		font-size: 12px;
		line-height: 16px;
		color: var(--dust);
		white-space: nowrap;
	}

	.compact .name {
		left: 4px;
		font-size: 12px;
		line-height: 16px;
	}

	.compact .title,
	.compact .figures {
		font-size: 11px;
		line-height: 14px;
	}
</style>
