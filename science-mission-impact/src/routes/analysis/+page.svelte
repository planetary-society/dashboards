<script>
	import Seo from '$lib/ui/Seo.svelte';
	import EntityHeader from '$lib/ui/EntityHeader.svelte';
	import FailureGrid from '$lib/analysis/FailureGrid.svelte';
	import TimeBars from '$lib/analysis/TimeBars.svelte';
	import RateBoxes from '$lib/analysis/RateBoxes.svelte';
	import EfficiencyHeatmap from '$lib/analysis/EfficiencyHeatmap.svelte';
	import StandoutScatter from '$lib/analysis/StandoutScatter.svelte';
	import ClpsScatter from '$lib/analysis/ClpsScatter.svelte';
	import { tierLabel } from '$lib/analysis/tiers.js';
	import { fullWindowLabel } from '$lib/copy/window.js';
	import { home, methodsHref } from '$lib/paths.js';
	import { apDate, int, listify, moneyWords, pct, spell, upperFirst, weight, years } from '$lib/format.js';
	import { favorsOver, notLinear, rate, scienceOrder, selectionContrast, series, shortestTier, slowestBuild as slowest, smallLowest, tierWords, topUnder } from '$lib/copy/analysis.js';

	// The text is the executive summary "Assessing scientific productivity of NASA's space missions
	// by cost" (Koeppel & Dreier), kept as written wherever the data allows, plus the N_c definitions
	// from its policymaker slides; the summary's methodology lives on the Methods page. Each of the summary's numbers is replaced by its packaged value
	// (site.analysis), and each claim about the record stands only while the gate beside it in
	// $lib/copy/analysis.js holds; the summary's own figures are never typed in here.
	let { data } = $props();
	const site = $derived(data.full);
	const a = $derived(site.analysis);
	const ref = $derived(moneyWords(a.referenceCost));
	// The divisions with the highest and lowest N_c divisor, for the weighted-output panel's "fields cite at different rates".
	const citeRange = $derived.by(() => {
		const byC = [...a.nc.divisions].sort((x, y) => y.c - x.c);
		return { hi: byC[0], lo: byC.at(-1) };
	});

	// Time to science
	const time = $derived(a.time);
	const first = $derived(time.tiers[0]);
	const last = $derived(time.tiers.at(-1));
	const shortest = $derived(shortestTier(time));
	const order = $derived(scienceOrder(time));
	const slowestBuild = $derived(slowest(time));

	// Science impact
	const f = $derived(a.failures);
	const g = $derived(a.groupRates);
	const under = $derived(site.comparison.find((c) => c.key === 'under'));
	const over = $derived(site.comparison.find((c) => c.key === 'over'));
	const lowest = $derived(smallLowest(g));
	const overWins = $derived(favorsOver(site.perDollar));

	// Divisional cost-sensitivity: the division whose small missions did best, the divisions whose
	// small missions hold less than one top-10% paper between them, and every other division's leading tier.
	const eff = $derived(a.efficiency);
	const topSmall = $derived(topUnder(eff));
	const sparse = $derived(eff.divisions.filter((d) => d.best && d.under.missions > 0 && d.under.top10 < 1));
	const others = $derived(eff.divisions.filter((d) => d.best && d !== topSmall && !sparse.includes(d)));
	const missionsIn = (t) => (t.lo === 0 || t.hi == null ? `missions costing ${tierWords(t)}` : `missions in the ${tierWords(t)} range`);
	// "in Earth Science, missions costing more than $1.55B, and in Planetary Science, missions in the …"
	const leaders = $derived(others.map((d) => `${d.name}, ${missionsIn(a.tiers[d.best.tier])}`).join(', and in '));

	// Success at low cost
	const standing = $derived(a.standouts.filter((s) => s.missions.length));
	const without = $derived(a.standouts.filter((s) => s.overMedian != null && !s.missions.length));

	// Selection strategies
	const sel = $derived(a.selection);
	const small = $derived(sel.groups[0]);
	const smallClassified = $derived(small.competed.missions + small.directed.missions);
	const competedShare = $derived(smallClassified ? small.competed.missions / smallClassified : 0);
	const contrast = $derived(selectionContrast(sel));
	// CLPS against earlier surface missions at the same age (site.clps.surface; behind is the packaged gate)
	const surface = $derived(site.clps?.surface);

	const groupTone = ['light', 'mid', 'dark'];
	const groupClusters = $derived(a.groups.map((t, i) => ({
		label: tierLabel(t),
		boxes: [{ key: 'all', tone: groupTone[i] ?? 'dark', spread: g[i], values: a.missions.filter((m) => m.group === i).map((m) => m.rate) }]
	})));
	const SELECTION_LABELS = { directed: 'Directed', competed: 'Competed' };
	const selectionClusters = $derived(a.groups.map((t, i) => ({
		label: tierLabel(t),
		boxes: ['directed', 'competed'].map((key) => ({
			key,
			label: SELECTION_LABELS[key],
			tone: key,
			spread: sel.groups[i][key],
			values: a.missions.filter((m) => m.group === i && m.selection === key).map((m) => m.rate)
		}))
	})));

	// One decimal for the worked N_c example ("about 4.4 papers").
	const papersWorth = (citations, c) => +(1 + citations / c).toFixed(1);

	// The summary's reference list, in its numbering, through the last one this page cites; the
	// methodology's references (9–13) moved with it to the Methods page.
	const references = [
		{ text: 'NASA (2026). A message from Administrator Jared Isaacman.', href: 'https://www.nasa.gov/blogs/workforce-updates/2026/05/22/a-message-from-administrator-jared-isaacman/' },
		{ text: 'NASA Science Mission Directorate. Faster to science: a letter to the science community.', href: 'https://science.nasa.gov/directorates/smd/faster-to-science-a-letter-to-the-science-community' },
		{ text: 'McCurdy, H. E. (2003). Faster, Better, Cheaper: Low-Cost Innovation in the U.S. Space Program.' },
		{ text: 'National Academies Press (2017). Powering Science: NASA’s Large Strategic Science Missions.', href: 'https://doi.org/10.17226/24857' },
		{ text: 'National Academies Press (2023). Origins, Worlds, and Life.', href: 'https://doi.org/10.17226/26522' },
		{ text: 'CHIPS and Science Act, H.R. 4346, 117th Congress (2022).', href: 'https://www.congress.gov/bill/117th-congress/house-bill/4346' },
		{ text: 'Fiore, F., & Elvis, M. (2025). Space Policy, 101713.', href: 'https://doi.org/10.1016/j.spacepol.2025.101713' },
		{ text: 'Kim, M. J. (2025). Acta Astronautica, 232, 633–639.' }
	];

	const sections = [
		['introduction', 'Introduction'],
		['measure', 'Measuring impact'],
		['time', 'Time to science'],
		['impact', 'Science impact'],
		['divisions', 'Divisional cost-sensitivity'],
		['standouts', 'Success at low cost'],
		['selection', 'Selection strategies'],
		['conclusions', 'Maximizing science per dollar'],
		['beyond', 'Beyond science'],
		['references', 'References']
	];

	const description = 'How the science NASA missions return varies with what they cost: time to a first high-impact paper, citation-weighted output per dollar, failure rates, each division’s cost sensitivity, and competed against directed missions.';
</script>

{#snippet cite(numbers)}<sup class="cite">{#each numbers as number, i (number)}{i ? ',' : ''}<a href="#ref-{number}" aria-label="Reference {number}">{number}</a>{/each}</sup>{/snippet}

{#snippet nc(c = 'c')}N<sub>{c}</sub>{/snippet}

<Seo title="Analysis" {description} />

<div class="wrap page">
	<EntityHeader name="Analysis" second={`A. H. D. Koeppel and C. Dreier, The Planetary Society. Data as of ${apDate(site.asOf)}.`}>
		Assessing scientific productivity of NASA’s space missions by cost.
	</EntityHeader>

	<article class="article">
		<section id="introduction" class="row intro">
			<div class="text">
				<h2>Introduction</h2>
				<p>One of the stated goals of the current NASA administration is maximizing science per dollar.{@render cite([1])}
					Another is faster time to science.{@render cite([2])} For decades, NASA has struggled to reduce science mission
					costs and increase project cadence.{@render cite([3])} Despite cost overruns and schedule challenges, the
					National Academies have consistently highlighted the unique value of NASA’s large strategic
					missions.{@render cite([4])} However, the National Academies’ decadal survey{@render cite([5])} and
					congressional statute{@render cite([6])} also state that frequent, low-cost science missions are a cornerstone
					of a balanced program portfolio.</p>
				<p>Programmatic experiments aimed at reducing cost and development time with low-cost missions are underway.
					NASA’s CubeSat, SIMPLEx, and Commercial Lunar Payload Services (CLPS) programs have produced dozens of
					low-cost missions across all science divisions since the late 2000s. Ride shares, commercial hardware, reusable
					components, and in-kind contributions have further driven down costs.{@render cite([7, 8])}</p>
				<p>Recent amendments to NASA’s competitive mission selection process have the stated aim of decreasing
					development and selection time.{@render cite([2])} NASA originally aimed for two New Frontiers competitions
					per decade and Discovery mission launches every two years, but budget uncertainty has stalled
					announcements, producing a 10-year gap for New Frontiers (next selection expected 2027) and a gap of more
					than seven years for Discovery. Meanwhile, development of new directed science missions, such as the Aeolus
					and Skyfall missions to Mars and PROMISE Rover to the Moon, is proceeding quickly.</p>
				<p>The recent uptick in the number of directed and low-cost missions, paired with the changes for competed
					missions, reflects a reprioritization. To prepare for precisely this type of restructuring, the National
					Academies’ 2017 report, <i>Powering Science</i>, recommended NASA develop a publicly accessible database that
					might be used to assess the value of different mission classes.{@render cite([4])} Nearly a decade later,
					NASA has not released such a database.</p>
				<p>To inform current discussions in the mission science community with quantitative evidence, we compiled a
					comprehensive database covering <b>{int(site.missions)} science missions</b> launched since
					{site.launchYears[0]}. We focused on science impact, cost, and time to impactful science. The <a href={home()}>overview</a> gives the short version; this page sets out the analysis.</p>
			</div>
			<nav class="aside toc" aria-label="On this page">
				<p class="meta">On this page</p>
				<ol>
					{#each sections as [id, label] (id)}
						<li><a href="#{id}">{label}</a></li>
					{/each}
				</ol>
			</nav>
		</section>

		<section id="measure" class="row">
			<div class="text">
				<h2>Measuring impact</h2>
				<p>Research community sizes and publication cultures differ across NASA’s five science divisions: Earth
					Science, Planetary Science, Heliophysics, Astrophysics, and Biological and Physical Sciences. Thus, we define
					science impact relative to the body of work retrieved for each division. We define “field-defining”
					publications as those in the top 1% of citation counts for their respective division. “High-impact” works
					are in the top 10%. “Above-average” works are in the top 50%. Each paper’s
					citations count over the {spell(site.fullPolicy.citationYears + 1)} years from its publication; the
					<a href={methodsHref()}>Methods</a> page explains how we gathered the papers, citations and costs.</p>
				<p>Citation thresholds are a common approach to quantifying impact, used by NSF, universities, and others. We
					use them two ways.</p>
			</div>
			<div class="way" role="group" aria-labelledby="ic-way">
				<header class="way-head">
					<p class="way-title" id="ic-way">Breakthrough count</p>
					<p class="formula">
						<span>i<sub>c</sub></span><span>=</span><span>papers with citations &gt; <i>c</i></span>
					</p>
					<p>Credits field-defining results. Each division sets <i>c</i> from its own papers: the citations at its
						top 1%, 10% or 50%. Figure 1 counts top-10% papers.</p>
				</header>
				<figure>
					<table class="by-division">
						<thead>
							<tr>
								<th scope="col">Division</th>
								<th scope="col" class="num">Papers</th>
								<th scope="col" class="num">Top 50%</th>
								<th scope="col" class="num">Top 10%</th>
								<th scope="col" class="num">Top 1%</th>
							</tr>
						</thead>
						<tbody>
							{#each a.nc.divisions as d (d.division)}
								<tr>
									<th scope="row">{d.name}</th>
									<td class="num">{int(d.papers)}</td>
									<td class="num">{int(d.cutoffs['50'])}</td>
									<td class="num">{int(d.cutoffs['10'])}</td>
									<td class="num">{int(d.cutoffs['1'])}</td>
								</tr>
							{/each}
						</tbody>
					</table>
					<figcaption>Table 1. The cutoffs <i>c</i>: the citations a paper needs in its four-year window to reach
						its division’s top 50%, 10% or 1%. The top-50% cutoff is also the {@render nc()} divisor.</figcaption>
				</figure>
			</div>
			<div class="way" role="group" aria-labelledby="nc-way">
				<header class="way-head">
					<p class="way-title" id="nc-way">Weighted output</p>
					<p class="formula">
						<span class="sr-only">N sub c equals papers plus citations divided by c</span>
						<span aria-hidden="true">{@render nc()}</span><span aria-hidden="true">=</span><span aria-hidden="true">papers</span><span aria-hidden="true">+</span><span class="frac" aria-hidden="true"><span>citations</span><span><i>c</i></span></span>
					</p>
					<p>Credits the whole body of work. Each refereed paper counts once, and each of its citations in its
						four-year window adds 1/<i>c</i> of a paper.</p>
				</header>
				<div class="way-body">
					<figure>
						<table class="by-division">
							<thead>
								<tr>
									<th scope="col">Division</th>
									<th scope="col" class="num"><i>c</i></th>
									<th scope="col" class="num">Top 50%</th>
									<th scope="col" class="num">Top 10%</th>
									<th scope="col" class="num">Top 1%</th>
								</tr>
							</thead>
							<tbody>
								{#each a.nc.divisions as d (d.division)}
									<tr>
										<th scope="row">{d.name}</th>
										<td class="num">{int(d.c)}</td>
										<td class="num">{papersWorth(d.cutoffs['50'], d.c)}</td>
										<td class="num">{papersWorth(d.cutoffs['10'], d.c)}</td>
										<td class="num">{papersWorth(d.cutoffs['1'], d.c)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
						<figcaption>Table 2. What one paper at each of Table 1’s cutoffs counts for, 1 + its citations ÷ <i>c</i>,
							with <i>c</i> set to the division’s top-50% cutoff ({@render nc('50')}). An uncited paper counts
							as 1.</figcaption>
					</figure>
					<p>It credits every paper, not only breakouts, and each division’s own <i>c</i> puts fields that cite at
						different rates ({citeRange.hi.c} citations at the line in {citeRange.hi.name}, {citeRange.lo.c} in
						{citeRange.lo.name}) on one scale. Divided by life-cycle cost, it gives the {@render nc('50')} per
						$1M in Figures 2, 5 and 6.</p>
				</div>
			</div>
		</section>

		<section id="time" class="row">
			<div class="text">
				<h2>Time to science</h2>
				<p>Results from past missions show that the relationship between cost and “time to science,” measured from
					start of formulation to the publication date of a mission’s first high-impact paper, is
					{notLinear(time) ? 'not linear' : 'longer for costlier missions'}. (Here each paper is ranked on all its
					citations to date, and failed missions are left out.)
					{#if shortest && shortest.index !== 0 && first.missions > 0}Very low-cost missions can take years to publish a
						highly cited result, largely negating their rapid development advantage: of the {int(first.missions)}
						missions of {tierWords(a.tiers[0])} that didn’t fail, {first.reached ? `only ${spell(first.reached)}` : 'none'}
						{first.reached === 1 ? 'has' : 'have'} one{#if first.formulation.median != null}, after a median
							{years(first.formulation.median)} years{/if}.{/if}
					{#if order}Very expensive missions return high-impact results quickly once operations begin (a median
						{years(last.science.median)} years for those costing {tierWords(a.tiers.at(-1))}, against
						{years(first.science.median)} for missions of {tierWords(a.tiers[0])}; Figure 1){#if slowestBuild}, but face protracted
							development times ({years(last.formulation.median)} years from formulation){/if}.{/if}</p>
				{#if shortest}
					<p>{#if shortest.index === 1}Low-cost ({tierWords(a.tiers[1])}), but not CubeSat-class, missions{:else}Missions
						of {tierWords(a.tiers[shortest.index])}{/if} have historically provided the minimum time to science, with a
						median of {years(shortest.median)} years from formulation to first high-impact
						paper{#if shortest.close}, though missions of {tierWords(a.tiers[shortest.close.index])} were close behind at
							{years(shortest.close.median)}{/if}.{#if time.fastest}{' '}However, no single mission in our evaluation
							set returned a high-impact result in less than {years(time.fastest.years)} years from formulation
							({time.fastest.name}{#if time.fastest.id === 'quikscat'}, a rapid reflight of the NASA Scatterometer
								mission, cut short in 1997 when the Japanese ADEOS satellite carrying it failed{/if}).{/if}</p>
				{/if}
			</div>
			<figure>
				<p class="chart-title">Years to a first top-10% paper</p>
				<TimeBars tiers={a.tiers} time={time} />
				<figcaption>Figure 1. Median time from start of formulation, and from the start of science operations, to a
					mission’s first top-10% most-cited paper, binned by cost.</figcaption>
			</figure>
		</section>

		<section id="impact">
			<div class="row">
				<div class="text">
					<h2>Science impact</h2>
					<p>{#if lowest}The dataset indicates that a portfolio weighted more heavily toward missions costing {ref} or
						less would reduce the volume of high-impact publications (Figure 2).{' '}{/if}The median mission costing {ref} or
						less returned {rate(g[0].median)} {@render nc('50')} per $1M;{#each a.groups.slice(1) as t, i (t.lo)}{' '}for
							missions of {tierWords(t)} the median was {rate(g[i + 1].median)}{i < a.groups.length - 2 ? ';' : '.'}{/each}</p>
				</div>
				<figure>
					<p class="chart-title">{@render nc('50')} per $1M, by cost</p>
					<RateBoxes clusters={groupClusters} />
					<figcaption>Figure 2. Citation-weighted publications ({@render nc('50')}: publications + citations ÷ the
						division’s 50th-percentile citation count) per million dollars spent for small, medium, and large missions.
						Each dot is a mission; those with no output, most of them failures, sit below the break.</figcaption>
				</figure>
			</div>

			<div class="row">
				<div class="text">
					<p>Of the {int(f.under.missions)} analyzed missions costing {ref} or less, {int(f.under.shortfall)} (or
						{pct(f.under.rate)}) have failed or fallen short of their goals due to a technical issue, while{f.over.rate < f.under.rate ? ' only' : ''}
						{pct(f.over.rate)} of all other missions did.{#if f.successPremium > 0}{' '}This means that under historical
							risk postures, in order for low-cost missions to sustain the publication output of larger missions, the
							average successful low-cost mission would have to be about {pct(f.successPremium)} more productive for the
							cost.{/if}{#if under && over && under.top10PerMission < over.top10PerMission}{' '}In fact, the {ref}-or-less
							group averages {weight(under.top10PerMission)} high-impact papers per mission, compared with
							{weight(over.top10PerMission)} for larger missions (in the {spell(site.perDollar.length)} divisions we
							compare).{#if overWins.length * 2 > site.perDollar.length}{' '}Normalized by cost, they are less
								cost-efficient than larger missions at drawing citations in {spell(overWins.length)} of those
								{spell(site.perDollar.length)} divisions.{/if}{/if}</p>
				</div>
				<figure>
					<p class="chart-title">Mission successes and failures</p>
					<FailureGrid tiers={a.tiers} failures={f} divisions={data.site.divisions} />
					<figcaption>Figure 3. Mission successes and failures by NASA science division and cost. A square with one
						slash is a partial failure or partial success; an X is a failure. Below each tier, the share that failed or
						fell short.</figcaption>
				</figure>
			</div>
		</section>

		<section id="divisions" class="row">
			<div class="text">
				<h2>Divisional cost-sensitivity</h2>
				<p>The data also reflect a strong sensitivity of low-cost mission output to division (Figure 4).
					{#if topSmall}{topSmall.name} missions have had more high-impact publication productivity in the {ref}-or-less
						classes than any other division.{/if}
					{#each sparse as d (d.division)}{' '}{d.name} missions costing {ref} or less have
						{d.under.top10 === 0 ? 'not produced any high-impact papers' : 'produced less than one high-impact paper between them'},
						but {missionsIn(a.tiers[d.best.tier])} have produced the greatest return per dollar spent.{/each}
					{#if others.length}{' '}{sparse.length ? 'Likewise, in' : 'In'} {leaders}{others.length > 1 ? ',' : ''} have
						produced the greatest return per dollar spent.{/if}
					</p>
				<p>These differences reflect the varying technical requirements of different science goals. For example, a
					{moneyWords(200)} mission in low Earth orbit and a {moneyWords(200)} mission landed on another planet do not
					belong to a common class that can predict scientific return. These distinctions indicate that a fixed cost cap
					does not carry the same meaning across all of NASA space science.</p>
			</div>
			<figure>
				<p class="chart-title">Efficiency ratio by division and cost</p>
				<EfficiencyHeatmap tiers={a.tiers} efficiency={eff} divisions={data.site.divisions} />
				<figcaption>Figure 4. Different divisions have different cost-to-science thresholds. Each tier’s share of its
					division’s {@render nc('50')}, divided by its share of the division’s spending: above 1×, a tier returned
					more than its share. The outlined cell is each division’s highest; grey cells have no missions.</figcaption>
			</figure>
		</section>

		<section id="standouts" class="row wide">
			<div class="text">
				<h2>Success at low cost</h2>
				{#if standing.length}
					<p>Considering divisional differences, {listify(standing.map((s) => s.name))}
						{standing.length === 1 ? 'has' : 'have each'} produced successful missions at the low end of their division’s
						cost range with a high ratio of high-impact publications to mission cost:
						{series(standing.map((s) => `${listify(s.missions.map((m) => m.name))} in ${s.name}`))}.{#if without.length}{' '}{listify(without.map((s) => s.name))}
							{without.length === 1 ? 'has' : 'have'} none by this measure.{/if}</p>
				{/if}
			</div>
			<div class="text">
				<p>To gain insight into common themes that could inform program strategy for low-cost programs, we interviewed
					PIs and managers from four Heliophysics missions, three Astrophysics missions, two Earth Science missions,
					and one Planetary Science mission. Those conversations revealed three common keys to success:</p>
				<ol class="themes">
					<li>A focused guiding science objective driving development.</li>
					<li>High PI/manager authority with streamlined institutional oversight.</li>
					<li>Post-launch funding for scientific analysis and open data access.</li>
				</ol>
			</div>
			<figure>
				<p class="chart-title">{@render nc('50')} per $1M against cost, by division</p>
				<StandoutScatter missions={a.missions} standouts={a.standouts} divisions={eff.divisions.map(({ division, name }) => ({ division, name }))} referenceCost={a.referenceCost} />
				<figcaption>Figure 5. Each mark is a mission. Rings cost {ref} or less; the named ones beat the median of their
					division’s costlier missions (dashed line). Failures are marked ×; missions with no output sit below the
					break.</figcaption>
			</figure>
		</section>

		<section id="selection">
			<div class="row">
				<div class="text">
					<h2>Selection strategies</h2>
					{#if competedShare > 0.5}
						<p>Most low-cost missions in our set ({int(small.competed.missions)} of the {int(smallClassified)} with a
							recorded selection method), including nine of the 10 captured in interviews, were competed (Figure 6).
							{#if contrast?.higher === 'competed'}Among mid-sized missions ({tierWords(a.groups[contrast.index])}),
								where both types are well represented, competed missions have produced more impactful science output per
								dollar: a median {rate(contrast.competed.median)} {@render nc('50')} per $1M, against
								{rate(contrast.directed.median)} for directed missions.{/if}</p>
					{/if}
				</div>
				<figure>
					<p class="chart-title">Competed and directed missions</p>
					<RateBoxes clusters={selectionClusters} />
					<figcaption>Figure 6. Comparison of competed vs. directed missions. Citation-weighted publications
						({@render nc('50')}) per million dollars spent for small, medium, and large
						missions.{#if sel.unclassified}{' '}{upperFirst(spell(sel.unclassified))} {sel.unclassified === 1 ? 'mission' : 'missions'}
							with no recorded selection method {sel.unclassified === 1 ? 'is' : 'are'} left out.{/if}</figcaption>
				</figure>
			</div>

			{#if surface}
				<div class="row">
					<div class="text">
						<p>CLPS missions are too immature to include in the main analysis{#if surface.behind?.total}, but as of
							{apDate(site.asOf)}, they have collectively produced fewer publications{surface.behind.perDollar ? ', in total and per dollar,' : ''}
							than any other successful surface mission at the same point after the start of prime operations{:else};
							Figure 7 compares their output so far with other surface missions at the same point after the start of
							prime operations{/if}{#if surface.behind?.total}{' '}(Figure 7){/if}.</p>
					</div>
					<figure>
						<p class="chart-title">CLPS and other planetary surface missions</p>
						<ClpsScatter clps={site.clps} />
						<figcaption>Figure 7. Publication volume {spell(surface.month)} months after the start of prime mission
							divided by cost for planetary surface missions: refereed papers per $1B of life-cycle cost. CLPS counts all {spell(site.clps.missions.length)} landers from the first launch; each lander’s own
							mark is its papers to date.</figcaption>
					</figure>
				</div>
			{/if}
		</section>

		<section id="conclusions" class="row">
			<div class="text">
				<h2>Maximizing science per dollar</h2>
				{#if lowest && contrast?.higher === 'competed'}
					<p>Our results do not support investing in more directed and low-cost missions purely as a means of reducing
						the cost of science. Among the most efficient missions in terms of high-impact publications per dollar have
						been competed mid-to-large missions (e.g., Discovery, New Frontiers, MIDEX, Earth System Science
						Pathfinder). Given the outsized success of these missions, accepting more risk in the mid-to-large tiers may
						yield cost savings.</p>
				{/if}
			</div>
		</section>

		<section id="beyond" class="row">
			<div class="text">
				<h2>Beyond science</h2>
				<p>The cases for missions of different sizes extend beyond cost alone. Small missions broaden participation,
					train early-career researchers on flight hardware and testing, build institutional capacity, and mature
					affordable technologies that other missions and industry later adopt. Large strategic missions develop
					radically new technologies, access domains once thought impossible to investigate, sustain entire fields for
					decades, and offer high-profile opportunities for international visibility and collaboration. These factors
					should each be weighed alongside science when gauging the value of a new program.</p>
			</div>
		</section>

		<section id="references" class="row">
			<div class="text">
				<h2>References</h2>
				<ol class="references">
					{#each references as r, i (r.text)}
						<li id="ref-{i + 1}">
							<span class="number">{i + 1}.</span>
							{#if r.href}<a href={r.href}>{r.text}</a>{:else}{r.text}{/if}
						</li>
					{/each}
				</ol>
			</div>
		</section>
	</article>
</div>

<style>
	/* Two columns: the text, and beside it the figure it discusses, which stays in view while the text
	   scrolls past (only where the screen is tall enough to show all of it). Text-only rows keep to
	   the text column, so the reading line never moves. The standouts row is the exception: its text
	   sits in both columns and its scatter runs the full width beneath. Below 900px it is one column,
	   each figure after its text. */
	.article {
		padding-bottom: 96px;
	}

	.row {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr);
		column-gap: clamp(40px, 5vw, 80px);
		align-items: start;
	}

	section,
	section > .row + .row {
		margin-top: 80px;
	}

	.text {
		grid-column: 1;
		font-size: 17px;
		line-height: 1.75;
	}

	.row > figure,
	.aside {
		grid-column: 2;
		grid-row: 1;
	}

	@media (min-height: 760px) {
		.row > figure,
		.aside {
			position: sticky;
			top: calc(var(--nav-h) + 32px);
		}
	}

	.wide > .text + .text {
		grid-column: 2;
		grid-row: 1;
		/* level with the first paragraph beside it, below the heading */
		padding-top: 52px;
	}

	.wide > figure {
		grid-column: 1 / -1;
		grid-row: 2;
		position: static;
		margin-top: 40px;
	}

	h2 {
		font-size: 26px;
		font-weight: 400;
		line-height: 1.35;
		margin-bottom: 16px;
	}

	p + p,
	p + ol {
		margin-top: 18px;
	}

	b {
		font-weight: 500;
	}

	sub {
		font-size: 0.72em;
		line-height: 0;
	}

	.cite {
		font-size: 0.68em;
		line-height: 0;
		margin-left: 1px;
	}

	/* The two measures, side by side under the measuring text: matching highlighted panels (Neptune
	   left rule, as the site's other panels), each headed by its name, its formula set large and what
	   it credits. Each panel is a two-row subgrid (head, body), so the heads end level and the panels
	   share a height. They don't stick; the text they follow is above, not beside them. */
	.row > .way {
		grid-column: 1;
		grid-row: 2 / span 2;
		display: grid;
		grid-template-rows: subgrid;
		/* lets the chart shrink with the panel instead of holding its last width */
		grid-template-columns: minmax(0, 1fr);
		margin-top: 40px;
		padding: 20px 22px 22px;
		background: var(--panel);
		border-left: 2px solid var(--neptune);
		font-size: 14px;
		line-height: 1.6;
		color: var(--dust);
	}

	.row > .way + .way {
		grid-column: 2;
	}

	.way-head {
		margin-bottom: 20px;
		padding-bottom: 16px;
		border-bottom: 1px solid var(--shadow);
	}

	.way-head > * + *,
	.way-body > * + * {
		margin-top: 12px;
	}

	.way-title {
		font-weight: 500;
		color: var(--white);
	}

	/* the two by-division tables, ruled like the site's other tables (MeasureTable) */
	.by-division {
		width: 100%;
		border-collapse: collapse;
		font-variant-numeric: tabular-nums;
	}

	.by-division th,
	.by-division td {
		padding: 8px 0;
		border-bottom: 1px solid var(--shadow);
		text-align: left;
		font-weight: 400;
		vertical-align: baseline;
	}

	.by-division thead th {
		font-size: 12px;
		line-height: 1.4;
	}

	.by-division tbody th,
	.by-division td {
		color: var(--white);
	}

	.by-division .num {
		text-align: right;
		padding-left: 12px;
		white-space: nowrap;
	}

	.formula {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.4em;
		/* tall enough for the stacked fraction, so both panels' formulas sit level */
		min-height: 2.2em;
		margin: 12px 0 16px;
		font-size: clamp(20px, 2.1vw, 26px);
		font-weight: 300;
		line-height: 1.2;
		color: var(--white);
	}

	.frac {
		display: inline-flex;
		flex-direction: column;
		align-items: center;
		font-size: 0.8em;
		line-height: 1.2;
	}

	.frac > span:first-child {
		padding: 0 0.15em 0.1em;
		border-bottom: 1.5px solid currentColor;
	}

	.frac > span + span {
		padding-top: 0.1em;
	}

	.toc {
		padding-top: 52px;
	}

	.toc ol {
		margin-top: 10px;
		border-left: 1px solid var(--shadow);
		padding-left: 18px;
		font-size: 14px;
		line-height: 2;
	}

	.chart-title {
		font-weight: 500;
		font-size: 15px;
		line-height: 22px;
		margin-bottom: 12px;
	}

	figcaption {
		margin-top: 12px;
		font-size: 13px;
		line-height: 1.55;
		color: var(--dust);
	}

	.themes {
		list-style: decimal;
		padding-left: 1.4em;
	}

	.themes li + li {
		margin-top: 8px;
	}

	.references {
		font-size: 14px;
		line-height: 1.6;
		color: var(--dust);
	}

	.references li {
		display: flex;
		gap: 10px;
		scroll-margin-top: calc(var(--nav-h) + 24px);
	}

	.references li + li {
		margin-top: 12px;
	}

	.references .number {
		flex: none;
		min-width: 1.6em;
		color: var(--soil);
	}

	@media (max-width: 900px) {
		.row {
			grid-template-columns: minmax(0, 1fr);
		}

		.text {
			max-width: 680px;
		}

		.row > figure,
		.aside,
		.wide > .text + .text,
		.wide > figure {
			grid-column: 1;
			grid-row: auto;
			position: static;
			margin-top: 28px;
			padding-top: 0;
		}

		/* the two measures stack, keeping their panel padding; no subgrid to line up */
		.row > .way,
		.row > .way + .way {
			display: block;
			grid-column: 1;
			grid-row: auto;
			margin-top: 28px;
		}

		/* the contents come first on one column, before the introduction */
		.intro .toc {
			grid-row: 1;
			margin: 0 0 32px;
		}

		.toc ol {
			display: flex;
			flex-wrap: wrap;
			gap: 4px 20px;
			border-left: 0;
			padding-left: 0;
			line-height: 1.6;
		}
	}

	@media (max-width: 600px) {
		.text {
			font-size: 16px;
			line-height: 1.7;
		}

		section,
		section > .row + .row {
			margin-top: 56px;
		}

		h2 {
			font-size: 22px;
		}
	}
</style>
