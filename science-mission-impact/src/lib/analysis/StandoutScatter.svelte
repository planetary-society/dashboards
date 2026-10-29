<script>
	// N50 per $M against cost, one panel per compared division on shared log axes (standoutLayout):
	// missions over the threshold are grey dots, those at or under it white rings, and the packaged
	// standouts (at or under it, beating the median of the division's costlier missions) blue rings
	// with their names. Measured zeros sit in the zero lane under a dashed break, failures as X's.
	import { money, moneyTick } from '$lib/format.js';
	import { rateText, rateTick, standoutLayout } from './charts-b.js';

	/** missions: AnalysisFacts.missions. standouts: AnalysisFacts.standouts. divisions: [{ division, name }] in order. referenceCost: the threshold, $M. */
	let { missions, standouts, divisions, referenceCost } = $props();
	let width = $state(0);
	const L = $derived(width > 0 ? standoutLayout(missions, standouts, divisions, referenceCost, width) : null);
	const ref = $derived(money(referenceCost));

	// the panel's aria-label, and the prerendered fallback before the chart has a width
	function describe(d) {
		const s = standouts.find((x) => x.division === d.division);
		const n = missions.filter((m) => m.division === d.division).length;
		const named = s?.missions.length ? s.missions.map((m) => `${m.name} (${rateText(m.rate)} at ${money(m.cost)})`).join(', ') : 'none';
		return `${d.name}: N50 per $1M against life-cycle cost for ${n} missions, both log scales, failures at zero. Median of missions over ${ref}: ${rateText(s?.overMedian)}. Missions at or under ${ref} above it: ${named}.`;
	}
</script>

<div class="standouts">
	<p class="key" aria-hidden="true">
		<span><svg width="10" height="10"><circle class="over" cx="5" cy="5" r="3" /></svg>Over {ref}</span>
		<span><svg width="10" height="10"><circle class="under" cx="5" cy="5" r="3.5" /></svg>{ref} or less</span>
		<span><svg width="12" height="12"><circle class="standout" cx="6" cy="6" r="4.5" /></svg>Beats the median over {ref}</span>
		<span><svg width="10" height="10"><path class="failed" d="M1.5,1.5L8.5,8.5M8.5,1.5L1.5,8.5" /></svg>Failed</span>
		<span><svg width="18" height="6"><line class="median" x1="0" x2="18" y1="3" y2="3" /></svg>Median of missions over {ref}</span>
	</p>
	<p class="axis-title">N50 per $1M (log scale)</p>
	<div class="stage" bind:clientWidth={width}>
		{#if L}
			{@const { axis } = L}
			<div class="panels" style:grid-template-columns="repeat({L.cols}, 1fr)" style:column-gap="{L.gapX}px">
				{#each L.panels as p, i (p.division)}
					<svg width={L.pw} height={L.ph} role="img" aria-label={describe(divisions[i])}>
						<text class="title" x="0" y="14">{p.name}</text>
						{#each L.ticks as t (t)}
							<line class="grid" x1={L.x(t)} x2={L.x(t)} y1={L.titleH + 4} y2={axis.laneBottom} />
							<text class="tick" x={L.x(t)} y={L.ph - 4} text-anchor="middle">{moneyTick(t)}</text>
						{/each}
						{#each axis.ticks as t (t)}
							<line class="grid" x1={L.left} x2={L.right} y1={axis.y(t)} y2={axis.y(t)} />
							<text class="tick" x={L.left - 6} y={axis.y(t)} dy="0.32em" text-anchor="end">{rateTick(t)}</text>
						{/each}
						<line class="grid" x1={L.left} x2={L.right} y1={axis.zeroY} y2={axis.zeroY} />
						<text class="tick" x={L.left - 6} y={axis.zeroY} dy="0.32em" text-anchor="end">0</text>
						<line class="break" x1={L.left - 4} x2={L.right} y1={axis.breakY} y2={axis.breakY} />
						<!-- labelled in the key, not in the panel, where it would sit on the costlier missions' dots -->
						{#if p.medianY != null}<line class="median" x1={L.left} x2={L.right} y1={p.medianY} y2={p.medianY} />{/if}
						{#each p.points as m (m.id)}
							{#if m.kind === 'failed'}
								<path class="failed" d="M{m.x - 3},{m.y - 3}L{m.x + 3},{m.y + 3}M{m.x + 3},{m.y - 3}L{m.x - 3},{m.y + 3}" />
							{:else}
								<circle class={m.kind} cx={m.x} cy={m.y} r={m.kind === 'standout' ? 4.5 : m.kind === 'under' ? 3 : 2.5} />
							{/if}
						{/each}
						{#each p.labels as l (l.id)}
							<text class="name" x={l.x} y={l.y} dy="0.32em" text-anchor={l.anchor}>{l.text}</text>
						{/each}
					</svg>
				{/each}
			</div>
		{:else}
			<ul class="sr-only">
				{#each divisions as d (d.division)}<li>{describe(d)}</li>{/each}
			</ul>
		{/if}
	</div>
	<p class="axis-title x">Life-cycle cost (log scale)</p>
</div>

<style>
	.standouts {
		min-width: 0;
	}

	.key {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 16px;
		margin-bottom: 10px;
		font-size: 13px;
		color: var(--dust);
	}

	.key span {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		white-space: nowrap;
	}

	.key svg {
		overflow: visible;
	}

	.axis-title {
		font-size: 12px;
		color: var(--dust);
	}

	.axis-title.x {
		margin-top: 4px;
		text-align: center;
	}

	.stage {
		position: relative;
		margin-top: 4px;
	}

	.panels {
		display: grid;
		row-gap: 20px;
	}

	svg {
		display: block;
		overflow: visible;
	}

	text {
		font-family: var(--sans);
	}

	.title {
		font-size: 13px;
		font-weight: 500;
		fill: var(--white);
	}

	.tick {
		font-size: 11px;
		fill: var(--soil);
	}

	.grid {
		stroke: var(--shadow);
		opacity: 0.6;
	}

	.break {
		stroke: var(--soil);
		stroke-dasharray: 5 4;
	}

	.median {
		stroke: var(--dust);
		stroke-width: 1.25;
		stroke-dasharray: 4 3;
	}

	.name {
		paint-order: stroke;
		stroke: var(--black);
		stroke-width: 3px;
		stroke-linejoin: round;
	}

	.name {
		font-size: 11px;
		font-weight: 500;
		fill: var(--white);
	}

	.over {
		fill: var(--dust);
	}

	.under {
		fill: var(--black);
		stroke: var(--white);
		stroke-width: 1.25;
	}

	.standout {
		fill: var(--neptune);
		stroke: var(--white);
		stroke-width: 1.5;
	}

	.failed {
		fill: none;
		stroke: var(--flame);
		stroke-width: 1.5;
	}
</style>
