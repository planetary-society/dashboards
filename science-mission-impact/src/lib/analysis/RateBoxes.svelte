<script>
	// N50 per $M as box plots with every mission a dot (geometry in rateBoxesLayout): clusters of one
	// box (the cost groups) or several (how missions were selected, within each group). The packaged
	// quartiles and whiskers are drawn as given, never recomputed; measured zeros (failures, uncited
	// missions) sit in their own lane under a dashed break, since a log scale has no zero.
	import { rateBoxesLayout, rateText, rateTick } from './charts-b.js';

	/**
	 * clusters: [{ label, boxes: [{ key, label?, tone: 'light' | 'mid' | 'dark' | 'competed' | 'directed',
	 * spread: RateSpread, values: number[] }] }]; `values` are the raw rates (failures as 0) that `spread` summarizes.
	 * zeros: false leaves out the zero-count labels (the hidden table keeps them, and the medians).
	 */
	let { clusters, yLabel = 'N50 per $1M (log scale)', zeros = true } = $props();
	let width = $state(0);
	const layout = $derived(width > 0 ? rateBoxesLayout(clusters, width, { zeros }) : null);
	// a key only when clusters hold several boxes; the tones then carry the box labels
	const legend = $derived(
		clusters.some((c) => c.boxes.length > 1) ? [...new Map(clusters.flatMap((c) => c.boxes).filter((b) => b.label).map((b) => [b.tone, b])).values()] : []
	);
	const name = (c, b) => (b.label ? `${c.label}, ${b.label}` : c.label);
	const summary = (b) => {
		const s = b.spread;
		return s.missions ? `median ${rateText(s.median)}, ${s.missions} missions, ${s.zeros} at 0` : 'no missions';
	};
	const aria = $derived(`Box plots of ${yLabel}, every mission a dot. ${clusters.flatMap((c) => c.boxes.map((b) => `${name(c, b)}: ${summary(b)}`)).join('; ')}.`);
	const HEADS = { zeros: 'at 0' };
</script>

<div class="rate-boxes">
	{#if legend.length}
		<p class="key">
			{#each legend as b (b.tone)}<span><i class="swatch {b.tone}"></i>{b.label}</span>{/each}
		</p>
	{/if}
	<div class="stage" bind:clientWidth={width}>
		{#if layout}
			{@const { axis, bw } = layout}
			<svg width={layout.W} height={layout.H} role="img" aria-label={aria}>
				<text class="axis-title" x="0" y="12">{yLabel}</text>
				{#each axis.ticks as t (t)}
					<line class="grid" x1={layout.left} x2={layout.right} y1={axis.y(t)} y2={axis.y(t)} />
					<text class="tick" x={layout.left - 8} y={axis.y(t)} dy="0.32em" text-anchor="end">{rateTick(t)}</text>
				{/each}
				<line class="grid" x1={layout.left} x2={layout.right} y1={axis.zeroY} y2={axis.zeroY} />
				<text class="tick" x={layout.left - 8} y={axis.zeroY} dy="0.32em" text-anchor="end">0</text>
				<line class="break" x1={layout.left - 4} x2={layout.right} y1={axis.breakY} y2={axis.breakY} />

				{#each layout.boxes as b (b.id)}
					<g class="box {b.tone}">
						{#if b.marks}
							{@const m = b.marks}
							<line class="whisker" x1={b.x} x2={b.x} y1={m.hi} y2={m.q3} />
							<line class="whisker" x1={b.x} x2={b.x} y1={m.q1} y2={m.lo} />
							<line class="whisker" x1={b.x - bw / 4} x2={b.x + bw / 4} y1={m.hi} y2={m.hi} />
							<line class="whisker" x1={b.x - bw / 4} x2={b.x + bw / 4} y1={m.lo} y2={m.lo} />
							<rect class="body" x={b.x - bw / 2} y={m.q3} width={bw} height={Math.max(0, m.q1 - m.q3)} />
							<line class="median-line" x1={b.x - bw / 2} x2={b.x + bw / 2} y1={m.median} y2={m.median} />
						{/if}
						<!-- dots last, so every mission shows over the box, the median and its neighbours' whiskers -->
						{#each b.dots as d, i (i)}<circle class="dot" cx={d.x} cy={d.y} r={layout.r} />{/each}
						{#if layout.beside && b.spread.zeros}
							<text class="zeros" x={b.x + bw / 2 + 5} y={axis.zeroY} dy="0.32em">{b.spread.zeros} at 0</text>
						{/if}
					</g>
				{/each}

				{#each layout.rows as row (row.kind)}
					{#if !layout.inline && HEADS[row.kind]}
						<text class="head" x={layout.left - 8} y={row.y} text-anchor="end">{HEADS[row.kind]}</text>
					{/if}
					{#each layout.boxes as b (b.id)}
						{@const s = b.spread}
						<text class="row {row.kind} {b.tone}" x={b.x} y={row.y} text-anchor="middle">
							{#if row.kind === 'label'}{b.label ?? ''}{:else}{layout.inline ? (s.zeros ? `${s.zeros} at 0` : '') : s.zeros}{/if}
						</text>
					{/each}
				{/each}
				{#each layout.clusters as c, i (i)}
					<text class="cluster" x={c.x} y={layout.clusterY} text-anchor="middle">{c.label}</text>
				{/each}
			</svg>
		{/if}
	</div>
	<!-- the clip goes on a wrapper: a table grows to its content whatever width .sr-only gives it, and widened the page -->
	<div class="sr-only"><table>
		<caption>{yLabel}: each box's missions, zeros and quartiles</caption>
		<thead><tr><th scope="col">Group</th><th scope="col">Missions</th><th scope="col">At 0</th><th scope="col">Lower quartile</th><th scope="col">Median</th><th scope="col">Upper quartile</th></tr></thead>
		<tbody>
			{#each clusters as c, ci (ci)}
				{#each c.boxes as b (b.key)}
					<tr><th scope="row">{name(c, b)}</th><td>{b.spread.missions}</td><td>{b.spread.zeros}</td><td>{rateText(b.spread.q1)}</td><td>{rateText(b.spread.median)}</td><td>{rateText(b.spread.q3)}</td></tr>
				{/each}
			{/each}
		</tbody>
	</table></div>
</div>

<style>
	.rate-boxes {
		/* the box tones: three Neptune steps by cost, and selection's two */
		--tone-light: #9fd0ef;
		--tone-mid: #2f95d6;
		--tone-dark: #035f96;
		--tone-competed: var(--neptune);
		--tone-directed: #8c8c8c;
		min-width: 0;
	}

	.key {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 16px;
		margin-bottom: 8px;
		font-size: 13px;
		color: var(--dust);
	}

	.key span {
		white-space: nowrap;
	}

	.swatch {
		display: inline-block;
		width: 12px;
		height: 12px;
		margin-right: 6px;
		vertical-align: -1px;
		background: var(--tone);
		border: 1px solid var(--tone);
	}

	.stage {
		position: relative;
	}

	svg {
		display: block;
		overflow: visible;
	}

	text {
		font-family: var(--sans);
	}

	.axis-title {
		font-size: 12px;
		fill: var(--dust);
	}

	.tick,
	.head {
		font-size: 11px;
		fill: var(--soil);
	}

	.grid {
		stroke: var(--shadow);
		opacity: 0.7;
	}

	.break {
		stroke: var(--soil);
		stroke-dasharray: 5 4;
	}

	.light { --tone: var(--tone-light); }
	.mid { --tone: var(--tone-mid); }
	.dark { --tone: var(--tone-dark); }
	.competed { --tone: var(--tone-competed); }
	.directed { --tone: var(--tone-directed); }

	/* translucent, so the gridlines and every dot read through */
	.body {
		fill: var(--tone);
		fill-opacity: 0.5;
		stroke: var(--tone);
		stroke-width: 1.5;
	}

	.whisker {
		stroke: var(--dust);
		stroke-width: 1.5;
	}

	.median-line {
		stroke: var(--white);
		stroke-width: 2;
	}

	.dot {
		fill: var(--white);
		stroke: var(--black);
		stroke-width: 1;
	}

	.zeros {
		font-size: 11px;
		fill: var(--dust);
	}

	.row {
		font-size: 11px;
		fill: var(--dust);
	}

	.row.label {
		font-weight: 500;
	}

	.row.label.competed {
		fill: var(--neptune-mid);
	}

	.cluster {
		font-size: 12px;
		font-weight: 500;
		fill: var(--white);
	}
</style>
