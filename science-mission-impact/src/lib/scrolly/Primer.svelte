<script>
	// The citation primer: one division's papers by how often each was cited, one bar per count
	// from none up to the most cited paper. `build` (0–1) grows the bars from the left on the
	// first step; `highlight` turns each bar's top-10% papers blue, from its base, and marks
	// where the top 10% begins. Papers tied at the cutoff share the last places, so that bar is
	// only partly blue; the line sits at the first bar that is mostly in. The geometry, log scale
	// included, is primerLayout's. Pointing at a bar lights it in Rocket Flame and names its count,
	// as the skyline does a column.
	// ponytail: one bar per count suits planetary science (most cited: a few hundred); a focus
	// division cited into the thousands would want bars binned by more than one citation.
	import { int, plural, spell } from '$lib/format.js';
	import { columnLabel } from './layouts.js';

	/** layout: primerLayout() result. primer: StoryFacts.primer. years: the citation window, in calendar years. highlight: top 10% in blue. hot: the pointed-at bar's citation count. */
	let { layout, primer, years, build = 1, highlight = false, hot = null, visible = false, compact = false, width, height } = $props();

	const clamp01 = (v) => Math.max(0, Math.min(1, v));
	// the sweep: the leftmost bar starts first and every bar is full by build = 1
	const grown = (c) => clamp01(build * 1.6 - (c.id / layout.cap) * 0.6);
	const pointed = $derived(layout.columns.find((c) => c.id === hot) ?? null);
	const cited = (n) => (n === 0 ? 'with no citations' : n === 1 ? 'cited once' : `cited ${int(n)} times`);
	const label = $derived(
		pointed && columnLabel(`${int(pointed.papers)} ${plural(pointed.papers, 'paper')} ${cited(pointed.id)}`, pointed, { left: layout.left, right: layout.right, y: layout.ground - pointed.h - 4, compact })
	);
</script>

<div class="primer" class:visible class:highlight class:compact aria-hidden="true">
	<svg {width} {height}>
		{#each layout.yTicks as t (t.v)}
			<line class="grid" x1={layout.left} x2={layout.right} y1={t.y} y2={t.y} />
			<text x={layout.left - 8} y={t.y} dy="0.32em" text-anchor="end">{int(t.v)}</text>
		{/each}
		{#each layout.columns as c (c.id)}
			{@const h = c.h * grown(c)}
			{@const t = c.t * grown(c)}
			<rect class:hot={c.id === hot} x={c.x} y={layout.ground - h} width={c.w} height={h} />
			{#if c.top > 0}<rect class="top" class:hot={c.id === hot} x={c.x} y={layout.ground - t} width={c.w} height={t} />{/if}
		{/each}
		<line class="base" x1={layout.left} x2={layout.right} y1={layout.ground} y2={layout.ground} />
		{#each layout.xTicks as t (t.v)}
			<text x={t.x} y={layout.ground + 18} text-anchor="middle">{t.v}</text>
		{/each}
		<text x={layout.left} y={layout.top - 14}>Papers</text>
		<text x={layout.right} y={layout.ground + 38} text-anchor="end">Citations in a paper’s first {spell(years)} years</text>
		<g class="cut">
			<line x1={layout.cut - 1} x2={layout.cut - 1} y1={layout.top} y2={layout.ground} />
			<text class="strong" x={layout.cut + 6} y={layout.top + 14}>Top 10%: {int(primer.topPapers)} papers</text>
			<text x={layout.cut + 6} y={layout.top + (compact ? 30 : 32)}>about {primer.cutoff} or more citations</text>
		</g>
		{#if label && build > 0.9}<text class="label" x={label.x} y={label.y} text-anchor={label.anchor}>{label.text}</text>{/if}
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

	/* the pointed-at bar, whole, and its name: as the skyline lights a column */
	.primer rect.hot {
		fill: var(--flame);
		opacity: 1;
		transition: none;
	}

	.label {
		fill: var(--white);
		paint-order: stroke;
		stroke: var(--black);
		stroke-width: 3px;
	}
</style>
