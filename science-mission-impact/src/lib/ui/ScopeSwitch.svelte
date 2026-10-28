<script>
	// The page's one scope control. First child of a `.scoped` wrapper: it sticks under the
	// nav while the sections it drives scroll, and lets go when the wrapper ends. The division and
	// mission pages both mount this one control, so the options are the view's own SCOPES.
	import Choice from './Choice.svelte';
	import { scopeLabel, scopeGloss } from '$lib/copy/window.js';
	import { FOOTNOTES } from '$lib/copy/footnotes.js';
	import { methodsHref } from '$lib/paths.js';
	import { view, setScope, SCOPES } from '$lib/state/view.svelte.js';

	let { site } = $props();
	const SHORT = { full: 'Active', lifetime: 'Lifetime' };
	const options = $derived(SCOPES.map((value) => ({
		value, short: SHORT[value], label: scopeLabel(value),
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
