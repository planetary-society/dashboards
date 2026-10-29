<script>
	// Mission outcomes by cost tier (columns) and division (rows): one square per mission, in the
	// story's outcome marks, with each tier's shortfall rate beneath. Divisions stay in labelled
	// rows rather than colours. A plain CSS grid, so the server renders it whole; a container
	// query swaps in full division names and larger squares where there is room.
	import { pct } from '$lib/format.js';
	import { failureGrid, PER_LINE } from './charts-a.js';
	import { tierLabel } from './tiers.js';

	/** tiers: AnalysisFacts.tiers; failures: AnalysisFacts.failures; divisions: [{ slug, name, nav }] in Site.divisions order. */
	let { tiers, failures, divisions } = $props();
	const grid = $derived(failureGrid(failures, divisions));
</script>

<div class="failure-grid">
	<div class="grid" style:--cols={tiers.length} style:--per={PER_LINE} aria-hidden="true">
		<span class="corner"></span>
		{#each tiers as t, i (i)}<span class="head">{tierLabel(t, { short: true })}</span>{/each}
		{#each grid.rows as row (row.slug)}
			<span class="name"><span class="full">{row.name}</span><span class="nav">{row.nav}</span></span>
			{#each row.cells as cell, i (i)}
				<span class="cell">{#each cell.marks as mark, j (j)}<i class="sq mark-{mark}"></i>{/each}</span>
			{/each}
		{/each}
		<span class="corner"></span>
		{#each grid.totals as total, i (i)}
			<span class="total">
				<b class:zero={!total.rate}>{pct(total.rate)}</b>
				<span>{total.shortfall} of {total.missions}</span>
			</span>
		{/each}
	</div>
	<p class="key" aria-hidden="true">
		<span><i class="sq mark-solid"></i>Succeeded</span>
		<span><i class="sq mark-partial"></i>Partial failure or partial success</span>
		<span><i class="sq mark-lost"></i>Failed</span>
	</p>
	<!-- the clip goes on a wrapper: a table grows to its content whatever width .sr-only gives it, and widened the page -->
	<div class="sr-only"><table>
		<caption>Mission outcomes by cost tier and division: succeeded, partial failure or partial success, failed</caption>
		<thead>
			<tr>
				<th scope="col">Cost tier</th>
				{#each grid.rows as row (row.slug)}<th scope="col">{row.name}</th>{/each}
				<th scope="col">All divisions</th>
				<th scope="col">Failed or fell short</th>
			</tr>
		</thead>
		<tbody>
			{#each tiers as t, i (i)}
				{@const total = grid.totals[i]}
				<tr>
					<th scope="row">{tierLabel(t)}</th>
					{#each grid.rows as row (row.slug)}
						{@const c = row.cells[i]}
						<td>{c.ok} succeeded, {c.partial} partial, {c.failed} failed</td>
					{/each}
					<td>{total.missions} missions: {total.ok} succeeded, {total.partial} partial, {total.failed} failed</td>
					<td>{pct(total.rate)} ({total.shortfall} of {total.missions})</td>
				</tr>
			{/each}
		</tbody>
	</table></div>
</div>

<style>
	.failure-grid { container-type: inline-size; --s: 6px; --g: 2px; }
	.grid {
		display: grid;
		grid-template-columns: auto repeat(var(--cols), minmax(0, 1fr));
		gap: 10px 4px;
		align-items: start;
	}
	.head { font-size: 11px; line-height: 14px; color: var(--dust); text-align: center; align-self: end; }
	.name { font-size: 11px; line-height: 14px; color: var(--white); margin-top: -4px; }
	.full { display: none; }
	.cell {
		display: grid;
		grid-template-columns: repeat(var(--per), var(--s));
		grid-auto-rows: var(--s);
		gap: var(--g);
		justify-content: center;
	}
	.sq { display: block; width: var(--s); height: var(--s); }
	/* with no thumbnail under it the story's resting grey reads as an empty box on black, so a
	   success is a lighter solid here; the failures' red marks still lead */
	.sq.mark-solid { background: var(--outline-filled); }
	.total { display: flex; flex-direction: column; align-items: center; padding-top: 4px; border-top: 1px solid var(--shadow); }
	.total b { font-size: 14px; line-height: 20px; font-weight: 500; color: var(--flame); }
	.total b.zero { color: var(--soil); }
	.total span { font-size: 11px; line-height: 14px; color: var(--dust); white-space: nowrap; }
	.key { display: flex; flex-wrap: wrap; gap: 4px 16px; margin-top: 14px; font-size: 12px; line-height: 16px; color: var(--dust); }
	.key span { display: inline-flex; align-items: center; gap: 6px; }
	.key .sq { --s: 9px; }

	/* narrower than a 343px phone, six columns and a label gutter don't fit: each division's
	   name moves above its row and the columns take the whole width */
	@container (max-width: 339px) {
		.grid { grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); row-gap: 4px; }
		.corner { display: none; }
		.name { grid-column: 1 / -1; margin-top: 6px; }
	}

	@container (min-width: 440px) {
		/* the container can't query itself, so the larger squares are set on the grid inside it */
		.grid { --s: 8px; gap: 12px 8px; }
		.name { font-size: 12px; line-height: 15px; max-width: 8.5em; margin-top: -3px; }
		.full { display: inline; }
		.nav { display: none; }
		.head { font-size: 12px; line-height: 15px; }
	}

	@container (min-width: 600px) {
		.grid { --s: 10px; }
		.name { max-width: 11em; }
	}
</style>
