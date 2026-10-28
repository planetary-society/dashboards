<script>
	// Small against larger missions in each compared division (geometry in varyLayout): the share
	// that failed or fell short, then the share that had a top-10% paper. Small missions are rings,
	// labelled with their own count so a share of a handful reads as one; larger missions are dots.
	// No blue: in the story it means top-10% papers and trend lines.
	import { pct } from '$lib/format.js';

	/** layout: varyLayout(). */
	let { layout, visible = false, compact = false, width, height } = $props();

	const TITLES = { failed: 'Share that failed or fell short', reached: 'Share with a top-10% paper' };
</script>

<div class="vary" class:visible class:compact aria-hidden="true">
	<svg {width} {height}>
		{#each layout.panels as p (p.key)}
			<text class="title" x={layout.left} y={p.top - (compact ? 10 : 14)}>{TITLES[p.key]}</text>
			{#each p.ticks as t (t.v)}
				<line class="grid" x1={t.x} x2={t.x} y1={p.top} y2={p.axisY} />
				<text class="tick" x={t.x} y={p.axisY + (compact ? 12 : 14)} text-anchor="middle">{pct(t.v)}</text>
			{/each}
			{#each p.rows as row (row.slug)}
				<text class="name" x={layout.left - (compact ? 8 : 14)} y={row.y} dy="0.32em" text-anchor="end">{row.label}</text>
				{#if row.under && row.over}<line class="link" x1={row.under.x} x2={row.over.x} y1={row.y} y2={row.y} />{/if}
				{#if row.over}<circle class="over" cx={row.over.x} cy={row.y} r={layout.r} />{/if}
				{#if row.under}
					<circle class="under" cx={row.under.x} cy={row.y} r={layout.r - 1} />
					<text class="count" x={row.under.label.x} y={row.y} dy="0.32em" text-anchor={row.under.label.anchor}>{row.under.label.text}</text>
				{/if}
			{/each}
		{/each}
	</svg>
</div>

<style>
	.vary {
		position: absolute;
		inset: 0;
		opacity: 0;
		transition: opacity 400ms linear;
		pointer-events: none;
	}

	.vary.visible {
		opacity: 1;
	}

	svg {
		position: absolute;
		inset: 0;
		overflow: visible;
	}

	text {
		font: 12px var(--sans);
		fill: var(--dust);
	}

	.title {
		font-size: 15px;
		font-weight: 500;
		fill: var(--white);
	}

	.name {
		font-size: 14px;
		fill: var(--white);
	}

	.tick {
		font-size: 11px;
		fill: var(--soil);
	}

	.count {
		font-size: 10px;
	}

	.grid {
		stroke: var(--shadow);
	}

	.link {
		stroke: var(--soil);
		stroke-width: 2;
		opacity: 0.5;
	}

	.over {
		fill: var(--white);
	}

	/* drawn after the dot, so two close shares both stay visible */
	.under {
		fill: var(--black);
		stroke: var(--white);
		stroke-width: 2;
	}

	.compact .title {
		font-size: 13px;
	}

	.compact .name {
		font-size: 11px;
	}
</style>
