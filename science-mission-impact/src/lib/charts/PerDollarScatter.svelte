<script>
	// Citations per $100M against cost for one division, one square per mission: the overview's
	// single-division per-dollar chart (perDollarLayout + DollarChart) in the page's scope, with the
	// scope's packaged running average and no threshold line. Eligible empty failures stay in the plot
	// as measured zeros, as they do in the packaged average.
	import Squares from '$lib/scrolly/Squares.svelte';
	import DollarChart from '$lib/scrolly/DollarChart.svelte';
	import { perDollarLayout } from '$lib/charts/perdollar.js';
	import { failureItems } from '$lib/scrolly/items.js';
	import { int, money, plural } from '$lib/format.js';
	import { measured } from '$lib/mission/papers.js';
	import { FOOTNOTES } from '$lib/copy/footnotes.js';

	/** average: the scope's perDollar.runningMean, or null */
	let { missions, slug, scope, average = null } = $props();
	let W = $state(0);
	let H = $state(0);
	// the layout reads a story tile's flat citations and top10; here they come from the page's scope,
	// left null where the scope isn't measured, as the packaged average leaves the mission out
	const tiles = $derived(missions.map((m) => ({ ...m, division: slug, citations: measured(m[scope]) ? m[scope].citations : null, top10: measured(m[scope]) ? m[scope].top10 : null })));
	const layout = $derived(W > 0 && H > 0 ? perDollarLayout(tiles, W, H, { divisions: [{ slug }], averages: new Map([[slug, average]]) }) : null);
	const items = $derived.by(() => {
		const out = layout ? failureItems(tiles, layout) : new Map();
		for (const t of tiles) {
			if (out.has(t.id)) out.get(t.id).label = `${t.name}: ${money(t.cost)}, ${int(t.citations)} ${plural(t.citations, 'citation')}`;
		}
		return out;
	});
</script>

<figure>
	<p class="sr-only">{FOOTNOTES.perDollarChart.text()}</p>
	<div class="stage" bind:clientWidth={W} bind:clientHeight={H}>
		{#if layout}
			<DollarChart {layout} visible confidence compact={W < 600} width={W} height={H} />
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
