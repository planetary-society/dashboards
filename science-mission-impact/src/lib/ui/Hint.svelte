<script>
	// An "i" beside a term. Hover or focus shows the definition, a tap pins it. The tip is
	// always in the HTML, hidden by CSS, so prerendered pages carry every definition.
	let { text, label, href = null } = $props();
	const id = $props.id();
	let open = $state(false);
	let hushed = $state(false); // Escape hides a hovered or focused tip too
	let x = $state(0);
	let el, tip;

	// Shift the tip sideways so it stays on screen: a definition under a term near a phone's
	// right edge would otherwise run off it. Only ever called from browser events.
	function place() {
		hushed = false;
		tip.style.display = 'block';
		const w = tip.offsetWidth;
		tip.style.display = '';
		const left = el.getBoundingClientRect().left;
		x = Math.max(8 - left, Math.min(0, innerWidth - 8 - left - w));
	}
</script>

<svelte:document
	onclick={(e) => open && !el.contains(e.target) && (open = false)}
	onkeydown={(e) => e.key === 'Escape' && ((open = false), (hushed = true))}
/>

<span class="hint" class:open class:hushed bind:this={el}>
	<button
		type="button"
		aria-label="What is {label}?"
		aria-describedby={id}
		aria-expanded={open}
		onpointerenter={place}
		onfocus={place}
		onclick={() => (place(), (open = !open))}>i</button
	><span role="tooltip" {id} class="tip meta" style:left="{x}px" bind:this={tip}
		>{text}{#if href}{' '}<a {href}>Methods</a>{/if}</span
	>
</span>

<style>
	.hint {
		position: relative;
		display: inline-block;
		margin-left: 4px;
	}

	button {
		position: relative;
		width: 16px;
		height: 16px;
		border: 1px solid var(--soil);
		border-radius: 50%;
		color: var(--soil);
		font: 500 10px/14px var(--sans);
		text-align: center;
		vertical-align: 1px;
		opacity: 0.55; /* a quiet mark beside every term; full strength only when pointed at */
	}

	button:hover,
	button:focus-visible,
	.open button {
		color: var(--white);
		border-color: var(--white);
		opacity: 1;
	}

	/* Touch: grow the hit area to 44px, not the glyph. */
	@media (pointer: coarse) {
		button::before {
			content: '';
			position: absolute;
			inset: -15px;
		}
	}

	.tip {
		display: none;
		position: absolute;
		top: 100%;
		margin-top: 6px;
		z-index: 10;
		width: max-content;
		max-width: min(280px, calc(100vw - 2 * var(--gutter)));
		padding: 10px 12px;
		background: var(--panel);
		border: 1px solid var(--shadow);
		color: var(--dust);
		font-weight: 400;
		text-align: left;
		white-space: normal;
		text-transform: none;
	}

	/* Bridges the gap under the button, so the pointer can reach the Methods link. */
	.tip::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: -8px;
		height: 8px;
	}

	.hint:focus-within .tip,
	.open .tip {
		display: block;
	}

	/* Hover only where it exists: on a touch screen a tap would leave the tip stuck open. */
	@media (hover: hover) {
		.hint:hover .tip {
			display: block;
		}
	}

	/* Same weight as the rules above and later, so it wins. */
	.hint.hushed .tip {
		display: none;
	}
</style>
