<script>
	import { int, compact } from '$lib/format.js';
	import { timelineModel, timelineLayout } from './lifetimetimeline.js';

	let { lifetime } = $props();
	let mode = $state('annual');
	let width = $state(0);
	let selected = $state(null);
	let dragging = $state(null);
	const model = $derived(timelineModel(lifetime, mode));
	const layout = $derived(width > 0 ? timelineLayout(model, width) : null);
	const point = $derived(model?.points[Math.min(selected ?? model.points.length - 1, model.points.length - 1)]);
	const coverage = $derived(model?.citationCoverage);
	const incomplete = $derived(coverage?.status === 'incomplete');
	const partialYear = $derived(model?.partialIndex >= 0 ? model.years[model.partialIndex] : null);
	const readout = $derived(point ? `${point.year}: ${int(point.pub)} tracked publications · ${int(point.cite)} citations${mode === 'cumulative' ? ' accumulated' : ''}` : '');

	function selectAtPointer(event) {
		const bounds = event.currentTarget.getBoundingClientRect();
		const year = layout.x.invert(layout.left + (event.clientX - bounds.left) * (layout.right - layout.left) / bounds.width);
		selected = model.years.reduce((nearest, value, index) =>
			Math.abs(value - year) < Math.abs(model.years[nearest] - year) ? index : nearest, 0);
	}

	function startDrag(event) {
		if (!event.isPrimary || event.button !== 0) return;
		dragging = event.pointerId;
		event.currentTarget.setPointerCapture(event.pointerId);
		event.currentTarget.focus({ preventScroll: true });
		selectAtPointer(event);
	}

	function endDrag(event) {
		if (dragging !== event.pointerId) return;
		dragging = null;
		if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
	}

	function selectWithKeyboard(event) {
		const index = model.years.indexOf(point.year);
		const next = { ArrowLeft: index - 1, ArrowDown: index - 1, ArrowRight: index + 1, ArrowUp: index + 1,
			Home: 0, End: model.points.length - 1, PageDown: index - 10, PageUp: index + 10 }[event.key];
		if (next == null) return;
		event.preventDefault();
		selected = Math.max(0, Math.min(model.points.length - 1, next));
	}
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
				<div
					class="chart-control" class:dragging={dragging !== null}
					style:left={`${layout.left}px`} style:width={`${layout.right - layout.left}px`}
					style:top={`${layout.panels[0].top}px`} style:height={`${layout.panels.at(-1).bottom - layout.panels[0].top}px`}
					role="slider" tabindex="0" aria-label="Calendar year" aria-orientation="horizontal"
					aria-valuemin={model.years[0]} aria-valuemax={model.years.at(-1)} aria-valuenow={point.year} aria-valuetext={readout}
					onpointerdown={startDrag}
					onpointermove={(event) => { if (dragging === event.pointerId) selectAtPointer(event); }}
					onpointerup={endDrag} onpointercancel={endDrag} onlostpointercapture={endDrag}
					onkeydown={selectWithKeyboard}
				></div>
			{/if}
		</div>
		<p class="meta note">Tap or drag across either plot to choose a year. Use arrow keys when focused.</p>
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
	.toolbar p, .toolbar label, .explanation, .readout, details { font-size: 14px; line-height: 1.5; }
	.toolbar { margin-top: 12px; color: var(--dust); }
	.toolbar label { display: flex; align-items: center; gap: 8px; }
	select { background: var(--panel); color: var(--white); border: 1px solid var(--soil); padding: 6px 8px; font: inherit; }
	.explanation { margin-top: 12px; color: var(--dust); }
	.stage { position: relative; min-height: 410px; margin-top: 12px; }
	.chart-control { position: absolute; cursor: ew-resize; touch-action: pan-y; user-select: none; }
	.chart-control.dragging { cursor: grabbing; }
	.chart-control:focus-visible { outline: 2px solid var(--neptune); outline-offset: 4px; }
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
	.readout { margin-top: 8px; min-height: 42px; font-variant-numeric: tabular-nums; }
	.note { margin-top: 10px; color: var(--dust); }
	summary { cursor: pointer; }
	details p { margin-top: 8px; }
</style>
