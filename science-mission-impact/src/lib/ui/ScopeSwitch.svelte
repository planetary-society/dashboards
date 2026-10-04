<script>
	// The page's one scope control. First child of a `.scoped` wrapper: it sticks under the
	// nav while the sections it drives scroll, and lets go when the wrapper ends.
	import Choice from './Choice.svelte';
	import { scopeLabel, scopeGloss } from '$lib/copy/window.js';
	import { FOOTNOTES } from '$lib/copy/footnotes.js';
	import { methodsHref } from '$lib/paths.js';
	import { view, setScope } from '$lib/state/view.svelte.js';

	let { site } = $props();
	const SHORT = { full: 'Active', window: 'Prime', lifetime: 'Lifetime' };
	const options = $derived(Object.entries(SHORT).map(([value, short]) => ({
		value, short, label: scopeLabel(value, site),
		hint: { text: scopeGloss(value, site), href: methodsHref(FOOTNOTES[value].anchor) }
	})));
</script>

<div class="bar">
	<span class="label">Scope</span>
	<Choice label="Scope" value={view.scope} onchange={setScope} {options} />
</div>

<style>
	.bar {
		position: sticky;
		top: var(--nav-h);
		z-index: 5;
		display: flex;
		flex-wrap: nowrap;
		align-items: baseline;
		gap: 12px 16px;
		padding: 10px 0;
		background: var(--black);
		border-bottom: 1px solid var(--shadow);
		font-size: 14px;
		white-space: nowrap;
	}

	/* Same size and weight as the chosen option, so the word reads as part of the control. */
	.label {
		font-weight: 500;
	}
</style>
