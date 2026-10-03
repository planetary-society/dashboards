<script>
	// Publication trends for one mission: a cell per year since science began, brighter = more
	// papers that year. `emphasize` (n years) keeps the early window lit and dims the rest.
	let { values, max, emphasize = 0, years = 20 } = $props();

	const cells = $derived(Array.from({ length: years }, (_, i) => (i < values.length ? values[i] : null)));
	const level = (v) => (v ? 0.18 + 0.82 * Math.sqrt(v / max) : 0);
	const label = $derived(
		values.length ? `Tracked publications per year since science began: ${values.join(', ')}` : 'No tracked publications'
	);
</script>

<span class="strip" role="img" aria-label={label}>
	{#each cells as v, i (i)}
		<span
			class="cell"
			class:future={v == null}
			class:dim={emphasize > 0 && i >= emphasize}
			title={v == null ? undefined : `Year ${i + 1}: ${v}`}
			style:--level={v == null ? 0 : level(v)}
		></span>
	{/each}
</span>

<style>
	.strip {
		display: grid;
		grid-auto-flow: column;
		grid-auto-columns: 1fr;
		gap: 1px;
		height: 14px;
		width: 100%;
	}

	.cell {
		position: relative;
		background: var(--strip-empty);
	}

	.cell::after {
		content: '';
		position: absolute;
		inset: 0;
		background: var(--neptune);
		opacity: var(--level);
		transition: opacity 300ms linear;
	}

	.cell.dim::after {
		opacity: calc(var(--level) * 0.3);
	}

	.cell.future {
		background: transparent;
	}
</style>
