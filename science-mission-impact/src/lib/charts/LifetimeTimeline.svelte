<script>
	import { int, compact } from '$lib/format.js';
	import { timelineModel, timelineLayout } from './lifetimetimeline.js';

	let { lifetime } = $props();
	let mode = $state('annual');
	let width = $state(0);
	let selected = $state(null);
	const model = $derived(timelineModel(lifetime, mode));
	const layout = $derived(width > 0 ? timelineLayout(model, width) : null);
	const point = $derived(model?.points[Math.min(selected ?? model.points.length - 1, model.points.length - 1)]);
	const coverage = $derived(model?.citationCoverage);
	const incomplete = $derived(coverage?.status === 'incomplete');
	const partialYear = $derived(model?.partialIndex >= 0 ? model.years[model.partialIndex] : null);
	const readout = $derived(point ? `${point.year}: ${int(point.pub)} tracked publications · ${int(point.cite)} citations${mode === 'cumulative' ? ' accumulated' : ''}` : '');
</script>

<figure>
	<div class="toolbar">
		<p>Lifetime · {model ? `${model.years[0]}–${model.years.at(-1)}` : 'No recorded years'}</p>
		<label>View <select bind:value={mode}><option value="annual">Annual</option><option value="cumulative">Cumulative</option></select></label>
	</div>
	{#if model}
		<div class="stage" bind:clientWidth={width}>
			{#if layout}
				<svg {width} height={layout.height} role="img" aria-label={`Tracked publications and citations by calendar year, ${model.years[0]} to ${model.years.at(-1)}. Each plot has its own count scale.`}>
					{#each layout.panels as panel (panel.key)}
						<text class="title" x={layout.left} y={panel.top - 14}>{panel.label}</text>
						{#each panel.ticks as value (value)}
							<line class="grid" x1={layout.left} x2={layout.right} y1={panel.y(value)} y2={panel.y(value)} />
							<text class="tick" x={layout.left - 8} y={panel.y(value)} dy="0.32em" text-anchor="end">{compact(value)}</text>
						{/each}
						{#if panel.solid}<path class="series {panel.key}" d={panel.solid} />{/if}
						{#if panel.partial}<path class="series partial {panel.key}" d={panel.partial} />{/if}
						<line class="cursor" x1={layout.x(point.year)} x2={layout.x(point.year)} y1={panel.top} y2={panel.bottom} />
						<circle class="dot {panel.key}" cx={layout.x(point.year)} cy={panel.y(point[panel.key])} r="3" />
					{/each}
					{#each layout.xTicks as year (year)}
						<text class="tick" x={layout.x(year)} y={layout.height - 25} text-anchor="middle">{year}</text>
					{/each}
					<text class="tick" x={(layout.left + layout.right) / 2} y={layout.height - 5} text-anchor="middle">Calendar year</text>
				</svg>
			{/if}
		</div>
		<label class="year-control">Year
			<input type="range" min="0" max={model.points.length - 1} step="1" value={selected ?? model.points.length - 1} oninput={(e) => (selected = Number(e.currentTarget.value))} aria-valuetext={readout} disabled={model.points.length === 1} />
		</label>
		<p class="readout">{readout}</p>
		{#if partialYear != null}<p class="meta note">Dashed from {partialYear}: incomplete calendar-year coverage.</p>{/if}
		{#if incomplete}
			<details class="note">
				<summary>Citation timeline has a small gap</summary>
				<p>{int(coverage.observed)} of {int(coverage.expected)} reported citations have dated records; {int(coverage.missing)} missing. Headline totals include all reported citations.</p>
			</details>
		{/if}
	{:else}
		<p class="explanation">No publication or citation timeline is available.</p>
	{/if}
</figure>

<style>
	figure { min-width: 0; }
	.toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
	.toolbar p, .toolbar label, .explanation, .readout, .year-control, details { font-size: 14px; line-height: 1.5; }
	.toolbar { margin-top: 12px; color: var(--dust); }
	.toolbar label { display: flex; align-items: center; gap: 8px; }
	select { background: var(--panel); color: var(--white); border: 1px solid var(--soil); padding: 6px 8px; font: inherit; }
	.explanation { margin-top: 12px; color: var(--dust); }
	.stage { min-height: 410px; margin-top: 12px; }
	svg { display: block; overflow: visible; }
	text { font-family: var(--sans); }
	.title { font-size: 14px; fill: var(--white); }
	.tick { font-size: 12px; fill: var(--dust); }
	.grid { stroke: var(--shadow); }
	.cursor { stroke: var(--soil); stroke-dasharray: 2 4; }
	.series { fill: none; stroke-width: 2; }
	.series.pub { stroke: var(--white); }
	.series.cite { stroke: var(--neptune); }
	.partial { stroke-dasharray: 4 4; }
	.dot.pub { fill: var(--white); }
	.dot.cite { fill: var(--neptune); }
	.year-control { display: flex; gap: 12px; align-items: center; }
	input { flex: 1; min-width: 0; accent-color: var(--neptune); }
	.readout { margin-top: 8px; min-height: 42px; font-variant-numeric: tabular-nums; }
	.note { margin-top: 10px; color: var(--dust); }
	summary { cursor: pointer; }
	details p { margin-top: 8px; }
</style>
