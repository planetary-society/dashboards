<script>
	import Squares from '$lib/scrolly/Squares.svelte';
	import MissionReadout from '$lib/ui/MissionReadout.svelte';
	import { money, moneyTick, pct, plural, spell, upperFirst } from '$lib/format.js';
	import { view } from '$lib/state/view.svelte.js';
	import { curveFacts, curveChart } from './costcurve.js';
	import { minorDollarTicks } from './costaxis.js';
	import DollarMinorTicks from './DollarMinorTicks.svelte';

	let { costCurves, missions, slug, referenceCost, selectedId = '', onselect = null } = $props();
	const GRID = [0, 0.25, 0.5, 0.75, 1];
	const WIDE = { padTop: 10, plotH: 300, mark: 8, gap: 2, gutter: 44, rightPad: 26, axisH: 24 };
	const PHONE = { padTop: 8, plotH: 220, mark: 5, gap: 2, gutter: 36, rightPad: 22, axisH: 24 };
	let width = $state(0);
	let showBand = $state(false);
	const facts = $derived(curveFacts(costCurves?.[view.scope]?.[view.top] ?? null, missions));
	const c = $derived(curveChart(facts, width, width < 560 ? PHONE : WIDE));
	const referenceX = $derived(c && referenceCost > 0 ? c.x(referenceCost) : null);
	const band = $derived(facts?.band.p25 != null && facts?.band.p75 != null ? facts.band : null);
	const takeaway = $derived(
		facts?.atP25
			? `Missions up to ${money(facts.band.p25)} account for the first quarter of the division’s top ${view.top}% papers and ${pct(facts.atP25.costShare)} of its spending.`
			: `No mission in this division holds a top ${view.top}% paper in this view.`
	);
	const unplaced = $derived(facts?.unplaced ? `${upperFirst(spell(facts.unplaced))} ${plural(facts.unplaced, 'mission')} ${facts.unplaced === 1 ? 'has' : 'have'} no cost on record and ${facts.unplaced === 1 ? 'is' : 'are'} not shown.` : '');
	const summary = $derived(facts ? `Running share of top ${view.top}% papers and spending, adding missions in cost order. ${band ? `The middle half of the top papers comes from missions costing ${money(band.p25)} to ${money(band.p75)}. ` : ''}${takeaway} ${unplaced}` : '');
	const tiles = $derived(missions.map((m) => ({ ...m, division: slug })));
	const label = (p) => `${p.name}: ${money(p.cost)}, ${pct(p.share)} of top-paper credit.\nMissions up to this cost: ${pct(p.topShare)} of credit, ${pct(p.costShare)} of spending.`;
	const items = $derived(new Map((c?.marks ?? []).map((p) => [p.id, {
		...p, variant: missions.find((m) => m.id === p.id)?.failed ? 'failure' : p.reached ? 'reached' : 'none', label: label(p)
	}])));
	const selected = $derived(facts?.points.find((p) => p.id === selectedId));
</script>

{#if !facts}
	<p class="fact none">Not available for this view.</p>
{:else}
	<figure class="curve">
		<p class="sr-only">{summary}</p>
		<p class="takeaway">{takeaway}</p>
		<div class="legend meta">
			<span><i class="top"></i>Top-paper credit</span>
			<span><i class="cost"></i>Spending</span>
			{#if referenceCost}<span><i class="reference"></i>{money(referenceCost)} reference</span>{/if}
			{#if band}<label><input type="checkbox" bind:checked={showBand} /> Middle half of credit</label>{/if}
		</div>
		<p class="meta axis-label">Cumulative share · Moving right adds costlier missions</p>
		<div class="stage" bind:clientWidth={width} style:height="{c?.height ?? 360}px">
			{#if c}
				<DollarMinorTicks positions={minorDollarTicks(...c.x.domain()).map(c.x)} top={c.y(0)} />
				<svg {width} height={c.height} aria-hidden="true">
					{#each c.ticks as t (t.value)}
						<line class="vgrid" x1={c.x(t.value)} x2={c.x(t.value)} y1={c.top} y2={c.y(0)} />
					{/each}
					{#each GRID as g (g)}
						<line class="grid" x1={c.left} x2={c.right} y1={c.y(g)} y2={c.y(g)} />
						<text x={c.left - 8} y={c.y(g)} dy="0.32em" text-anchor="end">{pct(g)}</text>
					{/each}
					{#if showBand && c.band}<rect class="band" x={c.band.x} y={c.top} width={c.band.w} height={c.plotH} />{/if}
					<path class="cost" d={c.costPath} />
					{#if c.topPath}<path class="top" d={c.topPath} />{/if}
					{#if referenceX != null && referenceX >= c.left && referenceX <= c.right}
						<line class="reference" x1={referenceX} x2={referenceX} y1={c.top} y2={c.y(0)} />
					{/if}
					{#each c.ticks as t (t.value)}
						{#if !t.minor}<text x={c.x(t.value)} y={c.axisY} text-anchor="middle">{moneyTick(t.value)}</text>{/if}
					{/each}
				</svg>
				<Squares {tiles} {items} thumbnailBorders {selectedId} {onselect} />
			{/if}
		</div>
		<p class="meta axis-label">Adjusted mission cost · log scale</p>
		{#if showBand && band}<p class="meta">Middle half of credit: {money(band.p25)}–{money(band.p75)}.</p>{/if}
		<MissionReadout id={selectedId} {slug} label={selected ? label(selected) : 'Selected mission: not included in this cost comparison.'} />
		{#if unplaced}<p class="meta">{unplaced}</p>{/if}
	</figure>
{/if}

<style>
	.curve { margin-top: 12px; }
	.takeaway { color: var(--dust); max-width: 70ch; font-size: 14px; line-height: 1.6; }
	.legend { display: flex; flex-wrap: wrap; gap: 12px 24px; margin: 20px 0 12px; color: var(--dust); }
	.legend span, .legend label { display: inline-flex; align-items: center; gap: 8px; }
	i { width: 18px; height: 0; border-top: 2px solid; }
	i.top { border-color: var(--neptune); }
	i.cost { border-color: var(--dust); }
	i.reference { border-color: var(--dust); border-top-style: dashed; }
	input { accent-color: var(--neptune); }
	.stage { position: relative; }
	.axis-label { margin: 12px 0; }
	text { fill: var(--dust); font: 12px var(--sans); }
	.grid, .vgrid { stroke: var(--shadow); }
	.vgrid { opacity: 0.6; }
	path { fill: none; stroke-linejoin: miter; }
	path.top { stroke: var(--neptune); stroke-width: 2; }
	path.cost { stroke: var(--dust); stroke-width: 1; }
	line.reference { stroke: var(--dust); stroke-width: 1; stroke-dasharray: 4 4; }
	.band { fill: var(--neptune); opacity: 0.18; }
	.none { margin-top: 16px; }
</style>
