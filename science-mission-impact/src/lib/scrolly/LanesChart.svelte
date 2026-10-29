<script>
	// Every compared division on the one cost axis, a band each: a bar per mission, its top-10%
	// papers a year, rising from the shelf to the band's own scale (`row.rateTop`: each division
	// ranks its own papers, so the bands are never read against one scale, and none is labelled).
	// Pointing at a bar (laneHit, in the story) lights it in Rocket Flame and names its mission and
	// rate, as the primer does a count; a dashed cursor through every band reads the cost off the
	// axis, as the division pages' by-year chart reads off the year.
	// The focus division's bars are drawn here for the focus chart's steps too (`focus`), on that
	// chart's axes, rising with `grow`; when the lanes come up the same bars move into their band.
	import { money, moneyTick, weight } from '$lib/format.js';
	import { minorDollarTicks } from '$lib/charts/costaxis.js';
	import DollarMinorTicks from '$lib/charts/DollarMinorTicks.svelte';
	import { columnLabel } from './layouts.js';

	/**
	 * layout: costLayout() over the compared divisions. hot: the pointed-at bar's mission id. cursor: the pointer's x over the lanes.
	 * title: the chart's title, over a layout made `titled`. focus: the focus chart's focusLayout(), whose division's bars
	 * this chart carries. focused: the focus chart is up, so those bars stand on its axes, `grow` (0–1) of their height.
	 */
	let { layout, title = null, focus = null, focused = false, grow = 1, hot = null, cursor = null, visible = false, compact = false, width, height } = $props();

	const [x0, x1] = $derived(layout.x.range());
	const bw = $derived(compact ? 3 : 4);
	// a phone is too narrow for the title on one line: it breaks after its first comma
	const cut = $derived(title?.indexOf(', ') ?? -1);
	const titleLines = $derived(!title ? [] : compact && cut > 0 ? [title.slice(0, cut + 1), title.slice(cut + 2)] : [title]);
	// Each band's bars stand on its bottom edge, the divider under it, rather than on the layout's
	// shelf (which sits higher, over room the hidden squares and the preview image use), so the
	// axis and the divider are one line. Edges are whole pixels, so the band's border and the
	// baseline drawn over it land on the same row of pixels.
	const rows = $derived(
		layout.rows.map((row) => {
			const top = Math.round(row.y);
			const base = Math.round(row.y + row.h);
			const bars = row.members.filter((t) => t.top10PerYear > 0).map((t) => ({ id: t.id, name: t.name, cost: t.cost, rate: t.top10PerYear, x: layout.x(t.cost), h: (t.top10PerYear / row.rateTop) * (base - row.curveTop) }));
			return { ...row, top, base, bars };
		})
	);
	// The focus division's bars, each a unit rect `rate` tall scaled into place (px per paper a
	// year), so moving between the two charts is one transform transition while `grow` scrubs the
	// height alone. On the focus chart's axes while it is up, otherwise in their band.
	const carriedRow = $derived(focus && rows.find((r) => r.slug === focus.division));
	const movers = $derived.by(() => {
		if (!carriedRow) return [];
		const c = focus.chart;
		const fw = compact ? 3 : 5;
		const v = Math.max(0, Math.min(1, grow));
		return carriedRow.bars.map((b) => ({
			id: b.id,
			v: b.rate * v,
			...(focused ? { x: c.x(b.cost) - fw / 2, base: c.y(0), w: fw, k: c.y(0) - c.y(1) } : { x: b.x - bw / 2, base: carriedRow.base, w: bw, k: b.h / b.rate })
		}));
	});
	// the last band's bottom edge, where the cost axis hangs
	const floor = $derived(rows.at(-1).base);
	const pointed = $derived.by(() => {
		for (const row of rows) {
			const b = row.bars.find((b) => b.id === hot);
			if (b) return { row, b };
		}
		return null;
	});
	// the cursor snaps to the pointed-at bar, so it reads that mission's cost; otherwise it follows the pointer
	const cx = $derived(pointed ? pointed.b.x : cursor != null && cursor >= x0 && cursor <= x1 ? cursor : null);
	const label = $derived(
		pointed && columnLabel(`${pointed.b.name}: ${weight(pointed.b.rate)} top-10% papers a year`, { x: pointed.b.x - bw / 2, w: bw }, { left: x0, right: x1, y: pointed.row.base - pointed.b.h - 6, compact })
	);
</script>

<div class="lanes" class:visible class:compact aria-hidden="true">
	{#each rows as row (row.slug)}
		<span class="band" class:alt={row.band} style:top="{row.top}px" style:height="{row.base - row.top}px"></span>
	{/each}
	<span class="band closing" style:top="{floor}px"></span>
	<DollarMinorTicks positions={minorDollarTicks(...layout.x.domain()).map(layout.x)} top={floor} />
	{#each layout.ticks as t (t)}
		<span class="tick" class:covered={cx != null && Math.abs(layout.x(t) - cx) < (compact ? 34 : 42)} style:left="{layout.x(t)}px" style:top="{floor + 5}px">{moneyTick(t)}</span>
	{/each}
	<!-- the cursor's cost, on the axis; a tick label it would run into steps aside -->
	{#if cx != null}<span class="tick reading" style:left="{cx}px" style:top="{floor + 5}px">{money(layout.x.invert(cx))}</span>{/if}

	<svg {width} {height}>
		<!-- the chart's title, top right like the overview's other charts -->
		{#each titleLines as line, i (i)}<text class="stage-title" x={x1} y={layout.top - 12 - (titleLines.length - 1 - i) * 15} text-anchor="end">{line}</text>{/each}
		{#each layout.ticks as t (t)}
			<line class="grid" x1={layout.x(t)} x2={layout.x(t)} y1={layout.top} y2={floor} />
		{/each}
		<!-- under the bars, so a lit bar it snaps to stays whole -->
		{#if cx != null}<line class="cursor" x1={cx} x2={cx} y1={rows[0].top} y2={floor} />{/if}
		{#each rows as row (row.slug)}
			<!-- over the next band's top border (or the closing one): the 1px line fills that pixel row -->
			<line class="shelf" x1={x0} x2={x1} y1={row.base + 0.5} y2={row.base + 0.5} />
			{#if row !== carriedRow}
				{#each row.bars as b (b.id)}<rect class="bar" class:hot={b.id === hot} x={b.x - bw / 2} y={row.base - b.h} width={bw} height={b.h} />{/each}
			{/if}
		{/each}
	</svg>

	{#each rows as row (row.slug)}
		<span class="name" style:top="{row.y}px" style:width={compact ? null : `${layout.left - 12}px`}>{row.label}</span>
	{/each}
</div>

<!-- outside the lanes, so they stay up for the focus chart's steps while the lanes are hidden -->
<svg class="carried" class:shown={visible || focused} class:compact {width} {height} aria-hidden="true">
	{#each movers as m (m.id)}
		<g class="mover" style:transform="translate({m.x}px, {m.base}px) scale({m.w}, {m.k})"><rect class="bar" class:hot={m.id === hot} y={-m.v} width="1" height={m.v} /></g>
	{/each}
	{#if label}<text class="label" x={label.x} y={label.y} text-anchor={label.anchor}>{label.text}</text>{/if}
</svg>

<style>
	.lanes {
		position: absolute;
		inset: 0;
		opacity: 0;
		transition: opacity 400ms linear;
		pointer-events: none;
	}

	.lanes.visible {
		opacity: 1;
	}

	.lanes > span,
	svg {
		position: absolute;
	}

	svg {
		inset: 0;
		overflow: visible;
	}

	.carried {
		position: absolute;
		pointer-events: none;
		opacity: 0;
		transition: opacity 400ms linear;
	}

	.carried.shown {
		opacity: 1;
	}

	.mover {
		transition: transform var(--move) var(--ease);
	}

	.band {
		left: 0;
		right: 0;
		border-top: 1px solid var(--shadow);
	}

	.band.alt {
		background: var(--band);
	}

	.tick {
		transform: translateX(-50%);
		font-size: 12px;
		line-height: 16px;
		color: var(--dust);
		white-space: nowrap;
	}

	.grid {
		stroke: var(--shadow);
		opacity: 0.6;
	}

	.shelf {
		stroke: var(--soil);
	}

	.bar {
		fill: var(--neptune);
	}

	.bar.hot {
		fill: var(--flame);
	}

	/* the division pages' by-year cursor */
	.cursor {
		stroke: var(--soil);
		stroke-dasharray: 2 4;
	}

	.reading {
		color: var(--white);
	}

	.tick.covered {
		visibility: hidden;
	}

	.label {
		fill: var(--white);
		font: 500 12px var(--sans);
		paint-order: stroke;
		stroke: var(--black);
		stroke-width: 3px;
		stroke-linejoin: round;
	}

	.compact .label {
		font-size: 11px;
	}

	.name {
		left: 0;
		padding-top: 8px;
		font-weight: 500;
		font-size: 14px;
		line-height: 18px;
	}

	.compact .name {
		padding-top: 2px;
		font-size: 12px;
		line-height: 16px;
	}
</style>
