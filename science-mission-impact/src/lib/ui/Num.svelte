<script>
	// Poppins has no tabular figures. In tables, each digit sits in a fixed-width cell so
	// columns of numbers align; separators keep their natural width.
	let { value } = $props();
	const chars = $derived(String(value ?? '').split(''));
</script>

<span class="num" aria-label={String(value ?? '')}
	>{#each chars as ch}{#if ch >= '0' && ch <= '9'}<span class="d" aria-hidden="true">{ch}</span>{:else}<span aria-hidden="true">{ch}</span>{/if}{/each}</span
>

<style>
	.num {
		white-space: nowrap;
	}
	.d {
		display: inline-block;
		width: 0.62em;
		text-align: center;
	}
</style>
