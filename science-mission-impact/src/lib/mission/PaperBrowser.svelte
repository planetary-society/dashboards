<script module>
	// The active and lifetime views are separate routes, so a scope switch remounts this list. The
	// last loaded file and the reader's search and filters outlive that, one mission at a time.
	let kept = null;
</script>

<script>
	// Every publication behind a mission's numbers.
	//
	// Prerendered: the twenty most cited, as a plain static list that needs no JS.
	// On request: the whole columnar file (up to ~19k rows), fetched once and kept
	// columnar. Filtering and sorting run over an index of integers and only the
	// first hundred rows are ever built into objects, so the list stays quick.
	import { untrack } from 'svelte';
	import Num from '$lib/ui/Num.svelte';
	import Choice from '$lib/ui/Choice.svelte';
	import { exportUrl, scixAbstract, papersUrl } from '$lib/paths.js';
	import { int, plural } from '$lib/format.js';
	import { view } from '$lib/state/view.svelte.js';
	import { buildSearchIndex, filterIndex, sortIndex, rowsFor, journalFromBibcode } from './papers.js';

	let { missionId, name, initial, file } = $props();

	const PAGE = 100;
	const uid = $props.id();

	// A remounted list (same mission, other scope) starts where the reader left it.
	const saved = untrack(() => (kept?.missionId === missionId ? kept : null));

	let columns = $state.raw(saved?.columns ?? null); // raw: 15 arrays of ~19k values, never a reactive proxy
	let total = $state(saved?.total ?? 0);
	let status = $state(saved ? 'ready' : 'idle'); // idle | loading | error | ready

	let typed = $state(saved?.search ?? '');
	let search = $state(saved?.search ?? ''); // debounced
	let sort = $state(saved?.sort ?? 'cited');
	let topOnly = $state(saved?.topOnly ?? false);
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

	// Deriveds, so an unrelated URL change (a hash) does not re-filter the list.
	const scope = $derived(view.scope);
	const top = $derived(view.top);
	const haystack = $derived(columns ? buildSearchIndex(columns) : null);
	// Sorted once per sort change; each keystroke only filters that order.
	const order = $derived(columns ? sortIndex(columns.bibcode.map((_, i) => i), columns, { sort }) : null);
	const result = $derived(
		columns ? filterIndex(columns, { search, topOnly, scope, top, haystack, order }) : []
	);
	const rows = $derived(columns ? rowsFor(columns, result, 0, limit, scope) : initialRows);

	// The active window has window citations and top-paper marks; lifetime shows lifetime citations only.
	const windowed = $derived(scope !== 'lifetime');
	const showWindow = $derived(loaded && windowed);
	// Even a short list loads its file: that is where search and the top-10% marks live.
	const canLoadAll = $derived(!!file);
	const hasMore = $derived(file && file.rows > (initial?.length ?? 0));

	// Any change to what the list contains starts the reader back at the first hundred.
	const resultKey = $derived(`${search}|${sort}|${topOnly}|${scope}|${top}`);
	$effect(() => {
		void resultKey;
		limit = PAGE;
	});

	$effect(() => {
		if (columns) kept = { missionId, columns, total, search, sort, topOnly };
	});

	async function loadAll() {
		status = 'loading';
		try {
			const response = await fetch(papersUrl(missionId));
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			const papers = await response.json();
			columns = papers.columns;
			total = papers.rows ?? papers.columns.bibcode.length;
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
	{#if file}
		<p class="downloads"><a class="link" href={exportUrl(`${missionId}-publications.csv`)} download>All publications CSV</a> · <a class="link" href={papersUrl(missionId)} download>JSON</a></p>
	{/if}
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

			{#if windowed}<button type="button" class="toggle" aria-pressed={topOnly} onclick={() => (topOnly = !topOnly)}>Top-{top}% papers only</button>{/if}

			<p class="meta readout" aria-live="polite">{int(result.length)} of {int(total)}</p>

		</div>
		<p class="meta legend" aria-hidden="true">
			{#if windowed}
				<span><span class="tier on"></span>Top-10% paper</span>
				<span><span class="tier on partial"></span>Partial top-10% credit</span>
				<span><span class="tier on one"></span>Top-1% paper</span>
			{/if}
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
					<a class="title" href={scixAbstract(r.bibcode)} target="_blank" rel="noopener">{r.title ?? r.bibcode}</a>
				</p>
				<p class="meta">{metaLine(r)}</p>
				<p class="cites">
					<Num value={int(r.citations)} /><span class="unit meta">{' '}lifetime {plural(r.citations, 'citation')}</span>
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
					{status === 'loading' ? 'Loading…' : hasMore ? `Show all ${int(file.rows)} tracked publications` : windowed ? 'Search or mark top-10% papers' : 'Search tracked publications'}
				</button>
			{/if}
		</p>
	{/if}
</div>

<style>
	.browser {
		margin-top: 20px;
	}
	.downloads { margin-bottom: 16px; }

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
