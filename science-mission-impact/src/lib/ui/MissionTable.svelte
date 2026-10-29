<script>
	// The division's missions in one list, earliest launch first. Cost is the prime-mission
	// life-cycle cost (adjusted_lcc), never extended-mission spending. Every figure follows the
	// page's scope, so the rows match the stats above; top 1% and the indices are in the CSV,
	// which carries both selectable scopes.
	import Num from './Num.svelte';
	import Hint from './Hint.svelte';
	import { FOOTNOTES, noteText } from '$lib/copy/footnotes.js';
	import { methodsHref, missionHref, thumbSrc } from '$lib/paths.js';
	import { missionsCsv } from '$lib/mission/papers.js';
	import { downloadText } from '$lib/download.js';
	import { int, weight, money } from '$lib/format.js';

	// rankable: false for a division too small to rank, which has no top-10% papers to show
	let { missions, slug, site, scope = 'full', rankable = true } = $props();

	let sort = $state({ key: 'launch', dir: 1 });

	const value = {
		name: (m) => m.name.toLowerCase(),
		launch: (m) => m.launchDate ?? (m.launchYear == null ? null : String(m.launchYear)),
		type: (m) => m.type?.toLowerCase() ?? null,
		cost: (m) => m.cost,
		papers: (m) => m[scope].papers,
		citations: (m) => m[scope].citations,
		top: (m) => m[scope].top10
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
	const maxTop = $derived(Math.max(1e-9, ...missions.map((m) => m[scope].top10 ?? 0)));

	function setSort(key) {
		sort = sort.key === key ? { key, dir: -sort.dir } : { key, dir: ['name', 'launch', 'cost'].includes(key) ? 1 : -1 };
	}
	const ariaSort = (key) => (sort.key !== key ? 'none' : sort.dir === 1 ? 'ascending' : 'descending');

	const downloadCsv = () =>
		downloadText(missionsCsv(missions, { costBaseYear: site.costBaseYear, url: (id) => new URL(missionHref(slug, id), location.origin).href }), `${slug}-missions.csv`);
</script>

{#snippet th(key, label, cls = '', notes = null)}
	<th class={cls} aria-sort={ariaSort(key)}>
		<span class="head"><button type="button" onclick={() => setSort(key)}>
			{label}<span class="arrow" aria-hidden="true">{sort.key === key ? (sort.dir === 1 ? '↑' : '↓') : ''}</span>
		</button>{#if notes}<Hint {label} text={noteText(notes, site, scope)} href={methodsHref(FOOTNOTES[notes[0]].anchor)} />{/if}</span>
	</th>
{/snippet}

<div class="tools">
	<button type="button" class="link" onclick={downloadCsv}>Download CSV</button>
</div>

<table>
	<caption class="sr-only">Missions, earliest launch first</caption>
	<thead>
		<tr>
			<th class="thumb"><span class="sr-only">Image</span></th>
			{@render th('name', 'Mission', 'name')}
			{@render th('launch', 'Launch', 'num wide')}
			{@render th('type', 'Type', 'type wide')}
			{@render th('cost', `LCC (${site.costBaseYear} $)`, 'num mid', ['cost'])}
			{@render th('papers', 'Publications', rankable ? 'num mid' : 'num', ['publications'])}
			{@render th('citations', 'Citations', 'num', ['citations'])}
			{#if rankable}{@render th('top', 'Top-10% papers', 'num top', ['top10', 'shared'])}{/if}
		</tr>
	</thead>
	<tbody>
		{#each rows as m (m.id)}
			{@const top = m[scope].top10}
			<tr class="row">
				<td class="thumb">
					{#if m.hasThumb}<img src={thumbSrc(m.id)} alt="" width="32" height="32" loading="lazy" />{:else}<span class="blank"></span>{/if}
				</td>
				<td class="name">
					<a href={missionHref(slug, m.id)}>{m.name}</a>{#if m.outcome}{' '}<span class="tag">{m.outcome[0] + m.outcome.slice(1).toLowerCase()}</span>{/if}
					<span class="sub meta">{money(m.cost)}, {m.launchYear ?? '—'}</span>
				</td>
				<td class="num wide"><Num value={m.launchYear ?? '—'} /></td>
				<td class="type wide">{m.type ?? '—'}</td>
				<td class="num mid"><Num value={money(m.cost)} /></td>
				<td class={rankable ? 'num mid' : 'num'}><Num value={int(m[scope].papers)} /></td>
				<td class="num"><Num value={int(m[scope].citations)} /></td>
				{#if rankable}
					<td class="num top">
						<span class="bar" style:width="{((top ?? 0) / maxTop) * 100}%"></span>
						<span class="topv" class:nil={!top}><Num value={top == null ? '—' : weight(top)} /></span>
					</td>
				{/if}
			</tr>
		{/each}
	</tbody>
</table>

<style>
	.tools {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: flex-end;
		gap: 8px 24px;
		margin-bottom: 8px;
	}

	.tools .link {
		min-height: 44px;
		color: var(--neptune-mid);
		font-size: 14px;
		text-decoration: underline;
		text-underline-offset: 3px;
	}

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
		padding: 0 12px 6px 0;
		white-space: nowrap;
		vertical-align: bottom;
	}

	/* The sort button is a flex box; the "i" beside it has to share its line. */
	.head {
		display: inline-flex;
		align-items: center;
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

	thead .num .head {
		justify-content: flex-end;
	}

	thead .num button {
		flex-direction: row-reverse;
	}

	thead tr {
		border-bottom: 1px solid var(--shadow);
	}

	.row {
		position: relative;
	}

	.row td {
		padding: 8px 12px 8px 0;
		vertical-align: middle;
		border-bottom: 1px solid var(--band);
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

	.tag {
		margin-left: 8px;
		padding: 0 6px;
		border: 1px solid var(--flame);
		color: var(--flame);
		font-size: 12px;
		line-height: 18px;
	}

	/* cost and launch year under the name, once their own columns are gone */
	.sub {
		display: none;
	}

	/* mission types run to "Pointed Observatory"; the column takes what it needs and no more */
	.type {
		max-width: 160px;
		color: var(--dust);
	}

	.row .type {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.top {
		position: relative;
		width: 200px;
	}

	.bar {
		position: absolute;
		right: 64px;
		top: 50%;
		height: 8px;
		max-width: calc(100% - 76px);
		transform: translateY(-50%);
		background: var(--neptune);
	}

	.topv.nil {
		color: var(--soil);
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
		.mid {
			display: none;
		}

		.sub {
			display: block;
		}

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
