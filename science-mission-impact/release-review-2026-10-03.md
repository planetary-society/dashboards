# Science Mission Impact: release candidate review

Reviewed 2026-10-03 against the current build (data as of 2026-10-03, 134 missions, 141 pages). No code was changed for this review. This file is untracked; keep, move or delete it.

## Verdict

Not ready to go live as it stands, but close. Every headline figure was recomputed independently from the upstream data and matched. The blockers are copy that says more than the data supports, a handful of layout bugs on phones, a methods page that is missing the sections the story points to, and a provenance problem with the upstream code revision. With one focused day of fixes, Casey's copy pass, and one clean upstream re-run, it is launchable.

How it was reviewed: five independent passes. Claims and calculations (recomputed from `dist/fixed` and `dist/latest`, scripts under the session scratchpad `review/claims/`). Static scan of all 141 built pages. Playwright in headless Chromium at 1280×800 and 390×844 against the current build (272 screenshots under scratchpad `review/browser/shots/`). A reader and data-visualization pass. Deployment and pipeline. Tests: 495 of 495 pass. Not checked: the live GitHub Pages behavior, Safari and iOS, image license terms, and the upstream inputs themselves (costs, statuses, citation counts were taken as given).

## 1. Figures verified

| Figure | Site | Recomputed |
| --- | --- | --- |
| Missions at or under $150M | 40 of 134; nearest costs $149.7M / $158.3M | match |
| Mission papers | 1,329 / 135,129 | match (135,129 counts mission–paper pairs; 112,897 distinct papers) |
| Shortfall rate | 9/40 = 22.5% vs 7/94 = 7.4% | match |
| Comparison | 35 vs 94 missions; 4.58 vs 119.2 top-10% papers per mission; 10 with any; TRACE 60% | match |
| Pooled band | $756M–$2.35B; cost share 48% | match, per-division bands too |
| Timing | Lunar Prospector fastest at 3.34 yr; Planetary thirds 5.50 / 5.26 / 9.00 yr | match in all four divisions |
| Citations per $100M | 213 / 3,695 · 246 / 1,951 · 2,383 / 1,632 · 303 / 423; favors and margins | match; Heliophysics flips only if TRACE is dropped |
| Paper kinds | 20.8% of papers, 19.1% of citations; small corpora 15 missions, 37.3%; 7 of 26 majority non-science | match; 0 unclassified in-window papers, 0 stale entries |
| Examples | RainCube 7 papers / 179 citations, results paper 28, review 127 (70.9%), 5 in window; MarCO 1 review | match |
| CLPS | start 2024-01-08; month 32: CLPS 15, LCROSS 24, Mars Pathfinder 67 | match; "behind" also holds aligned from launch (17, 54) |

## 2. Blockers

### 2.1 Copy that goes beyond the data (overview story, `src/lib/scrolly/Story.svelte`)

- **"11 produced no publications at all"** (per-dollar step, ~line 238). `noPapers` counts zero papers inside the Active Mission Window. CIRiS-BATC, HARP and IceCube each have one tracked paper outside it. The KindBars strip "14 with no publications" has the same issue. Say "in their Active Mission Window".
- **"only one reports its own science data"** (RainCube step and its caption). The site counts the `data` kind as science, and RainCube's two data papers are built on its own flight data ("Scientific Products From the First Radar in a CubeSat"). Either say "only one is a science result" or reclassify those two papers. Decide which, and apply the same logic to the "Highlighted: the paper reporting its own science data" caption.
- **CLPS steps.** "In their first 32 months" is wrong for Blue Ghost M1 and IM-2, which launched in 2025; the clock runs from the first CLPS launch. "Science-directed missions of similar cost" does not fit Mars Pathfinder ($613M against landers of $50M–173M, about $485M pooled). "Returning less science" rests on unclassified paper counts three steps after the story argued counts are not science; say "fewer refereed publications". CLPS is never defined. The chart labels Mars Pathfinder 72 (its month-36 value) while the text says 67 at month 32; label the comparators at `clps.comparison.month` or mention both counts.
- **Kinds step lede.** "citations per dollar overstate it most" and, two steps later, "every one of those citations counts for the small missions" imply a measured bias. Only missions at or under $150M were classified, so nothing is known about larger missions' non-science citations. Also "smallest" here means fewest papers, not lowest cost. Drop "most" and state that larger missions were not classified.
- **Range caption.** "Lighter column: the range shared across divisions" misdescribes `pooledBand`, which is the equal-weight average of the divisions, not an overlap. Say "the same middle half with the four divisions weighted equally".
- **Timing step.** "cheaper ones usually got there sooner, mostly because they were built faster" is hard-coded and causal. The middle third beats the cheapest third in Planetary (5.26 vs 5.50 yr) and Heliophysics (4.89 vs 5.04). Gate it on `byCostThird` or soften it.
- **Failure step.** "They" shifts the base from the 35 rankable missions in the previous step to all 40; the status list reads "failure, partial failure and partial success" (should be "or"); partial success is called failure. Name the set: "Of the 40 missions at $150M or less, 22.5% failed or only partly succeeded, against 7.4% of the 94 costlier ones."
- **Two steps are still marked placeholder in the source**: the motivation step ("NASA policy has shifted…", unsupported as written) and the conclusion. Both need Casey's sign-off, and the conclusion's "fewer publications and fewer high-impact papers" should bind to `story.comparison` rather than stand unconditioned.

### 2.2 Missing-space bugs (visible in the built pages)

Svelte trims whitespace at the edge of `{#if}` blocks. Readers see "$756M to **$2.4B**.That range also holds 48%…" (range step, Story.svelte ~209) and "20 missions plotted· Dashed line" (`TimeToScience.svelte:48`). Story.svelte ~231 has the same latent bug ("Scienceandthe" if both sides were ever favored). Move the space outside the block or use `{' '}`.

### 2.3 Methods page does not cover what the story points to (`src/routes/methods/+page.svelte`)

- The kinds step says "See the methods page", but the page never renders `kindDefinitions` (defined at line 13) nor `site.kinds.method`, which is the text that discloses the classification was done by an AI model under a written rubric and spot-checked. Nothing links the published `data/paper-kinds.json` (it is served, 305 KB, HTTP 200).
- Also missing: the shortfall statuses and that failed missions count as zero; the CLPS dataset, comparators and alignment rule; the equal-weight pooling across divisions; how citations per $100M and the drop-one "favors" rule work.
- Line 189 says recent publications are excluded until mature; there is in fact a three-month grace, so ELFIN's 2023 papers count citations only through October 2026 of their window. Say so.
- Two garbled sentences: line 108 "They generaly agree within 10% - 25%" and line 155 "were include these results".

### 2.4 Phone layout

- **Mission pages scroll sideways by 106px** on every mission with papers (HST, Cassini, RainCube, MarCO, THEMIS-ARTEMIS). The rank-histogram heading's scope choice ("Active Mission Window / Prime Mission Window / lifetime") is `white-space: nowrap` (`src/lib/ui/Choice.svelte:19`) and runs to x=496. Let it wrap below about 600px.
- **Story text taller than the hold space.** On the phone the text holds under the pinned graphic at y=506, and these steps run off the bottom for the whole hold: comparison (82px hidden), timing (110), per dollar (34), kinds (161), RainCube (59), citations (8), conclusion (697px tall, 366 visible). On desktop at 1280×800 the conclusion loses 170px. Split or trim the comparison, timing, kinds and conclusion steps; trim RainCube and citations; or stop text taller than the available space from sticking.

### 2.5 Keyboard: the first Tab skips the skip link and the start of the nav

`src/lib/ui/Nav.svelte:20` calls `scrollIntoView()` on the active item, and Chromium then starts the Tab sequence from that element. On the overview the first Tab lands on "Astrophysics"; on Methods it goes straight into the table of contents. Reproduced with a minimal page. Set `scrollLeft` by hand instead.

### 2.6 Provenance of the figures

The methods page cites analysis code revision `81208d8`, but four of the five `dist/fixed` stats runs and all five `dist/latest` runs carry a source fingerprint that matches no commit in the upstream repository (a dirty working tree; the refresh report warns on every run). Only the BPS run is reproducible from a commit, and the upstream repo has no tags. Before launch: commit and tag upstream, re-run the four rankable `fixed` runs and `latest` from that clean tree, then `just smi-refresh` and confirm the report has no dirty-tree warnings. Until then the methods page should not present `81208d8` as the code that produced the figures.

### 2.7 Git and deployment

- The current build's hashed bundles (`_app/immutable/entry/app.DF200wCD.js`, `nodes/2.BboMePpN.js`) are untracked and the ones they replace show as deleted. A `git commit -a` would deploy pages whose scripts 404. Stage with `git add docs/science-mission-impact science-mission-impact CLAUDE.md`, never `git add -A` at the repo root (an unrelated .xlsx sits there).
- Soft-launch switches are all still on and should be flipped deliberately in one commit: `src/app.html:7` sets `noindex, follow` on all 141 pages; `docs/sitemap.xml` has no SMI URLs (deliberate per `scripts/bake/templates.mjs:464`, and `tests/bake-seo.test.mjs` asserts it, but the root CLAUDE.md still says the sitemap includes them); the landing page `docs/index.html` has no link to the dashboard; the footer says "Preliminary".
- Deploys run only on the 17:00 UTC schedule or a manual `gh workflow run daily-dashboard-update.yml`.

## 3. Should fix before launch

### Data and calculations

- **Raw ADS markup in paper titles.** About 5,450 of 178,784 titles (3%) carry `<SUB>`, `<SUP>`, MathML, `$\epsilon$` or double-escaped entities, and they render literally (HST, Aura, OCO-2, Fermi, CGRO, ACE, Aqua). The CSV download carries the same text. Decode entities and map or strip the tags in the packager.
- **The comparison step counts top-10% papers across divisions.** The 4.6 vs 119 average ranks each paper within its own division and then pools the counts over four divisions. The CLAUDE.md rule says top-paper credit is never summed across fields, and the methods page says comparisons stay within each division. The direction holds in every division (under vs over, per mission: Astrophysics 0.19 vs 262, Earth 0.11 vs 137, Heliophysics 12.4 vs 76, Planetary 1.9 vs 36). Either show per-division or equal-weight figures, or amend the rule and disclose the pooling. The means are also skewed (TRACE holds 60% of one side, HST 15% of the other); the packaged medians are available.
- **"First top-10% paper" uses the pooled cutoff, not the era-adjusted one** (`scripts/lib/measures.mjs:126` reads `by_top_percent['10'].first_qualifying`). The story calls it "a high-impact paper", defined two steps earlier as era-adjusted. Genesis, LADEE and Landsat 4 have era-adjusted credit but count as never reaching one. Disclose or change the measure.
- **18% of the under-$150M top-10% credit sits on non-science kinds** (28.7 of 160.9; TRACE about 20 of its 96; the ELFIN, FAST, SWAS and SAMPEX overviews; RainCube's whole 0.33 is the radar review). `src/lib/copy/outcomes.js:2`, `footnotes.js:72` and `IndexScatter.svelte:32` say overview papers are excluded; they are not. Add one aside and correct those strings.
- **"1,329 of 135,129 publications"** are mission–paper pairs (112,897 distinct), shown right after the 146,699 distinct-paper counter. Label them "mission papers". "Across their active lives" also overstates a window that ends two years after mission end and is cut at maturity.
- **HST's "Most cited paper" is Schlegel, Finkbeiner and Davis 1998** (the IRAS/COBE dust maps, 14,188 citations), a corpus false positive scientists will notice. Curate upstream.
- **Paper browser "Show all" reorders the list.** The first 20 rows are sorted by lifetime citations; after loading, "Most cited" sorts by in-window citations while the big number stays lifetime, so the 14,188 paper drops off the top. Use one key or label the sort.
- **Lifetime chart y ticks repeat on 11 small missions** (`accumulation.js:136`: fixed fractions of the total). MarCO, CuPID, CSIM-FD read 0, 1, 1, 1; ASTERIA 1, 2, 2, 3; the zero baseline has no label. Use integer ticks when the total is small.
- Minor data items: "MarCo" should be "MarCO" (upstream short title); "from 2024–2024" on seven pages (`format.js` `yearSpan`); "1 tracked publications"; CeREs' full name reads "(formerly CeREs)"; `util.mjs:79` parses `YYYY-00-00` as January, shortening EO-1 and Landsat 7 timing by up to 11 months; six classification calls look questionable (section 5).

### Charts and layout (all seen in the Playwright screenshots)

- Rank histogram: the dashed "even spread" line runs through bar labels (HST "1.5k", "1.6k"; MarCO "0.1"), both viewports.
- Timing step, phone: gridlines run through "Start", "5 yr", "10 yr", "15 yr".
- Failure step, desktop: the descenders of "Astrophysics" and "Biological & Physical Sciences" touch the first row of squares.
- Astrophysics scatter, phone: "15,000" and "20,000" run together on the x axis.
- Per-dollar step, phone: rate ticks are hidden in compact mode and each row reads "213 vs 3.7k" with no indication which side is $150M or less.
- CLPS step, phone: "LCROSS 24" overlaps the CLPS label block by 3px; the lander "M1" is unclear without "Blue Ghost".
- 117 mission pages shift after hydration because the lifetime `.canvas` reserves no height (`AccumulationPair.svelte:232`); add `min-height: 300px`.
- The 404 route shows SvelteKit's unstyled default with an empty title; add `+error.svelte` and a matching `404.html`.

### Mission pages

- No Active Mission Window dates or counts appear, though the story and the footnote say they do; RainCube shows 7 (header), 2 (prime chart) and 5 (histogram) with nothing tying them together. Add the full-window line to the header.
- Status appears only for outright failure ("The mission failed."). WIRE (partial success) and SporeSat (partial failure) say nothing, though the story counts both.
- The 13 failed missions with no ADS query (Glory, MCO, MPL, CONTOUR and others) show only "No tracked publications found", which implies a search was run. Say no search was run and that the mission counts as zero.
- Missions with 20 or fewer papers never get search, top-10% marks or the CSV download (`PaperBrowser.svelte:58` loads the full table only when it is larger than the initial 20 rows). Always offer the CSV.
- Raw machine text: "2020-03-01 to 2022-06-01 (end exclusive)" window notes; "Mission selection: Launch Date <= 2026-10-03 AND …" on division pages and Methods.
- Curation labels: "Added by hand" and "Removed by hand" above items marked "AI-assisted review"; "Curated out 1" beside "Removed by hand (4)" with no explanation; untitled exclusions show as bare bibcodes.
- `Num.svelte:8` puts `aria-label` on a plain span whose digits are `aria-hidden`; many screen readers ignore that, silencing every number in the paper list and mission table. Sr-only text also runs into numbers ("1,058tracked publications").

### Reader clarity

- One term for each concept across the site: "top-10% paper" (gloss "high-impact" once) instead of "top paper" and "top-paper credit"; "$150M or less" and "over $150M" instead of "very low-cost" and "smaller/larger"; "peer-reviewed" instead of "refereed"; define Active Mission Window at first use; "after its window" should name the window.
- The opening question is framed three ways (thesis, hidden h1, step 1). The division doors' "Its middle half of top-paper credit falls between…" is opaque; give the section a visible heading and plainer wording. Story squares are clickable but nothing says so; the conclusion caption "lists its own by cost" should match the tables' default order.
- "Per dollar, the picture is less clear" contradicts the three-of-four result that follows. The Heliophysics sentence never says which side leads.
- Consider merging the kinds and citations-by-kind steps (the bars switch mode) to keep the arc moving.
- Image credits: `static/img/missions/manifest.json` records URLs but no license or credit. EUVE comes from a stock-image site, five tiles from Google's image cache (CIRiS-BATC, EcAMSat, MinXSS-2, PharmaSat, Phoenix), HST from ESA. Replace with NASA public-domain images where needed and add a credits list to Methods.
- Methods also lacks a contact for corrections, how to cite and the companion paper, a repository link for the code revision, and whether CubeSat costs include rideshare launch and university labor.

## 4. Later

Nav labels "Bio + Phys" and "Helio"; display names (SIRTF, ODY, PHX, MSL, RBSP, WIND); the kinds legend's "Planned" and "Mentions" greys are nearly identical; scatter marks of 5–8px are too small to tap and stack near zero; about 120 mission buttons precede the Earth table in the tab order; faded KindExample rows at 2.95:1 for 11px text; no `svh` fallback for old browsers; `version.name` is the as-of date, so a code-only redeploy can strand open tabs; no Node `engines` pin; the test glob only reaches one directory level; no CI check that `docs/` matches source; dead code (`LanesKey.svelte`, `copy/outcomes.js`, `TimeAxis.svelte`); the next data refresh will fail packaging until new in-window papers are classified; `costBaseYear` is a config constant the packager never reads from the data; no data download for the overview figures; the BPS page still plots top-10% credit for a 15-paper division.

## 5. Classification spot-check (17 papers by title)

Eleven look right. Six to look at: LCROSS `2010Sci...330..479P` (Diviner cold traps, an LRO paper, marked `results` with 74 in-window citations while the LEND paper of the same kind is `other`); TRACE `2005ApJ...624L..61D` and `2007A&A...462..743E` (theory interpreting TRACE measurements, marked `other`; the rubric puts these under `results`); TRACE `1998ApJ...502L.181A` (`future`, should be `other`); RAVAN `2019RemS...11..796S` (`mission`; if it reports Earth radiation measurements the RainCube call makes it `results`, which changes RAVAN's majority-non-science status); RAVAN `2018Aeros...5...63C` (`future`, should be `mission`). Casey has not yet reviewed the 268 low-confidence calls flagged in `data/paper-kinds.json`.

## 6. Checked and clean

All 141 pages exist with unique titles, descriptions, canonical and social tags, one h1, no heading skips, alt text and `lang`. All 3,862 internal hrefs and srcs, all fragment anchors, all thumbnails, paper files and bundles resolve. No visible `undefined`, `NaN`, `null` or placeholder strings. No console or page errors on any page at either viewport. No horizontal overflow on the overview, division or methods pages at either size, nor on desktop mission pages. Scrubbed graphics draw correctly on scroll and render complete under reduced motion. The scope switcher, tooltips, search, sort, "Show 100 more", top-10% filter and external links all work. Bio & Physical Sciences renders sensibly. Edge-case server renders (0 to 3 papers, failed, incomplete citations, longest names, all scopes, 340px and 1100px) produced no bad geometry. Overview cold load: about 800 KB, 156 requests, load event at 105 ms locally. `npm run data -- --check` passes; `dist/fixed` and `dist/latest` share the as-of date and schemas; the two copies of `paper-kinds.json` are identical; links, fonts and the ADS acknowledgement are in order.

## 7. Suggested order of work

1. Upstream: commit, tag, re-run the four `fixed` runs and `latest`; curate the HST dust-map false positive; fix the "MarCo" short title; strip title markup (or do it in the packager).
2. Packager: title markup, `yearSpan`, lifetime ticks, mission-paper labelling, optionally per-division comparison figures and the era-adjusted first top paper.
3. Front end: Choice wrap, Nav scroll, the two missing spaces, histogram label collision, timing gridlines, failure-step label gap, scatter ticks, per-dollar phone labels, CLPS label month, canvas min-height, error page, mission header (window line and status), unsearched-mission text, paper browser CSV and sort key, Num accessibility.
4. Copy (Casey): the blockers in 2.1, the placeholder steps, the terminology pass, split the four long steps.
5. Methods: kinds section with the method text, definitions and file link; failures, CLPS, pooling, per-dollar; fix the two sentences and the grace period.
6. `just smi-refresh`, confirm no warnings, `npm test`, `node scripts/sync-to-docs.mjs --dry-run` shows no changes, commit with an explicit path list.
7. Launch commit: remove `noindex`, add SMI URLs to the sitemap bake and flip its test, add the landing-page card, drop "Preliminary"; `node scripts/bake-seo.mjs`; commit; `gh workflow run daily-dashboard-update.yml`; spot-check `/science-mission-impact/`, `/earth`, `/earth/`, `/methods/`, one mission page and the social preview on the live site, on a phone.
