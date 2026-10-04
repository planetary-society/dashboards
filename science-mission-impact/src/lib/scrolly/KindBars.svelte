<script>
	// Furniture for the paper-kind rows: the legend and mode title in the head, per row the
	// mission's name, a 100%-stacked bar of its papers (or citations) by kind and the total, and
	// the label over the strip of missions without papers. The squares are drawn by Squares.
	import { int } from '$lib/format.js';

	/** layout: kindsLayout() result. kinds: site.kinds. mode: 'papers' | 'citations'. */
	let { layout, kinds, mode = 'papers', visible = false, compact = false } = $props();

	const byId = $derived(new Map(kinds.missions.map((m) => [m.id, m])));
	const shown = $derived(kinds.kinds.filter((k) => kinds.total.byKind[k.key]?.[mode] > 0));
	const share = (m, key) => (m[mode] > 0 ? (m.byKind[key]?.[mode] ?? 0) / m[mode] : 0);
	const side = $derived(compact ? 6 : 24);
</script>

<div class="labels" class:visible class:compact aria-hidden="true" style:--font="{layout.fontPx}px">
	<span class="head" style:left="{layout.left}px" style:right="{side}px" style:height="{layout.headH}px">
		<span class="legend">
			{#each shown as k (k.key)}
				<span class="key"><i class="kind-{k.key}"></i>{compact ? k.short : k.label}</span>
			{/each}
		</span>
		<span class="mode">{mode === 'citations' ? 'Citations' : 'Papers'}</span>
	</span>

	{#each layout.rows as row (row.id)}
		{@const m = byId.get(row.id)}
		{#if m}
			<span class="name" style:top="{row.y}px" style:left="{layout.left}px" style:width="{layout.nameW}px" style:height="{row.h}px" style:line-height="{row.h}px">{m.name}</span>
			<span class="bar" style:top="{row.y}px" style:left="{layout.barX}px" style:width="{layout.barW}px" style:height="{row.h}px">
				{#each kinds.kinds as k (k.key)}
					<i class="seg kind-{k.key}" style:width="{share(m, k.key) * 100}%"></i>
				{/each}
			</span>
			<span class="value" style:top="{row.y}px" style:left="{layout.valueX}px" style:line-height="{row.h}px">{int(m[mode])}</span>
		{/if}
	{/each}

	{#if layout.strip}
		<span class="strip" style:top="{layout.strip.y - 16}px" style:left="{layout.barX}px">{int(layout.strip.ids.length)} with no publications in their window</span>
	{/if}
</div>

<style>
	.labels {
		position: absolute;
		inset: 0;
		opacity: 0;
		transition: opacity 400ms linear;
		pointer-events: none;
	}

	.labels.visible {
		opacity: 1;
	}

	.labels > span {
		position: absolute;
	}

	.head {
		top: 0;
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 2px 12px;
	}

	.key {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 12px;
		line-height: 16px;
		color: var(--dust);
		white-space: nowrap;
	}

	.key i {
		width: 10px;
		height: 10px;
		flex: none;
	}

	.mode {
		font-size: 13px;
		line-height: 16px;
		font-weight: 500;
		color: var(--white);
		white-space: nowrap;
	}

	.name {
		font-size: var(--font);
		color: var(--white);
		text-align: right;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.bar {
		display: flex;
		overflow: hidden;
	}

	.seg {
		height: 100%;
		flex: none;
		transition: width var(--move) var(--ease);
	}

	.value {
		font-size: var(--font);
		color: var(--dust);
		white-space: nowrap;
	}

	.strip {
		font-size: 11px;
		line-height: 16px;
		color: var(--dust);
		white-space: nowrap;
	}

	.compact .key,
	.compact .mode {
		font-size: 11px;
		line-height: 14px;
	}
</style>
