# Science Mission Impact: content and presentation audit

Reviewed 2026-10-22 against the live site (data as of the current build: 139 missions) and the Google Slides deck, slides 1–27. No code or data was changed.

**How it was reviewed:** four reviewers each read the site and deck as one audience:

- a congressional appropriations staffer;
- a TPS member reading on a phone;
- a NASA-funded planetary scientist who knows bibliometrics;
- a science-policy journalist.

A fifth pass collected research and practitioner guidance on narrative visualization, risk communication and responsible bibliometrics. Screenshots of every story step (desktop and phone) and two division pages were taken from the live site. Every figure quoted below was checked against `src/lib/data/generated/`. Figures marked *(not packaged)* were computed for this review and must go through the packager before any copy uses them.

## Verdict

All four audiences understood and accepted the core argument: below $150M, missions produced far fewer highly cited papers each and failed more often. All four also hit the same trust breakers:

- the per-dollar step contradicts its own chart;
- two different publication totals appear two screens apart;
- "top-10% paper" is used before it is explained;
- the time-to-science claim depends on which clock you choose;
- the site and the deck do not reconcile.

The staffer said the last one alone would make them dismiss the work. The fixes are mostly cuts and merges, plus a short primer, a handful of new packaged facts, and prose on the division pages.

## 1. Fix first: things that cost trust today

1. **Step 10 (per dollar) says the opposite of its data.**
   - The copy is hard-coded: "very low cost missions… can keep pace… excellent value". The packaged `perDollar` facts say:

     | Division | ≤$150M, citations per $100M | >$150M | Packaged verdict |
     | --- | --- | --- | --- |
     | Astrophysics | 213 | 3,695 | favors costlier |
     | Earth | 275 | 1,951 | favors costlier |
     | Planetary | 275 | 423 | favors costlier |
     | Heliophysics | 2,312 | 1,647 | null; flips without TRACE |

   - That breaks the CLAUDE.md rule that copy says "favor" only from `favors`. It is also the opposite of deck slide 17 ("Cost efficiency increases above $150M"). All four reviewers flagged it independently, and the journalist's headline was "its own chart contradicts that".
   - Replacement copy, which can be gated on `favors`/`flipsOn` exactly as the close is: "Per dollar, costlier missions drew more citations in astrophysics, Earth science and planetary science. Heliophysics is the exception, and it rests on one mission, TRACE: without it, costlier missions lead there too." Section 2 proposes folding this step into another chart.
2. **The site and the deck must reconcile before both circulate.**

   | Figure | Site | Deck |
   | --- | --- | --- |
   | Missions | 139 (Earth 40, Helio 32) | 141 (slide 8: Earth 41, Helio 33); slide 12's legend sums to 186 |
   | Missions ≤$150M | 45 | 47 (slides 17–18) |
   | Shortfall rate ≤$150M | 31% (14 of 45) | slide 12's bins imply about 27% (19 of 71) |
   | Time-to-science gap | about 3× (quartiles, from science start) | about 11× (slide 14: six bins, from prime start); slide 13 uses a third clock (formulation) |
   | Planetary top-10% papers | 1,096 | 1,220 (slides 15–16) |
   | Planetary top-1% cutoff | 97 | 100 (slide 9) |
   | CLPS comparators | month 32 (Pathfinder 67) | labels show month 36 (Pathfinder 72, DART 146, Phoenix 107) beside CLPS at month 32 |
   | Publication window | science start to 2 years after mission end | "through the lifetime of the mission" (slide 6) |
   | Impact measure | top-10% papers | N₅₀ weighted output (slides 17–21) |

   **Why the mission counts differ** (traced 2026-10-22). The selection code did not change; three things did.
   - **The dashboard is stale.** It was packaged from the 2026-10-04 `dist/fixed` (139 missions).
   - **The upstream rerun on 2026-10-19/20 picked up three mission-sheet edits:**
     - GRIFEX gained its prime-end and mission-end dates, so it now qualifies.
     - CURIE changed from "Extended Mission" to "Failure", ended 2024-07-16, and now enters under the exception for failures with no papers.
     - HETE 1's cost rose from $55.0M to $68.0M, or $158.6M adjusted, which crosses the $150M line. HETE 2's rose to $183.5M adjusted.
   - **`d3/data` is a byte-identical copy of the rerun** (141 missions). Slide 8 matches it.
   - **Slide 12 deliberately uses `dist/latest`** (186 missions, no maturity selection; `plot_focused_paper.py`). It therefore includes JWST, Europa Clipper and the CLPS landers.
   - **Slides 17–18 (47 / 59 / 35) match neither run.** The current split is 46 / 60 / 35. The deck's figures fit GRIFEX and CURIE added with HETE 1 still at its old cost, a combination no committed chart CSV contains.

   Refreshing the dashboard (`just smi-refresh`) should give 141 missions, 46 at or under $150M, and failures of about 14 of 46 against 8 of 95. Those failure counts are an estimate, since HETE 1 is a failure.

   Further deck problems:
   - Slide 13's title says "3–4 years", but its bars run 2.5–5.9 years.
   - Slide 16 puts Heliophysics' "steepest return" at $1.0–1.5B, while slide 21 puts its best ratio at $50–150M.
   - The "small mission" line moves between $100M, $150M and $350M across the speaker notes.
3. **One publication total.**
   - Step 3 says 146,833 publications (distinct papers, to date). Step 5 says 135,221 (mission–paper pairs in the Active Mission Window).
   - Every reviewer read this as an error. Removing the waffle (section 2) removes the second number.
4. **Division pages mix scopes without saying so.**
   - The header shows lifetime totals: Planetary 15,729 papers and 585,067 citations. Key measures, directly below, show the Active Mission Window: 10,910 and 153,653.
   - "Most cited paper" is a lifetime count (AIA, 4,694), while the list beneath ranks the same paper at 877, its in-window count.
   - Either label each figure with its scope or make the header follow the scope switch.
5. **Data questions to settle upstream:**
   - WISE (Astrophysics) and NEOWISE (Planetary) both carry $484.2M, so one spacecraft is costed twice.
   - **OSIRIS-REx and DART are left out by design, but neither the site nor the deck says why.**
     - The site's dataset (`dist/fixed`) is built with `--mature-only`. A mission enters only once its prime-window citations are complete: papers through 2 years after the prime mission ends, then citations through the fourth calendar year of the last papers (year Y through Y+3). Upstream lets a mission in 3 months before that last year closes.
     - OSIRIS-REx's prime mission ended 2023-10-01, so it qualifies on 2028-10-01. DART's ended 2022-09-26, so it qualifies on 2027-10-01. Both are in `dist/latest`, which is why DART can appear on slide 23.
     - The same rule leaves out Mars 2020 and Parker Solar Probe.
     - Slide 8's "started science operations by 2022" is not the actual rule. State the real one on slide 8 and on the methods page, which today says only "mature publication windows".
     - **A decision for you:** selection uses the prime window, but the site's default scope is the Active Mission Window. Four left-out missions already have a complete Active window: OSIRIS-REx, Mars 2020, Parker Solar Probe and CUTE. Selecting on the Active window would admit them. Keeping the prime-window rule is defensible, but say so.
6. **Phone checks:**
   - The failure step's thumbnails are too small to read at 390px, and the "Biological & Physical Sciences" label collides with the divider.
   - The per-dollar panels are unreadable on a phone.
   - Two reviewers saw the motivation step's photo with no text in view. This may be a capture artifact; check on a real device.

## 2. Simplifying the overview (question 1)

The story uses about ten unrelated graphics: title, photo, grid, skyline, threshold grid, waffle, bar pairs, failure grid, scatter, per-dollar panels, and CLPS lines. Each needs its own legend and reading instructions. The research is consistent on this:

- Readers follow sequences that change one thing per step on a stable visual unit (Hullman et al. 2013).
- Segmenting a lesson helps only when each segment carries one idea (Rey et al. 2019 meta-analysis).
- A graphic that needs its own legend and caveat, and that no other step reuses, belongs on a detail page.

**Proposal: one cost axis as the spine of the story.** The existing `costLayout`/`perDollarLayout` already places missions in four division lanes along a shared log-cost x-axis. Keep that axis fixed from the threshold step through time-to-science, and change one thing per step.

| # | Step | Graphic | Replaces |
| --- | --- | --- | --- |
| 0 | Title | as now | — |
| 1 | Why now | photo, as now | — |
| 2 | 139 missions, 146,833 papers | grid → skyline (one number) | OVERVIEW + CORPUS |
| 3 | What a paper and a citation are | citation histogram for one division | new (question 4) |
| 4 | What "top-10%" means, and what we don't measure | same histogram, cutoff marked | new (question 4) |
| 5 | Every mission by cost; who sits under $150M | squares on the cost axis, $150M line | THRESHOLD |
| 6 | Failures | same axis, failures marked | FAILURE grid |
| 7–9 | Top-10% papers: per mission, then running total | build-up, section 3 | waffle, COMPARE bars |
| 10 | All four divisions: three shares each | four lanes with running totals | COMPARE, DOLLAR |
| 11 | Time to science | rising-curve chart, section 6 | scatter |
| 12–13 | CLPS | as now, with the deck's caveats | — |
| 14 | Close | one step | CLOSE + CLOSE_LIMITS |

Net effect: the waffle, the bar pairs, the scatter and the per-dollar panels go. Their facts survive in the three-shares step or move to division pages. The step count stays similar, but distinct graphic types drop from about ten to five (grid/skyline, primer, cost axis, time, CLPS), and the cost axis carries five consecutive steps.

**The three-shares step answers the strongest rebuttal before an opponent does.** The staffer and journalist each raised it independently: missions at or under $150M are about 1.3% of total cost and produced 0.98% of mission papers, which is close to parity. Showing each division's small-mission share of missions, of spending and of top-10% papers keeps every comparison within a division and stays honest:

| Division | Share of missions | Share of spending *(not packaged)* | Share of top-10% papers (`story.divisions[].share`) |
| --- | --- | --- | --- |
| Astrophysics | 24% (6/25) | 1.3% | 0.02% |
| Earth | 30% (12/40) | 0.4% | 0.05% |
| Heliophysics | 47% (15/32) | 5.0% | 10.2% (TRACE holds about two-thirds) |
| Planetary | 19% (7/37) | 1.0% | 0.9% |

The table shows both "far fewer per mission" (19% of missions, 0.9% of papers) and the per-dollar picture in one metric, so step 10 can go.

**Judgement call for you:** Planetary is close to parity per dollar. That is true and quotable either way, and it is better said by TPS than by a critic.

Further cuts:
- Drop "up to 134 citations": a maximum with no reference point.
- Drop "significantly" in the comparison: no test was run.
- State why there are four divisions, not five: Biological & Physical Sciences has no mission over $150M.
- **Keep the skyline.** The TPS member said it was where they were hooked; the staffer would cut it. It costs one step and carries the dataset number.

## 3. Build-up steps (question 2)

Use build-ups for the running-total chart. Research supports this:

- Introducing parts before the whole helped in 13 of 16 tests (Mayer & Pilegard 2014).
- Walkthroughs pay off mainly for unfamiliar charts (Stoiber et al. 2022), and a running total on a log axis is unfamiliar to three of the four audiences.
- Morphing from a familiar to an unfamiliar chart improved understanding (Ruchikachorn & Mueller 2015).
- Hold the axes fixed while layers change (Heer & Robertson 2007).

Running total, walked through one division, then all four:

1. **Every mission as a square on the cost axis**, failures marked (carried over from step 6). Copy: "Cheaper missions on the left. Each gridline is ten times the cost of the one before."
2. **Each square rises to its own count of top-10% papers** (a stem, as in the skyline). Copy names the exceptions the packaged facts support, e.g. TRACE in Heliophysics.
3. **The stems stack into a running total, drawn left to right as the reader scrolls.** This reuses the `clpsDraw`-style scrub. Copy: "Reading left to right, the line counts every top-10% paper from missions up to that cost."
4. **The $150M line labelled with that division's three shares.** Then step 10 shows all four lanes.

Retire the deck's "area of steepest return" shading. On a cumulative count it marks where the big missions sit, not value per dollar; in Astrophysics it is Hubble alone. The staffer, scientist and journalist all read it as a value claim. If a band is wanted, use the packaged middle-half `bands`, labelled "half of this division's top-10% papers came from missions costing $X–$Y".

Add one line to the copy: a flat stretch can simply mean few missions were flown at that price.

Use **Planetary** as the walk-through division, as the deck does; add `storyCurveDivision` to `smi.config.json`, alongside `storyTimingDivision`. CLPS already uses a two-state build (CLPS line, then comparators), and every reviewer followed it.

## 4. Failure rates (question 3)

Guidance from risk communication:

- Use counts over a shared denominator rather than "1 in X" (Trevena et al. 2013).
- Icon arrays counter denominator neglect when group sizes differ, here 45 against 94 (Garcia-Retamero et al. 2010).
- Use absolute rates, not "four times as likely".
- Round away false precision: 7.4% from 7 of 94 is over-precise.
- State uncertainty in words, which barely lowers trust (van der Bles et al. 2020). Error bars are often misread.

Recommendations:

- **Headline in counts:** "14 of the 45 missions at $150M or less failed or fell short, against 7 of the 94 costlier ones: about 31% against 7%."
- **Add the uncertainty in words.** The pooled 95% ranges are about 20–46% and 4–15% *(not packaged; Wilson intervals)*. They do not overlap, so the pooled gap holds.
  - No single division passes that test: Planetary's 4 of 7 spans 25–84%.
  - So division rows show counts only, never percentages and never "every division".
- **Mark outright losses differently from partial outcomes** (an X versus a half-filled square). Define "partial success" in the caption. Counting partial successes as failures is the first thing a NASA-friendly reader will dispute.
- **Say that failed missions count as zero** in the output comparisons that follow.
- **Say where the losses sit**, if packaged: most losses at or under $150M were CubeSats and rideshare missions, and Class D missions accept that risk by design.
  - This needs a size-class or risk-class field; the mission `type` field has no "CubeSat" value.
- **Overview:** keep two groups to match the $150M line used everywhere else. The scientist and staffer would split out the missions under $50M as the deck does; that is reasonable, but it would make $150M one of two lines on one step only. Put that split on the division pages instead.
- **Division pages:** that division's missions on the cost axis, losses marked, "k of n" each side.
- **Deck slide 12:** too much for the lay reviewers (six bins, five division colours, hatching, two directions). Simplify to one bar per bracket labelled "k of n" with losses and partial outcomes distinguished, and keep the division colours for a backup slide.

## 5. What publications and citations are (question 4)

Every reviewer asked for this. The TPS member needed it most; the scientist wanted the deck's "what we don't measure" list with it. Put it before the first chart that depends on it. Today "top-10%" first appears at step 7 undefined.

Use the deck's slide 9 histogram, showing only the top-10% cutoff and dropping the N꜀/i꜀ formula boxes (all four reviewers said so). That needs a new packaged per-division citation histogram, a small addition to the packager.

Draft copy, written to fit a 390px phone:

> **Step 3.** Scientists report what a mission found in peer-reviewed papers: articles checked by other experts before they are published. When later research builds on a paper, it cites it. We counted each mission's papers, and the citations each paper drew in its first four years.

> **Step 4.** Fields cite at different rates, so each paper is ranked only against papers from its own division and era. A top-10% paper drew more citations than nine in ten of those; in planetary science, that took about 31. Citations show how much other scientists used a result. They do not measure its value to the public, the technology it proved, or the people it trained.

Notes for the copy:

- **"About 31"** is the Planetary Active-window top-10% cutoff, a pooled figure. Era-adjusted cutoffs vary by era, so bind the number to a packaged fact and keep "about".
- **Leiden Manifesto principles 1, 2 and 6 apply here:**
  - pair each metric with a concrete case;
  - measure against each mission's purpose;
  - normalize by field.
  The within-division, same-era percentile already satisfies principle 6; say why it is fair.
- **Put the societal-benefit examples on division pages.** Each division page can carry one example from slides 10–11 (space-weather forecasting for Heliophysics, the NEO catalog for Planetary, drought monitoring for Earth, imaging sensors for Astrophysics), reviewed by you. They are hand-picked and need editorial sign-off, which suits a curated `divisions.js` entry better than the data-bound story.

## 6. Time to science (question 5)

This is the step reviewers trusted least. The current claim, "slower for lower cost missions… about three times as long", has three problems:

1. **It depends on the clock.**
   - From science start, cheaper missions take longer.
   - From formulation start, the cheapest third of missions that reached a top-10% paper got there sooner in every division (packaged `timing.byCostThird`):

     | Division | Cheapest third | Costliest third |
     | --- | --- | --- |
     | Astrophysics | 6.8 yr | 12.0 yr |
     | Earth | 5.9 yr | 11.4 yr |
     | Heliophysics | 5.0 yr | 7.8 yr |
     | Planetary | 5.7 yr | 9.0 yr |

     They are built faster.
   - Slide 13 makes this point; the site hides it. The journalist would lead with the discrepancy.
2. **It drops the missions that never got there.** Of the 40 ranked missions at or under $150M, 29 have no top-10% paper; above the line, 7 of 94 have none. Survivorship biases both the scatter and the medians (Pocock, Clayton & Altman 2002).
3. **"The cheapest missions" here is a quartile from $2M to $277M**, not the $150M group used in every other step. The best-fit line rests on about five points under $30M.

**Recommendation for the overview:** one rising-curve chart.

- **Title:** "Share of missions with a top-10% paper, by years since science began."
- **Lines:** two, one for missions at or under $150M and one for costlier missions.
- **What the reader sees:**
  - Costlier missions climb steeply and most get there.
  - Small missions climb slowly and level off low.
  - The gap under each line is the "never reached" count, labelled "k of n".
- **Why this form:**
  - It shows speed and survivorship on one clock.
  - A rising "share that have reached" frame reads better for lay audiences than a falling one (Armstrong et al. 2002).
- **Censoring:** keep recent missions in as "not yet", end each line where few missions remain, and put the time horizon in the title (Zikmund-Fisher et al. 2005).

Then one sentence for the other clock, from packaged build-time medians:

> Cheaper missions reach space sooner. Once operating, fewer of them produce a highly cited paper, and those that do take longer.

This reconciles slides 13 and 14 instead of choosing between them. Drop the best-fit line.

**Division pages:** use the same curve per division, with the ≤$150M side's n shown, in place of the scatter. Add a prose line from `byCostThird` covering both clocks.

The TPS member and staffer preferred simple bars of median months by cost group, each with a "+k never reached" label. That is the fallback if the curve proves too unfamiliar. Either way, use the $150M groups, not quartiles.

## 7. Division pages: move the discussion there

Today each division page has one intro line and charts with titles but no interpretation. Research on explorable dashboards is clear on three points:

- An author-led opening does not by itself make readers explore well afterwards (Boy et al. 2015), so each page needs its own reading guide.
- Readers prefer heavily annotated charts, and statistical or comparative text yields more takeaways than encoding text (Stokes et al. 2022).
- Titles drive what people remember (Kong et al. 2018), so use a takeaway title only when the data support it.

**A template for every division page:**

1. **Bottom line (three or four sentences, at the top).** It covers:
   - the division's mission count and who sits at or under $150M (by name and era);
   - the three shares;
   - failures as "k of n" each side;
   - the one mission that drives the small side, with what happens without it (`perDollar.flipsOn`, `comparison.largest`).
2. **Why this field costs what it does.** One line from slide 22, curated in `src/lib/copy/divisions.js`.
3. **Each chart gets three short lines:**
   - **How to read:** one sentence on the encoding.
   - **What it shows:** with n, and naming the missions the text depends on, highlighted in the chart.
   - **Keep in mind:**
     - small n;
     - $150M is an editorial line;
     - missing ≠ zero;
     - instrument-description papers are counted;
     - costs stop at prime operations while citations include extended missions. This is deliberate, because a mission's longevity is paid for in its cost; say so in a sentence.
4. **Moved from the overview:**
   - the per-dollar comparison, with the corrected copy and a "without TRACE" note where `flipsOn` applies;
   - the division's failure rows;
   - the formulation-clock timing.
5. **One societal-benefit example** (slides 10–11), curated.
6. **Biological & Physical Sciences** says plainly why it is not compared: all five missions cost under $150M.

**Example bottom line for Planetary Science.** The 19% and 1.0% shares are not packaged yet; the other figures are packaged.

> Seven of Planetary Science's 37 missions cost $150M or less. Four were lost (DS-2, Lunar IceCube, NEA Scout and Q-PACE), and MarCO, which relayed InSight's landing, has no top-10% paper. The two that succeeded as science missions, Lunar Prospector ($131M) and LCROSS ($139M), produced highly cited work on lunar polar water. Together the seven make up 19% of the division's missions, 1.0% of its spending and 0.9% of its top-10% papers. In the running total below, the line stays nearly flat until missions of about $450M, then climbs with Discovery, New Frontiers and flagship missions; Cassini alone contributed 175.

**Implementation shape:**

- `src/routes/[division]/+page.server.js` passes the division's slice of `site.story`:
  - `failure.byDivision`
  - `comparison.byDivision`
  - `bands`
  - `timing`
  - `perDollar`
  - `divisions`

  None of these reaches division pages today; the layout passes only a few site fields.
- A `src/lib/copy/discussion.js` builds each sentence gated on those facts, the same way `Story.svelte` gates its claims, so a data refresh can never leave stale prose.
- The packager stays the only producer of numbers.

## 8. New packaged facts the above needs

All of these belong in `buildDiscussion` (`scripts/lib/public.mjs`) or the division docs, with tests:

- **Per division:** the share of missions and the share of spending at or under $150M. `costTotal` and `share` already exist in `story.divisions`; add the division cost total and mission count.
- **Failures:**
  - outright losses separately from partial outcomes;
  - Wilson 95% intervals for the pooled rates;
  - a size or risk class, if "mostly CubeSats" is to be said.
- **Per division:** a citation histogram (in-window, binned) for the primer, plus the top-10% cutoff to quote.
- **Time to science, by the $150M sides:**
  - the cumulative share reaching a first top-10% paper by year since science start, with censoring;
  - "never reached" and "not yet" counts;
  - median build years.
- **Robustness:** a drop-one check on the three-shares per-dollar reading, matching the `favors`/`flipsOn` rule, before any copy says "ahead" or "behind".

## 9. Where the audiences agreed and differed

| Point | Staffer | Member | Scientist | Journalist |
| --- | --- | --- | --- | --- |
| Step 10 contradicts its chart | yes | yes | yes | yes |
| Two publication totals confuse | yes | yes | yes | yes |
| Needs a primer on papers and citations | yes | yes, most of all | yes, with limits | yes |
| Show "never reached" in time to science | yes | yes | yes | yes |
| Deck and site must reconcile | dealbreaker | noticed | yes | yes |
| Time chart form | bars by group | bars by group | cumulative curve | two clocks |
| Split under $50M | yes | no | yes | for failures |
| Keep the skyline | cut | keep | neutral | cut the repeated grids |
| Retire "area of steepest return" | yes | — | yes | yes |

The scientist added referee points that aren't presentation fixes but would strengthen the work:

- **Medians alongside means:** the median top-10% credit is 0 at or under $150M against 49.7 above, so the flagships drive the averages.
- **A recency check:** the median launch year is 2018 at or under $150M and 2003 above, so repeat the comparison for missions launched since 2010.
- **Instrument papers:** rerun without instrument-description papers. Nine of Heliophysics' ten most-cited papers are mission or instrument papers.

## Sources

- Hullman et al. 2013, *A Deeper Understanding of Sequence in Narrative Visualization* — https://mucollective.northwestern.edu/files/2013-StorySequence-InfoVis.pdf
- Rey et al. 2019, *A meta-analysis of the segmenting effect* — https://doi.org/10.1007/s10648-018-9456-4
- Segel & Heer 2010, *Narrative Visualization* — https://idl.uw.edu/papers/narrative
- Boy et al. 2015, *Storytelling in Information Visualizations: Does it Engage Users to Explore Data?* — https://hal-imt.archives-ouvertes.fr/hal-01133595
- Heer & Robertson 2007, *Animated Transitions in Statistical Data Graphics* — https://idl.uw.edu/papers/animated-transitions
- Ruchikachorn & Mueller 2015, *Learning Visualizations by Analogy* — https://www3.cs.stonybrook.edu/~mueller/research/pages/visAnalogies
- Stoiber et al. 2022, onboarding comparisons — https://jku-vds-lab.at/publications/2022_visinf_compare_evaluations_onboarding/
- Stokes et al. 2022, *Striking a Balance* — https://www.tableau.com/research/publications/striking-balance-reader-takeaways-and-preferences-when-integrating-text-and
- Kong, Liu & Karahalios 2018, chart titles and slant — https://mail.zcliu.cs.umd.edu/vistitles/CHI18-VisTitles.pdf
- Trevena et al. 2013, risk communication principles — https://pmc.ncbi.nlm.nih.gov/articles/PMC4045391
- Garcia-Retamero, Galesic & Gigerenzer 2010, icon arrays and denominator neglect — https://journals.sagepub.com/doi/10.1177/0272989X10369000
- van der Bles et al. 2020, uncertainty and trust (PNAS) — https://research.rug.nl/en/publications/the-effects-of-communicating-uncertainty-on-public-trust-in-facts/
- Pocock, Clayton & Altman 2002, survival plots (Lancet) — https://doi.org/10.1016/S0140-6736(02)08594-X
- Armstrong et al. 2002, survival vs mortality framing — https://ideas.repec.org/a/sae/medema/v22y2002i1p76-83.html
- Zikmund-Fisher et al. 2005, time horizons in risk graphs — https://ideas.repec.org/a/wly/riskan/v25y2005i3p589-595.html
- Hicks et al. 2015, *The Leiden Manifesto* — https://www.nature.com/articles/520429a
- Aksnes, Langfeldt & Wouters 2019, what citations measure — https://journals.sagepub.com/doi/10.1177/2158244019829575
- Waltman 2016, review of citation impact indicators — https://arxiv.org/abs/1507.02099
