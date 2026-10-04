<script>
	// Papers a person or an agent added to, or removed from, what the query returned.
	// Both lists are collapsed: they are provenance, not reading.
	import { adsAbstract } from '$lib/paths.js';
	import { int, longDate } from '$lib/format.js';

	let { curation } = $props();

	const PAGE = 50;

	const includes = $derived(curation?.includes ?? []);
	const excludes = $derived(curation?.excludes ?? []);

	let showAll = $state({ includes: false, excludes: false });

	const href = (item) => (item.bibcode ? adsAbstract(item.bibcode) : item.doi ? `https://doi.org/${item.doi}` : null);
	const reviewer = (item) => (item.authority === 'agent' ? 'AI-assisted review' : 'Reviewed by hand');
</script>

{#snippet list(key, heading, items)}
	{@const shown = showAll[key] ? items : items.slice(0, PAGE)}
	<details>
		<summary>{heading} ({int(items.length)})</summary>
		<ol>
			{#each shown as item, i (item.bibcode ?? item.doi ?? `${key}-${i}`)}
				{@const url = href(item)}
				<li>
					{#if url && item.title}
						<a class="title" href={url} target="_blank" rel="noopener">{item.title}</a>
					{:else}
						<!-- an untitled record is named as such; its identifier is the link -->
						<span class="title plain">{item.title || 'Untitled'}</span>
						{#if url}<a class="id" href={url} target="_blank" rel="noopener">{item.bibcode ?? item.doi}</a>{/if}
					{/if}
					{#if item.reason}<span class="reason">{item.reason}</span>{/if}
					<span class="meta">{reviewer(item)}{item.date ? `, ${longDate(item.date)}` : ''}</span>
				</li>
			{/each}
		</ol>
		{#if !showAll[key] && items.length > PAGE}
			<button type="button" onclick={() => (showAll = { ...showAll, [key]: true })}>Show all {int(items.length)}</button>
		{/if}
	</details>
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
		margin-top: 20px;
		max-width: 92ch;
	}

	summary {
		display: flex;
		align-items: center;
		min-height: 44px;
		color: var(--neptune-mid);
		cursor: pointer;
	}

	summary:hover {
		color: var(--white);
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

	/* a bibcode or DOI has nothing to break on */
	.id {
		display: block;
		font-size: 12px;
		color: var(--neptune-mid);
		overflow-wrap: anywhere;
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

	.meta {
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
