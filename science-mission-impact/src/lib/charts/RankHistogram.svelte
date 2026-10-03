<script>
	// Where a mission's papers rank among every paper from its division's missions: a plain
	// histogram over citation percentile, least cited on the left. An evenly spread mission
	// would put a tenth of its papers in every bin (the dashed line); the top tenth is the
	// division's top 10%, and the lighter cap on it is the top 1%.
	import { int, pct, weight, plural, compact } from '$lib/format.js';
	import { histogramModel } from './ranks.js';

	let { ranks } = $props();

	const m = $derived(histogramModel(ranks));
	const label = $derived(
		m
			? `Papers by citation percentile: ${m.bars.map((b) => `${b.from} to ${b.to}, ${weight(b.value)}`).join('; ')}. An even spread would be ${weight(m.even)} in each.`
			: ''
	);
</script>

{#if !m}
	<p class="fact none">Not available for this view.</p>
{:else if m.total <= 0}
	<!-- Measured, and measured as none: a mission can have papers over its lifetime and none
	     inside the early window. -->
	<p class="fact none">No papers in this view.</p>
{:else}
	<figure class="hist">
		<div class="plot" role="img" aria-label={label}>
			<div class="ylabels meta" aria-hidden="true">
				{#each m.yTicks as t (t)}
					<span style:bottom="{(t / m.max) * 100}%">{int(t)}</span>
				{/each}
			</div>
			<div class="area" aria-hidden="true">
				{#each m.yTicks as t (t)}
					<span class="grid" style:bottom="{(t / m.max) * 100}%"></span>
				{/each}
				<div class="bars">
					{#each m.bars as b (b.from)}
						<div class="slot">
							<!-- four digits would collide with the next bar's figure on a phone -->
							<span class="value meta" style:bottom="{b.height * 100}%">{b.value >= 1000 ? compact(b.value) : weight(b.value)}</span>
							<span class="bar" class:top={b.top} style:height="{b.height * 100}%">
								{#if b.top && m.top1 > 0}<span class="cap" style:height="{(m.top1 / b.value) * 100}%"></span>{/if}
							</span>
						</div>
					{/each}
				</div>
				<span class="even" style:bottom="{(m.even / m.max) * 100}%"></span>
			</div>
		</div>
		<div class="xaxis meta" aria-hidden="true">
			{#each m.edges as e, i (e)}
				<span class:minor={i % 2 === 1} style:left="{e}%">{e}</span>
			{/each}
		</div>
		<div class="ends meta" aria-hidden="true">
			<span>Least cited</span>
			<span>Citation percentile within the division</span>
			<span>Most cited</span>
		</div>

		<ul class="key meta">
			<li><span class="swatch dash"></span>Even spread: {weight(m.even)} per bar</li>
			<li><span class="swatch top"></span>Top {m.topPercent}% of the division</li>
			{#if m.top1 > 0}<li><span class="swatch cap"></span>Top 1%: {weight(m.top1)} {plural(m.top1, 'paper')}</li>{/if}
		</ul>
		<p class="meta sentence">
			{pct(m.topShare)} of this mission’s {weight(m.total)} {plural(m.total, 'paper')} {m.total === 1 ? 'is' : 'are'} in the division’s top {m.topPercent}%; {m.topPercent}% would be an even spread.
		</p>
	</figure>
{/if}

<style>
	.hist {
		--ygutter: 40px;
		margin-top: 20px;
		max-width: 760px;
	}

	.plot {
		display: grid;
		grid-template-columns: var(--ygutter) minmax(0, 1fr);
		height: 240px;
		padding-top: 20px; /* room for the tallest bar's figure */
	}

	.ylabels,
	.area {
		position: relative;
	}

	.ylabels span {
		position: absolute;
		right: 8px;
		transform: translateY(50%);
	}

	.area {
		border-bottom: 1px solid var(--soil);
	}

	.grid {
		position: absolute;
		left: 0;
		right: 0;
		height: 1px;
		background: var(--shadow);
	}

	.bars {
		position: absolute;
		inset: 0;
		display: flex;
		gap: 2px;
	}

	.slot {
		position: relative;
		flex: 1 1 0;
		min-width: 0;
	}

	.bar {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		min-height: 1px;
		background: #6f6f6f;
		transition: height 400ms var(--ease);
	}

	.bar.top {
		background: var(--neptune);
	}

	.cap {
		position: absolute;
		left: 0;
		right: 0;
		top: 0;
		min-height: 2px;
		background: var(--neptune-light);
	}

	.value {
		position: absolute;
		left: 0;
		right: 0;
		padding-bottom: 3px;
		text-align: center;
		color: var(--dust);
		white-space: nowrap;
		transition: bottom 400ms var(--ease);
	}

	.even {
		position: absolute;
		left: 0;
		right: 0;
		border-top: 1px dashed var(--white);
	}

	.xaxis {
		position: relative;
		height: 18px;
		margin: 6px 0 0 var(--ygutter);
	}

	.xaxis span {
		position: absolute;
		transform: translateX(-50%);
	}

	.ends {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		margin: 4px 0 0 var(--ygutter);
	}

	.ends span:nth-child(2) {
		color: var(--dust);
		text-align: center;
	}

	.key {
		display: flex;
		flex-wrap: wrap;
		gap: 6px 24px;
		margin: 18px 0 0 var(--ygutter);
	}

	.key li {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.swatch {
		width: 10px;
		height: 10px;
	}

	.swatch.dash {
		width: 16px;
		height: 0;
		border-top: 1px dashed var(--white);
	}

	.swatch.top {
		background: var(--neptune);
	}

	.swatch.cap {
		background: var(--neptune-light);
	}

	.sentence {
		margin: 10px 0 0 var(--ygutter);
		max-width: 52em;
	}

	.none {
		margin-top: 16px;
	}

	@media (max-width: 560px) {
		.hist {
			--ygutter: 30px;
		}

		.plot {
			height: 200px;
		}

		.value {
			font-size: 10px;
			letter-spacing: 0;
		}

		.xaxis .minor {
			display: none;
		}

		.ends span:nth-child(2) {
			display: none;
		}
	}
</style>
