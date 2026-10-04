<script>
	import Num from '$lib/ui/Num.svelte';
	import MissionReadout from '$lib/ui/MissionReadout.svelte';
	import { view } from '$lib/state/view.svelte.js';
	import { missionHref, thumbSrc } from '$lib/paths.js';
	import { topShareModel } from './topsharebars.js';

	// A division too small to rank counts tracked publications.
	let { missions, slug, rankable = true, top = 10, selectedId = '', onselect = null } = $props();
	const model = $derived(topShareModel(missions, view.scope, { rankable, top }));
	const selected = $derived(model.rows.find((r) => r.id === selectedId));
	const subtitle = $derived(!rankable ? 'Tracked publications per mission in the selected scope.'
		: top === 1 ? 'Papers from each mission in the division’s top 1% within the window, not era-adjusted.'
		: 'Papers from each mission that rank in the division’s top 10% for their era.');
	const aria = (r) => `${r.name}: ${r.text}`;
</script>

{#snippet row(r)}
	{#if r.hasThumb}<img src={thumbSrc(r.id)} alt="" width="20" height="20" loading="lazy" />{:else}<span class="blank"></span>{/if}
	<span class="name"><span class="n">{r.name}</span>{#if r.failed}<span class="meta tag">failed</span>{/if}</span>
	<span class="track">{#if r.width > 0}<span class="bar" style:width="{r.width}%"></span>{/if}</span>
	<span class="v"><Num value={r.text} /></span>
{/snippet}

<figure>
	<p class="guide">{subtitle}</p>
	{#if model.rows.length}
		<div class="bars">
			<ul>
				{#each model.rows as r (r.id)}
					<li>
						{#if onselect}
							<button type="button" class="row" class:selected={r.id === selectedId} aria-pressed={r.id === selectedId} aria-label={aria(r)} onclick={() => onselect(r.id)}>{@render row(r)}</button>
						{:else}
							<a class="row" href={missionHref(slug, r.id)} aria-label={aria(r)}>{@render row(r)}</a>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{:else}
		<p class="meta">No missions with tracked publications in this view.</p>
	{/if}
	<MissionReadout id={selectedId} {slug} label={selected?.label ?? 'Selected mission: not measured in this scope.'} />
</figure>

<style>
	figure { min-width: 0; }
	.guide { color: var(--dust); font-size: 14px; line-height: 1.6; margin: 12px 0; }
	/* thumb · name · track · value */
	.bars { --name: 120px; --val: 56px; }
	ul { list-style: none; margin: 0; padding: 0; }
	li + li { border-top: 1px solid var(--shadow); }
	.row {
		display: grid; grid-template-columns: 20px var(--name) 1fr var(--val); gap: 8px; align-items: center;
		width: 100%; height: 28px; padding: 0; text-align: left; color: var(--dust); font-size: 14px;
	}
	.row:hover .n { color: var(--white); }
	.row.selected { box-shadow: inset 2px 0 var(--white); }
	.row.selected .n { color: var(--white); font-weight: 500; }
	img, .blank { display: block; width: 20px; height: 20px; background: var(--shadow); filter: grayscale(1); }
	.name { display: flex; min-width: 0; white-space: nowrap; }
	.n { overflow: hidden; text-overflow: ellipsis; }
	.tag { margin-left: 6px; align-self: center; } /* a flex row drops a bare space */
	.track { position: relative; height: 14px; }
	.bar { position: absolute; inset: 0 auto 0 0; background: var(--neptune); }
	.v { text-align: right; color: var(--white); }
	@media (max-width: 480px) { .bars { --name: 96px; } }
</style>
