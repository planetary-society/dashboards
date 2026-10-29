<script>
	import Story from '$lib/scrolly/Story.svelte';
	import Seo from '$lib/ui/Seo.svelte';
	import { analysisHref, divisionHref } from '$lib/paths.js';
	import { int, yearSpan } from '$lib/format.js';

	let { data } = $props();
	// Divisions, adjusted dollar year and window policy come from the layout.
	const site = $derived({ ...data.site, ...data.facts });
	const description = $derived(`Explore ${int(site.missions)} NASA-led science missions and ${int(site.papersDistinct)} tracked peer-reviewed publications by actual mission cost, within each science division.`);
</script>

<Seo title="Science Mission Impact" {description} />

<h1 class="sr-only">Science Mission Impact: how does science impact and productivity scale with cost?</h1>
<a class="skip" href="#divisions">Skip to divisions</a>

<Story {site} scrolly={data.scrolly} />

<div class="wrap">
	<section id="divisions" class="doors" aria-labelledby="divisions-title">
		<h2 id="divisions-title">Explore each division’s data</h2>
		<p class="fact deeper">For failure rates, time to science and output per dollar in more depth, read the <a href={analysisHref()}>full analysis</a>.</p>
		<ul>
			{#each site.divisions as d (d.slug)}
				<li>
					<a href={divisionHref(d.slug)}>
						<span class="name">{d.name}</span>
						<span class="fact">
							<b>{int(d.missions)}</b> missions, <b>{int(d.papers)}</b> tracked publications{#if d.publicationYears}{' '}({yearSpan(d.publicationYears)}){/if}, <b>{int(d.citations)}</b> citations
						</span>
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

	.doors .deeper {
		margin: -16px 0 40px;
	}

	.doors li {
		border-top: 1px solid var(--shadow);
	}

	/* the division cards' links only: the inline link in .deeper stays a plain link */
	.doors li > a {
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
		gap: 24px;
		align-items: baseline;
		padding: 28px 0 32px;
		color: var(--white);
	}

	.doors li > a:hover {
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
		.doors li > a {
			grid-template-columns: minmax(0, 1fr);
			gap: 8px;
		}
	}
</style>
