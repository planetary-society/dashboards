<script>
	// The furniture around the tier outcome plot (geometry in tierOutcomeLayout): the title,
	// hairlines between the tiers, the zero line the up and down stacks meet at, Success and Failure
	// up and down the gutter left of it, and under each tier its cost range, like an axis label,
	// then its packaged shortfall rate. The squares are the stage's.
	import { edgeMoney, tierLabel } from '$lib/analysis/tiers.js';

	/** layout: tierOutcomeLayout(). failures: AnalysisFacts.failures.tiers, in the layout's tier order. */
	let { layout, failures, visible = false, compact = false, width, height } = $props();
	// a phone's columns are too narrow for "$150M–$350M": the range breaks after its dash
	const lines = (c) => (compact && c.lo > 0 && c.hi != null ? [`${edgeMoney(c.lo)}–`, edgeMoney(c.hi)] : [tierLabel(c, { short: true })]);
	// whole percents, as the story's copy prints them: 1 of 17 is "6%", not 5.9%
	const whole = (v) => `${Math.round(v * 100)}%`;
	// offsets under footY, inside the layout's footH: the range, the rate
	const at = $derived(compact ? { head: 14, rate: 46, end: 50 } : { head: 20, rate: 44, end: 50 });
	// the axis labels' baseline, in the gutter; turned to read upwards, the letters sit left of it
	const lx = $derived(layout.left - (compact ? 5 : 7));
</script>

<div class="outcome" class:visible class:compact aria-hidden="true">
	<svg {width} {height}>
		<!-- the chart's title, top right like the overview's other charts -->
		<text class="stage-title" x={layout.right} y={layout.top - (compact ? 14 : 18)} text-anchor="end">Mission success and failures by cost</text>
		{#each layout.cols as c, i (i)}
			{#if i > 0}<line class="divider" x1={c.x} x2={c.x} y1={layout.top - (compact ? 6 : 10)} y2={layout.footY + at.end} />{/if}
			<text class="head" x={c.cx} y={layout.footY + at.head} text-anchor="middle">{#each lines(c) as line, j (j)}<tspan x={c.cx} dy={j ? '1.2em' : 0}>{line}</tspan>{/each}</text>
			{@const f = failures[i]}
			<text class="rate" class:zero={!f.rate} x={c.cx} y={layout.footY + at.rate} text-anchor="middle">{whole(f.rate)}</text>
		{/each}
		<line class="zero" x1={layout.left} x2={layout.right} y1={layout.zeroY} y2={layout.zeroY} />
		<text class="axis" x={lx} y={layout.zeroY - 6} transform="rotate(-90 {lx} {layout.zeroY - 6})">Success</text>
		<text class="axis" x={lx} y={layout.zeroY + 6} transform="rotate(-90 {lx} {layout.zeroY + 6})" text-anchor="end">Failure</text>
	</svg>
</div>

<style>
	.outcome {
		position: absolute;
		inset: 0;
		opacity: 0;
		transition: opacity 400ms linear;
		pointer-events: none;
	}

	.outcome.visible {
		opacity: 1;
	}

	svg {
		position: absolute;
		inset: 0;
		overflow: visible;
	}

	text {
		font: 12px var(--sans);
		fill: var(--dust);
	}

	.head {
		font-size: 14px;
		fill: var(--white);
	}

	.rate {
		font-size: 18px;
		font-weight: 500;
		fill: var(--flame);
	}

	.rate.zero {
		fill: var(--soil);
	}

	.divider {
		stroke: var(--shadow);
		opacity: 0.6;
	}

	.zero {
		stroke: var(--soil);
	}

	.compact .head {
		font-size: 11px;
	}

	.compact .rate {
		font-size: 14px;
	}

	.compact .axis {
		font-size: 11px;
	}
</style>
