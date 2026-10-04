<script>
	// A missing page or a failed load. The nav and footer come from the layout.
	import { page } from '$app/state';
	import { home, methodsHref } from '$lib/paths.js';

	const missing = $derived(page.status === 404);
	const heading = $derived(missing ? 'Page not found' : 'Something went wrong');
</script>

<svelte:head>
	<title>{heading} | Science Mission Impact</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="wrap error">
	<p class="meta">Error {page.status}</p>
	<h1 class="page-name">{heading}</h1>
	<p class="fact">
		{missing
			? 'There is no page at this address; the mission or division may have been renamed.'
			: 'This page could not be loaded. Try again, or start from the overview.'}
	</p>
	<p class="links">
		<a href={home()}>Overview</a>
		<a href={methodsHref()}>Methods</a>
	</p>
</div>

<style>
	.error {
		padding-top: clamp(40px, 7vw, 88px);
		padding-bottom: 88px;
	}

	.page-name {
		margin-top: 12px;
	}

	.fact {
		margin-top: 16px;
		max-width: 62ch;
	}

	.links {
		display: flex;
		gap: 28px;
		margin-top: 24px;
	}

	.links a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: var(--neptune-mid);
	}

	.links a:hover {
		color: var(--white);
		text-decoration: underline;
	}
</style>
