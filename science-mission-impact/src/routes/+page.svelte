<script>
	import Story from '$lib/scrolly/Story.svelte';
	import Seo from '$lib/ui/Seo.svelte';
	import { divisionHref } from '$lib/paths.js';
	import { int, money, yearSpan } from '$lib/format.js';

	let { data } = $props();
	// Divisions, adjusted dollar year and window policy come from the layout.
	const site = $derived({ ...data.site, ...data.facts });
	const bandOf = $derived(new Map(site.story.bands.map((b) => [b.division, b])));
	const description = $derived(`Explore ${int(site.missions)} NASA-led science missions and ${int(site.papersDistinct)} tracked peer-reviewed publications by actual mission cost, within each science division.`);
</script>

<Seo title="Science Mission Impact" {description} />

<h1 class="sr-only">Science Mission Impact: how does science impact and productivity scale with cost?</h1>
<a class="skip" href="#divisions">Skip to divisions</a>

<Story {site} scrolly={data.scrolly} />

<div class="wrap">
	<section id="divisions" class="doors" aria-labelledby="divisions-title">
		<h2 id="divisions-title">Explore Data for Each Division</h2>
		<ul>
			{#each site.divisions as d (d.slug)}
				<li>
					<a href={divisionHref(d.slug)}>
						<span class="name">{d.name}</span>
						<span class="fact">
							<b>{int(d.missions)}</b> missions, <b>{int(d.papers)}</b> tracked publications, <b>{int(d.citations)}</b> citations{#if d.publicationYears}, published {yearSpan(d.publicationYears)}{/if}
						</span>
						{#if bandOf.get(d.slug)?.p25 != null}
							{@const b = bandOf.get(d.slug)}
							<span class="fact">Counting its missions from cheapest to costliest, the middle half of its top-10% papers came from missions costing <b>{money(b.p25)}</b> to <b>{money(b.p75)}</b>.</span>
						{/if}
					</a>
				</li>
			{/each}
		</ul>
	</section>
</div>

<style>
	.doors {
		margin-top: 160px;
	}

	/* the story ends here and the reader takes over: a heading a size above the division names */
	.doors h2 {
		margin-bottom: 40px;
		font-weight: 400;
		font-size: clamp(38px, 6vw, 76px);
		line-height: 1.05;
		letter-spacing: -0.03em;
	}

	.doors li {
		border-top: 1px solid var(--shadow);
	}

	.doors a {
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
		gap: 24px;
		align-items: baseline;
		padding: 28px 0 32px;
		color: var(--white);
	}

	.doors a:hover {
		text-decoration: none;
	}

	.name {
		font-weight: 300;
		font-size: clamp(30px, 4.4vw, 56px);
		line-height: 1.08;
		letter-spacing: -0.025em;
		text-decoration: underline transparent 2px;
		text-underline-offset: 8px;
		transition: text-decoration-color 150ms;
	}

	.doors a:hover .name {
		text-decoration-color: var(--neptune);
	}

	.doors .fact {
		font-size: 16px;
		line-height: 24px;
	}

	@media (max-width: 720px) {
		.doors a {
			grid-template-columns: minmax(0, 1fr);
			gap: 8px;
		}
	}
</style>
