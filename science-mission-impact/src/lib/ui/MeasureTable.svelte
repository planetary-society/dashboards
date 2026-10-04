<script>
	// Key measures as grouped rows; the copy lives in $lib/copy/measures.js. Each term's
	// definition comes from FOOTNOTES, via the row's hint. Groups sit side by side when they fit.
	import Hint from './Hint.svelte';
	import Num from './Num.svelte';
	import { methodsHref } from '$lib/paths.js';

	let { groups } = $props();
</script>

<div class="groups">
	{#each groups as g (g.heading)}
		<table>
			<thead><tr><th colspan="2" class="meta">{g.heading}</th></tr></thead>
			<tbody>
				{#each g.rows as r (r.label)}
					<tr>
						<th scope="row" class:hi={r.highlight}
							>{r.label}{#if r.hint}<Hint label={r.label.replace(/,.*/, '')} text={r.hint.text} href={methodsHref(r.hint.anchor)} />{/if}</th
						>
						<td class="num"><Num value={r.value} />{#if r.note}{' '}<span class="meta">· {r.note}</span>{/if}</td>
					</tr>
				{:else}
					<tr><td colspan="2" class="none">Not available for this view.</td></tr>
				{/each}
			</tbody>
		</table>
	{/each}
</div>

<style>
	.groups {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
		gap: 32px 48px;
		margin-top: 16px;
	}

	table {
		width: 100%;
		align-self: start;
		border-collapse: collapse;
		font-size: 14px;
	}

	th,
	td {
		padding: 8px 0;
		border-bottom: 1px solid var(--shadow);
		text-align: left;
		font-weight: 400;
		vertical-align: baseline;
	}

	.num {
		text-align: right;
		padding-left: 16px;
	}

	/* A line to read others against: the cutoffs. */
	.hi {
		border-left: 2px solid var(--neptune);
		padding-left: 10px;
	}

	.hi,
	.hi + td {
		color: var(--white);
		font-weight: 500;
	}

	.none {
		color: var(--dust);
	}
</style>
