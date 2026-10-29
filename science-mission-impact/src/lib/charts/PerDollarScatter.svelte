<script>
	// Citations per $100M against cost for one division, one square per mission: the overview's
	// single-division per-dollar chart (perDollarLayout + DollarChart) in the page's scope, with the
	// scope's packaged best fit and no threshold line.
	import Squares from '$lib/scrolly/Squares.svelte';
	import DollarChart from '$lib/scrolly/DollarChart.svelte';
	import { perDollarLayout } from '$lib/charts/perdollar.js';
	import { failureItems } from '$lib/scrolly/items.js';
	import { int, money, plural } from '$lib/format.js';
	import { measured } from '$lib/mission/papers.js';

	/** fit: the scope's perDollar.fit, or null */
	let { missions, slug, scope, fit = null } = $props();
	let W = $state(0);
	let H = $state(0);
	// the layout reads a story tile's flat citations and top10; here they come from the page's scope,
	// left null where the scope isn't measured, as the packaged fit leaves the mission out
	const tiles = $derived(missions.map((m) => ({ ...m, division: slug, citations: measured(m[scope]) ? m[scope].citations : null, top10: measured(m[scope]) ? m[scope].top10 : null })));
	const layout = $derived(W > 0 && H > 0 ? perDollarLayout(tiles, W, H, { divisions: [{ slug }], fits: new Map([[slug, fit]]) }) : null);
	const items = $derived.by(() => {
		const out = layout ? failureItems(tiles, layout) : new Map();
		for (const t of tiles) {
			if (out.has(t.id)) out.get(t.id).label = `${t.name}: ${money(t.cost)}, ${int(t.citations)} ${plural(t.citations, 'citation')}`;
		}
		return out;
	});
</script>

<figure>
	<p class="sr-only">Citations per {money(100)} of cost for each mission, by cost, both on log scales, with the best fit through the missions with citations.</p>
	<div class="stage" bind:clientWidth={W} bind:clientHeight={H}>
		{#if layout}
			<DollarChart {layout} visible compact={W < 600} width={W} height={H} />
			<Squares {tiles} {items} />
		{/if}
	</div>
</figure>

<style>
	/* the by-year chart's height beside it, so the pair lines up */
	.stage {
		position: relative;
		height: 300px;
		margin-top: 12px;
	}
</style>
