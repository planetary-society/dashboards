<script>
	// Every compared division on the one cost axis, a band each: its missions on the shelf, and
	// above them the running share of its top-10% papers as missions are added cheapest first.
	// `spending` swaps that line for the running share of all its citations and adds the running
	// share of its spending, so citations and dollars can be read against each other at the
	// threshold. Each band is read on its own: fields cite at different rates, so only shares
	// within a division are drawn.
	import { money, moneyTick } from '$lib/format.js';
	import { minorDollarTicks, stepAfterPath } from '$lib/charts/costaxis.js';
	import DollarMinorTicks from '$lib/charts/DollarMinorTicks.svelte';
	import { costCurve } from './layouts.js';

	/**
	 * layout: costLayout() over the compared divisions. scope: the story scope. referenceCost: the
	 * threshold. notes: per division slug, the lines the story wrote for that band.
	 */
	let { layout, scope, referenceCost, notes, spending = false, visible = false, compact = false, width, height } = $props();

	const [x0, x1] = $derived(layout.x.range());
	const refX = $derived(layout.x(referenceCost));
	const rows = $derived(
		layout.rows.map((row) => {
			const y = (v) => row.shelfY - v * (row.shelfY - row.curveTop);
			// costCurve's topShare is the running share of whatever it is given: top papers, or citations
			const path = (share, key) => stepAfterPath(costCurve(row.members, share), { x: layout.x, y, x0, x1, value: (p) => p[key], round: (n) => Math.round(n * 10) / 10 });
			const top = (t) => t.share[scope]['10'];
			return { ...row, top: path(top, 'topShare'), cited: path((t) => t.citations ?? 0, 'topShare'), cost: path(top, 'costShare') };
		})
	);
</script>

<div class="lanes" class:visible class:spending class:compact aria-hidden="true">
	{#each rows as row (row.slug)}
		<span class="band" class:alt={row.band} style:top="{row.y}px" style:height="{row.h}px"></span>
	{/each}
	<span class="band closing" style:top="{layout.bottomY}px"></span>
	<DollarMinorTicks positions={minorDollarTicks(...layout.x.domain()).map(layout.x)} />
	{#each layout.ticks as t (t)}
		<!-- a decade label that would touch the threshold's own label gives way to it -->
		{#if Math.abs(layout.x(t) - refX) > (compact ? 34 : 44)}<span class="tick" style:left="{layout.x(t)}px">{moneyTick(t)}</span>{/if}
	{/each}

	<svg {width} {height}>
		<rect class="zone" x={x0} y={layout.top} width={Math.max(0, refX - x0)} height={layout.bottomY - layout.top} />
		{#each layout.ticks as t (t)}
			<line class="grid" x1={layout.x(t)} x2={layout.x(t)} y1={layout.top} y2={layout.bottomY} />
		{/each}
		<line class="reference" x1={refX} x2={refX} y1={layout.top} y2={layout.bottomY} />
		{#each rows as row (row.slug)}
			<line class="ceiling" x1={x0} x2={x1} y1={row.curveTop} y2={row.curveTop} />
			<line class="shelf" x1={x0} x2={x1} y1={row.shelfY} y2={row.shelfY} />
			<path class="cost" d={row.cost} />
			<path class="top" d={row.top} />
			<path class="cited" d={row.cited} />
		{/each}
	</svg>
	<span class="tick strong" style:left="{refX}px">{money(referenceCost)}</span>

	{#each rows as row, i (row.slug)}
		{@const note = notes[row.slug]}
		<span class="name" style:top="{row.y}px" style:width={compact ? null : `${layout.left - 12}px`}>{row.label}</span>
		{#if note && compact}
			<!-- a phone's bands are too short to hold the figures over the squares: one line beside the name -->
			<span class="note line" style:top="{row.y + 2}px" style:right="calc(100% - {x1}px)">{#if spending}{note.cost},{' '}<span class="paper">{note.cited}</span>{:else}<span class="paper">{note.top}</span>{/if}</span>
		{:else if note}
			<!-- in the shaded side, against the line: the figures describe the missions left of it -->
			<span class="note" style:top="{row.curveTop + 2}px" style:right="calc(100% - {refX - 8}px)">
				<span>{note.missions}</span>
				<span class="paper">{spending ? note.cited : note.top}</span>
				<span class="spend">{note.cost}</span>
			</span>
		{/if}
		{#if i === 0}
			<span class="scale" style:top="{row.curveTop}px" style:left="{x1 + 4}px">100%</span>
		{/if}
	{/each}
</div>

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

	.band {
		left: 0;
		right: 0;
		border-top: 1px solid var(--shadow);
	}

	.band.alt {
		background: var(--band);
	}

	.tick {
		top: 0;
		transform: translateX(-50%);
		font-size: 12px;
		line-height: 16px;
		color: var(--dust);
		white-space: nowrap;
	}

	.tick.strong {
		color: var(--white);
		font-weight: 500;
		background: var(--black);
		padding-inline: 4px;
	}

	.zone {
		fill: var(--strip-empty);
		opacity: 0.8;
	}

	.grid {
		stroke: var(--shadow);
		opacity: 0.6;
	}

	.reference {
		stroke: var(--white);
		stroke-dasharray: 4 4;
	}

	.ceiling {
		stroke: var(--shadow);
		stroke-dasharray: 2 3;
	}

	.shelf {
		stroke: var(--soil);
	}

	path {
		fill: none;
	}

	path.top,
	path.cited {
		stroke: var(--neptune);
		stroke-width: 2;
		transition: opacity 400ms linear;
	}

	/* the per-dollar step: the citations line takes the top papers line's place */
	path.cited,
	.spending path.top {
		opacity: 0;
	}

	.spending path.cited {
		opacity: 1;
	}

	/* the spending line arrives on its own step, under the papers line */
	path.cost {
		stroke: var(--dust);
		stroke-width: 1;
		stroke-dasharray: 3 3;
		opacity: 0;
		transition: opacity 400ms linear;
	}

	.spending path.cost {
		opacity: 1;
	}

	.name {
		left: 0;
		padding-top: 8px;
		font-weight: 500;
		font-size: 14px;
		line-height: 18px;
	}

	.note {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		font-size: 12px;
		line-height: 15px;
		color: var(--dust);
		white-space: nowrap;
	}

	.note .paper {
		color: var(--white);
	}

	.note .spend {
		opacity: 0;
		transition: opacity 400ms linear;
	}

	.spending .note .spend {
		opacity: 1;
	}

	.scale {
		transform: translateY(-50%);
		font-size: 11px;
		color: var(--soil);
	}

	.compact .name {
		padding-top: 2px;
		font-size: 12px;
		line-height: 16px;
	}

	/* on its own ground, so the dashed threshold line never runs through the words */
	.note.line {
		display: block;
		padding-left: 4px;
		background: var(--black);
		font-size: 11px;
		line-height: 16px;
	}

	.compact .scale {
		display: none;
	}
</style>
