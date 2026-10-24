<script>
	// Citations per $100M against cost, one square per mission (geometry in perdollar.js). The
	// dashed line is the trend across missions; the two solid ones are each side's combined rate,
	// read from the packaged perDollar groups, never recomputed here.
	import Squares from '$lib/scrolly/Squares.svelte';
	import { compact, int, money, moneyTick, plural, spell, upperFirst } from '$lib/format.js';
	import { minorDollarTicks } from './costaxis.js';
	import DollarMinorTicks from './DollarMinorTicks.svelte';
	import { perDollarChart } from './perdollar.js';

	/** groups: the scope's perDollar.groups ({ key: 'under'|'over', perHundredM }) */
	let { missions, slug, scope, referenceCost, groups = [] } = $props();
	let width = $state(0);
	const c = $derived(perDollarChart(missions, scope, width));
	const refX = $derived(c ? Math.min(c.right, Math.max(c.left, c.x(referenceCost))) : 0);
	const combined = (key) => groups.find((g) => g.key === key)?.perHundredM ?? null;
	const sides = $derived(
		c
			? [
					{ key: 'under', x1: c.left, x2: refX, v: combined('under'), label: 'small' },
					{ key: 'over', x1: refX, x2: c.right, v: combined('over'), label: 'larger' }
				].filter((s) => s.v > 0 && s.x2 - s.x1 > 24)
			: []
	);
	const tiles = $derived(missions.map((m) => ({ ...m, division: slug })));
	// the rate is the square's height; the label gives the two packaged figures it comes from
	const label = (m) => `${m.name}: ${money(m.cost)}, ${int(m[scope].citations)} ${plural(m[scope].citations, 'citation')}`;
	const items = $derived(
		new Map((c?.marks ?? []).map((p) => {
			const m = missions.find((q) => q.id === p.id);
			return [p.id, { ...p, variant: m.failed ? 'lost' : 'solid', label: label(m) }];
		}))
	);
	const summary = $derived(
		c
			? `Citations per ${money(100)} of cost for each mission, by cost, both on log scales. ` +
					sides.map((s) => `Combined, ${s.label} missions: ${int(s.v)}.`).join(' ') +
					(c.zeros ? ` ${upperFirst(spell(c.zeros))} ${plural(c.zeros, 'mission')} with no citations ${c.zeros === 1 ? 'sits' : 'sit'} under the plot.` : '')
			: ''
	);
</script>

<figure class="scatter">
	<p class="sr-only">{summary}</p>
	<div class="stage" bind:clientWidth={width} style:height="{c?.height ?? 360}px">
		{#if c}
			<DollarMinorTicks positions={minorDollarTicks(...c.x.domain()).map(c.x)} top={c.axisY - 16} />
			<svg {width} height={c.height} aria-hidden="true">
				<rect class="zone" x={c.left} y={c.top} width={Math.max(0, refX - c.left)} height={c.bottom - c.top} />
				{#each c.ticks as t (t.value)}
					{#if t.grid}<line class="grid" x1={c.x(t.value)} x2={c.x(t.value)} y1={c.top} y2={c.bottom} />{/if}
				{/each}
				{#each c.yTicks as v (v)}
					<line class="grid" x1={c.left} x2={c.right} y1={c.y(v)} y2={c.y(v)} />
					<text x={c.left - 8} y={c.y(v)} dy="0.32em" text-anchor="end">{compact(v)}</text>
				{/each}
				<line class="reference" x1={refX} x2={refX} y1={c.top} y2={c.bottom} />
				<text x={refX + 4} y={c.top + 12}>{money(referenceCost)}</text>
				{#each sides as s (s.key)}
					<line class="combined" x1={s.x1} x2={s.x2} y1={c.y(s.v)} y2={c.y(s.v)} />
				{/each}
				{#if c.fit}<line class="fit" x1={c.fit.x1} y1={c.fit.y1} x2={c.fit.x2} y2={c.fit.y2} />{/if}
				{#if c.zeros}<text x={c.left - 8} y={c.shelfY + 8} text-anchor="end">None</text>{/if}
				{#each c.ticks as t (t.value)}
					{#if t.label}<text x={c.x(t.value)} y={c.axisY} text-anchor="middle">{moneyTick(t.value)}</text>{/if}
				{/each}
			</svg>
			<Squares {tiles} {items} />
		{:else if width}
			<p class="meta none">No mission in this view has citations to place.</p>
		{/if}
	</div>
	<ul class="key">
		<li><span class="swatch square"></span>A mission. Point at one for its figures.</li>
		{#if sides.length}<li><span class="swatch combined"></span>Combined rate: {sides.map((s) => `${int(s.v)} ${s.label}`).join(', ')}</li>{/if}
		<li><span class="swatch fit"></span>Best fit across missions</li>
		<li>Both axes are log scales</li>
	</ul>
</figure>

<style>
	.stage {
		position: relative;
		margin-top: 12px;
	}

	svg {
		position: absolute;
		inset: 0;
	}

	text {
		fill: var(--dust);
		font: 12px var(--sans);
	}

	.zone {
		fill: var(--strip-empty);
	}

	.grid {
		stroke: var(--shadow);
	}

	.reference {
		stroke: var(--dust);
		stroke-dasharray: 4 4;
	}

	.combined {
		stroke: var(--white);
		stroke-width: 2;
	}

	.fit {
		stroke: var(--neptune-mid);
		stroke-width: 2;
		stroke-dasharray: 6 4;
	}

	.none {
		padding-top: 24px;
	}

	.key {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 20px;
		margin-top: 8px;
		color: var(--dust);
		font-size: 12px;
		line-height: 16px;
	}

	.key li {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.swatch {
		display: inline-block;
		width: 16px;
	}

	.swatch.square {
		width: 10px;
		height: 10px;
		background: var(--square);
		box-shadow: inset 0 0 0 1px var(--outline);
	}

	.swatch.combined {
		border-top: 2px solid var(--white);
	}

	.swatch.fit {
		border-top: 2px dashed var(--neptune-mid);
	}
</style>
