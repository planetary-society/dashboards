<script>
	import '../app.css';
	import { onMount } from 'svelte';
	import { afterNavigate } from '$app/navigation';
	import Nav from '$lib/ui/Nav.svelte';
	import Footer from '$lib/ui/Footer.svelte';
	import { readUrl, writeUrl } from '$lib/state/view.svelte.js';

	let { data, children } = $props();

	onMount(readUrl);
	afterNavigate(({ type }) => {
		if (type !== 'enter') writeUrl();
	});
</script>

<a class="skip" href="#main">Skip to content</a>
<Nav divisions={data.site.divisions} />
<main id="main">
	{@render children()}
</main>
<Footer site={data.site} />
