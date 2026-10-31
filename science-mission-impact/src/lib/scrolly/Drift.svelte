<script>
	// The title's backdrop: mission thumbnails rising slowly behind the question, edge to edge across the
	// page. Its frame is only the graphic's column, so the field measures how far the frame sits from the
	// screen's left edge and reaches out to it. Three depths, the far ones small, faint and slow, so the
	// field reads as depth rather than a conveyor belt, and only as many thumbnails as keep it airy at this
	// screen's size. CSS animations on transforms alone, paused while hidden; reduced motion leaves them
	// scattered and still.
	import { thumbSrc } from '$lib/paths.js';

	let { tiles, visible } = $props();

	// each depth's share of the thumbnails, size range (px on a wide screen), opacity and seconds to cross
	const DEPTHS = [
		{ share: 0.55, size: [22, 34], opacity: 0.2, secs: 130 },
		{ share: 0.3, size: [40, 64], opacity: 0.34, secs: 90 },
		{ share: 0.15, size: [84, 128], opacity: 0.5, secs: 62 }
	];
	// the share of the field the thumbnails cover at any moment
	const COVER = 0.2;
	// low-discrepancy sequences (golden ratio, plastic number) spread the thumbnails evenly without a
	// random draw, so every load and the server render agree
	const frac = (v) => v - Math.floor(v);
	const PHI = 0.6180339887, R1 = 0.7548776662, R2 = 0.569840291;

	let el = $state();
	// the screen's width, the frame's height, and the frame's offset from the screen's left edge
	let field = $state(null);
	$effect(() => {
		const measure = () => {
			const frame = el.parentElement.getBoundingClientRect();
			field = { left: -frame.left, width: document.documentElement.clientWidth, height: frame.height };
		};
		measure();
		addEventListener('resize', measure);
		return () => removeEventListener('resize', measure);
	});

	const floats = $derived.by(() => {
		if (!field) return [];
		// thumbnails shrink on a narrow screen, to 60% on a phone
		const unit = Math.min(1, Math.max(0.6, field.width / 1440));
		const meanArea = DEPTHS.reduce((a, d) => a + d.share * (((d.size[0] + d.size[1]) / 2) * unit) ** 2, 0);
		const n = Math.min(tiles.length, Math.round((COVER * field.width * field.height) / meanArea));
		return tiles
			.map((t, i) => ({ t, key: frac(i * PHI) })) // shuffled, so every launch decade drifts together
			.sort((a, b) => a.key - b.key)
			.slice(0, n)
			.map(({ t }, j) => {
				const pick = frac(j * PHI);
				const depth = pick < DEPTHS[0].share ? DEPTHS[0] : pick < DEPTHS[0].share + DEPTHS[1].share ? DEPTHS[1] : DEPTHS[2];
				const s = Math.round((depth.size[0] + frac(j * 0.41421356) * (depth.size[1] - depth.size[0])) * unit);
				const secs = depth.secs * (0.9 + 0.2 * frac(j * 0.70710678));
				return {
					id: t.id,
					s,
					x: Math.round(frac(0.5 + j * R1) * (field.width - s)),
					opacity: depth.opacity,
					secs,
					// a head start, so the field opens already full
					delay: -frac(0.5 + j * R2) * secs
				};
			})
			.sort((a, b) => a.s - b.s); // the near ones paint over the far
	});
</script>

<div class="drift" class:visible bind:this={el} style:left="{field?.left ?? 0}px" style:width="{field?.width ?? 0}px">
	{#each floats as f (f.id)}
		<div class="float" style:left="{f.x}px" style:width="{f.s}px" style:--s="{f.s}px" style:opacity={f.opacity} style:animation-duration="{f.secs}s" style:animation-delay="{f.delay}s">
			<img src={thumbSrc(f.id)} alt="" decoding="async" />
		</div>
	{/each}
</div>

<style>
	/* fades in and out with the title; hidden, it stops animating */
	.drift {
		position: absolute;
		top: 0;
		bottom: 0;
		overflow: hidden;
		pointer-events: none;
		/* thumbnails surface from the bottom edge and dissolve before the top */
		mask-image: linear-gradient(transparent, #000 18%, #000 80%, transparent);
		opacity: 0;
		visibility: hidden;
		transition:
			opacity 600ms ease,
			visibility 0s linear 600ms;
	}

	.drift.visible {
		opacity: 1;
		visibility: visible;
		transition-delay: 0s;
	}

	/* a column one thumbnail wide and the frame's height plus its own: the thumbnail sits at the
	   bottom, just under the frame, and the column rises its whole height, leaving it just above */
	.float {
		position: absolute;
		top: 0;
		height: calc(100% + var(--s));
		animation: rise linear infinite;
		will-change: transform;
	}

	.drift:not(.visible) .float {
		animation-play-state: paused;
	}

	@media (prefers-reduced-motion: reduce) {
		.float {
			animation-play-state: paused;
		}
	}

	@keyframes rise {
		to {
			transform: translateY(-100%);
		}
	}

	/* the squares' treatment: grey, with a hairline edge drawn over the picture */
	img {
		position: absolute;
		bottom: 0;
		left: 0;
		width: 100%;
		aspect-ratio: 1;
		object-fit: cover;
		filter: grayscale(1) contrast(1.05);
		outline: 1px solid rgb(255 255 255 / 0.18);
		outline-offset: -1px;
		animation: appear 1.6s ease-out both;
	}

	@keyframes appear {
		from {
			opacity: 0;
		}
	}
</style>
