<script>
	// Scroll-as-steps. A sticky graphic with text steps passing over it. `progress` (0–1 through
	// the active step) is only used to scrub line drawing; everything else is step-triggered.
	//
	// Steps are deliberately taller than the screen and their text is sticky inside them: the
	// text arrives, the graphic makes its move, and then both hold still for most of a screen of
	// scrolling before the next text comes up. That hold is the give between transitions.
	//
	// Consecutive steps are separated by `--step-gap`, sized so the outgoing text has fully
	// scrolled out of view before the next text enters at the bottom of the screen.
	import { onMount } from 'svelte';

	let { index = $bindable(0), progress = $bindable(0), graphic, steps } = $props();

	let root;

	onMount(() => {
		const els = [...root.querySelectorAll('[data-step]')];
		let frame = 0;

		// A step becomes active as its text arrives: the text sits at the top of its block, so
		// that is when the block's top edge passes a line low in the viewport. Measured on the
		// block, not the text, because the text stops moving once it sticks.
		const measure = () => {
			frame = 0;
			const line = window.innerHeight * 0.8;
			let active = 0;
			let rect = els[0].getBoundingClientRect();
			for (let i = 1; i < els.length; i++) {
				const r = els[i].getBoundingClientRect();
				if (r.top > line) break;
				active = i;
				rect = r;
			}
			index = active;
			progress = Math.max(0, Math.min(1, (line - rect.top) / rect.height));
		};
		const onScroll = () => {
			if (!frame) frame = requestAnimationFrame(measure);
		};

		measure();
		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onScroll);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onScroll);
		};
	});
</script>

<div class="scroller" bind:this={root}>
	<div class="graphic" aria-hidden="true">
		{@render graphic()}
	</div>
	<div class="steps">
		{@render steps()}
	</div>
</div>

<style>
	.scroller {
		/* Once a step's text unsticks, its top edge leaves the screen (under the nav) after the
		   same scroll distance that brings a point this far below its bottom edge up to the
		   bottom of the screen, whatever the text's height. */
		--step-gap: calc(100svh - var(--nav-h));
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(0, 2fr);
		gap: clamp(24px, 4vw, 72px);
		max-width: 1480px;
		margin-inline: auto;
		padding-inline: var(--gutter);
	}

	.graphic {
		grid-column: 2;
		grid-row: 1;
		position: sticky;
		top: var(--nav-h);
		height: calc(100svh - var(--nav-h));
		padding-block: 24px;
	}

	.steps {
		grid-column: 1;
		grid-row: 1;
		position: relative;
		z-index: 1;
		pointer-events: none;
	}

	/* The gap also holds the graphic still, so the step itself can be shorter than it would
	   otherwise need to be. */
	.steps :global([data-step]) {
		min-height: 130svh;
		pointer-events: none;
	}

	.steps :global([data-step]:not(:last-child)) {
		margin-bottom: var(--step-gap);
	}

	/* The text rides up to a little above the middle, then holds there while the rest of its
	   block scrolls by. */
	.steps :global([data-step] > *) {
		position: sticky;
		top: 36svh;
		pointer-events: auto;
	}

	.steps :global([data-step]:last-child) {
		min-height: 120svh;
	}

	/* Phones: graphic pinned on top, steps pass beneath it as solid black bands. */
	@media (max-width: 860px) {
		.scroller {
			/* the text leaves under the pinned graphic rather than the nav */
			--graphic-h: 50svh;
			--step-gap: calc(100svh - var(--nav-h) - var(--graphic-h) - 28px);
			display: block;
			padding-inline: 0;
		}

		.graphic {
			top: var(--nav-h);
			height: var(--graphic-h);
			padding: 8px 8px 0;
			background: var(--black);
			z-index: 2;
			border-bottom: 1px solid var(--shadow);
		}

		.steps :global([data-step]) {
			min-height: 125svh; /* a shorter hold: long steps are clipped by the screen while stuck */
			padding: 28px var(--gutter) 0;
			background: var(--black);
		}

		/* holds just under the pinned graphic */
		.steps :global([data-step] > *) {
			top: calc(var(--nav-h) + var(--graphic-h) + 28px);
		}

		.steps :global([data-step]:last-child) {
			min-height: 100svh;
		}
	}
</style>
