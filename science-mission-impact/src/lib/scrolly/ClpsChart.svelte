<script>
	// The commercial landers' running publications, month by month since the first CLPS launch,
	// against two earlier low-cost missions aligned by months since their own start. The CLPS line
	// draws over its own step (draw), the two comparators together over the next (drawComparators).
	import { scaleLinear } from 'd3-scale';
	import { line, curveStepAfter } from 'd3-shape';
	import { compact as short, int } from '$lib/format.js';

	/** clps: Site.clps (series indexed by month, null until that month has elapsed). */
	let { clps, draw = 0, drawComparators = 0, visible = false, compact = false, width, height } = $props();

	const clamp01 = (v) => Math.max(0, Math.min(1, v));
	const a = $derived(clamp01(draw));
	const b = $derived(clamp01(drawComparators));
	const all = $derived(
		[{ id: 'clps', name: 'CLPS', series: clps.series, main: true }, ...clps.comparators.map((c) => ({ ...c, main: false }))].map((s) => {
			const month = s.series.findLastIndex((v) => v != null);
			return { ...s, last: month < 0 ? { month: 0, papers: 0 } : { month, papers: s.series[month] } };
		})
	);
	// On a phone the right margin grows to hold the longest comparator label (~6.2px a character at
	// 11px, plus the 8px gap), but the plot keeps at least 55% of the width; past that cap a
	// comparator's label drops to its last word ("Pathfinder 72"). The CLPS label wraps instead.
	const fit = (texts) => Math.max(...texts.map((t) => t.length)) * 6.2 + 8;
	const cap = $derived(width * 0.45 - 34);
	const texts = $derived.by(() => {
		const full = all.map((s) => `${s.name} ${int(s.last.papers)}`);
		if (!compact || fit(full.filter((_, i) => !all[i].main)) <= cap) return full;
		return all.map((s, i) => (s.main ? full[i] : `${s.name.split(' ').at(-1)} ${int(s.last.papers)}`));
	});
	const m = $derived({
		l: compact ? 34 : 56,
		r: compact ? Math.min(cap, Math.max(92, fit(texts.filter((_, i) => !all[i].main)))) : 148,
		t: 20,
		b: 28
	});
	const lineH = $derived(compact ? 13 : 15);
	// The CLPS label: the short names of the landers that contributed papers, greedily wrapped to the
	// margin at 11px, then the value on its own last line.
	const clpsLines = $derived.by(() => {
		const max = Math.max(1, Math.floor((m.r - 8) / 6.2));
		const out = [];
		const names = clps.missions.filter((p) => p.papers != null).map((p) => p.name);
		// whole names only, never broken inside one; a name wider than the margin gets its own line
		for (const w of names.map((n, i) => (i < names.length - 1 ? `${n},` : n))) {
			if (out.length && out.at(-1).length + 1 + w.length <= max) out[out.length - 1] += ` ${w}`;
			else out.push(w);
		}
		return [...out, int(all[0].last.papers)];
	});
	const x = $derived(scaleLinear([0, clps.horizonMonths], [m.l, width - m.r]));
	const y = $derived(scaleLinear([0, Math.max(1, ...all.flatMap((s) => s.series.filter((v) => v != null)))], [height - m.b, m.t]).nice(4));
	const path = $derived(
		line()
			.defined((p) => p.papers != null)
			.x((p) => x(p.month))
			.y((p) => y(p.papers))
			.curve(curveStepAfter)
	);
	const lines = $derived(
		all.map((s, i) => ({ ...s, text: texts[i], d: path(s.series.map((papers, month) => ({ month, papers }))), opacity: s.main ? a : b }))
	);
	// end labels in y order, each block's top at least a line below the last line of the one above;
	// y is the block's last line, the CLPS names stack above it
	const labels = $derived.by(() => {
		let prev = -Infinity;
		return lines
			.map((l) => ({ id: l.id, lines: l.main ? clpsLines : [l.text], y: y(l.last.papers), opacity: l.opacity, main: l.main }))
			.sort((p, q) => p.y - q.y)
			.map((l) => {
				const ly = Math.max(l.y, prev + l.lines.length * lineH);
				prev = ly;
				return { ...l, y: ly };
			});
	});
	const xTicks = $derived([0, 12, 24, 36].filter((t) => t <= clps.horizonMonths));
</script>

<div class="clps" class:visible class:compact aria-hidden="true">
	<svg {width} {height}>
		{#each y.ticks(4) as t (t)}
			<line class="grid" x1={m.l} x2={width - m.r} y1={y(t)} y2={y(t)} />
			<text class="tick" x={m.l - 8} y={y(t)} dy="0.32em" text-anchor="end">{short(t)}</text>
		{/each}
		{#each xTicks as t, i (t)}
			<text class="tick" x={x(t)} y={height - 8} text-anchor="middle">{t}{i === xTicks.length - 1 ? ' months' : ''}</text>
		{/each}
		{#each lines as l (l.id)}
			<path class:main={l.main} d={l.d} pathLength="1" stroke-dasharray="1" stroke-dashoffset={1 - l.opacity} />
			{#if l.main}<circle cx={x(l.last.month)} cy={y(l.last.papers)} r="3" opacity={a >= 1 ? 1 : 0} />{/if}
		{/each}
		{#each labels as l (l.id)}
			<text class="label" class:main={l.main} x={width - m.r + 8} y={l.y - (l.lines.length - 1) * lineH} dy="0.32em" opacity={l.opacity}>
				{#each l.lines as t, i (i)}<tspan class:names={i < l.lines.length - 1} x={width - m.r + 8} dy={i ? lineH : undefined}>{t}</tspan>{/each}
			</text>
		{/each}
	</svg>
</div>

<style>
	.clps {
		position: absolute;
		inset: 0;
		opacity: 0;
		transition: opacity 400ms linear;
		pointer-events: none;
	}

	.clps.visible {
		opacity: 1;
	}

	svg {
		position: absolute;
		inset: 0;
		overflow: visible;
	}

	.grid {
		stroke: var(--shadow);
		stroke-width: 1;
	}

	.tick {
		fill: var(--soil);
		font-size: 12px;
	}

	path {
		fill: none;
		stroke: var(--dust);
		stroke-width: 1.5;
	}

	path.main {
		stroke: var(--neptune);
		stroke-width: 2.5;
	}

	circle {
		fill: var(--neptune);
	}

	.label {
		fill: var(--dust);
		font-size: 13px;
	}

	.label.main {
		fill: var(--white);
	}

	.label .names {
		fill: var(--dust);
		font-size: 11px;
	}

	.compact .label,
	.compact .tick {
		font-size: 11px;
	}
</style>
