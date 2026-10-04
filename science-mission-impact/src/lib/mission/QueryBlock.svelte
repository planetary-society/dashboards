<script>
	// The ADS query behind a mission's paper list, shown rather than described.
		import { onDestroy } from 'svelte';
	import { fullQuery } from './query.js';

	let { query, name } = $props();

	const arms = $derived(query?.arms ?? null);

	let copyLabel = $state('Copy query');
	let timer;

	function flash(label) {
		copyLabel = label;
		clearTimeout(timer);
		timer = setTimeout(() => (copyLabel = 'Copy query'), 2000);
	}

	/** Pre-clipboard-API fallback: a throwaway textarea and execCommand. */
	function legacyCopy(text) {
		try {
			const field = document.createElement('textarea');
			field.value = text;
			field.setAttribute('readonly', '');
			field.style.position = 'fixed';
			field.style.top = '-1000px';
			document.body.appendChild(field);
			field.select();
			const ok = document.execCommand('copy');
			field.remove();
			return ok;
		} catch {
			return false;
		}
	}

	async function copyQuery() {
		const text = fullQuery(query);
		if (!text) return;
		let ok = false;
		try {
			if (navigator.clipboard?.writeText) {
				await navigator.clipboard.writeText(text);
				ok = true;
			}
		} catch {
			ok = false;
		}
		if (!ok) ok = legacyCopy(text);
		flash(ok ? 'Copied' : 'Couldn’t copy');
	}

	onDestroy(() => clearTimeout(timer));
</script>

<div class="query">
	{#if arms}
		<p class="lead">We searched NASA’s Astrophysics Data System (ADS) for peer-reviewed articles naming {name} in the title, abstract or keywords; standard filters drop articles that are not peer-reviewed and magazine pieces. SciX is ADS’s current interface.</p>
		<p class="arms">{fullQuery(query)}</p>

		<p class="actions">
			<button type="button" onclick={copyQuery}>{copyLabel}</button>
			{#if query?.url}<a href={query.url} target="_blank" rel="noopener">Open in SciX</a>{/if}
		</p>
		<span class="sr-only" role="status">{copyLabel === 'Copy query' ? '' : copyLabel}</span>
	{:else}
		<p class="hand">This mission has no ADS query; its tracked publications were added by hand.</p>
	{/if}

</div>

<style>
	.query {
		margin-top: 24px;
		max-width: 92ch;
	}

	/* No monospace anywhere on this site — the query reads as text, set off by a rule. */
	.arms {
		font-size: 14px;
		line-height: 22px;
		color: var(--dust);
		padding-left: 16px;
		border-left: 1px solid var(--shadow);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.actions {
		display: flex;
		align-items: center;
		gap: 24px;
		margin-top: 4px;
	}

	.actions button,
	.actions a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: var(--neptune-mid);
	}

	.actions button:hover,
	.actions a:hover {
		color: var(--white);
		text-decoration: underline;
	}

	.lead {
		margin-bottom: 12px;
		font-size: 14px;
		line-height: 22px;
		color: var(--dust);
	}

	.hand {
		margin-top: 8px;
		font-size: 16px;
		line-height: 26px;
		color: var(--dust);
	}
</style>
