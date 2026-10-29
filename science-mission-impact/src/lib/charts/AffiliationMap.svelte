<script>
	// Where the authors of every tracked paper worked, on a US or a world map: each square glows
	// brighter the more papers have an author there. The page carries the summary; the squares come
	// from a data file fetched after load, and the land is a cached image (scripts/basemaps.mjs). The
	// map sits low on the page, so its data, its land and d3-geo all wait until the reader nears it.
	import Choice from '$lib/ui/Choice.svelte';
	import { int, plural } from '$lib/format.js';
	import { basemapSrc } from '$lib/paths.js';
	import { FRAMES } from './mapframes.js';
	import { decadeTicks } from './costaxis.js';
	import { scaleSequentialLog } from 'd3-scale';
	import { interpolateLab, piecewise } from 'd3-interpolate';

	/** maxHeight: the most the map itself may stand, in px, so it can match a chart beside it; its width follows. */
	let { summary, url, maxHeight = null } = $props();
	const uid = $props.id();
	let chosen = $state(null);
	// raw: the fetched grid and the pointed-at cell are replaced, never mutated, so neither needs a deep proxy
	let grid = $state.raw(null);
	let failed = $state(false);
	let hover = $state.raw(null);
	// the projection module, imported with the data
	let geo = $state.raw(null);
	let figure;
	let near = $state(false);

	// Neptune from dim to white: the most papers burn brightest on the black land.
	const HEAT = ['#0c3f5f', '#037cc2', '#80bde0', '#ffffff'];
	const OPTIONS = Object.entries(FRAMES).map(([value, { label, short }]) => ({ value, label, short }));

	$effect(() => {
		if (typeof IntersectionObserver === 'undefined') return void (near = true);
		const watch = new IntersectionObserver(([entry]) => entry.isIntersecting && ((near = true), watch.disconnect()), { rootMargin: '400px 0px' });
		watch.observe(figure);
		return () => watch.disconnect();
	});

	$effect(() => {
		if (!near) return;
		let live = true;
		grid = null;
		failed = false;
		hover = null;
		Promise.all([
			fetch(url).then((response) => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))),
			import('./affiliationmap.js')
		]).then(([json, module]) => live && ((geo = module), (grid = json)), () => live && (failed = true));
		return () => (live = false);
	});

	// A mission with no US author opens on the world.
	const key = $derived(chosen ?? (summary.us.mapped ? 'us' : 'world'));
	const map = $derived(FRAMES[key]);
	const facts = $derived(summary[key]);
	const cells = $derived(
		(grid && geo ? grid[key].cells : [])
			.map(([west, south, papers, place, count]) => ({ d: geo.cellPath(key, west, south), papers, place: grid.places[place], count }))
			.filter((c) => c.d)
	);
	// Cells arrive most papers first; a log scale keeps one big centre from washing out the rest.
	const top = $derived(Math.max(cells[0]?.papers ?? 1, 10));
	const color = $derived(scaleSequentialLog(piecewise(interpolateLab, HEAT)).domain([1, top]));
	// the decades, then the top end itself at the ramp's right edge; a decade that would crowd its label steps aside
	const ticks = $derived([...decadeTicks(1, top).filter((t) => Math.log(t) / Math.log(top) < 0.7), top]);
	// for the screen-reader label only; no caption shows them
	const leaders = $derived(facts.top.map((t) => `${t.name} (${int(t.papers)})`).join('; '));

	// The pointed-at square and where the pointer is on the map (x, y), for the pop-up. A tap is a
	// pointerdown, so a touch picks a square too; it stays until the next tap, since a lifted
	// finger also fires pointerleave, which clears only a mouse's.
	function pick(event) {
		const i = event.target.dataset?.i;
		const r = event.currentTarget.getBoundingClientRect();
		hover = i == null ? null : { ...cells[i], x: event.clientX - r.left, y: event.clientY - r.top, w: r.width };
	}
	// the pop-up hangs off the pointer's side with room: its left edge near the left, its right near the right
	const shift = (h) => (h.x < h.w / 3 ? '-12px' : h.x > (h.w * 2) / 3 ? 'calc(12px - 100%)' : '-50%');
</script>

<figure bind:this={figure}>
	<div class="toolbar">
		<Choice label="Map" value={key} onchange={(value) => { chosen = value; hover = null; }} options={OPTIONS} />
		<div class="legend" aria-hidden="true">
			<span class="ramp" style:background="linear-gradient(to right, {HEAT.join(', ')})"></span>
			<span class="ticks">
				{#each ticks as t (t)}<span style:left="{(Math.log(t) / Math.log(top)) * 100}%">{int(t)}</span>{/each}
			</span>
			<span class="unit">papers</span>
		</div>
	</div>
	<div class="stage" style:aspect-ratio="{map.width} / {map.height}" style:max-width={maxHeight ? `${Math.min(960, (maxHeight * map.width) / map.height)}px` : null}>
		<svg
			viewBox="0 0 {map.width} {map.height}"
			role="img"
			aria-label="Heat map of where the authors worked, {map.label}: {int(facts.mapped)} of {int(summary.papers)} tracked publications have an author on this map.{leaders ? ` Institutions on the most papers: ${leaders}.` : ''}"
			onpointermove={pick}
			onpointerdown={pick}
			onpointerleave={(e) => e.pointerType === 'mouse' && (hover = null)}
		>
			<!-- A soft halo under each square: the busiest places glow like city lights, and a lone square on a phone still shows. -->
			<filter id="{uid}-glow" x="-10%" y="-10%" width="120%" height="120%">
				<feGaussianBlur stdDeviation="3" result="halo" />
				<feMerge><feMergeNode in="halo" /><feMergeNode in="SourceGraphic" /></feMerge>
			</filter>
			{#if near}<image href={basemapSrc(key)} width={map.width} height={map.height} />{/if}
			<g filter="url(#{uid}-glow)">
				{#each cells as c, i (c.d)}
					<path d={c.d} fill={color(c.papers)} data-i={i} />
				{/each}
			</g>
			{#if hover}<path class="hovered" d={hover.d} />{/if}
		</svg>
		<!-- the square's leading institution, how many others share it, and its papers; under the pointer's top edge, it drops below -->
		{#if hover}
			<p class="tip" class:below={hover.y < 64} style:left="{hover.x}px" style:top="{hover.y}px" style:--shift={shift(hover)}>
				<strong>{hover.place}</strong>{#if hover.count > 1}{' '}and {int(hover.count - 1)} {plural(hover.count - 1, 'other')}{/if}
				<span>{int(hover.papers)} {plural(hover.papers, 'paper')}</span>
			</p>
		{/if}
		{#if !grid}<p class="status meta">{failed ? 'The map’s data didn’t load. Reload the page to try again.' : 'Loading the map…'}</p>{/if}
	</div>
</figure>

<style>
	figure { min-width: 0; }
	.toolbar { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 16px 32px; max-width: 960px; margin-top: 12px; font-size: 14px; }
	.legend { display: grid; grid-template-columns: 160px auto; column-gap: 12px; align-items: center; color: var(--dust); font-size: 12px; line-height: 16px; }
	.ramp { height: 8px; border-radius: 1px; }
	.ticks { position: relative; grid-row: 2; height: 16px; margin-top: 2px; }
	.ticks span { position: absolute; transform: translateX(-50%); font-variant-numeric: tabular-nums; }
	.ticks span:first-child { transform: none; }
	.ticks span:last-child { transform: translateX(-100%); }
	.unit { grid-row: 1 / span 2; grid-column: 2; max-width: 11em; }
	.stage { position: relative; max-width: 960px; margin-top: 12px; }
	svg { display: block; width: 100%; height: auto; cursor: crosshair; touch-action: pan-y; }
	.hovered { fill: none; stroke: var(--white); stroke-width: 1.5px; vector-effect: non-scaling-stroke; pointer-events: none; }
	.status { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; }
	.tip { position: absolute; z-index: 2; margin: 0; padding: 6px 10px; transform: translate(var(--shift), calc(-100% - 12px)); width: max-content; max-width: 240px; background: var(--black); border: 1px solid var(--shadow); font-size: 13px; line-height: 18px; pointer-events: none; }
	.tip.below { transform: translate(var(--shift), 16px); }
	.tip strong { font-weight: 500; }
	.tip span { display: block; color: var(--dust); }
</style>
