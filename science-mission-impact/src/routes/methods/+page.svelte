<script>
	import { fullWindowLabel } from '$lib/copy/window.js';
	import Seo from '$lib/ui/Seo.svelte';
	import EntityHeader from '$lib/ui/EntityHeader.svelte';
	import { int, longDate, money, listify, spell } from '$lib/format.js';
	import { analysisHref } from '$lib/paths.js';

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
			title: 'ESA Mission Publications and Their Impact',
			authors: 'De Marchi, G., & Parmar, A. N.', year: 2024,
			publication: 'In ESA Science Programme Missions: Contributions and Exploitation, ISSI Scientific Report Series. Springer Nature Switzerland', href: 'https://doi.org/10.1007/978-3-031-69004-4'
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
				and speculative work. A <a href="https://doi.org/10.1007/978-3-031-69004-4">European team studying ESA’s
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
			<p>This dataset contains data related to <b>{int(site.missions)}</b> projects built or funded by
				NASA’s science directorate between
				{site.launchYears[0]} to {site.launchYears[1]},  spanning all {spell(data.site.divisions.length)} divisions.</p>
				<p>The default
				comparison allows papers the publication year and {spell(fullPolicy.citationYears)} following
				calendar years to accrue citations.</p>
			<p>Comparisons stay within each division. Research communities differ in size, publishing practices,
				and citation rates, so a higher count in one field does not mean its science is more valuable.</p>
		</section>

		<section id="mission-papers">
			<h2>Tracked publications</h2>
			<p>The publications we tracked are the peer-reviewed research papers associated with each mission using a set of keywords in their abstract, title, and keywords via NASA's <a href="https://scixplorer.org/">Science Explorer digital library</a> (SciX). Publications are time-gated by the start of mission operations and continue through the full mission's lifetime, plus two years to accomodate general publication times.</p>
			<p>Our SciX queries use mission and major instrument names along with topic restrictions to distinguish ambiguous acronyms. The query for each mission is listed in the mission's overview page.</p>
			<p> This approach will miss papers that use mission data without naming the source in those fields.
				A name match alone also does not establish that a paper used the data.</p><p>In essence, we are measuring the signal strength of a mission's name in the SciX abstract fields. That is a common approach to bibliometrics, though more complex approaches are possible (see <a href="https://doi.org/10.1007/978-3-031-69004-4">De Marchi, G., & Parmar, A. N., 2024)</a>.</p>
			<h3 id="removed" class="subhead">What we exclude</h3>
			<p>We have general exclusions for non-refereed material, conference proceedings, news articles, and records for
				datasets or data catalogs. We have mission-by-mission exclusions based on known false positives reviewed with AI and human oversight.</p>
		</section>

		<section id="windows">
			<h2>Citation comparison windows</h2>
			<p>Older papers have had more time to collect citations, which would artificially inflate their metrics compared to more recent ones. To account for this, all metrics in this dashboard (except for the explicit lifetime metrics) use windowed citation counts of {spell(fullPolicy.citationYears)} years, inclusive, from the publish date of each paper.</p>
			<p>This means that missions launched after the full citation comparison window are not included in this study. A
				mission still operating limits publications to those have were published within this citation window.</p>
		</section>

		<section id="cost">
			<h2>Mission costs</h2>
			<p>Costs come from the NASA's reported life-cycle costs at launch. We include documented partner
				contributions where available. These generally cover development, payloads, launch, and prime
				operations. Values are adjusted to <b>{site.costBaseYear} dollars</b> using NASA’s
				<a href="https://www.nasa.gov/wp-content/uploads/2024/11/nnsi-faqs-2024.pdf">New Start Inflation Index</a>.</p>
		</section>

		<section id="running-averages">
			<h2>Running averages</h2>
			<p>The citations-per-dollar charts on the overview and division pages show a running average. Each mission’s
				rate is its windowed citations per {money(100)} of its cost, and a mission that failed or published nothing
				counts as zero. At each cost, we average the rates of missions within a factor of 10 of that cost, weighting
				the closest missions most heavily. We only draw the average where at least three missions contribute.</p>
			<p>The shaded band is a 95% range from resampling the missions. To compare small and larger missions, we
				average the rates on each side of {threshold} and only say one side did better when the 95% range of the
				difference excludes zero and the result holds with any single mission left out.</p>
		</section>

		<section id="nc">
			<h2>Citation-weighted output (N<sub>50</sub>)</h2>
			<p>Our <a href={analysisHref()}>analysis</a> uses both threshold counts to determine high-impact papers and a citation-weighted count, defined as: N<sub>c</sub> = papers + citations ÷ c, where c is a citation
				cutoff. We set c to each division’s top-50% cutoff in the {fullWindowLabel} and call the result
				N<sub>50</sub>. Because each division has its
				own c, N<sub>50</sub> normalizes outputs across different divisions.</p>
		</section>


		<section id="ai">
			<h2>How we used AI in this project</h2>
			<p>AI was used extensively in this project to help write and review code, to refine and improve our SciX queries, and to identify papers for exclusion based on our internal criteria. According to Planetary Society policy, AI was not used write our analysis: that was led by the authors. All AI-driven query suggestions and exclusions were reviewed by humans as well. Our public facing text is written by the authors using AI for copyediting. Some descriptive, functional text such as tool-tips on this dashboard are AI-generated.</p>
		</section>

		<section id="citing">
			<h2>Corrections</h2>
			<p>If you find a missing or misattributed paper, a wrong date or cost, or any other error, write to
				<a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.</p>
		</section>
		<section id="thanks">
			<h2>Special Thanks</h2>
			<p>The authors wish to acknowledge the staff and services of NASA's Science Explorer Digital Library, who provided feedback on early drafts of this project and increased API access to build out our datasets. We are grateful for their work and the data provided by this service.</p>
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
	h3 { margin-top: 24px; }
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
