<script>
	import { page } from '$app/state';
	import { FOOTNOTES } from '$lib/copy/footnotes.js';
	import { methodsHref } from '$lib/paths.js';

	let { ids, collapsed = false } = $props();
	const policy = $derived({
		...page.data.site.windowPolicy,
		fullPolicy: page.data.site.fullPolicy,
		asOf: page.data.site.asOf,
		costBaseYear: page.data.site.costBaseYear,
		referenceCost: page.data.site.referenceCost
	});
	const notes = $derived(ids.filter((id) => FOOTNOTES[id]).map((id) => ({ id, ...FOOTNOTES[id] })));
</script>

{#snippet content()}
<p class="footnote meta">
	{#each notes as n (n.id)}
		<span>{n.text(policy)}</span>{' '}
	{/each}
	<a href={methodsHref(notes[0]?.anchor)}>Methods</a>
</p>
{/snippet}

{#if collapsed}
	<details><summary class="meta">How to read this chart</summary>{@render content()}</details>
{:else}
	{@render content()}
{/if}

<style>
	details { margin-top: 16px; }
	summary { cursor: pointer; }
	.footnote {
		margin-top: 16px;
		max-width: 92ch;
	}
</style>
