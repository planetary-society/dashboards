<script>
	import { page } from '$app/state';
	import { canonical, SITE_ORIGIN } from '$lib/paths.js';

	let { title, description } = $props();

	const SITE = 'Science Mission Impact';
	const fullTitle = $derived(title === SITE ? `${SITE} | The Planetary Society` : `${title} | ${SITE}`);
	const url = $derived(canonical(page.url.pathname));
	const image = `${SITE_ORIGIN}/img/tps-science-mission-impact-preview.png`;
	const imageAlt = 'NASA science missions as squares, placed at their actual adjusted costs within each division and filled by their share of top-cited papers';
</script>

<svelte:head>
	<title>{fullTitle}</title>
	<meta name="description" content={description} />
	<link rel="canonical" href={url} />
	<meta name="twitter:title" content={fullTitle} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={image} />
	<meta name="twitter:image:alt" content={imageAlt} />
	<meta property="og:title" content={fullTitle} />
	<meta property="og:description" content={description} />
	<meta property="og:image" content={image} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="675" />
	<meta property="og:image:alt" content={imageAlt} />
	<meta property="og:url" content={url} />
</svelte:head>
