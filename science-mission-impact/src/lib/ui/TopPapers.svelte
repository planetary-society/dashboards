<script>
	// The division's most cited papers in the selected scope, each beside its mission's picture.
	import Num from './Num.svelte';
	import { adsAbstract, missionHref, thumbSrc } from '$lib/paths.js';
	import { byline, int, plural } from '$lib/format.js';

	// papers: one scope's list from Division.topPapers; missions: Division.missions (names, thumbnails)
	let { papers, missions, slug, label } = $props();

	const byId = $derived(new Map(missions.map((m) => [m.id, m])));
	const max = $derived(Math.max(1, ...papers.map((p) => p.citations)));
</script>

<ol class="papers" aria-label={label}>
	{#each papers as p (p.bibcode)}
		{@const lead = byId.get(p.missions[0])}
		<li>
			{#if lead?.hasThumb}
				<img src={thumbSrc(lead.id)} alt="" width="40" height="40" loading="lazy" />
			{:else}
				<span class="blank"></span>
			{/if}
			<div class="text">
				<a class="title" href={adsAbstract(p.bibcode)} target="_blank" rel="noopener">{p.title ?? p.bibcode}</a>
				<p class="meta">
					{byline(p.authors, p.authorCount ?? undefined) || (p.firstAuthor ?? '')}{p.year ? ` (${p.year})` : ''}{#each p.missions as id, i (id)}{@const m = byId.get(id)}{#if m}{i === 0 ? ', ' : i === p.missions.length - 1 ? ' and ' : ', '}<a href={missionHref(slug, id)}>{m.name}</a>{/if}{/each}
				</p>
			</div>
			<p class="cites">
				<Num value={int(p.citations)} /><span class="unit meta">{' '}{plural(p.citations, 'citation')}</span>
				<span class="bar" style:width="{(p.citations / max) * 100}%"></span>
			</p>
		</li>
	{/each}
</ol>

<style>
	.papers {
		margin-top: 8px;
		border-top: 1px solid var(--shadow);
	}

	li {
		display: grid;
		grid-template-columns: 40px minmax(0, 1fr) 112px;
		column-gap: 16px;
		align-items: center;
		padding: 12px 0;
		border-bottom: 1px solid var(--shadow);
	}

	img,
	.blank {
		display: block;
		width: 40px;
		height: 40px;
		background: var(--square);
		filter: grayscale(1);
		transition: filter 300ms var(--ease);
	}

	/* the picture takes its colour back while its row is being read */
	li:hover img {
		filter: none;
	}

	.title {
		font-size: 14px;
		line-height: 20px;
		color: var(--white);
		overflow-wrap: anywhere;
	}

	.title:hover {
		text-decoration: underline;
		text-decoration-color: var(--neptune);
	}

	.meta {
		margin-top: 2px;
	}

	.meta a {
		color: var(--neptune-mid);
	}

	.meta a:hover {
		color: var(--white);
		text-decoration: underline;
	}

	.cites {
		text-align: right;
		font-size: 14px;
		line-height: 20px;
	}

	.unit {
		display: block;
	}

	.bar {
		display: block;
		height: 2px;
		margin: 6px 0 0 auto;
		background: var(--neptune);
		transition: width 400ms var(--ease);
	}

	@media (max-width: 640px) {
		li {
			grid-template-columns: 32px minmax(0, 1fr) 72px;
			column-gap: 12px;
			align-items: start;
		}

		img,
		.blank {
			width: 32px;
			height: 32px;
		}
	}
</style>
