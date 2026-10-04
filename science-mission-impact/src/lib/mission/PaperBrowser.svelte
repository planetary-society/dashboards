<script>
	// Every publication behind a mission's numbers.
	//
	// Prerendered: the twenty most cited, as a plain static list that needs no JS.
	// On request: the whole columnar file (up to ~19k rows), fetched once and kept
	// columnar. Filtering and sorting run over an index of integers and only the
	// first hundred rows are ever built into objects, so the list stays quick.
	import Num from '$lib/ui/Num.svelte';
	import Choice from '$lib/ui/Choice.svelte';
	import { adsAbstract, papersUrl } from '$lib/paths.js';
	import { int, plural } from '$lib/format.js';
	import { view } from '$lib/state/view.svelte.js';
	import { buildSearchIndex, filterIndex, sortIndex, rowsFor, journalFromBibcode, toCsv } from './papers.js';

	let { missionId, name, initial, file } = $props();

	const PAGE = 100;
	const uid = $props.id();

	let columns = $state.raw(null); // raw: 15 arrays of ~19k values, never a reactive proxy
	let total = $state(0);
	let status = $state('idle'); // idle | loading | error | ready

	let typed = $state('');
	let search = $state(''); // debounced
	let sort = $state('cited');
	let topOnly = $state(false);
	let limit = $state(PAGE);

	let debounce;

	const loaded = $derived(columns != null);
	const initialRows = $derived(
		(initial ?? []).map((p) => ({
			bibcode: p.bibcode,
			year: p.year,
			title: p.title,
			firstAuthor: p.firstAuthor,
			citations: p.citations,
			windowCitations: null,
			sharedWith: 0,
			addedByHand: false,
			journal: journalFromBibcode(p.bibcode),
			top10: 0,
			top1: false
		}))
	);

	const haystack = $derived(columns ? buildSearchIndex(columns) : null);
	// Sorted once per sort change; each keystroke only filters that order.
	const order = $derived(columns ? sortIndex(columns.b.map((_, i) => i), columns, { sort }) : null);
	const result = $derived(
		columns ? filterIndex(columns, { search, topOnly, scope: view.scope, top: view.top, haystack, order }) : []
	);
	const rows = $derived(columns ? rowsFor(columns, result, 0, limit, view.scope) : initialRows);

	const showWindow = $derived(loaded && view.scope !== 'lifetime');
	// Even a short list loads its file: that is where search, the top-10% marks and the CSV live.
	const canLoadAll = $derived(!!file);
	const hasMore = $derived(file && file.rows > (initial?.length ?? 0));

	// Any change to what the list contains starts the reader back at the first hundred.
	const resultKey = $derived(`${search}|${sort}|${topOnly}|${view.scope}|${view.top}`);
	$effect(() => {
		void resultKey;
		limit = PAGE;
	});

	async function loadAll() {
		status = 'loading';
		try {
			const response = await fetch(papersUrl(missionId));
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const papers = await response.json();
			columns = papers.columns;
			total = papers.rows ?? papers.columns.b.length;
			status = 'ready';
		} catch {
			status = 'error';
		}
	}

	function onSearch(event) {
		typed = event.currentTarget.value;
		clearTimeout(debounce);
		debounce = setTimeout(() => (search = typed), 120);
	}

	function downloadCsv() {
		if (!columns) return;
		const blob = new Blob([toCsv(columns, adsAbstract)], { type: 'text/csv;charset=utf-8' });
		const href = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = href;
		link.download = `${missionId}-publications.csv`;
		document.body.appendChild(link);
		link.click();
		link.remove();
		setTimeout(() => URL.revokeObjectURL(href), 0);
	}

	function metaLine(r) {
		const parts = [];
		if (r.firstAuthor) parts.push(r.firstAuthor);
		if (r.year) parts.push(String(r.year));
		if (r.journal) parts.push(r.journal);
		if (r.sharedWith > 0) parts.push(`shared with ${int(r.sharedWith)} other ${plural(r.sharedWith, 'mission')}`);
		if (r.addedByHand) parts.push('added by hand');
		return parts.join(', ');
	}
</script>

<div class="browser">
	{#if loaded}
		<div class="controls">
			<div class="field">
				<label class="sr-only" for="{uid}-search">Search titles and authors</label>
				<input id="{uid}-search" type="search" value={typed} oninput={onSearch} placeholder="Search titles and authors" autocomplete="off" />
			</div>

			<Choice
				label="Sort"
				value={sort}
				onchange={(v) => (sort = v)}
				options={[
					{ value: 'cited', label: 'Most cited (lifetime)' },
					{ value: 'newest', label: 'Newest' },
					{ value: 'oldest', label: 'Oldest' }
				]}
			/>

			<button type="button" class="toggle" aria-pressed={topOnly} onclick={() => (topOnly = !topOnly)}>Top-{view.top}% papers only</button>

			<p class="meta readout" aria-live="polite">{int(result.length)} of {int(total)}</p>

			<button type="button" class="link csv" onclick={downloadCsv}>Download CSV</button>
		</div>
		<p class="meta legend" aria-hidden="true">
			<span><span class="tier on"></span>Top-10% paper</span>
			<span><span class="tier on partial"></span>Partial top-10% credit</span>
			<span><span class="tier on one"></span>Top-1% paper</span>
			<span>Citations: lifetime{showWindow ? ', and within the window' : ''}</span>
		</p>
	{/if}

	<ol class="papers" aria-label="{name} tracked publications">
		{#each rows as r (r.bibcode)}
			<li>
				<p class="line">
					{#if loaded}
						<span class="tier" class:on={r.top10 > 0} class:partial={r.top10 > 0 && r.top10 < 1} class:one={r.top1} aria-hidden="true"></span>
						{#if r.top1}<span class="sr-only">Top-1% paper.</span>{:else if r.top10 > 0}<span class="sr-only">Top-10% paper.</span>{/if}
					{/if}
					<a class="title" href={adsAbstract(r.bibcode)} target="_blank" rel="noopener">{r.title ?? r.bibcode}</a>
				</p>
				<p class="meta">{metaLine(r)}</p>
				<p class="cites">
					<Num value={int(r.citations)} /><span class="unit meta">{' '}{plural(r.citations, 'citation')}</span>
					{#if showWindow}
						<span class="meta win"><Num value={r.windowCitations == null ? '—' : int(r.windowCitations)} /> in window</span>
					{/if}
				</p>
			</li>
		{/each}
	</ol>

	{#if loaded}
		{#if result.length > rows.length}
			<p class="more"><button type="button" class="link" onclick={() => (limit += PAGE)}>Show 100 more</button></p>
		{:else if result.length === 0}
			<p class="meta empty">No tracked publications match.</p>
		{/if}
	{:else if canLoadAll}
		<p class="more">
			{#if status === 'error'}
				<span class="failed">Couldn’t load the list.</span>
				<button type="button" class="link" onclick={loadAll}>Try again.</button>
			{:else}
				<button type="button" class="link" disabled={status === 'loading'} onclick={loadAll}>
					{status === 'loading' ? 'Loading…' : hasMore ? `Show all ${int(file.rows)} tracked publications` : 'Search, mark top-10% papers or download CSV'}
				</button>
			{/if}
		</p>
	{/if}
</div>

<style>
	.browser {
		margin-top: 20px;
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px 28px;
		padding-bottom: 12px;
		border-bottom: 1px solid var(--shadow);
	}

	.field {
		flex: 1 1 240px;
		min-width: 200px;
	}

	input {
		width: 100%;
		min-height: 44px;
		font: inherit;
		color: var(--white);
		background: none;
		border: 0;
		border-bottom: 1px solid var(--shadow);
		padding: 0 0 4px;
		-webkit-appearance: none;
		appearance: none;
	}

	input::placeholder {
		color: var(--soil);
	}

	input:hover {
		border-bottom-color: var(--soil);
	}

	.toggle {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: var(--soil);
		border-bottom: 2px solid transparent;
		white-space: nowrap;
	}

	.toggle:hover {
		color: var(--white);
	}

	.toggle[aria-pressed='true'] {
		color: var(--white);
		border-bottom-color: var(--neptune);
	}

	.readout {
		margin-left: auto;
	}

	.link {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: var(--neptune-mid);
		white-space: nowrap;
	}

	.link:hover:not(:disabled) {
		color: var(--white);
		text-decoration: underline;
	}

	.link:disabled {
		color: var(--soil);
		cursor: default;
	}

	.papers li {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 96px;
		column-gap: 16px;
		padding: 10px 0;
		border-bottom: 1px solid var(--shadow);
	}

	.line {
		grid-column: 1;
		font-size: 14px;
		line-height: 20px;
	}

	.papers .meta {
		grid-column: 1;
		margin-top: 2px;
	}

	.title {
		color: var(--white);
		/* titles carry bare bibcodes, DOIs and instrument strings with nothing to break on */
		overflow-wrap: anywhere;
	}

	.title:hover {
		text-decoration: underline;
		text-decoration-color: var(--neptune);
	}

	/* Tier marker. Reserved even when empty so titles keep one left edge. */
	.tier {
		display: inline-block;
		width: 8px;
		height: 8px;
		margin-right: 10px;
		background: transparent;
	}

	.tier.on {
		background: var(--neptune);
	}

	.tier.partial {
		opacity: 0.5;
	}

	.tier.one {
		outline: 1px solid var(--white);
		outline-offset: 1px;
	}

	.cites {
		grid-column: 2;
		grid-row: 1 / span 2;
		text-align: right;
		font-size: 14px;
		line-height: 20px;
	}

	.unit,
	.win {
		display: block;
		margin-top: 2px;
	}

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 20px;
		padding: 10px 0;
		border-bottom: 1px solid var(--shadow);
	}

	.legend .tier {
		margin-right: 6px;
	}

	.more {
		margin-top: 4px;
	}

	.failed {
		color: var(--flame);
		margin-right: 8px;
	}

	.empty {
		margin-top: 12px;
	}

	@media (max-width: 640px) {
		.readout {
			margin-left: 0;
		}

		.papers li {
			grid-template-columns: minmax(0, 1fr) 72px;
		}

		/* iOS Safari zooms the page in on any field under 16px and never zooms back out */
		input {
			font-size: 16px;
		}
	}
</style>
