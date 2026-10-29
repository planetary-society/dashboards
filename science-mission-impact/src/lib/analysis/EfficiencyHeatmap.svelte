<script>
	// Each cost tier's share of its division's N50 over its share of the division's spending, as a
	// heatmap. A real table, so the numbers read in order without a separate hidden copy; colour and
	// text contrast come from heatColor/textOn, and a container query shrinks it for a phone
	// (short division names, smaller text) so it needs no measured width.
	import { pct } from '$lib/format.js';
	import { tierLabel } from './tiers.js';
	import { heatColor, textOn } from './charts-b.js';

	/** tiers: AnalysisFacts.tiers. efficiency: AnalysisFacts.efficiency. divisions: [{ slug, name, nav }] for the short row labels. */
	let { tiers, efficiency, divisions } = $props();
	const nav = $derived(new Map(divisions.map((d) => [d.slug, d.nav])));
	const ratio = (r) => `${r.toFixed(1)}×`;
	const detail = (c, best) =>
		`${c.missions} ${c.missions === 1 ? 'mission' : 'missions'}, ${pct(c.n50Share)} of the division's N50 for ${pct(c.costShare)} of its cost${best ? "; the division's highest" : ''}`;
</script>

<div class="heatmap">
	<table>
		<thead>
			<tr>
				<td class="corner"></td>
				{#each tiers as t, i (i)}<th scope="col">{tierLabel(t, { short: true })}</th>{/each}
			</tr>
		</thead>
		<tbody>
			{#each efficiency.divisions as d (d.division)}
				<tr>
					<th scope="row"><span class="long">{d.name}</span><span class="short">{nav.get(d.division) ?? d.name}</span></th>
					{#each d.cells as c, i (i)}
						{#if c}
							{@const fill = heatColor(c.ratio)}
							{@const best = d.best?.tier === i}
							<td class:best style:background={fill} style:color={textOn(fill)} title="{d.name}, {tierLabel(tiers[i])}: {ratio(c.ratio)}, {detail(c, best)}">
								{ratio(c.ratio)}<span class="sr-only">: {detail(c, best)}</span>
							</td>
						{:else}
							<td class="empty" title="{d.name}, {tierLabel(tiers[i])}: no missions"><span aria-hidden="true">—</span><span class="sr-only">no missions</span></td>
						{/if}
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.heatmap {
		container-type: inline-size;
		min-width: 0;
	}

	table {
		width: 100%;
		table-layout: fixed;
		border-collapse: separate;
		border-spacing: 3px;
		font-family: var(--sans);
	}

	.corner {
		width: 8.5em;
	}

	thead th {
		padding: 0 1px 6px;
		vertical-align: bottom;
		font-size: 12px;
		font-weight: 500;
		line-height: 1.25;
		color: var(--dust);
		text-align: center;
	}

	tbody th {
		padding-right: 8px;
		font-size: 13px;
		font-weight: 500;
		line-height: 1.25;
		color: var(--white);
		text-align: right;
	}

	td {
		height: 50px;
		padding: 0;
		font-size: 15px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		text-align: center;
	}

	/* inset, so the outline never covers a neighbour or changes the cell's size */
	td.best {
		box-shadow: inset 0 0 0 2px var(--white);
	}

	.empty {
		background: repeating-linear-gradient(135deg, #1c1c1c 0 4px, #2b2b2b 4px 8px);
		color: var(--soil);
	}

	.short {
		display: none;
	}

	@container (max-width: 440px) {
		.corner {
			width: 6.6em;
		}

		thead th {
			font-size: 10px;
		}

		tbody th {
			padding-right: 6px;
			font-size: 11px;
		}

		td {
			height: 40px;
			font-size: 12px;
		}

		.long {
			display: none;
		}

		.short {
			display: inline;
		}
	}

	/* the narrowest phones: ">$1.55B" still has to fit its column */
	@container (max-width: 330px) {
		table {
			border-spacing: 2px;
		}

		.corner {
			width: 6.2em;
		}

		thead th {
			font-size: 9px;
			letter-spacing: -0.02em;
		}

		td {
			font-size: 11px;
		}
	}
</style>
