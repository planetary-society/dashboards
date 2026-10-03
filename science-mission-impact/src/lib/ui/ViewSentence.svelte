<script>
	// The chart title controls percentile and time scope.
	import { page } from '$app/state';
	import Choice from './Choice.svelte';
	import { scopeLabel } from '$lib/copy/window.js';
	import { view, setScope, setTop } from '$lib/state/view.svelte.js';

	let { lead, tail = '', showTop = true } = $props();
	// mid-sentence: the window names are proper nouns, only "lifetime" reads lower-case
	const scopes = $derived(
		['full', 'window', 'lifetime'].map((value) => ({
			value,
			label: value === 'lifetime' ? 'lifetime' : scopeLabel(value, { windowPolicy: page.data.site.windowPolicy })
		}))
	);
</script>

<span>
	{lead}
	{#if showTop}
		<Choice
			label="Threshold"
			value={view.top}
			onchange={setTop}
			options={[
				{ value: 10, label: '10%' },
				{ value: 1, label: '1%' }
			]}
		/>
	{/if}
	{tail}
	<Choice
		label="Scope"
		value={view.scope}
		onchange={setScope}
		options={scopes}
	/>
</span>
