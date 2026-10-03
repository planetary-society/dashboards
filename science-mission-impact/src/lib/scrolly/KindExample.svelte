<script>
	// Furniture for the worked example: the mission's name and figures beside its square, then
	// every paper on record (lifetime) with its kind, year, citations and any note. Papers reporting
	// the mission's own science data stay at full contrast; the rest are faded.
	import { int, money, plural } from '$lib/format.js';

	/** layout: exampleLayout() result. example: one of site.kinds.examples. kinds: site.kinds. */
	let { layout, example, kinds, visible = false, compact = false } = $props();

	const labels = $derived(new Map(kinds.kinds.map((k) => [k.key, k.label])));
</script>

<div class="labels" class:visible class:compact aria-hidden="true">
	<span class="head" style:left="{layout.headRight}px" style:top="{layout.top}px">
		<span class="title">{example.name}</span>
		<span class="meta">{money(example.cost)} · {int(example.lifetime.papers)} {plural(example.lifetime.papers, 'paper')} to date · {int(example.lifetime.citations)} citations</span>
	</span>

	<ol class="list" style:top="{layout.listY}px" style:left="{layout.left}px" style:right="{layout.left}px">
		{#each example.lifetime.list as p (p.bibcode)}
			<li class={p.kind === 'results' ? 'hit' : 'dim'}>
				<i class="kind-{p.kind}"></i>
				<span class="text">
					<span class="paper">{p.title}</span>
					<span class="meta">{p.year} · {int(p.citations)} citations · {labels.get(p.kind) ?? ''}{!compact && p.note ? ` · ${p.note}` : ''}{p.inScope ? '' : ' · after its window'}</span>
				</span>
			</li>
		{/each}
	</ol>
</div>

<style>
	.labels {
		position: absolute;
		inset: 0;
		opacity: 0;
		transition: opacity 400ms linear;
		pointer-events: none;
	}

	.labels.visible {
		opacity: 1;
	}

	.head,
	.list {
		position: absolute;
	}

	.head {
		right: 0;
		display: flex;
		flex-direction: column;
	}

	.title {
		font-size: 18px;
		line-height: 24px;
		font-weight: 500;
		color: var(--white);
	}

	.meta {
		font-size: 12px;
		line-height: 16px;
		color: var(--dust);
	}

	.list {
		bottom: 0;
		margin: 0;
		padding: 0;
		list-style: none;
		overflow: hidden;
		/* rows that do not fit wrap into a second column, off to the right and clipped, so the cut falls between rows */
		display: flex;
		flex-direction: column;
		flex-wrap: wrap;
		align-content: flex-start;
	}

	li {
		display: flex;
		flex: none;
		width: 100%;
		gap: 8px;
		padding: 6px 0;
		border-top: 1px solid var(--shadow);
	}

	li i {
		width: 10px;
		height: 10px;
		flex: none;
		margin-top: 4px;
	}

	.text {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.paper {
		font-size: 13px;
		line-height: 18px;
		color: var(--white);
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
	}

	.text .meta {
		font-size: 11px;
		line-height: 15px;
	}

	.dim i,
	.dim .paper,
	.dim .meta {
		opacity: 0.45;
	}

	.compact .paper {
		font-size: 12px;
		line-height: 16px;
	}

	/* on a phone the faded rows take one line so all seven papers fit; the hit keeps two */
	.compact .dim .paper {
		-webkit-line-clamp: 1;
		line-clamp: 1;
	}
</style>
