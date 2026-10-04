<script>
	import { fullWindowLabel, windowLabel } from '$lib/copy/window.js';
	import Seo from '$lib/ui/Seo.svelte';
	import EntityHeader from '$lib/ui/EntityHeader.svelte';
	import { int, longDate, money, listify, spell } from '$lib/format.js';

	let { data } = $props();
	const site = $derived(data.full);
	const policy = $derived(site.windowPolicy);
	const fullPolicy = $derived(site.fullPolicy);
	const grace = $derived(policy.maturityGraceMonths ?? 0);
	const revisions = $derived(site.codeRevision?.split('+').filter(Boolean).map((r) => r.slice(0, 7)) ?? []);
	const threshold = $derived(money(site.story.referenceCost));
	// Organization contact, as in docs/shared/js/constants.js CONTACT.
	const CONTACT_EMAIL = 'casey.dreier@planetary.org';
	const furtherReading = [
		{
			title: 'Space science & the space economy',
			authors: 'Fiore, F., & Elvis, M.', year: 2026,
			publication: 'Space Policy, 75, 101713', href: 'https://doi.org/10.1016/j.spacepol.2025.101713'
		},
		{
			title: 'A Measure of Total Research Impact Independent of Time and Discipline',
			authors: 'Pepe, A., & Kurtz, M. J.', year: 2012,
			publication: 'PLOS ONE, 7(11), e46428', href: 'https://doi.org/10.1371/journal.pone.0046428'
		},
		{
			title: 'Assessing your Observatory’s Impact: Best Practices in Establishing and Maintaining Observatory Bibliographies',
			authors: 'D’Abrusco, R., et al.', year: 2024,
			publication: 'The Open Journal of Astrophysics, 7', href: 'https://doi.org/10.33232/001c.124452'
		},
		{
			title: 'Computing and Using Metrics in the ADS',
			authors: 'Henneken, E. A., et al.', year: 2014,
			publication: 'arXiv:1406.4542', href: 'https://arxiv.org/abs/1406.4542'
		},
		{
			title: 'Lessons from a High-Impact Observatory: The Hubble Space Telescope’s Science Productivity between 1998 and 2008',
			authors: 'Apai, D., et al.', year: 2010,
			publication: 'Publications of the Astronomical Society of the Pacific, 122(893), 808–826', href: 'https://doi.org/10.1086/654851'
		},
		{
			title: 'On the calculation of percentile-based bibliometric indicators',
			authors: 'Waltman, L., & Schreiber, M.', year: 2013,
			publication: 'Journal of the American Society for Information Science and Technology, 64(2), 372–379', href: 'https://doi.org/10.1002/asi.22775'
		},
		{
			title: 'ESA Science Programme Missions: Contributions and Exploitation — ESA Mission Publications',
			authors: 'De Marchi, G., & Parmar, A. N.', year: 2024,
			publication: 'arXiv:2402.12818', href: 'https://arxiv.org/abs/2402.12818'
		},
		{
			title: 'Bibliometrics: The Leiden Manifesto for research metrics',
			authors: 'Hicks, D., Wouters, P., Waltman, L., de Rijcke, S., & Rafols, I.', year: 2015,
			publication: 'Nature, 520, 429–431', href: 'https://doi.org/10.1038/520429a'
		}
	];
	const description = 'How we select NASA science missions, find tracked publications, compare citations, and account for mission cost and time.';
	// Adapted from Koeppel & Dreier in-draft paper.
	// sections 2–3 and the appendix. Current definitions checked against upstream
	// docs/CORPUS_STATS.md, docs/metrics.md and the packaged snapshot, not draft totals.
</script>

<Seo title="Methods" {description} />

<div class="wrap page">
	<EntityHeader name="Methods" second={`Data as of ${longDate(site.asOf)}.`}>
		How we compare mission costs with tracked publications and citations.
	</EntityHeader>

	<div class="body">
		<section id="challenges">
			<h2>The challenges of bibliometrics for space science missions</h2>
			<p>Space is hard, as the saying goes. So is measuring a space mission’s scientific output.</p>
			<p>There is no perfect collection of science publications associated with a mission; there are
				only degrees of correctness. Large missions, like the Hubble Space Telescope, dedicate staff
				time to identifying science papers and distinguishing results from engineering descriptions
				and speculative work. A <a href="https://arxiv.org/abs/2402.12818">European team studying ESA’s
				space science missions</a> describes a transition from manual review to machine learning and
				natural language processing, with scientists still validating the selections. Such assessments
				can require access to the full text of large numbers of publications, often shielded by paywalls.</p>
			<p>Exactly how one defines “science” varies, and many judgment calls are required. For this study,
				we used a simpler approach also used in many peer-reviewed publications, such as
				<a href="https://doi.org/10.1016/j.spacepol.2025.101713">Fiore &amp; Elvis (2026)</a>: querying
				NASA’s Astrophysics Data System (ADS)/SciXplorer database by mission name and the names of its
				primary instruments. ADS is the leading repository of space science publication and citation
				references. This approach assesses the signal of a mission within the abstract literature,
				using publications as a proxy for scientific productivity and citations to those publications
				as a proxy for impact.</p>
			<p>We tailor each query to filter out obvious false positives from name or acronym collisions:
				TRACE, for example, is both a space mission and a very common word. We also compared our query
				outcomes to the managed collections of several missions with hand-curated publication sets. They
				generally agree within 10%–25% of publication records, with a single exception, GALEX, differing
				by a wide amount due to the pattern of not reporting the mission name in many abstracts. Since we’re
				primarily comparing mission costs across orders of magnitude, this is well within acceptable limits.
				We tested our outcomes with curated mission collections and found the overall comparative outcomes
				remained consistent.</p>
			<p>Our aim is to identify broad patterns in the research associated with these missions. We call
				these records “tracked publications” to make their scope clear: they capture the papers we found,
				while leaving room for omissions and corrections.</p>
		</section>

		<section id="missions">
			<h2>What we included</h2>
			<p>This dataset contains <b>{int(site.missions)}</b> projects primarily built and funded by
				NASA’s science directorate, launched from
				{site.launchYears[0]} to {site.launchYears[1]}, spanning {spell(site.divisions.length)} divisions.
				It focuses on US-led, free-flying missions with mature publication windows. The default
				comparison allows papers the publication year and {spell(fullPolicy.citationYears)} following
				calendar years to accrue citations.</p>
			<p>Comparisons stay within each division. Research communities differ in size, publishing practices,
				and citation rates, so a higher count in one field does not mean its science is more valuable.</p>
		</section>

		<section id="mission-papers">
			<h2>Tracked publications</h2>
			<p><b>Tracked publications are the peer-reviewed research papers we found for each mission.</b>
				They are not necessarily its full publication record. The snapshot contains
				{int(site.papersDistinct)} distinct tracked publications across the study.</p>
			<p>We use mission-specific searches in NASA’s Astrophysics Data System (ADS), now available through
				<a href="https://scixplorer.org/">SciX</a>. Searches look for mission and instrument names in titles,
				abstracts, and keywords, with topic restrictions to distinguish ambiguous acronyms. Mission
				bibliographies help identify omissions; additions and exclusions are reviewed individually.</p>
			<p> This approach will miss papers that use mission data without naming the source in those fields.
				A name match alone also does not establish that a paper used the data. In essence, we are measuring the signal strength of a mission's name in the ADS's abstract fields.</p>
			<h3 id="removed">What we exclude</h3>
			<p>We have general exclusions for non-refereed material, conference proceedings, news articles, and records for
				datasets or catalogs.</p>
			<h3 id="start">When tracking begins</h3>
			<p>Queries are time-bound by the first full month after prime science operations start, or launch
				date if no prime mission start is published. This reduces pre-launch and overview material; it does not eliminate
				every false match. For missions with long cruises or flyby results, we include results published
				before the prime mission start.</p>
		</section>

		<section id="windows">
			<h2>Comparison windows</h2>
			<p>Older papers have had more time to collect citations. Windowed comparisons give each paper
				a defined citation period, while lifetime totals show the accumulated record.</p>
			<h3 id="full-window">{fullWindowLabel}</h3>
			<p>The default comparison covers publications from a mission’s operating life and allows
				{spell(fullPolicy.postEndYears)} years after mission end for results to appear. Each paper’s
				citations count from its publication year through the {spell(fullPolicy.citationYears)} calendar
				years that follow. A window counts as mature {spell(grace)} months before its last citation year
				ends, so the most recent papers’ final citation year is counted only through the as-of date (at
				least {spell(12 - grace)} of its twelve months), and their counts can still grow slightly. A
				mission still operating, or one that ended too recently, is cut at the latest window end that is
				mature on the as-of date{#if fullPolicy.minWindowYears}; a cut window shorter than
				{spell(fullPolicy.minWindowYears)} years is not scored{/if}.</p>
			<h3 id="early-window">{windowLabel(policy)}</h3>
			<p>This comparison follows the prime phase, with {spell(policy.postPrimeYears)} years after prime mission
				end for results to appear. Its length varies by mission.</p>
			<h3>Lifetime</h3>
			<p>All tracked publications and their reported citations to date.</p>
		</section>

		<section id="cost">
			<h2>Mission costs</h2>
			<p>Costs come from the NASA's reported life-cycle costs at launch. We include documented partner
				contributions where available. These generally cover development, payloads, launch, and prime
				operations. Values are adjusted to <b>{site.costBaseYear} dollars</b> using NASA’s
				<a href="https://www.nasa.gov/wp-content/uploads/2024/11/nnsi-faqs-2024.pdf">New Start Inflation Index</a>.
		</section>

		<section id="citing">
			<h2>Corrections</h2>
			<p>If you find a missing or misattributed paper, a wrong date or cost, or any other error, write to
				<a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Mission pages list the query and every
				tracked publication, which makes a specific correction easy to check.</p>
		</section>

		<section id="image-credits">
			<h2>Image credits</h2>
			<p>NASA/ESA.</p>
		</section>

		<section id="further-reading">
			<h2>Further reading</h2>
			<ul class="reading">
				{#each furtherReading as reference (reference.href)}
					<li>
						<a href={reference.href}>{reference.title}</a>
						<p>{reference.authors} ({reference.year}). <i>{reference.publication}</i>.</p>
					</li>
				{/each}
			</ul>
		</section>
	</div>
</div>

<style>
	.body { max-width: 68ch; font-size: 16px; line-height: 1.8; }
	section { margin-top: 56px; }
	h2 { font-size: 24px; font-weight: 400; line-height: 1.4; margin-bottom: 16px; }
	h3 { font-size: 17px; font-weight: 500; margin: 24px 0 8px; }
	p + p { margin-top: 16px; }
	dl { margin-top: 16px; }
	dt { margin-top: 16px; color: var(--white); }
	dd { margin-top: 4px; overflow-wrap: anywhere; }
	.reading li + li { margin-top: 24px; }
	.reading p { margin-top: 4px; color: var(--dust); font-size: 14px; }
	@media (max-width: 600px) {
		section { margin-top: 40px; }
	}
</style>
