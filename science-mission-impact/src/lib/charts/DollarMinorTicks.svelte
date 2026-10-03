<script>
	// The same short, unlabeled marks for pixel-based and percentage-based dollar axes.
	let { positions, top = 18, unit = 'px' } = $props();
</script>

<span class="dollar-minor-ticks" aria-hidden="true" style:top="{top}px">
	{#each positions as x (x)}
		<span class="minor" style:left="{x}{unit}"></span>
	{/each}
</span>

<style>
	.dollar-minor-ticks {
		position: absolute;
		left: 0;
		right: 0;
		height: 4px;
		pointer-events: none;
	}

	.minor {
		position: absolute;
		width: 1px;
		height: 4px;
		background: var(--soil);
		transform: translateX(-50%);
	}
</style>
