<script>
	// Papers a person or an agent added to, or removed from, what the query returned.
	import { adsAbstract } from '$lib/paths.js';
	import { int } from '$lib/format.js';

	let { curation } = $props();

	const PAGE = 50;

	const includes = $derived(curation?.includes ?? []);
	const excludes = $derived(curation?.excludes ?? []);

	let showAll = $state({ includes: false, excludes: false });

	const href = (item) => (item.bibcode ? adsAbstract(item.bibcode) : item.doi ? `https://doi.org/${item.doi}` : null);
	const reviewer = (item) => (item.authority === 'agent' ? ['🤖', 'AI-assisted review'] : ['👨', 'Reviewed by hand']);
</script>

{#snippet list(key, heading, items)}
	{@const shown = showAll[key] ? items : items.slice(0, PAGE)}
	<h3 class="chart-title sub">{heading} <span class="meta">({int(items.length)})</span></h3>
	<ol>
		{#each shown as item, i (item.bibcode ?? item.doi ?? `${key}-${i}`)}
			{@const url = href(item)}
			{@const [emoji, who] = reviewer(item)}
			<li>
				{#if url && item.title}
					<a class="title" href={url} target="_blank" rel="noopener">{item.title}</a>
				{:else if url}
					<!-- an untitled record is known by its identifier -->
					<a class="title id" href={url} target="_blank" rel="noopener">{item.bibcode ?? item.doi}</a>
				{:else if item.title}
					<span class="title plain">{item.title}</span>
				{/if}
				{#if item.reason}<span class="reason">{item.reason}</span>{/if}
				<span class="meta">Decision <span role="img" aria-label={who}>{emoji}</span></span>
			</li>
		{/each}
	</ol>
	{#if !showAll[key] && items.length > PAGE}
		<button type="button" onclick={() => (showAll = { ...showAll, [key]: true })}>Show all {int(items.length)}</button>
	{/if}
{/snippet}

{#if includes.length || excludes.length}
	<div class="curation">
		{#if includes.length}
			{@render list('includes', 'Added after review', includes)}
		{/if}
		{#if excludes.length}
			{@render list('excludes', 'Removed after review', excludes)}
		{/if}
	</div>
{/if}

<style>
	.curation {
		max-width: 92ch;
	}

	.sub {
		margin-top: 40px;
	}

	ol {
		margin: 4px 0 0;
	}

	li {
		padding: 10px 0;
		border-top: 1px solid var(--shadow);
	}

	.title {
		display: block;
		font-size: 14px;
		line-height: 20px;
		color: var(--white);
		overflow-wrap: anywhere;
	}

	.id {
		color: var(--neptune-mid);
	}

	.title.plain {
		color: var(--dust);
	}

	a.title:hover {
		text-decoration: underline;
		text-decoration-color: var(--neptune);
	}

	.reason {
		display: block;
		margin-top: 2px;
		color: var(--dust);
	}

	li .meta {
		display: block;
		margin-top: 2px;
	}

	button {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: var(--neptune-mid);
	}

	button:hover {
		color: var(--white);
		text-decoration: underline;
	}
</style>
