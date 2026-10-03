<script>
	import { page } from '$app/state';
	import { home, divisionHref, methodsHref, asset } from '$lib/paths.js';

	let { divisions } = $props();

	const path = $derived(page.url.pathname);
	const homePath = home();
	const methodsPath = methodsHref();
	const isHome = $derived(path === homePath);
	const inDivision = (slug) => path.startsWith(divisionHref(slug));

	let list = $state(null);

	// The items don't fit a phone, so the strip scrolls; bring the current page's item
	// into it rather than leaving the reader on an apparently unmarked nav.
	$effect(() => {
		void path;
		const active = list?.querySelector('[aria-current="page"]');
		const reveal = () => active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		reveal();
		// Font loading can widen the last label after the initial scroll.
		let cancelled = false;
		document.fonts.ready.then(() => { if (!cancelled) reveal(); });
		return () => { cancelled = true; };
	});
</script>

<header class="nav">
	<nav class="wrap" aria-label="Science Mission Impact">
		<a class="mark" href="https://dashboards.planetary.org/" aria-label="The Planetary Society dashboards">
			<img src={asset('img/tps-logomark-white.png')} alt="" width="26" height="26" />
		</a>
		<ul bind:this={list}>
			<li><a href={homePath} aria-current={isHome ? 'page' : undefined}>Overview</a></li>
			{#each divisions as d (d.slug)}
				<li>
					<a href={divisionHref(d.slug)} aria-current={inDivision(d.slug) ? 'page' : undefined}>{d.nav}</a>
				</li>
			{/each}
			<li><a href={methodsPath} aria-current={path === methodsPath ? 'page' : undefined}>Methods</a></li>
		</ul>
	</nav>
</header>

<style>
	.nav {
		position: sticky;
		top: 0;
		z-index: 50;
		height: var(--nav-h);
		background: var(--black);
		border-bottom: 1px solid var(--shadow);
	}

	nav {
		height: 100%;
		display: flex;
		align-items: center;
		gap: 28px;
	}

	.mark {
		flex: none;
		display: grid;
		place-items: center;
		width: 44px;
		height: 44px;
		margin-left: -9px;
	}

	ul {
		display: flex;
		gap: clamp(18px, 3vw, 40px);
		height: 100%;
		/* the strip scrolls itself on a phone; without this it would widen the page instead */
		min-width: 0;
		overflow-x: auto;
		overscroll-behavior-x: contain;
		scrollbar-width: none;
	}

	ul::-webkit-scrollbar {
		display: none;
	}

	li {
		flex: none;
		height: 100%;
	}

	li a {
		display: flex;
		align-items: center;
		height: 100%;
		min-width: 44px;
		color: var(--soil);
		font-size: 14px;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		transition: color 150ms;
	}

	li a:hover {
		color: var(--white);
		text-decoration: none;
	}

	li a[aria-current='page'] {
		color: var(--white);
		border-bottom-color: var(--neptune);
	}

	li a:focus-visible {
		outline-offset: -4px;
	}
</style>
