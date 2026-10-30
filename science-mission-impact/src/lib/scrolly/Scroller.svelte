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
	let bare = $state(false);

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
			bare = els[active].hasAttribute('data-bleed');
			progress = Math.max(0, Math.min(1, (line - rect.top) / rect.height));
		};
		const onScroll = () => {
			if (!frame) frame = requestAnimationFrame(measure);
		};

		// Safety net: text taller than the room below its sticky top would be clipped while it
		// holds (on a phone, under the pinned graphic), so that step's text scrolls normally
		// instead. The sticky top is read back from the CSS, so the two cannot disagree. A
		// full-bleed step's frame fills that room by design (to a pixel of rounding), so it
		// overflows only when its text grows it past the screen.
		const fit = () => {
			// Keep geometry reads together so each step does not force another layout.
			for (const el of els) el.classList.remove('overflows');
			const overflowing = els.filter((el) => {
				const text = el.firstElementChild;
				if (!text) return false;
				const margin = el.hasAttribute('data-bleed') ? -1 : 8;
				const room = window.innerHeight - parseFloat(getComputedStyle(text).top) - margin;
				return text.offsetHeight > room;
			});
			for (const el of overflowing) el.classList.add('overflows');
		};
		const onResize = () => {
			fit();
			onScroll();
		};

		fit();
		document.fonts?.ready.then(fit);
		measure();
		window.addEventListener('scroll', onScroll, { passive: true });
		window.addEventListener('resize', onResize);
		return () => {
			cancelAnimationFrame(frame);
			window.removeEventListener('scroll', onScroll);
			window.removeEventListener('resize', onResize);
		};
	});
</script>

<div class="full">
	<div class="scroller" bind:this={root}>
		<div class="graphic" class:bare aria-hidden="true">
			{@render graphic()}
		</div>
		<div class="steps">
			{@render steps()}
		</div>
	</div>
</div>

<style>
	.scroller {
		/* Once a step's text unsticks, its top edge leaves the screen (under the nav) after the
		   same scroll distance that brings a point this far below its bottom edge up to the
		   bottom of the screen, whatever the text's height. */
		--step-gap: calc(100vh - var(--nav-h)); /* svh in the @supports block below */
		--max: 1480px;
		position: relative;
		display: grid;
		grid-template-columns: minmax(0, 1.2fr) minmax(0, 2fr);
		gap: clamp(24px, 4vw, 72px);
		max-width: var(--max);
		margin-inline: auto;
		padding-inline: var(--gutter);
	}

	/* the page's full width, which a full-bleed step reads in cqw (vw would count a scrollbar) */
	.full {
		container-type: inline-size;
	}

	.graphic {
		grid-column: 2;
		grid-row: 1;
		position: sticky;
		top: var(--nav-h);
		height: calc(100vh - var(--nav-h));
		height: calc(100svh - var(--nav-h));
		padding-block: 24px;
		transition: opacity 400ms linear;
	}

	/* a full-bleed step has the screen to itself */
	.graphic.bare {
		opacity: 0;
		pointer-events: none;
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
	/* A step that only changes the graphic holds for most of a screen; one whose graphic builds
	   as the reader scrolls (data-scrub) holds longer, so its build, which runs over about half
	   of the step, takes about half a screen of scrolling. */
	.steps :global([data-step]) {
		min-height: 90vh;
		min-height: 90svh;
		pointer-events: none;
	}

	.steps :global([data-step][data-scrub]) {
		min-height: 115vh;
		min-height: 115svh;
	}

	.steps :global([data-step]:not(:last-child)) {
		margin-bottom: var(--step-gap);
	}

	/* The text rides up to a little above the middle, then holds there while the rest of its
	   block scrolls by. The text is the step's first child, the one fit() measures. */
	.steps :global([data-step] > :first-child) {
		position: sticky;
		top: 36vh;
		top: 36svh;
		pointer-events: auto;
	}

	/* Scroller's safety net: text too tall for the hold scrolls with its step instead. */
	.steps :global([data-step].overflows > :first-child) {
		position: static;
	}

	.steps :global([data-step]:last-child) {
		min-height: 120vh;
		min-height: 120svh;
	}

	/* A full-bleed step (data-bleed) runs edge to edge across the page, taller than the screen. Its
	   first child is a frame the height of the screen under the nav with the text centred in it,
	   which holds while the band covers the screen: a short pause (the band's height less the
	   frame's) before the text scrolls on. The step dresses the band. */
	.steps :global([data-step][data-bleed]) {
		width: 100cqw;
		min-height: 130vh;
		min-height: 130svh;
		margin-left: calc(-1 * max(var(--gutter), (100cqw - var(--max)) / 2 + var(--gutter)));
		padding: 0 var(--gutter);
	}

	.steps :global([data-step][data-bleed] > :first-child) {
		top: var(--nav-h);
		display: grid;
		place-items: center;
		min-height: calc(100vh - var(--nav-h));
		min-height: calc(100svh - var(--nav-h));
		padding-block: 48px;
	}

	/* Phones: graphic pinned on top, each step's text a highlighted box that rides up beneath it and
	   holds just under it. No rule between them: the box's own edge does that job. */
	@media (max-width: 860px) {
		.scroller {
			/* the text leaves under the pinned graphic rather than the nav */
			--graphic-h: 50vh;
			/* the gap between the graphic and the box holding under it */
			--lead: 12px;
			--step-gap: calc(100vh - var(--nav-h) - var(--graphic-h) - var(--lead));
			display: block;
			padding-inline: 0;
		}

		.graphic {
			top: var(--nav-h);
			height: var(--graphic-h);
			padding: 8px 8px 0;
			background: var(--black);
			z-index: 2;
		}

		.steps :global([data-step]) {
			/* a step too long for the hold scrolls normally (the safety net above) */
			min-height: 90vh;
			min-height: 90svh;
			padding: var(--lead) 12px 0;
		}

		/* the site's highlighted block (--panel, Neptune left rule); a full-bleed step's text already
		   sits in its own panel over the photo, and a step left blank shows no empty box */
		.steps :global([data-step]:not([data-bleed]) > :first-child) {
			padding: 16px 18px;
			background: var(--panel);
			border-left: 2px solid var(--neptune);
		}

		.steps :global([data-step] > :first-child:empty) {
			display: none;
		}

		/* holds just under the pinned graphic */
		.steps :global([data-step] > :first-child) {
			top: calc(var(--nav-h) + var(--graphic-h) + var(--lead));
		}

		.steps :global([data-step]:last-child) {
			min-height: 100vh;
			min-height: 100svh;
		}

		/* the steps are already full width here */
		.steps :global([data-step][data-bleed]) {
			width: auto;
			margin-left: 0;
		}
	}

	/* A custom property cannot fall back by repetition (an unsupported unit only fails where it
	   is used), so the svh versions of the two that hold viewport units come in here, last. */
	@supports (height: 1svh) {
		.scroller {
			--step-gap: calc(100svh - var(--nav-h));
		}

		@media (max-width: 860px) {
			.scroller {
				--graphic-h: 50svh;
				--step-gap: calc(100svh - var(--nav-h) - var(--graphic-h) - var(--lead));
			}
		}
	}
</style>
