# Science Mission Impact: content and presentation audit

Reviewed 2026-10-22 against the live site and the Google Slides deck, slides 1–27. The review used the data then deployed (as of 2026-10-04, 139 missions). The dashboard was refreshed and redeployed the same day (data as of 2026-10-20, 141 missions). **Every figure below has been updated to the refreshed data** unless it is marked as historical. What changed after the review is listed under "Changes since the review".

**How it was reviewed:** four reviewers each read the site and deck as one audience:

- a congressional appropriations staffer;
- a TPS member reading on a phone;
- a NASA-funded planetary scientist who knows bibliometrics;
- a science-policy journalist.

A fifth pass collected research and practitioner guidance on narrative visualization, risk communication and responsible bibliometrics. Screenshots of every story step (desktop and phone) and two division pages were taken from the live site. Every figure quoted below was checked against `src/lib/data/generated/`. Figures marked *(not packaged)* were computed for this review and must go through the packager before any copy uses them.

## Verdict

All four audiences understood and accepted the core argument: below $150M, missions produced far fewer highly cited papers each and failed more often. All four also hit the same trust breakers:

- the per-dollar step contradicted its own chart (**fixed**);
- two different publication totals appear two screens apart;
- "top-10% paper" is used before it is explained;
- the time-to-science claim depends on which clock you choose;
- the site and the deck do not reconcile (**the mission count now matches slide 8**; the rest remains).

The staffer said the last one alone would make them dismiss the work. The remaining fixes are mostly cuts and merges, plus a short primer, a handful of new packaged facts, and prose on the division pages.

## Changes since the review (2026-10-22)

- **Data refreshed and deployed.**
  - The dashboard was repackaged from upstream's 2026-10-20 `dist/fixed`: 141 missions, 46 of them at or under $150M.
  - The commit was merged to `main` and pushed (`69e98061`), and GitHub Pages queued the deployment.
  - `just smi-build` only rebuilds the site from already-packaged data. To pick up new upstream data, run `just smi-refresh`, or `just smi-data` then `just smi-build`.
- **Three fixes were needed to get the refresh through:**
  - **CURIE's Active Mission Window ran backwards** (Aug 2024 → Jan 2024).
    - Upstream cuts every window at the latest mature date (2024-01-01 as of October 2026). It still counts a failed mission with no papers as a measured zero.
    - `scripts/lib/windows.mjs` now accepts exactly that case as an empty window with no dates, and tests cover both sides.
    - `src/lib/copy/measures.js` leaves the date range out of the Key measures heading for an empty window.
    - More recent CubeSat failures will hit this case.
  - **A new TRACE paper had no paper kind.**
    - Auchère et al. 2001, "SwRI/LASP Sounding Rocket Inter-Calibration With The EIT Instrument On Board SOHO", was classed `other`.
    - The campaign targeted both SOHO and TRACE, but the paper reports only the EIT calibration. This follows an existing precedent in `data/paper-kinds.json`.
  - **Cost-curve y-axes.**
    - Earth's prime-window totals fell to 941 (top 10%) and 94 (top 1%). d3's 1-2-5 tick steps then offered only zero, half and the top.
    - `src/lib/charts/costcurve.js` now splits such an axis into quarters (0, 250, 500, 750, 1,000).
    - Data-dependent tests like this one can trip on any future refresh.
- **Step 10 (per dollar) rewritten** in `src/lib/scrolly/Story.svelte`. Every claim now follows the packaged `favors`/`flipsOn` facts, as the close does, so a refresh cannot leave it contradicting its chart again. It reads:

  > When looking at citations per dollar, the story gets a bit more complex. Costlier missions drew more citations per $100M in Astrophysics, Earth Science and Planetary Science.
  >
  > In Heliophysics, neither side clearly leads. Missions at $150M or less drew more citations per $100M, but TRACE alone accounts for 63% of their citations; without it, costlier missions lead.

- **Questions answered during the review:**
  - why OSIRIS-REx and DART are absent;
  - whether the selection rule matches the intended one;
  - why the site and deck mission counts differed;
  - whether the per-dollar trend line still favors costlier missions.

  See items 1.1, 1.2 and 1.5.

## Second review, after the revision (2026-10-22)

The overview, division pages and Methods were rewritten against this audit, then the same four reviewers read the result, again with the deck (slides 1–27) and the packaged data. Every figure they spot-checked (about 35 in all) matched `site.json`. All four judged the step-by-step build met: primer, $150M split, failures, one division's axis, bars and running total, then every division.

**What the revision did:**
- **Overview:** one argument in 17 steps over five graphic types instead of about ten.
  - A two-step primer on papers, citations and the top 10%.
  - Icon arrays for the $150M split, failures (losses marked apart from partial outcomes) and which missions ever produced a top-10% paper.
  - Planetary Science's running total built as axis, then bars, then stacked total.
  - Four division lanes with shares of missions, top papers and spending.
  - The per-dollar step reads the same measure as its chart.
  - CLPS and a close.
  - The waffle, bar pairs, failure grid, timing scatter and per-dollar panels are gone.
- **Division pages:** a bottom line, why the field costs what it does, sourced anecdotes, and "how to read / what it shows / keep in mind" for each chart. Per dollar, failures and both timing clocks moved here, and the scope is labeled on every figure.
- **Methods:** the real selection rule, the $150M line, failure definitions with Wilson ranges, what citations measure, the costs-versus-citations spans and the drop-one rule.
- **New packaged facts:** the primer histogram with era-adjusted top-10% papers per bar; small-side shares of missions and spending; Wilson intervals; outright losses and the costliest loss; the median small-mission cost; whether each mission ever reached a top-10% paper, by side; and top-10% papers per $100M with the drop-one check.

**Fixed after the second review:**
- **The close no longer says small missions failed more often in every division.** Astrophysics has no outright small-mission loss. Failures are now pooled ("Across the study").
- **Per dollar stays citations per $100M**, your measure, everywhere. The overview's per-dollar step now draws each division's running share of all citations against its running share of spending, so chart and text measure the same thing. Lane labels read "% of citations" against "% of spending" (`story.divisions[].citationShare`). For a few hours it read top-10% papers per $100M instead; that was reverted.
- **Top 10% now means the division's whole corpus, every year ranked together** (your call, after the second review). Until then every top-10% figure on the site was ranked within its publication year (upstream's `*_cohort_top10`), and in Planetary those per-year cutoffs ran from 24 to 48 citations. That made the primer's blue bars disagree with its 30-citation line. Now the packager reads upstream's division-wide `top_k["10"]` and the papers' `top10_weight`. The primer, charts, mission pages and story all use one rule, and papers tied at the cutoff share the last places, so a division's top 10% is still exactly a tenth of its papers (Planetary: 1,093).
- **What the switch moved:**
  - Cassini 176 → 195.
  - Small missions' share of top papers: Heliophysics 10.3% → 8.3% (TRACE 65% → 69%), Planetary 0.85% → 0.96%.
  - Costlier missions with a top-10% paper: 87 → 84 of the 87 that worked.
  - In the Lifetime view the division-wide ranking favors older papers; Methods says so.
- **The time-to-science speed claim was dropped from the overview.** For costlier missions the first top-10% paper is often a mission or instrument description published around launch: InSight's came 5 days after the start of science operations, TESS's 7, MSL's 26. The step now asks only whether a mission ever produced a top-10% paper, and counts failures apart: of the 29 small missions that worked, 11 did; of the 87 costlier ones that worked, all did. The division-page scatter lost its best-fit line and gained this caveat.
- **The opening now uses the deck's figure:** "46%, end 53 missions."
- **Two new figures say how small the small missions are:** half cost under $7 million, and all 12 outright losses cost $58 million or less.
- **CLPS:** the step states the landers' combined cost ($621 million) and notes that the later landers have had less time.
- **Anecdotes:** TOPEX/Poseidon, SMAP, ACE and LCROSS no longer go beyond their sources. TRACE now cites the peer-reviewed paper. Each anecdote is tagged with its mission and cost.
- **Plain names:** Hubble, Spitzer, Compton, Curiosity, Mars Odyssey, Phoenix and others replace acronyms everywhere (`smi.config.json` `names`).
- **Phone and pacing:**
  - Phone lane labels no longer collide.
  - Steps without a scrubbed build hold for 90% of a screen.
  - The title has a scroll cue.

**Still open (decisions or work outside the site):**
- **The deck is still unreconciled.** All four reviewers raised it:
  - slide 12 (186-mission population);
  - slides 15 and 17 (1,220 top papers, "steepest return" shading, 47/59/35 and the N₅₀ metric);
  - slides 13 and 14 (time framing);
  - slide 23 (CLPS $485M against the site's $621M, month 32 against 33);
  - slide 8's selection rule.
- **The $150M group is bimodal.** The 37 missions under $50M hold 11 of the 12 losses; 7 of the 9 from $50M to $150M produced a top-10% paper. Splitting the overview at $50M, or packaging a size class (CubeSat), is your call.
- **The thesis.** Per mission the evidence is strong in all four divisions. Per dollar (citations) costlier missions lead in Astrophysics, Earth and Planetary even with any one mission left out; Heliophysics depends on TRACE. On top-10% papers per dollar, Planetary would be a toss-up (2.7 vs 2.8), so a critic who switches measures will find it. "Can't make up for" is defensible, but a critic will press on per dollar. The scientist suggested the deck's Key Finding wording ("a portfolio of only very low-cost missions is unlikely to maintain…") as the safer headline.
- **CLPS is clocked from the first launch.** Clocking each lander from its landing would need a change in `scripts/lib/clps.mjs`.
- **WISE and NEOWISE** are both costed at $484.2M upstream.
- **Referee checks not yet run:**
  - a rerun without instrument-description papers;
  - the comparison for missions launched since 2010. The scientist's quick run finds the per-mission gap holds in all four divisions, but Heliophysics' small missions lead per dollar on ELFIN alone.
- **The selection rule follows the prime mission** while comparisons use the Active Mission Window. Methods now says so; whether to change it is open (item 1.5).

## 1. Fix first: things that cost trust today

1. **Step 10 (per dollar) said the opposite of its data. Fixed 2026-10-22; see above.**
   - The old hard-coded copy said "very low cost missions… can keep pace… excellent value". The packaged `perDollar` facts:

     | Division | ≤$150M, citations per $100M | >$150M | Packaged verdict |
     | --- | --- | --- | --- |
     | Astrophysics | 298 | 3,648 | favors costlier |
     | Earth | 270 | 1,834 | favors costlier |
     | Planetary | 276 | 429 | favors costlier |
     | Heliophysics | 2,293 | 1,643 | none; flips without TRACE |

   - All four reviewers flagged it independently, and it was the opposite of deck slide 17 ("Cost efficiency increases above $150M").
   - **The dashed trend lines** are least-squares fits of log citations per $100M against log cost, over missions with citations. Every one slopes toward costlier missions, but none is statistically clear on its own *(not packaged)*:

     | Division | Slope | Change per 10× cost | 95% range of slope |
     | --- | --- | --- | --- |
     | Astrophysics | 0.195 | ×1.57 | ±0.43 |
     | Earth | 0.141 | ×1.38 | ±0.22 |
     | Heliophysics | 0.040 | ×1.10 | ±0.22 |
     | Planetary | 0.302 | ×2.00 | ±0.35 |

     - Heliophysics is flat for practical purposes. Removing TRACE barely moves its slope (0.046).
     - The fit leaves out missions with zero citations (six in Heliophysics, mostly CubeSats). Counting them would tilt every line further toward costlier missions.
     - The robust per-dollar claims are the drop-one verdicts the copy now uses, not the slopes.
     - Package the slope and its range before any copy mentions a trend line.
   - Section 2 still proposes folding this step into the three-shares chart.

2. **The site and the deck must reconcile before both circulate.**

   | Figure | Site (data as of 2026-10-20) | Deck |
   | --- | --- | --- |
   | Missions | 141 (Earth 41, Helio 33); **matches slide 8** | slide 12's legend sums to 186 |
   | Missions ≤$150M | 46 | 47 (slides 17–18) |
   | Shortfall rate ≤$150M | 30% (14 of 46) | slide 12's bins imply about 27% (19 of 71), from a wider population |
   | Time-to-science gap | about 2.7× (quartile medians, from science start; the copy rounds it to "about three") | about 11× (slide 14: six bins, from prime start); slide 13 uses a third clock (formulation) |
   | Planetary top-10% papers | about 1,093 | 1,220 (slides 15–16) |
   | Planetary top-1% cutoff | 97 | 100 (slide 9) |
   | CLPS comparators | month 33 (CLPS 15, LCROSS 24, Pathfinder 67) | labels show month 36 (Pathfinder 72, DART 146, Phoenix 107) beside CLPS at month 32 |
   | Publication window | science start to 2 years after mission end | "through the lifetime of the mission" (slide 6) |
   | Impact measure | top-10% papers | N₅₀ weighted output (slides 17–21) |

   **Why the mission counts differed** (traced 2026-10-22). The selection code did not change; three things did.
   - **The dashboard was stale.** It had been packaged from the 2026-10-04 `dist/fixed` (139 missions). Since the refresh it uses the 2026-10-20 run.
   - **The upstream rerun on 2026-10-19/20 picked up three mission-sheet edits:**
     - GRIFEX gained its prime-end and mission-end dates, so it now qualifies.
     - CURIE changed from "Extended Mission" to "Failure", ended 2024-07-16, and now enters under the exception for failures with no papers.
     - HETE 1's cost rose from $55.0M to $68.0M, or $158.6M adjusted, which crosses the $150M line. HETE 1 is a failure, so its move shifted the failure counts on both sides. HETE 2's cost rose to $183.5M adjusted.
   - **`d3/data` is a byte-identical copy of `dist/fixed`** (141 missions). Slide 8 matches it, and now the site does too.

   **Still to fix in the deck:**
   - **Slide 12 deliberately uses `dist/latest`.** That set has 186 missions and no maturity selection (`plot_focused_paper.py`: "the failure chart uses the latest mission populations, independent of citations"). It therefore includes JWST, Europa Clipper, the CLPS landers and many recent CubeSats. Either redraw it from `dist/fixed` or label it as a wider population.
   - **Slides 17–18 (47 / 59 / 35) match no saved run.** The current split is 46 / 60 / 35. The deck's figures fit GRIFEX and CURIE added with HETE 1 at its old cost, probably an uncommitted run between Oct 4 and Oct 19. Rebuild them from the current `dist/fixed`.
   - **Not yet traced:** whether the remaining differences come from the same data refresh: 101 vs 99 missions with a top-10% paper, and Planetary's 1,220 vs about 1,093 top-10% papers (possibly whole vs fractional counting).
   - Slide 13's title says "3–4 years", but its bars run 2.5–5.9 years.
   - Slide 16 puts Heliophysics' "steepest return" at $1.0–1.5B, while slide 21 puts its best ratio at $50–150M.
   - The "small mission" line moves between $100M, $150M and $350M across the speaker notes.

3. **One publication total.**
   - Step 3 says 142,687 publications (distinct papers, to date). Step 5 says 131,855 (mission–paper pairs in the Active Mission Window).
   - Every reviewer read this as an error. Removing the waffle (section 2) removes the second number.

4. **Division pages mix scopes without saying so.**
   - The header shows lifetime totals: Planetary 15,744 papers and 584,598 citations. Key measures, directly below, show the Active Mission Window: 10,928 and 153,516.
   - "Most cited paper" is a lifetime count, while the list beneath it ranks papers by in-window citations:
     - Heliophysics' AIA paper shows 4,720 in the card and 878 in the list.
     - Planetary's card names a Cassini paper (1,746 citations), but its list is led by DE440 (260).
   - Either label each figure with its scope or make the header follow the scope switch.

5. **Data questions to settle upstream:**
   - WISE (Astrophysics) and NEOWISE (Planetary) both carry $484.2M, so one spacecraft is costed twice.
   - **OSIRIS-REx and DART are left out by design, but neither the site nor the deck says why.**
     - The site's dataset (`dist/fixed`) is built with `--mature-only` and `--include-mature-failures`. A mission enters only once its prime-window citations are complete.
     - OSIRIS-REx's prime mission ended 2023-10-01, so it qualifies on 2028-10-01. DART's ended 2022-09-26, so it qualifies on 2027-10-01. Both are in `dist/latest`, which is why DART can appear on slide 23.
     - The same rule leaves out 46 missions in all. They include Mars 2020, Parker Solar Probe, JWST, Lucy and Psyche, and about 26 recent missions at or under $150M, mostly CubeSats and CLPS landers.
     - Slide 8's "started science operations by 2022" is not the actual rule. State the real one on slide 8 and on the methods page, which today says only "mature publication windows".
   - **The rule as implemented** (`MatureWindowFilter` and `CitationWindowPolicy` in `science-mission-citations`) matches the intended one, "prime mission complete, two years to cure, then four years for its papers to collect citations", apart from three details:
     1. **The citation window is four calendar years, not four years from each paper's date.** A paper published in year Y counts citations from Y through Y+3, so a January paper gets almost four years and a December paper just over three. The field `citation_window_years: 3` stores the "+3".
     2. **The cure runs to the end of the month** two years after the prime mission ends (`POST_PRIME_PUBLICATION_YEARS = 2`, month-rounded), so it is slightly longer than two years.
     3. **Missions are admitted 3 months early** (`MATURITY_GRACE_MONTHS = 3`): on 1 October of the last papers' final citation year. Those papers can be up to three months short of citations.

     For example, OSIRIS-REx's papers count through October 2025, and the 2025 papers collect citations through 2028, so it is admitted on 2028-10-01.

     A mission marked "Failure" with no papers enters 2 years after its mission end, with no citation wait. Partial failures and partial successes must meet the normal rule.

     A full four years for every paper would mean counting citations by month from each paper's date and dropping the grace period. Either change would shift every admission date and citation count.
   - **A decision for you:** selection uses the prime window, but the site's default scope is the Active Mission Window. Four left-out missions already have a complete Active window: OSIRIS-REx, Mars 2020, Parker Solar Probe and CUTE. Selecting on the Active window would admit them. Keeping the prime-window rule is defensible, but say so.

6. **Phone checks:**
   - The failure step's thumbnails are too small to read at 390px, and the "Biological & Physical Sciences" label collides with the divider.
   - The per-dollar panels are unreadable on a phone. The rewritten step 10 text fits (272px of text against a 330px limit).
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
| 2 | 141 missions, 142,687 papers | grid → skyline (one number) | OVERVIEW + CORPUS |
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

**The three-shares step answers the strongest rebuttal before an opponent does.** The staffer and journalist each raised it independently: missions at or under $150M are about 1.2% of the compared divisions' cost and produced 1.0% of mission papers, which is close to parity. Showing each division's small-mission share of missions, of spending and of top-10% papers keeps every comparison within a division and stays honest:

| Division | Share of missions | Share of spending *(not packaged)* | Share of top-10% papers (`story.divisions[].share`) |
| --- | --- | --- | --- |
| Astrophysics | 20% (5/25) | 0.9% | 0.02% |
| Earth | 32% (13/41) | 0.4% | 0.05% |
| Heliophysics | 48% (16/33) | 5.0% | 10.3% (TRACE holds about two-thirds) |
| Planetary | 19% (7/37) | 1.0% | 0.8% |

The table shows both "far fewer per mission" (19% of missions, 0.8% of papers) and the per-dollar picture in one metric, so step 10 can go.

**Judgement call for you:** Planetary is close to parity per dollar. That is true and quotable either way, and it is better said by TPS than by a critic.

Further cuts:
- Drop "up to 138 citations": a maximum with no reference point.
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
- Icon arrays counter denominator neglect when group sizes differ, here 46 against 95 (Garcia-Retamero et al. 2010).
- Use absolute rates, not "four times as likely".
- Round away false precision: 8.4% from 8 of 95 is over-precise.
- State uncertainty in words, which barely lowers trust (van der Bles et al. 2020). Error bars are often misread.

Recommendations:

- **Headline in counts:** "14 of the 46 missions at $150M or less failed or fell short, against 8 of the 95 costlier ones: about 30% against 8%."
- **Add the uncertainty in words.** The pooled 95% ranges are about 19–45% and 4–16% *(not packaged; Wilson intervals)*. They do not overlap, so the pooled gap holds.
  - No single division passes that test: Planetary's 4 of 7 spans 25–84%. Heliophysics' 6 of 16 (18–61%) against 0 of 17 comes closest.
  - So division rows show counts only, never percentages and never "every division".
- **Mark outright losses differently from partial outcomes** (an X versus a half-filled square). Define "partial success" in the caption. Counting partial successes as failures is the first thing a NASA-friendly reader will dispute.
- **Say that failed missions count as zero** in the output comparisons that follow.
- **Say where the losses sit**, if packaged: most losses at or under $150M were CubeSats and rideshare missions, and Class D missions accept that risk by design.
  - This needs a size-class or risk-class field; the mission `type` field has no "CubeSat" value.
  - All six Heliophysics losses at or under $150M are CubeSats under $10M: CeREs, DAILI, CURIE, CuSP, petitSat and CuPID.
- **Overview:** keep two groups to match the $150M line used everywhere else. The scientist and staffer would split out the missions under $50M as the deck does; that is reasonable, but it would make $150M one of two lines on one step only. Put that split on the division pages instead.
- **Division pages:** that division's missions on the cost axis, losses marked, "k of n" each side.
- **Deck slide 12:** too much for the lay reviewers (six bins, five division colours, hatching, two directions), and drawn from a wider population than the site (item 1.2). Simplify to one bar per bracket labelled "k of n" with losses and partial outcomes distinguished, and keep the division colours for a backup slide.

## 5. What publications and citations are (question 4)

Every reviewer asked for this. The TPS member needed it most; the scientist wanted the deck's "what we don't measure" list with it. Put it before the first chart that depends on it. Today "top-10%" first appears at step 7 undefined.

Use the deck's slide 9 histogram, showing only the top-10% cutoff and dropping the N꜀/i꜀ formula boxes (all four reviewers said so). That needs a new packaged per-division citation histogram, a small addition to the packager.

Draft copy, written to fit a 390px phone:

> **Step 3.** Scientists report what a mission found in peer-reviewed papers: articles checked by other experts before they are published. When later research builds on a paper, it cites it. We counted each mission's papers, and the citations each paper drew in its first four years.

> **Step 4.** Fields cite at different rates, so each paper is ranked only against papers from its own division and era. A top-10% paper drew more citations than nine in ten of those; in planetary science, that took about 30. Citations show how much other scientists used a result. They do not measure its value to the public, the technology it proved, or the people it trained.

Notes for the copy:

- **"About 30"** is the Planetary Active-window top-10% cutoff, a pooled figure. It was 31 before the refresh, and era-adjusted cutoffs vary by era, so bind the number to a packaged fact and keep "about".
- **"First four years"** is four calendar years (item 1.5), so "about four years" is the precise wording if a reviewer presses.
- **Leiden Manifesto principles 1, 2 and 6 apply here:**
  - pair each metric with a concrete case;
  - measure against each mission's purpose;
  - normalize by field.
  The within-division, same-era percentile already satisfies principle 6; say why it is fair.
- **Put the societal-benefit examples on division pages.** Each division page can carry one example from slides 10–11 (space-weather forecasting for Heliophysics, the NEO catalog for Planetary, drought monitoring for Earth, imaging sensors for Astrophysics), reviewed by you. They are hand-picked and need editorial sign-off, which suits a curated `divisions.js` entry better than the data-bound story.

## 6. Time to science (question 5)

This is the step reviewers trusted least. The current claim, "slower for lower cost missions… about three times as long", has four problems:

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
2. **It drops the missions that never got there.** Of the 41 compared missions at or under $150M, 30 have no top-10% paper; above the line, 8 of 95 have none. Survivorship biases both the scatter and the medians (Pocock, Clayton & Altman 2002).
3. **"The cheapest missions" here is a quartile from $2M to $277M**, not the $150M group used in every other step. The best-fit line rests on about five points under $30M.
4. **Since the refresh, the medians no longer fall steadily.** By cost quartile they are 14.9, 11.6, 4.9 and 5.6 months, so the costliest quarter is slightly slower than the one below it.
   - "Slower for lower cost missions" now holds only as the cheapest quarter against the costliest. The ratio is 2.66, which the copy rounds to "about three times".
   - "On average" in the copy is also loose: these are medians.

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
   - the per-dollar comparison, reusing the step 10 sentences, which are already data-bound, with the trend-line caveat from item 1.1;
   - the division's failure rows;
   - the formulation-clock timing.
5. **One societal-benefit example** (slides 10–11), curated.
6. **Biological & Physical Sciences** says plainly why it is not compared: all five missions cost under $150M.

**Example bottom line for Planetary Science.** The 19% and 1.0% shares are not packaged yet; the other figures are packaged.

> Seven of Planetary Science's 37 missions cost $150M or less. Four were lost (DS-2, Lunar IceCube, NEA Scout and Q-PACE), and MarCO, which relayed InSight's landing, has no top-10% paper. The two that succeeded as science missions, Lunar Prospector ($131M) and LCROSS ($139M), produced highly cited work on lunar polar water. Together the seven make up 19% of the division's missions, 1.0% of its spending and 0.8% of its top-10% papers. In the running total below, the line stays nearly flat until missions of about $450M, then climbs with Discovery, New Frontiers and flagship missions; Cassini alone contributed 176.

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
- **Per-dollar trend lines:** each division's slope and its 95% range, if any copy is to mention them.
- **Robustness:** a drop-one check on the three-shares per-dollar reading, matching the `favors`/`flipsOn` rule, before any copy says "ahead" or "behind".

## 9. Where the audiences agreed and differed

| Point | Staffer | Member | Scientist | Journalist |
| --- | --- | --- | --- | --- |
| Step 10 contradicts its chart (now fixed) | yes | yes | yes | yes |
| Two publication totals confuse | yes | yes | yes | yes |
| Needs a primer on papers and citations | yes | yes, most of all | yes, with limits | yes |
| Show "never reached" in time to science | yes | yes | yes | yes |
| Deck and site must reconcile | dealbreaker | noticed | yes | yes |
| Time chart form | bars by group | bars by group | cumulative curve | two clocks |
| Split under $50M | yes | no | yes | for failures |
| Keep the skyline | cut | keep | neutral | cut the repeated grids |
| Retire "area of steepest return" | yes | — | yes | yes |

The scientist added referee points that aren't presentation fixes but would strengthen the work:

- **Medians alongside means:** the median top-10% credit is 0 at or under $150M against 49.1 above, so the flagships drive the averages.
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
