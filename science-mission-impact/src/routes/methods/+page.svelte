<script>
	import { fullWindowLabel, windowLabel } from '$lib/copy/window.js';
	import Seo from '$lib/ui/Seo.svelte';
	import EntityHeader from '$lib/ui/EntityHeader.svelte';
	import { apDate, int, moneyWords, listify, pct, spell } from '$lib/format.js';
	import { allSmall } from '$lib/copy/discussion.js';

	let { data } = $props();
	const site = $derived(data.full);
	const policy = $derived(site.windowPolicy);
	const fullPolicy = $derived(site.fullPolicy);
	const grace = $derived(policy.maturityGraceMonths ?? 0);
	const revisions = $derived(site.codeRevision?.split('+').filter(Boolean).map((r) => r.slice(0, 7)) ?? []);
	const story = $derived(site.story);
	const ref = $derived(moneyWords(story.referenceCost));
	const failure = $derived(story.failure);
	const range = (side) => `${pct(side.interval[0])} and ${pct(side.interval[1])}`;
	const apart = $derived(failure.under.interval && failure.over.interval && failure.under.interval[0] > failure.over.interval[1]);
	const under = $derived(story.comparison.groups.find((g) => g.key === 'under'));
	const over = $derived(story.comparison.groups.find((g) => g.key === 'over'));
	const unranked = $derived(story.divisions.filter((d) => d.share == null && allSmall(d)));
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
	<EntityHeader name="Methods" second={`Data as of ${apDate(site.asOf)}.`}>
		How we compare mission costs with tracked publications and citations.
	</EntityHeader>

	<div class="body">
		<section id="challenges">
			<h2>Why it’s hard to count a mission’s science</h2>
			<p>Space is hard, as the saying goes. So is measuring a space mission’s scientific output.</p>
			<p>No list of a mission’s science publications is perfect; some are just more complete than others.
				Large missions, like the Hubble Space Telescope, assign staff to identify science papers and
				separate results from engineering descriptions and speculative work. A
				<a href="https://arxiv.org/abs/2402.12818">team studying the European Space Agency’s science
				missions</a> describes a move from manual review to machine learning and natural language
				processing, with scientists still checking the selections. Reviews like these can require the
				full text of many papers, often behind paywalls.</p>
			<p>What counts as “science” varies, and it takes many judgment calls. We used a simpler approach, one
				used in many peer-reviewed studies such as
				<a href="https://doi.org/10.1016/j.spacepol.2025.101713">Fiore and Elvis (2026)</a>: we searched
				NASA’s Astrophysics Data System (ADS), the leading database of space science papers and citations,
				for each mission’s name and the names of its main instruments. Publications stand in for
				scientific productivity, and citations to them stand in for impact.</p>
			<p>We tailor each search to weed out obvious false matches from shared names and acronyms: TRACE,
				for example, is both a space mission and a very common word. We also checked our results against
				the hand-curated publication lists that several missions keep. They generally agree within 10% to
				25%. The one exception is GALEX, which differs widely because many papers don’t name the mission
				in their abstracts. Since we’re comparing mission costs that differ by orders of magnitude, that is
				well within acceptable limits, and rerunning our comparisons with the curated lists gave the same
				overall results.</p>
			<p>We’re looking for broad patterns, not a perfect count. That’s why we call these records “tracked
				publications”: they are the papers we found, and the list may have gaps.</p>
		</section>

		<section id="missions">
			<h2>What we included</h2>
			<p>The study covers <b>{int(site.missions)}</b> missions, launched from {site.launchYears[0]} to
				{site.launchYears[1]}, that NASA’s science directorate primarily built and funded, across
				{spell(data.site.divisions.length)} of its divisions. It focuses on U.S.-led, free-flying missions whose
				publication records are complete enough to compare. By default, each paper collects citations over
				its publication year and the {spell(fullPolicy.citationYears)} calendar years after.</p>
			<h3 id="selection">When a mission joins the study</h3>
			<p>A mission joins once its record has matured. Its prime mission has to be over, and
				{spell(policy.postPrimeYears)} more years must pass for its results to reach print. Then the last of
				those papers need their own citation window: the year each appeared and the
				{spell(policy.citationYears)} calendar years after it. We admit a mission {spell(grace)} months before
				that final year closes. A mission lost with no papers joins {spell(policy.postPrimeYears)} years after
				it ended, since it has no citations to wait for.</p>
			<p>That rule leaves out recent missions for now, including OSIRIS-REx, DART, the James Webb Space
				Telescope, Mars 2020, and Parker Solar Probe. Each will join as its record matures. Entry depends on
				the prime mission, not the {fullWindowLabel}, so missions whose prime missions ended only recently,
				such as OSIRIS-REx, Mars 2020, and Parker Solar Probe, have to wait.</p>
			<p>Comparisons stay within each division. Research communities differ in size, publishing practices,
				and citation rates, so a higher count in one field does not mean its science is more valuable.</p>
			{#if unranked.length}
				<h3 id="not-compared">Why {listify(unranked.map((d) => d.name))} {unranked.length === 1 ? 'isn’t' : 'aren’t'} compared</h3>
				{#each unranked as d (d.division)}
					<p>All {spell(d.missions)} of its missions cost {ref} or less, so there are no costlier missions to
						compare them with. They count in the study’s mission totals and failure figures, but not in the
						cost comparisons.</p>
				{/each}
			{/if}
			<h3 id="recency">Small missions are newer</h3>
			<p>In the compared divisions, half the missions at {ref} or less launched in {under.launchMedian} or
				later; half the costlier ones launched by {over.launchMedian}. Giving every paper the same citation
				window accounts for how long it has had to collect citations, but the two groups still come from
				different eras of NASA’s science program.</p>
		</section>

		<section id="threshold">
			<h2>The {ref} line</h2>
			<p>We split missions at {ref} in {site.costBaseYear} dollars, counting a mission at exactly that cost
				as small. It is an editorial line, chosen to set apart the very small missions NASA is now leaning on.
				It is not a threshold found in the data, and nothing here says what a mission should cost.</p>
			<p>Most of the groups we compare hold few missions. When a division has only a handful of small
				missions, one of them can move the group’s numbers, which is why each division page names the missions its figures
				rest on.</p>
		</section>

		<section id="failures">
			<h2>Failures and partial outcomes</h2>
			<p>We count a mission as having failed or fallen short when our records list it as a
				{listify(failure.statuses.map((s) => s.toLowerCase()), 'or')}. A failure counts as zero output in
				every comparison; a partial failure or partial success counts whatever it published.</p>
			<p>Across all divisions, {spell(failure.under.failed)} of the {int(failure.under.missions)} missions at
				{ref} or less failed or fell short, {failure.under.lost ? spell(failure.under.lost) : 'none'} of them
				lost outright. Of the {int(failure.over.missions)} costlier missions,
				{failure.over.failed ? spell(failure.over.failed) : 'none'} did.
				{#if failure.under.interval && failure.over.interval}Allowing for chance in groups this size (a 95%
				Wilson interval), the underlying rate plausibly lies between {range(failure.under)} for the small
				missions and between {range(failure.over)} for the costlier ones{#if apart}; the two ranges don’t
				overlap{/if}.{/if}</p>
			<p>Within a single division the counts are too small to compare rates this way, so division pages give
				counts, not percentages.</p>
		</section>

		<section id="citations">
			<h2>What citations measure, and what they don’t</h2>
			<p>A citation shows that other scientists used a result. It doesn’t measure a mission’s value to the
				public, the technology it proved, or the people it trained. The
				<a href="https://doi.org/10.1038/520429a">Leiden Manifesto</a> for research metrics makes the same
				point: numbers should support judgment, not replace it.</p>
			<p>A top-10% paper is one of the 10% most cited of all its division’s papers in the selected window,
				every publication year ranked together. Fields cite at different rates, so each paper is ranked only
				against papers from its own division. In the two windowed views, every paper’s citations are counted over the same
				span of years, so an older paper has no head start; in the Lifetime view it does, and older papers
				fill more of the top 10%. Papers tied at the cutoff share the last places, so a division’s top 10%
				is exactly a tenth of its papers. Papers that describe a mission or its instruments count like any
				other; for a mission with few papers they can hold much of its citation count.</p>
		</section>

		<section id="mission-papers">
			<h2>Tracked publications</h2>
			<p><b>Tracked publications are the peer-reviewed research papers we found for each mission.</b>
				They are not necessarily its full publication record. The study includes
				{int(site.papersDistinct)} distinct tracked publications.</p>
			<p>We use mission-specific searches in NASA’s Astrophysics Data System (ADS), now available through
				<a href="https://scixplorer.org/">SciX</a>. Searches look for mission and instrument names in titles,
				abstracts, and keywords, with topic restrictions to distinguish ambiguous acronyms. Mission
				bibliographies help identify omissions, and we review each addition and exclusion individually.</p>
			<p>This approach misses papers that use a mission’s data without naming it in those fields, and a
				name match alone doesn’t show that a paper used the data. In effect, we measure how strongly a
				mission’s name shows up in paper titles, abstracts, and keywords.</p>
			<h3 id="removed">What we exclude</h3>
			<p>We exclude non-refereed material, conference proceedings, news articles, and records for datasets
				or catalogs.</p>
			<h3 id="start">When tracking begins</h3>
			<p>Searches start with the first full month after prime science operations begin, or at launch if no
				start date is published. That cuts down on prelaunch and overview papers, though it doesn’t weed
				out every false match. For missions with long cruises or flyby results, we also include results
				published before the prime mission began.</p>
		</section>

		<section id="windows">
			<h2>Comparison windows</h2>
			<p>Older papers have had more time to collect citations. The two windows give every paper the same
				citation period; lifetime totals show everything to date.</p>
			<h3 id="full-window">{fullWindowLabel}</h3>
			<p>The default comparison covers publications from a mission’s operating life and allows
				{spell(fullPolicy.postEndYears)} years after mission end for results to appear. Each paper’s
				citations count from its publication year through the {spell(fullPolicy.citationYears)} calendar
				years that follow. A window counts as mature {spell(grace)} months before its last citation year
				ends, so the most recent papers’ final citation year is counted only through the as-of date (at
				least {spell(12 - grace)} of its 12 months), and their counts can still grow slightly. For a
				mission still operating, or one that ended too recently, the window stops at the latest date that
				has matured{#if fullPolicy.minWindowYears}; a window cut to less than
				{spell(fullPolicy.minWindowYears)} years isn’t scored{/if}.</p>
			<h3 id="early-window">{windowLabel(policy)}</h3>
			<p>This comparison follows the prime phase, with {spell(policy.postPrimeYears)} years after prime mission
				end for results to appear. Its length varies by mission.</p>
			<h3>Lifetime</h3>
			<p>All tracked publications and their reported citations to date.</p>
		</section>

		<section id="cost">
			<h2>Mission costs</h2>
			<p>Costs come from NASA’s reported life-cycle costs at launch. We include documented partner
				contributions where available. These costs generally cover development, payloads, launch, and prime
				operations. Values are adjusted to <b>{site.costBaseYear} dollars</b> using NASA’s
				<a href="https://www.nasa.gov/wp-content/uploads/2024/11/nnsi-faqs-2024.pdf">New Start Inflation Index</a>.</p>
			<h3 id="cost-coverage">Costs and citations cover different spans</h3>
			<p>Costs stop at the end of prime operations, while the default comparison counts papers from a
				mission’s whole operating life, extended missions included. That is deliberate: much of a mission’s
				longevity is paid for up front, in how it is designed and built. Extended-operations costs may be
				added in a later version.</p>
			<h3 id="per-dollar">Citations per dollar</h3>
			<p>To get citations per {moneyWords(100)}, we divide each group’s citations in the {fullWindowLabel} by
				its total cost. We say one side leads only when it stays ahead with any single mission left out.
				Otherwise, we name the mission the result rests on, or say neither side clearly leads.</p>
		</section>

		<section id="citing">
			<h2>Corrections</h2>
			<p>If you find a missing or misattributed paper, a wrong date or cost, or any other error, write to
				<a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Mission pages list the query and every
				tracked publication, which makes a specific correction easy to check.</p>
		</section>

		<section id="image-credits">
			<h2>Image credits</h2>
			<p>NASA/ESA. Overview photo of IM-1’s Odysseus lander: Intuitive Machines.</p>
		</section>

		<section id="further-reading">
			<h2>Further reading</h2>
			<ul class="reading">
				{#each furtherReading as reference (reference.href)}
					<li>
						<a href={reference.href}>{reference.title}</a>
						<p>{reference.authors} ({reference.year}). {reference.publication}.</p>
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
