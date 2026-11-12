<script>
	// Median years to each tier's first top-10% paper, two ways on one axis: from the start of
	// formulation (thick) and from the start of science (thin). Geometry in timeLayout; its height
	// doesn't depend on width, so the server reserves the stage and nothing shifts on hydration.
	import { int, range, years, yearsLabel } from '$lib/format.js';
	import { timeLayout } from './charts-a.js';
	import { tierLabel } from './tiers.js';

	/** tiers: AnalysisFacts.tiers; time: AnalysisFacts.time. */
	let { tiers, time } = $props();
	let width = $state(0);
	const layout = $derived(timeLayout(tiers, time, width));
	// a median's 95% interval, for the screen-reader table only (the bars draw no whiskers)
	const interval = (ci) => range(ci, years, ' to ');
</script>

<div class="time-bars">
	<p class="key" aria-hidden="true">
		<span><i class="swatch formulation"></i>From formulation start</span>
		<span><i class="swatch science"></i>From the start of science</span>
	</p>
	<div class="stage" bind:clientWidth={width} style:height="{layout.height}px">
		{#if width > 0}
			<svg {width} height={layout.height} aria-hidden="true">
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
								<rect class="bar" class:thin={k === 1} x={bar.x} y={bar.y} width={bar.w} height={bar.h} />
								<text class="value" class:thin={k === 1} x={bar.tx} y={bar.cy} dy="0.32em" text-anchor={bar.anchor}>{yearsLabel(bar.median)}</text>
							{/if}
						{/each}
					{/if}
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
				<th scope="col">95% interval for that median</th>
				<th scope="col">Fewest years from formulation start</th>
				<th scope="col">Median years from the start of science</th>
				<th scope="col">95% interval for that median</th>
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
					<td>{interval(t.formulation.ci)}</td>
					<td>{years(t.formulation.min)}</td>
					<td>{years(t.science.median)}</td>
					<td>{interval(t.science.ci)}</td>
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
	.stage { position: relative; }
	text { font: 12px var(--sans); }
	.tick { font-size: 11px; fill: var(--soil); }
	.label, .title { fill: var(--dust); }
	/* a black halo keeps values legible where a gridline runs under them */
	.value, .none { paint-order: stroke; stroke: var(--black); stroke-width: 3px; stroke-linejoin: round; }
	.value { fill: var(--white); }
	.value.thin { fill: var(--neptune-mid); }
	.none { fill: var(--dust); }
	.grid { stroke: var(--shadow); }
	.bar { fill: var(--neptune); }
	.bar.thin { fill: var(--neptune-mid); }
</style>
