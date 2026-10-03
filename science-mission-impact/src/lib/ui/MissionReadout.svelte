<script>
	import { missionHref } from '$lib/paths.js';
	let { id, slug, label } = $props();
</script>

{#if id}
	<div class="readout" aria-live="polite">
		<p>{label}</p>
		<a href={missionHref(slug, id)}>Open mission →</a>
	</div>
{/if}

<style>
	.readout { margin-top: 12px; font-size: 13px; line-height: 1.6; color: var(--dust); }
	p { white-space: pre-line; }
	a { display: inline-block; margin-top: 4px; }
</style>
