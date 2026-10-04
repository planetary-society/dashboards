<script>
	// A choice set inside a sentence: "Share of top [10% · 1%] papers". No pills, no chrome.
	// An option's `short` replaces its label on a phone; its `hint` ({ text, href }) adds an "i".
	import Hint from './Hint.svelte';
	let { options, value, onchange, label } = $props();
</script>

<span class="choice" role="group" aria-label={label}>
	{#each options as opt, i (opt.value)}
		{#if i > 0}<span class="sep" aria-hidden="true">/</span>{/if}
		<button
			type="button"
			aria-pressed={opt.value === value}
			onclick={() => onchange(opt.value)}
			>{#if opt.short}<span class="long">{opt.label}</span><span class="short">{opt.short}</span>{:else}{opt.label}{/if}</button
		>{#if opt.hint}<Hint label={opt.label} text={opt.hint.text} href={opt.hint.href} />{/if}
	{/each}
</span>

<style>
	/* The group wraps between options (a three-way scope choice is wider than a phone
	   heading); each option stays whole. */
	button {
		white-space: nowrap;
		position: relative;
		color: var(--soil);
		padding: 12px 2px;
		margin: -12px 0;
		min-width: 28px;
		border-bottom: 0;
		transition: color 150ms;
	}

	button::after {
		content: '';
		position: absolute;
		left: 2px;
		right: 2px;
		bottom: 9px;
		height: 2px;
		background: transparent;
	}

	/* Touch: "1%" is only 28px wide. Grow the hit area, not the type, so the sentence
	   it sits inside reads the same. */
	@media (pointer: coarse) {
		button::before {
			content: '';
			position: absolute;
			inset: -4px -8px;
		}
	}

	button:hover {
		color: var(--white);
	}

	button[aria-pressed='true'] {
		color: var(--white);
	}

	button[aria-pressed='true']::after {
		background: var(--neptune);
	}

	.short {
		display: none;
	}

	@media (max-width: 560px) {
		.long {
			display: none;
		}

		.short {
			display: inline;
		}
	}

	.sep {
		color: var(--shadow);
		padding: 0 4px;
	}
</style>
