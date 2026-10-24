<script>
	// What small missions account for, one 100% bar per measure: the blue part is the small side.
	// HTML, not SVG: four bars and their numbers need no scale, and the numbers stay text.
	import { pct } from '$lib/format.js';

	/** rows: [{ label, share }] with share in 0..1 */
	let { rows, title } = $props();
</script>

<figure class="strip">
	<figcaption>{title}</figcaption>
	<ul>
		{#each rows as r (r.label)}
			<li>
				<span class="label">{r.label}</span>
				<span class="track" aria-hidden="true"><span class="fill" style:width="max(2px, {r.share * 100}%)"></span></span>
				<span class="value">{pct(r.share)}</span>
			</li>
		{/each}
	</ul>
</figure>

<style>
	.strip {
		margin: 0;
	}

	figcaption {
		font-size: 14px;
		line-height: 20px;
		color: var(--dust);
	}

	ul {
		margin-top: 12px;
	}

	li {
		display: grid;
		grid-template-columns: 8.5em minmax(0, 1fr) 4.5em;
		align-items: center;
		gap: 12px;
		padding: 7px 0;
		font-size: 14px;
		line-height: 20px;
	}

	.label {
		color: var(--dust);
	}

	.track {
		position: relative;
		height: 12px;
		background: var(--square);
	}

	.fill {
		position: absolute;
		inset: 0 auto 0 0;
		background: var(--neptune);
	}

	.value {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
</style>
