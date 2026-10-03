<script>
	// Two bars either side of the threshold: top-10% papers per mission, failures counted as
	// zero, on one linear ruler from zero. No squares behind them; the numbers live in the step.
	import { int, money, plural, weight } from '$lib/format.js';

	/** comparison: StoryFacts.comparison. referenceCost: the threshold ($M, inclusive below). */
	let { comparison, referenceCost, visible = false, compact = false } = $props();

	const most = $derived(Math.max(1e-9, ...comparison.groups.map((g) => g.top10PerMission ?? 0)));
	const title = (key) => (key === 'under' ? `${money(referenceCost)} or less` : `Over ${money(referenceCost)}`);
</script>

<div class="bars" class:visible class:compact aria-hidden="true">
	<span class="heading">Average high-impact papers per mission</span>
	{#each comparison.groups as g (g.key)}
		<div class="col">
			<div class="plot">
				<span class="bar" style:height="max(2px, {visible ? ((g.top10PerMission ?? 0) / most) * 100 : 0}%)">
					<span class="value">{weight(g.top10PerMission)}</span>
				</span>
			</div>
			<span class="title">{title(g.key)}</span>
			<span class="meta">{int(g.missions)} {plural(g.missions, 'mission')}, {int(g.failed)} failed</span>
		</div>
	{/each}
</div>

<style>
	.bars {
		position: absolute;
		inset: 0;
		display: flex;
		justify-content: center;
		gap: clamp(32px, 10vw, 140px);
		padding-top: 120px;
		opacity: 0;
		transition: opacity 400ms linear;
		pointer-events: none;
	}

	.bars.compact {
		padding-top: 72px;
	}

	.bars.visible {
		opacity: 1;
	}

	.col {
		display: flex;
		flex-direction: column;
		width: clamp(96px, 16vw, 180px);
		text-align: center;
	}

	.plot {
		position: relative;
		flex: 1;
		border-bottom: 1px solid var(--soil);
	}

	.bar {
		position: absolute;
		bottom: 0;
		left: 20%;
		right: 20%;
		background: var(--neptune);
		transition: height var(--move) var(--ease);
	}

	.value {
		position: absolute;
		bottom: 100%;
		left: 50%;
		transform: translateX(-50%);
		padding-bottom: 6px;
		font-weight: 300;
		font-size: clamp(32px, 5vw, 60px);
		line-height: 1;
		letter-spacing: -0.04em;
		white-space: nowrap;
	}

	.title {
		margin-top: 8px;
		font-size: 13px;
		line-height: 18px;
		color: var(--dust);
	}

	.meta {
		font-size: 12px;
		line-height: 16px;
		color: var(--soil);
	}

	.heading {
		position: absolute;
		top: 24px;
		left: 0;
		right: 0;
		text-align: center;
		font-size: 14px;
		color: var(--dust);
	}

	.compact .heading {
		top: 12px;
		font-size: 12px;
	}

	.compact .title,
	.compact .meta {
		font-size: 11px;
		line-height: 14px;
	}
</style>
