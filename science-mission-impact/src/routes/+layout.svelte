<script>
	import '../app.css';
	import { afterNavigate } from '$app/navigation';
	import Nav from '$lib/ui/Nav.svelte';
	import Footer from '$lib/ui/Footer.svelte';
	import { redirectLegacyScope } from '$lib/state/view.svelte.js';

	let { data, children } = $props();

	afterNavigate(redirectLegacyScope);
</script>

<a class="skip" href="#main">Skip to content</a>
<Nav divisions={data.site.divisions} />
<main id="main">
	{@render children()}
</main>
<Footer site={data.site} />
