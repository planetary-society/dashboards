<script>
	import { int, compact } from '$lib/format.js';
	import { timelineModel, timelineLayout } from './lifetimetimeline.js';

	let { lifetime } = $props();
	let mode = $state('annual');
	let width = $state(0);
	let hover = $state(null); // index under the pointer; the latest year otherwise
	const model = $derived(timelineModel(lifetime, mode));
	const layout = $derived(width > 0 ? timelineLayout(model, width) : null);
	const point = $derived(model?.points[Math.min(hover ?? model.points.length - 1, model.points.length - 1)]);
	const coverage = $derived(model?.citationCoverage);
	const incomplete = $derived(coverage?.status === 'incomplete');
	const partialYear = $derived(model?.partialIndex >= 0 ? model.years[model.partialIndex] : null);
	const when = $derived(mode === 'cumulative' ? `Through ${point?.year}` : `${point?.year}`);
	// Hover labels sit beside the cursor, on the side with room.
	const cx = $derived(layout && point ? layout.x(point.year) : 0);
	const side = $derived(layout && cx > (layout.left + layout.right) / 2 ? -1 : 1);

	// The same invisible scrubber as the mission page's AccumulationPair: the pointer picks a
	// year as it moves, arrow keys step it, and leaving the plot returns to the latest year.
	function scrub(event) {
		const rect = event.currentTarget.getBoundingClientRect();
		const t = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
		const year = layout.x.invert(layout.left + t * (layout.right - layout.left));
		hover = model.years.reduce((best, value, i) => Math.abs(value - year) < Math.abs(model.years[best] - year) ? i : best, 0);
	}
</script>

<figure>
	<div class="toolbar">
		{#if model}
			<p class="key"><span><i class="swatch pub"></i>Tracked publications</span> <span><i class="swatch cite"></i>Citations</span></p>
		{:else}
			<p class="meta">No recorded years</p>
		{/if}
		<label>View <select bind:value={mode}><option value="annual">Annual</option><option value="cumulative">Cumulative</option></select></label>
	</div>
	{#if model}
		<div class="stage" bind:clientWidth={width}>
			{#if layout}
				{@const [pub] = layout.panels}
				<svg {width} height={layout.height} role="img" aria-label={`Tracked publications (left scale) and citations received (right scale) by calendar year, ${model.years[0]} to ${model.years.at(-1)}.`}>
					<!-- Grid from the left scale only, so the two tick sets don't paint competing grids. -->
					{#each pub.ticks as value (value)}
						<line class="grid" x1={layout.left} x2={layout.right} y1={pub.y(value)} y2={pub.y(value)} />
					{/each}
					<line class="cursor" x1={cx} x2={cx} y1={pub.top} y2={pub.bottom} />
					<!-- Values sit beside their dots, the year above the cursor; the lines are the context. -->
					<text class="hover meta" x={cx + 8 * side} y={pub.top - 10} text-anchor={side > 0 ? 'start' : 'end'}>{when}</text>
					{#each layout.panels as panel (panel.key)}
						<text class="hover {panel.key}" x={cx + 8 * side} y={panel.y(point[panel.key]) + (panel.key === 'pub' ? -8 : 16)} text-anchor={side > 0 ? 'start' : 'end'}>{int(point[panel.key])}</text>
					{/each}
					{#each layout.panels as panel (panel.key)}
						{#each panel.ticks as value (value)}
							<text class="tick {panel.key}" x={panel.side === 'left' ? layout.left - 8 : layout.right + 8} y={panel.y(value)} dy="0.32em" text-anchor={panel.side === 'left' ? 'end' : 'start'}>{compact(value)}</text>
						{/each}
						{#if panel.solid}<path class="series {panel.key}" d={panel.solid} />{/if}
						{#if panel.partial}<path class="series partial {panel.key}" d={panel.partial} />{/if}
						<circle class="dot {panel.key}" cx={layout.x(point.year)} cy={panel.y(point[panel.key])} r="3" />
					{/each}
					{#each layout.xTicks as year (year)}
						<text class="tick" x={layout.x(year)} y={layout.height - 25} text-anchor="middle">{year}</text>
					{/each}
					<text class="tick" x={(layout.left + layout.right) / 2} y={layout.height - 5} text-anchor="middle">Calendar year</text>
				</svg>
				<input
					class="scrub"
					type="range"
					min="0"
					max={model.points.length - 1}
					step="1"
					value={hover ?? model.points.length - 1}
					aria-label="Calendar year"
					aria-valuetext={`${point.year}: ${int(point.pub)} tracked publications, ${int(point.cite)} citations`}
					style:left="{layout.left}px"
					style:top="{pub.top}px"
					style:width="{Math.max(0, layout.right - layout.left)}px"
					style:height="{Math.max(0, pub.bottom - pub.top)}px"
					oninput={(e) => (hover = Number(e.currentTarget.value))}
					onpointermove={scrub}
					onpointerleave={() => (hover = null)}
				/>
			{/if}
		</div>
		{#if partialYear != null}<p class="meta note">Dashed: {partialYear} is not yet a full year.</p>{/if}
		{#if incomplete}<p class="meta note">{int(coverage.observed)} of {int(coverage.expected)} reported citations have dated records; the headline totals include them all.</p>{/if}
	{:else}
		<p class="explanation">No publication or citation timeline is available.</p>
	{/if}
</figure>

<style>
	figure { min-width: 0; }
	.toolbar { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 8px 24px; margin-top: 12px; color: var(--dust); }
	.toolbar p, .toolbar label, .explanation { font-size: 14px; line-height: 1.5; }
	.toolbar label { display: flex; align-items: center; gap: 8px; }
	select { background: var(--panel); color: var(--white); border: 1px solid var(--soil); padding: 6px 8px; font: inherit; }
	.explanation { margin-top: 12px; color: var(--dust); }
	.key { display: flex; flex-wrap: wrap; gap: 4px 16px; }
	.key span { white-space: nowrap; }
	.swatch { display: inline-block; width: 14px; margin-right: 6px; vertical-align: middle; border-top: 2px solid var(--white); }
	.swatch.cite { border-color: var(--neptune); }
	.stage { position: relative; min-height: 300px; margin-top: 12px; }
	svg { display: block; overflow: visible; }
	text { font-family: var(--sans); }
	.tick { font-size: 12px; fill: var(--dust); }
	.tick.cite { fill: var(--neptune-mid); }
	.grid { stroke: var(--shadow); }
	.cursor { stroke: var(--soil); stroke-dasharray: 2 4; }
	.hover { fill: var(--white); font: 500 12px var(--sans); paint-order: stroke; stroke: var(--black); stroke-width: 3px; stroke-linejoin: round; }
	.hover.cite { fill: var(--neptune-mid); }
	.hover.meta { fill: var(--dust); font-weight: 400; }
	.series { fill: none; stroke-width: 2; }
	.series.pub { stroke: var(--white); }
	.series.cite { stroke: var(--neptune); }
	.partial { stroke-dasharray: 4 4; }
	.dot.pub { fill: var(--white); }
	.dot.cite { fill: var(--neptune); }
	.note { margin-top: 10px; color: var(--dust); }

	/* An invisible scrubber gives the readout a real keyboard control; the focus ring the
	   global stylesheet draws on it is the only part that ever shows. */
	.scrub { position: absolute; margin: 0; padding: 0; cursor: crosshair; touch-action: pan-y; -webkit-appearance: none; appearance: none; background: transparent; }
	.scrub::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 1px; height: 1px; opacity: 0; }
	.scrub::-moz-range-thumb { width: 1px; height: 1px; border: 0; opacity: 0; }
</style>
