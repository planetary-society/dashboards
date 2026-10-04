<script>
	import Squares from '$lib/scrolly/Squares.svelte';
	import MissionReadout from '$lib/ui/MissionReadout.svelte';
	import { compact, money, moneyTick, pct, plural, spell, upperFirst, weight } from '$lib/format.js';
	import { view } from '$lib/state/view.svelte.js';
	import { curveFacts, curveChart, runningAt } from './costcurve.js';
	import { minorDollarTicks } from './costaxis.js';
	import DollarMinorTicks from './DollarMinorTicks.svelte';

	let { costCurves, missions, slug, referenceCost, top = 10, selectedId = '', onselect = null } = $props();
	const WIDE = { padTop: 10, plotH: 300, mark: 8, gap: 2, gutter: 44, rightPad: 26, axisH: 24 };
	const PHONE = { padTop: 8, plotH: 220, mark: 6, gap: 2, gutter: 36, rightPad: 22, axisH: 24 };
	let width = $state(0);
	let hover = $state(null); // index of the mission under the pointer; the reference point otherwise
	const facts = $derived(curveFacts(costCurves?.[view.scope]?.[top] ?? null, missions, view.scope, top));
	const c = $derived(curveChart(facts, width, width < 560 ? PHONE : WIDE));
	const referenceX = $derived(c && referenceCost > 0 ? c.x(referenceCost) : null);
	const reference = $derived(facts ? runningAt(facts.points, referenceCost) : null);
	const point = $derived(hover != null ? facts?.points[hover] : null);
	const unplaced = $derived(facts?.unplaced ? `${upperFirst(spell(facts.unplaced))} ${plural(facts.unplaced, 'mission')} ${facts.unplaced === 1 ? 'has' : 'have'} no cost on record and ${facts.unplaced === 1 ? 'is' : 'are'} not shown.` : '');
	const summary = $derived(facts ? `Running total of the division’s top-${top}% papers, adding missions from cheapest to costliest: ${weight(facts.total)} papers across ${facts.points.length} missions from ${money(facts.points[0].cost)} to ${money(facts.points.at(-1).cost)}.` : '');
	const tiles = $derived(missions.map((m) => ({ ...m, division: slug })));
	const label = (p) => `${p.name}: ${money(p.cost)} · ${weight(p.credit)} top-${top}% papers · ${weight(p.total)} for all missions up to this cost`;
	const items = $derived(new Map((c?.marks ?? []).map((p) => [p.id, {
		...p, variant: missions.find((m) => m.id === p.id)?.failed ? 'failure' : p.reached ? 'reached' : 'none', label: label(p)
	}])));
	const selected = $derived(facts?.points.find((p) => p.id === selectedId));
	// Hover labels sit beside the cursor, on the side with room; the line itself is their context.
	const side = $derived(point && c && c.x(point.cost) > (c.left + c.right) / 2 ? -1 : 1);

	// The timeline's invisible scrubber: the pointer picks the nearest mission on the log axis,
	// arrow keys step through them in cost order, and leaving the plot returns to the reference.
	function scrub(event) {
		const rect = event.currentTarget.getBoundingClientRect();
		const t = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
		const at = Math.log(c.x.invert(c.left + t * (c.right - c.left)));
		const far = (p) => Math.abs(Math.log(p.cost) - at);
		hover = facts.points.reduce((best, p, i) => (far(p) < far(facts.points[best]) ? i : best), 0);
	}
</script>

{#if !facts}
	<p class="fact none">Not available for this view.</p>
{:else}
	<figure class="curve">
		<p class="sr-only">{summary}</p>
		<div class="stage" bind:clientWidth={width} style:height="{c?.height ?? 360}px">
			{#if c}
				<DollarMinorTicks positions={minorDollarTicks(...c.x.domain()).map(c.x)} top={c.y(0)} />
				<svg {width} height={c.height} aria-hidden="true">
					{#each c.ticks as t (t.value)}
						{#if t.grid}<line class="vgrid" x1={c.x(t.value)} x2={c.x(t.value)} y1={c.top} y2={c.y(0)} />{/if}
					{/each}
					{#each c.yTicks as v (v)}
						<line class="grid" x1={c.left} x2={c.right} y1={c.y(v)} y2={c.y(v)} />
						<text x={c.left - 8} y={c.y(v)} dy="0.32em" text-anchor="end">{compact(v)}</text>
					{/each}
					{#if c.path}<path d={c.path} />{/if}
					{#if referenceX != null && referenceX >= c.left && referenceX <= c.right}
						<line class="reference" x1={referenceX} x2={referenceX} y1={c.top} y2={c.y(0)} />
						<text x={referenceX + 4} y={c.top + 12}>{money(referenceCost)}</text>
					{/if}
					{#if point}
						{@const cx = c.x(point.cost)}
						<line class="cursor" x1={cx} x2={cx} y1={c.top} y2={c.y(0)} />
						<circle cx={cx} cy={c.y(point.total)} r="3" />
						<text class="hover" x={cx + 8 * side} y={c.y(point.total) - 8} text-anchor={side > 0 ? 'start' : 'end'}>{weight(point.total)} ({pct(point.total / facts.total)})</text>
						<text class="hover meta" x={cx + 8 * side} y={c.top + 12} text-anchor={side > 0 ? 'start' : 'end'}>{money(point.cost)} · {point.name}</text>
					{/if}
					{#each c.ticks as t (t.value)}
						{#if t.label}<text x={c.x(t.value)} y={c.axisY} text-anchor="middle">{moneyTick(t.value)}</text>{/if}
					{/each}
					<text x={c.right} y={c.y(0) - 6} text-anchor="end">Mission cost · log scale</text>
				</svg>
				<Squares {tiles} {items} thumbnailBorders {selectedId} {onselect} />
				<!-- after the squares, whose layer spans the whole stage, so the plot area answers the pointer -->
				<input
					class="scrub"
					type="range"
					min="0"
					max={facts.points.length - 1}
					step="1"
					value={hover ?? (reference ? facts.points.indexOf(reference) : 0)}
					aria-label="Mission, in cost order"
					aria-valuetext={label(point ?? reference ?? facts.points[0])}
					style:left="{c.left}px"
					style:top="{c.top}px"
					style:width="{Math.max(0, c.right - c.left)}px"
					style:height="{c.plotH}px"
					oninput={(e) => (hover = Number(e.currentTarget.value))}
					onpointermove={scrub}
					onpointerleave={() => (hover = null)}
				/>
			{/if}
		</div>
		<MissionReadout id={selectedId} {slug} label={selected ? label(selected) : 'Selected mission: not included in this cost comparison.'} />
		{#if unplaced}<p class="meta">{unplaced}</p>{/if}
	</figure>
{/if}

<style>
	.curve { margin-top: 20px; }
	.stage { position: relative; }
	text { fill: var(--dust); font: 12px var(--sans); }
	.grid, .vgrid { stroke: var(--shadow); }
	.vgrid { opacity: 0.6; }
	path { fill: none; stroke: var(--neptune); stroke-width: 2; stroke-linejoin: miter; }
	line.reference { stroke: var(--dust); stroke-width: 1; stroke-dasharray: 4 4; }
	.cursor { stroke: var(--soil); stroke-width: 1; }
	.hover { fill: var(--white); font-weight: 500; paint-order: stroke; stroke: var(--black); stroke-width: 3px; stroke-linejoin: round; }
	.hover.meta { fill: var(--dust); font-weight: 400; }
	circle { fill: var(--neptune); }
	.none { margin-top: 16px; }

	/* An invisible scrubber gives the readout a real keyboard control; the focus ring the
	   global stylesheet draws on it is the only part that ever shows. */
	.scrub { position: absolute; margin: 0; padding: 0; cursor: crosshair; touch-action: pan-y; -webkit-appearance: none; appearance: none; background: transparent; }
	.scrub::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 1px; height: 1px; opacity: 0; }
	.scrub::-moz-range-thumb { width: 1px; height: 1px; border: 0; opacity: 0; }
</style>
