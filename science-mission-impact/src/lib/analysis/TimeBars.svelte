<script>
	// Median years to each tier's first top-10% paper, two ways on one axis: from the start of
	// formulation (thick) and from the start of science (thin). Geometry in timeLayout; its height
	// doesn't depend on width, so the server reserves the stage and nothing shifts on hydration.
	import { int, years } from '$lib/format.js';
	import { timeLayout } from './charts-a.js';
	import { tierLabel } from './tiers.js';

	/**
	 * tiers: AnalysisFacts.tiers; time: AnalysisFacts.time. only: 'formulation' or 'science' fades the
	 * other measure out (the story's one step each), and the science bars, alone, are hatched so they
	 * read as the other measure; height: fit into this many px (the story's stage): rows tighten from
	 * 54 to 28px, and below 50 each row's mission count is left off. title: the story's, top right
	 * over the plot like its other charts, in place of the key.
	 */
	let { tiers, time, only = null, height = null, title = null } = $props();
	const uid = $props.id();
	let width = $state(0);
	// the key (or title) above the bars, as measured, then 66px for the gap under it and the axis
	let head = $state(16);
	const pitch = $derived(height ? Math.max(28, Math.min(54, Math.floor((height - head - 66) / tiers.length))) : 54);
	const counts = $derived(pitch >= 50);
	const layout = $derived(timeLayout(tiers, time, width, { pitch, only }));
	const off = (key) => only != null && only !== key;
	const yr = (v) => `${years(v)} yr`;
</script>

<div class="time-bars">
	{#if title}
		<!-- right-aligned to the plot's end; on a phone it balances over two lines, a word joiner
		     after each hyphen keeping "high-impact" whole -->
		<p class="heading" class:compact={width > 0 && width < 600} bind:clientHeight={head} style:padding-right={width > 0 ? `${width - layout.x.range()[1]}px` : null}>{title.replaceAll('-', '-⁠')}</p>
	{:else}
		<p class="key" bind:clientHeight={head} aria-hidden="true">
			{#if !off('formulation')}<span><i class="swatch formulation"></i>From formulation start</span>{/if}
			{#if !off('science')}<span><i class="swatch {only ? 'formulation' : 'science'}"></i>From the start of science</span>{/if}
		</p>
	{/if}
	<div class="stage" bind:clientWidth={width} style:height="{layout.height}px">
		{#if width > 0}
			<svg {width} height={layout.height} aria-hidden="true">
				<!-- the science bars' hatching, when they stand alone -->
				<defs>
					<pattern id="hatch-{uid}" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
						<rect class="hatch-ground" width="6" height="6" />
						<rect class="hatch-stripe" width="3" height="6" />
					</pattern>
				</defs>
				{#each layout.ticks as v (v)}
					<line class="grid" x1={layout.x(v)} x2={layout.x(v)} y1={layout.top} y2={layout.bottom} />
					<text class="tick" x={layout.x(v)} y={layout.bottom + 16} text-anchor="middle">{v}</text>
				{/each}
				{#each layout.rows as row, i (i)}
					<text class="label" x={layout.left - 10} y={row.labelY} dy="0.32em" text-anchor="end">{row.label}</text>
					{#if row.none}
						<text class="none" x={layout.x(0) + 6} y={row.labelY} dy="0.32em">None yet</text>
					{:else}
						{#each [row.formulation, row.science] as bar, k (k)}
							{#if bar}
								{@const faded = off(k ? 'science' : 'formulation')}
								<rect class="bar" class:thin={k === 1 && !only} class:off={faded} style:fill={k === 1 && only ? `url(#hatch-${uid})` : null} x={bar.x} y={bar.y} width={bar.w} height={bar.h} />
								<text class="value" class:thin={k === 1 && !only} class:off={faded} x={bar.tx} y={bar.cy} dy="0.32em" text-anchor={bar.anchor}>{yr(bar.median)}</text>
							{/if}
						{/each}
					{/if}
					{#if counts}<text class="meta" x={layout.x(0)} y={row.metaY}>{row.meta}</text>{/if}
				{/each}
				<text class="title" x={(layout.left + layout.x.range()[1]) / 2} y={layout.height - 4} text-anchor="middle">Years</text>
			</svg>
		{/if}
	</div>
	<!-- the clip goes on a wrapper: a table grows to its content whatever width .sr-only gives it, and widened the page -->
	<div class="sr-only"><table>
		<caption>Years to each mission's first top-10% paper, by cost tier (failures left out)</caption>
		<thead>
			<tr>
				<th scope="col">Cost tier</th>
				<th scope="col">Missions</th>
				<th scope="col">With a top-10% paper</th>
				<th scope="col">Without one yet</th>
				<th scope="col">Median years from formulation start</th>
				<th scope="col">Fewest years from formulation start</th>
				<th scope="col">Median years from the start of science</th>
				<th scope="col">Fewest years from the start of science</th>
			</tr>
		</thead>
		<tbody>
			{#each time.tiers as t, i (i)}
				<tr>
					<th scope="row">{tierLabel(tiers[i])}</th>
					<td>{int(t.missions)}</td>
					<td>{int(t.reached)}{#if t.undated > 0}, {t.undated} with no formulation date on record{/if}</td>
					<td>{int(t.without)}</td>
					<td>{years(t.formulation.median)}</td>
					<td>{years(t.formulation.min)}</td>
					<td>{years(t.science.median)}</td>
					<td>{years(t.science.min)}</td>
				</tr>
			{/each}
		</tbody>
	</table></div>
</div>

<style>
	.key { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-bottom: 12px; font-size: 12px; line-height: 16px; color: var(--dust); }
	.key span { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
	.swatch { display: inline-block; width: 16px; }
	.swatch.formulation { height: 10px; background: var(--neptune); }
	.swatch.science { height: 5px; background: var(--neptune-mid); }
	/* the overview's .stage-title, in HTML so it can wrap */
	.heading { margin-bottom: 12px; font-size: 15px; line-height: 20px; text-align: right; text-wrap: balance; color: var(--dust); }
	.heading.compact { font-size: 13px; line-height: 17px; }
	.hatch-ground { fill: var(--neptune); opacity: 0.3; }
	.hatch-stripe { fill: var(--neptune); }
	.stage { position: relative; }
	text { font: 12px var(--sans); }
	.tick { font-size: 11px; fill: var(--soil); }
	.label, .title { fill: var(--dust); }
	/* a black halo keeps values and counts legible where a gridline runs under them */
	.value, .meta, .none { paint-order: stroke; stroke: var(--black); stroke-width: 3px; stroke-linejoin: round; }
	.value { fill: var(--white); }
	.value.thin { fill: var(--neptune-mid); }
	.none { fill: var(--dust); }
	.meta { font-size: 11px; fill: var(--soil); }
	.grid { stroke: var(--shadow); }
	.bar { fill: var(--neptune); }
	.bar.thin { fill: var(--neptune-mid); }
	.bar, .value { transition: opacity 400ms linear; }
	.off { opacity: 0; }
</style>
