<script>
	// Poppins has no tabular figures. In tables, each digit sits in a fixed-width cell so
	// columns of numbers align; separators keep their natural width.
	let { value } = $props();
	const chars = $derived(String(value ?? '').split(''));
</script>

<!-- aria-label on a plain span is ignored by many screen readers: the number is read from real text -->
<span class="num"
	><span class="sr-only">{value ?? ''}</span><span aria-hidden="true"
		>{#each chars as ch}{#if ch >= '0' && ch <= '9'}<span class="d">{ch}</span>{:else}{ch}{/if}{/each}</span
	></span
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
