<script>
	import { view, setScope } from '$lib/state/view.svelte.js';
	import { scopeLabel } from '$lib/copy/window.js';
	import { missionHref } from '$lib/paths.js';
	import { int, money } from '$lib/format.js';

	let { missions, slug, windowPolicy, selectedId, onselect } = $props();
	const sorted = $derived([...missions].sort((a, b) => a.name.localeCompare(b.name)));
	const selected = $derived(missions.find((m) => m.id === selectedId));
</script>

<div class="controls">
	<label>Comparison window
		<select value={view.scope} onchange={(e) => setScope(e.currentTarget.value)}>
			{#each ['full', 'window', 'lifetime'] as scope (scope)}
				<option value={scope}>{scopeLabel(scope, { windowPolicy })}</option>
			{/each}
		</select>
	</label>
	<label>Find a mission
		<select value={selectedId} onchange={(e) => onselect(e.currentTarget.value)}>
			<option value="">All {int(missions.length)} missions</option>
			{#each sorted as mission (mission.id)}<option value={mission.id}>{mission.name}</option>{/each}
		</select>
	</label>
	{#if selected}
		<p class="selected"><strong>{selected.name}</strong> · {money(selected.cost)} <a href={missionHref(slug, selected.id)}>Open mission →</a></p>
	{/if}
</div>

<style>
	.controls { display: flex; flex-wrap: wrap; align-items: end; gap: 16px 24px; margin: 24px 0 16px; }
	label { display: grid; gap: 6px; font-size: 12px; color: var(--dust); min-width: 0; }
	select { font: inherit; font-size: 14px; color: var(--white); background: var(--panel); border: 1px solid var(--shadow); padding: 10px 30px 10px 10px; border-radius: 0; max-width: 100%; }
	.selected { font-size: 14px; color: var(--dust); padding-bottom: 10px; }
	.selected a { margin-left: 12px; white-space: nowrap; }
	@media (max-width: 560px) { label { flex: 1 1 100%; } select { width: 100%; } }
</style>
