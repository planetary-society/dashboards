<script>
	// Renders the mission squares. One element per mission for the life of the page, so moving
	// between layouts is a CSS transition on the same node (object constancy).
	import { missionHref, thumbSrc } from '$lib/paths.js';

	/**
	 * tiles: ScrollyTile[]
	 * items: Map<id, { x, y, s, opacity?, inner?, variant?, emph?, label? }>
	 *   label: optional detailed hover/focus and accessible text; defaults to the short name
	 *   variant: 'solid' | 'outline' | 'reached' | 'lost' | 'partial'
	 * shown: only the first `shown` tiles are visible (the grid step reveals them on scroll)
	 * interactive: squares are in the tab order (false inside the aria-hidden story graphic)
	 * highlightId: the square washed in Rocket Flame (the skyline's pointed-at mission)
	 * quietId: a square whose tip is left off because something else already names it
	 */
	let { tiles, items, shown = Infinity, interactive = true, highlightId = null, quietId = null } = $props();

	let tip = $state(null);
	let tipEl = $state(null);

	// One delegated pair on the container instead of four listeners on every square.
	function showTip(event) {
		const id = event.target.closest?.('[data-id]')?.dataset.id;
		const it = id && items.get(id);
		tip = it ? { id, name: it.label ?? event.target.closest('[data-id]').dataset.name, x: it.x + it.s / 2, y: it.y } : null;
	}
	const hideTip = () => (tip = null);

	// The label is centred on its square, so a square near either edge would hang outside the
	// stage and widen the page. Measure where it landed and nudge it back in.
	$effect(() => {
		const el = tip && tipEl;
		if (!el) return;
		el.style.marginLeft = '0px';
		const label = el.getBoundingClientRect();
		const frame = el.parentElement.getBoundingClientRect();
		const shift = Math.max(0, frame.left - label.left) - Math.max(0, label.right - frame.right);
		if (shift) el.style.marginLeft = `${shift}px`;
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions, a11y_mouse_events_have_key_events -->
<div
	class="squares"
	onmouseover={showTip}
	onmouseout={hideTip}
	onfocusin={showTip}
	onfocusout={hideTip}
>
	{#each tiles as t, i (t.id)}
		{@const it = items.get(t.id)}
		{#if it}
			{@const opacity = i < shown ? (it.opacity ?? 1) : 0}
			<a
				class="sq mark-{it.variant ?? 'solid'}"
				class:filled={it.filled}
				class:emph={it.emph}
				class:hot={highlightId === t.id}
				href={missionHref(t.division, t.id)}
				tabindex={interactive && opacity >= 0.05 ? 0 : -1}
				aria-label={it.label ?? t.name}
				data-id={t.id}
				data-name={t.name}
				style:transform="translate({it.x}px, {it.y}px)"
				style:width="{it.s}px"
				style:height="{it.s}px"
				style:opacity
				style:pointer-events={opacity < 0.05 ? 'none' : 'auto'}
				style:--inner={it.inner ?? 0}
			>
				{#if t.hasThumb}
					<img src={thumbSrc(t.id)} alt="" decoding="async" fetchpriority="low" />
				{/if}
				<span class="fill"></span>
			</a>
		{/if}
	{/each}

	{#if tip && tip.id !== quietId}
		<span class="tip" bind:this={tipEl} style:transform="translate(calc({tip.x}px - 50%), calc({tip.y}px - 100% - 6px))">{tip.name}</span>
	{/if}
</div>

<style>
	.squares {
		position: absolute;
		inset: 0;
	}

	/* Fills and outlines per variant are the shared .mark-* classes in app.css, so any legend
	   drawn from them can never drift from the squares it explains. */
	.sq {
		position: absolute;
		left: 0;
		top: 0;
		display: block;
		overflow: hidden;
		transition:
			transform var(--move) var(--ease),
			width var(--move) var(--ease),
			height var(--move) var(--ease),
			opacity 400ms linear,
			background-color 400ms linear,
			box-shadow 400ms linear;
		will-change: transform;
	}

	.sq:hover,
	.sq:focus-visible {
		z-index: 2;
		outline: 1px solid var(--white);
		outline-offset: 1px;
	}


	/* The picture stays in the square from one step to the next; the state is drawn over it. A
	   square with something in it keeps its picture bright, an empty one dims it, and the two
	   solid states wash it in their colour, so the legend's flat swatches still read true. */
	img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		filter: grayscale(1) contrast(1.05);
		opacity: var(--picture, 1);
		transition: opacity 400ms linear;
	}

	.sq.mark-outline {
		--picture: 0.4;
	}

	.sq.mark-reached {
		--wash: var(--neptune);
	}

	/* The hairlines are drawn on this overlay rather than on the square itself: an inset shadow
	   paints under the picture, and the edges have to stay on top of it. Same colours as the
	   .mark-* classes and the legend. */
	.sq::before {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 1;
		background: var(--wash, transparent);
		box-shadow: inset 0 0 0 1px var(--edge, transparent);
		opacity: var(--wash-opacity, 1);
		transition:
			background-color 400ms linear,
			box-shadow 400ms linear;
	}

	.sq.mark-reached::before {
		--wash-opacity: 0.7;
	}

	/* every state has an edge, so a bright picture never reads as a square without a mark */
	.sq.mark-solid,
	.sq.mark-outline {
		--edge: var(--outline);
	}

	/* a square with something in it is a little brighter than an empty one; the ones the
	   copy points at are white */
	.sq.filled {
		--edge: var(--outline-filled);
	}

	.sq.emph {
		--edge: var(--white);
	}

	.fill {
		position: absolute;
		z-index: 2;
		left: 50%;
		top: 50%;
		width: calc(var(--inner) * 100%);
		height: calc(var(--inner) * 100%);
		transform: translate(-50%, -50%);
		background: var(--neptune);
		transition:
			width var(--move) var(--ease),
			height var(--move) var(--ease);
	}

	.tip {
		position: absolute;
		left: 0;
		top: 0;
		z-index: 5;
		padding: 3px 8px;
		background: var(--white);
		color: var(--black);
		font-size: 12px;
		line-height: 16px;
		/* a name longer than the stage wraps rather than running off it */
		max-width: 100%;
		white-space: pre-line;
		pointer-events: none;
	}

	/* the mission the reader is pointing at, on the skyline step */
	.sq.hot {
		z-index: 2;
		--edge: var(--flame);
		--wash: var(--flame);
		outline: 1px solid var(--flame);
		outline-offset: 1px;
	}

	.sq.hot::before {
		--wash-opacity: 0.7;
	}

	/* an outright failure: the picture dimmed under a red X; a partial outcome: one red stroke */
	.sq.mark-lost,
	.sq.mark-partial {
		--picture: 0.35;
		--edge: var(--soil);
	}

	.sq.mark-partial::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 1;
		background: linear-gradient(to top right, transparent calc(50% - 0.75px), var(--flame) 0 calc(50% + 0.75px), transparent 0);
	}

	.sq.mark-lost::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: 1;
		background:
			linear-gradient(to top right, transparent calc(50% - 0.75px), var(--flame) 0 calc(50% + 0.75px), transparent 0),
			linear-gradient(to top left, transparent calc(50% - 0.75px), var(--flame) 0 calc(50% + 0.75px), transparent 0);
	}
</style>
