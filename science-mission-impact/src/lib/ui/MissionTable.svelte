<script>
	// One sortable list of missions, initially ordered by launch year, earliest first.
	import Num from './Num.svelte';
	import PubStrip from '$lib/charts/PubStrip.svelte';
	import { missionHref, thumbSrc } from '$lib/paths.js';
	import { int, weight, money } from '$lib/format.js';
	import { view } from '$lib/state/view.svelte.js';

	// rankable: false for a division too small to rank, which has no top-10% credit to show
	let { missions, slug, costBaseYear, rankable = true, selectedId = '', scopeLabel = '' } = $props();

	let sort = $state({ key: 'launch', dir: 1 });

	const topOf = (m) => (view.top === 1 ? m[view.scope].top1 : m[view.scope].top10);
	const value = {
		name: (m) => m.name.toLowerCase(),
		launch: (m) => m.launchYear,
		type: (m) => m.type?.toLowerCase() ?? null,
		cost: (m) => m.cost,
		papers: (m) => m.papers,
		citations: (m) => m.citations,
		hindex: (m) => m.indices?.h ?? null,
		top: (m) => topOf(m)
	};

	function sorted(list) {
		const get = value[sort.key];
		return list.slice().sort((a, b) => {
			const va = get(a);
			const vb = get(b);
			if (va == null && vb == null) return a.name.localeCompare(b.name);
			if (va == null) return 1;
			if (vb == null) return -1;
			if (va < vb) return -sort.dir;
			if (va > vb) return sort.dir;
			return a.name.localeCompare(b.name);
		});
	}

	const rows = $derived(sorted(missions));
	const maxTop = $derived(Math.max(1e-9, ...missions.map((m) => topOf(m) ?? 0)));
	const maxStrip = $derived(Math.max(1, ...missions.flatMap((m) => m.strip)));
	const topLabel = $derived(`Top-${view.top}% credit`);

	function setSort(key) {
		sort = sort.key === key ? { key, dir: -sort.dir } : { key, dir: key === 'name' ? 1 : -1 };
	}
	const ariaSort = (key) => (sort.key !== key ? 'none' : sort.dir === 1 ? 'ascending' : 'descending');

</script>

{#snippet th(key, label, cls = '')}
	<th class={cls} aria-sort={ariaSort(key)}>
		<button type="button" onclick={() => setSort(key)}>
			{label}<span class="arrow" aria-hidden="true">{sort.key === key ? (sort.dir === 1 ? '↑' : '↓') : ''}</span>
		</button>
	</th>
{/snippet}

<table>
	<caption>Lifetime totals{#if rankable} · Top-{view.top}% credit: {scopeLabel}{/if}</caption>
	<thead>
		<tr>
			<th class="thumb"><span class="sr-only">Image</span></th>
			{@render th('name', 'Mission', 'name')}
			{@render th('launch', 'Launch', 'num wide')}
			{@render th('type', 'Type', 'type wide')}
			{@render th('cost', `Cost (${costBaseYear} $)`, 'num')}
			{@render th('papers', 'Tracked publications', 'num')}
			{@render th('citations', 'Citations', 'num wide')}
			{@render th('hindex', 'h-index', 'num wide')}
			{#if rankable}{@render th('top', topLabel, 'num top')}{/if}
			<th class="strip wide">Tracked publications per year</th>
		</tr>
	</thead>
		<tbody>
			{#each rows as m (m.id)}
				{@const top = topOf(m)}
				<tr class="row" class:selected={selectedId === m.id}>
					<td class="thumb">
						{#if m.hasThumb}
							<img src={thumbSrc(m.id)} alt="" width="32" height="32" loading="lazy" />
						{:else}
							<span class="blank"></span>
						{/if}
					</td>
					<td class="name">
						<a href={missionHref(slug, m.id)}>{m.name}</a>
						{#if m.failed}<span class="meta">{' '}failed</span>{/if}
					</td>
					<td class="num wide"><Num value={m.launchYear ?? '—'} /></td>
					<td class="type wide">{m.type ?? '—'}</td>
					<td class="num"><Num value={money(m.cost)} /></td>
					<td class="num"><Num value={int(m.papers)} /></td>
					<td class="num wide"><Num value={int(m.citations)} /></td>
					<td class="num wide"><Num value={m.indices?.h == null ? '—' : int(m.indices.h)} /></td>
					{#if rankable}
						<td class="num top">
							<span class="bar" style:width="{((top ?? 0) / maxTop) * 100}%"></span>
							<span class="topv" class:nil={!top}><Num value={top == null ? '—' : weight(top)} /></span>
						</td>
					{/if}
					<td class="strip wide"><PubStrip values={m.strip} max={maxStrip} /></td>
				</tr>
			{/each}
		</tbody>
</table>

<style>
	caption { text-align: left; padding: 8px 0 16px; font-size: 12px; color: var(--dust); }
	.row.selected td { background: var(--row-hover); }
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 14px;
		line-height: 20px;
	}

	thead th {
		text-align: left;
		font-weight: 400;
		font-size: 12px;
		color: var(--soil);
		padding: 0 12px 10px 0;
		white-space: nowrap;
		vertical-align: middle;
	}

	thead button {
		min-height: 44px;
		display: flex;
		align-items: center;
		gap: 4px;
		color: inherit;
	}

	thead button:hover,
	th[aria-sort='ascending'] button,
	th[aria-sort='descending'] button {
		color: var(--white);
	}

	.arrow {
		display: inline-block;
		width: 10px;
	}

	.num {
		text-align: right;
	}

	thead .num button {
		flex-direction: row-reverse;
	}

	.row {
		position: relative;
	}

	.row td {
		padding: 8px 12px 8px 0;
		vertical-align: middle;
	}

	.row:hover td {
		background: var(--row-hover);
	}

	/* the whole row is the link */
	.name a {
		color: var(--white);
		font-weight: 500;
	}

	.name a::after {
		content: '';
		position: absolute;
		inset: 0;
	}

	.row:hover .name a {
		text-decoration: underline;
		text-decoration-color: var(--neptune);
	}

	.thumb {
		width: 44px;
	}

	.thumb img,
	.blank {
		display: block;
		width: 32px;
		height: 32px;
		background: var(--square);
		filter: grayscale(1);
	}

	/* mission types run to "Pointed Observatory"; the column takes what it needs and no more */
	.type {
		max-width: 140px;
		color: var(--dust);
	}

	.row .type {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.top {
		position: relative;
		width: 150px;
	}

	.bar {
		position: absolute;
		right: 60px;
		top: 50%;
		height: 8px;
		max-width: calc(100% - 72px);
		transform: translateY(-50%);
		background: var(--neptune);
		transition: width 400ms var(--ease);
	}

	.topv.nil {
		color: var(--soil);
	}

	.strip {
		width: 210px;
		padding-right: 0 !important;
	}

	@media (max-width: 860px) {
		.wide {
			display: none;
		}

		.top {
			width: 96px;
		}

		.bar {
			display: none;
		}
	}

	@media (max-width: 560px) {
		/* Reclaim every pixel the four remaining columns need: let a two-word heading
		   ("Top 10% papers") stack, and stop reserving width the bar no longer uses. */
		thead th {
			white-space: normal;
			padding-right: 8px;
		}

		.row td {
			padding-right: 8px;
		}

		.top {
			width: auto;
		}
	}
</style>
