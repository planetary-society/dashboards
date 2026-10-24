<script>
	// The citation primer: one division's papers by how often each was cited, one bar per count
	// and the rest in a last bar after a gap. `build` (0–1) grows the bars from the left on the
	// first step; `highlight` turns each bar's top-10% papers blue, from its base, and marks
	// where the top 10% begins. Papers tied at the cutoff share the last places, so that bar is
	// only partly blue; the line sits at the first bar that is mostly in.
	import { scaleLinear } from 'd3-scale';
	import { compact as short, int, spell } from '$lib/format.js';

	/** primer: StoryFacts.primer. years: the citation window, in calendar years. */
	let { primer, years, build = 1, highlight = false, visible = false, compact = false, width, height } = $props();

	const clamp01 = (v) => Math.max(0, Math.min(1, v));
	const m = $derived({ l: compact ? 36 : 56, r: compact ? 6 : 16, t: compact ? 30 : 44, b: compact ? 42 : 52 });
	const cap = $derived(primer.counts.length);
	// one slot per count, an empty slot, then the overflow bar
	const x = $derived(scaleLinear().domain([0, cap + 2]).range([m.l, width - m.r]));
	const y = $derived(scaleLinear().domain([0, Math.max(...primer.counts, primer.overflow)]).nice(4).range([height - m.b, m.t]));
	const pitch = $derived(x(1) - x(0));
	const bw = $derived(Math.max(1, pitch - (pitch >= 3 ? 1 : 0)));
	const bars = $derived([...primer.counts.map((n, c) => ({ slot: c, n, top: primer.top[c] })), { slot: cap + 1, n: primer.overflow, top: primer.topOverflow }]);
	// the sweep: the leftmost bar starts first and every bar is full by build = 1
	const grown = (i) => clamp01(build * 1.6 - (i / bars.length) * 0.6);
	const xTicks = $derived([0, 20, 40, 60, 80].filter((c) => c < cap));
	const edge = $derived(bars.find((b) => b.n > 0 && b.top / b.n >= 0.5)?.slot ?? cap + 1);
	const cutX = $derived(x(edge));
</script>

<div class="primer" class:visible class:highlight class:compact aria-hidden="true">
	<svg {width} {height}>
		{#each y.ticks(compact ? 3 : 4) as v (v)}
			<line class="grid" x1={m.l} x2={width - m.r} y1={y(v)} y2={y(v)} />
			<text x={m.l - 8} y={y(v)} dy="0.32em" text-anchor="end">{short(v)}</text>
		{/each}
		{#each bars as b, i (b.slot)}
			{@const h = (y(0) - y(b.n)) * grown(i)}
			{@const t = (y(0) - y(b.top)) * grown(i)}
			<rect x={x(b.slot)} y={y(0) - h} width={bw} height={h} />
			{#if b.top > 0}<rect class="top" x={x(b.slot)} y={y(0) - t} width={bw} height={t} />{/if}
		{/each}
		<line class="base" x1={m.l} x2={width - m.r} y1={y(0)} y2={y(0)} />
		{#each xTicks as c (c)}
			<text x={x(c) + bw / 2} y={y(0) + 18} text-anchor="middle">{c}</text>
		{/each}
		<text x={x(cap + 1) + bw / 2} y={y(0) + 18} text-anchor="middle">{cap}+</text>
		<text x={m.l} y={m.t - 14}>Papers</text>
		<text x={width - m.r} y={y(0) + 38} text-anchor="end">Citations in a paper’s first {spell(years)} years</text>
		<g class="cut">
			<line x1={cutX - 1} x2={cutX - 1} y1={m.t} y2={y(0)} />
			<text class="strong" x={cutX + 6} y={m.t + 14}>Top 10%: {int(primer.topPapers)} papers</text>
			<text x={cutX + 6} y={m.t + (compact ? 30 : 32)}>about {primer.cutoff} or more citations</text>
		</g>
	</svg>
</div>

<style>
	.primer {
		position: absolute;
		inset: 0;
		opacity: 0;
		transition: opacity 400ms linear;
		pointer-events: none;
	}

	.primer.visible {
		opacity: 1;
	}

	svg {
		position: absolute;
		inset: 0;
		overflow: visible;
	}

	text {
		fill: var(--dust);
		font: 12px var(--sans);
	}

	.compact text {
		font-size: 11px;
	}

	.grid {
		stroke: var(--shadow);
		opacity: 0.6;
	}

	.base {
		stroke: var(--soil);
	}

	rect {
		fill: var(--dust);
		transition: fill 400ms linear, opacity 400ms linear;
	}

	/* the top 10% turns blue and the rest steps back */
	rect.top {
		fill: var(--neptune);
		opacity: 0;
	}

	.highlight rect {
		fill: var(--outline);
	}

	.highlight rect.top {
		fill: var(--neptune);
		opacity: 1;
	}

	.cut {
		opacity: 0;
		transition: opacity 400ms linear;
	}

	.highlight .cut {
		opacity: 1;
	}

	.cut line {
		stroke: var(--white);
		stroke-dasharray: 4 4;
	}

	.cut .strong {
		fill: var(--white);
		font-weight: 500;
	}
</style>
