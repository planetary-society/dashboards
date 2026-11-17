# Science Mission Impact

SvelteKit (Svelte 5, `adapter-static`) site at `dashboards.planetary.org/science-mission-impact/`: a bibliometric analysis of the papers and citations NASA science missions produce. Builds to `.site/`, synced to `docs/science-mission-impact/`. **Never hand-edit the output**; change the source and re-sync.

## Commands (root `Justfile`)

- `just smi-refresh [raw_dir] [--skip-thumbs] [--skip-build]`: preflight → thumbnails → package → tests → preview image → build → sync to `docs/`
- `just smi-check [raw_dir]`: read-only preflight; writes nothing
- `just smi-data`, `smi-thumbs`, `smi-test`, `smi-build` (build + sync), `smi-dev`, `smi-install`
- After a build: `npm run check:site` in this app. After syncing: `just bake` at the root (regenerates the sitemap).

## Data

- Input is the sibling `science-mission-citations` project: `dist/fixed/` (main dataset) and `dist/latest/` (`clps.rawDir`: the CLPS chart and missions awaiting inclusion). Positional dir > `SMI_RAW_DIR` > default; no fallback between datasets.
- Raw data is never in CI, so **packaging runs locally only**. Never delete or wipe the raw `dist/` folders.
- Preflight fails on schema, manifest, checksum or citation-history mismatches. A dataset without the `full_mission` scope must be regenerated upstream with `process.py --full-mission-window`.
- Editorial settings live in `smi.config.json`: `thresholdCost` ($150M), `analysis.costTiers`/`costGroups`, `storyDivision`, `names`, `clps.surface`/`comparators`, `thumbnails.overrides`.
- Missions awaiting inclusion: launched missions in `dist/latest` whose prime window isn't mature yet (`scripts/lib/inclusion.mjs`, registered in `generated/awaiting.json`). They get lifetime-only pages and their own CSVs, but never enter analysis totals, charts or pooled downloads.
- Mission headers link Wikipedia (`wikipediaOf`: an https Wikipedia article, else packaging fails) and the catalog's mission-curated bibliography (`bibliographyOf`).

## Architecture

- **The packager is the only producer of numbers.** `scripts/package-data.mjs` + `scripts/lib/` write `src/lib/data/generated/` and `static/data/`; `src/lib/data/server.js` renders that JSON as-is. Never recalculate a statistic in a component or route loader.
- Figures: `public.mjs` `buildDiscussion` → `site.story`; `analysis.mjs` `buildAnalysis` → `site.analysis`; `running-mean.mjs` (running averages, bootstraps); `clps.mjs`; `inclusion.mjs`; `affiliations.mjs` (maps); `measures.mjs`; `series.mjs`.
- Copy gates (whether a claim may show): `src/lib/copy/discussion.js` (story), `src/lib/copy/analysis.js` (Analysis page). Hint text: `src/lib/copy/footnotes.js`.
- Story: `src/lib/scrolly/Story.svelte`. Step constants (`TITLE`…`CLOSE`) are numbered by hand; `order.test.mjs` checks them against the `<!-- NAME:` comments.
- Scopes: `full` (default, shown as "Active Mission Window") and `lifetime` (`/lifetime/` routes, counts only). `window` ("Prime Mission Window") is packaged but never offered to readers. See `src/lib/state/scope.js` and `src/lib/copy/window.js`.

## Analysis rules (Casey's; ask before changing)

- No comparison of citations reads a lifetime statistic. Lifetime totals appear only as illustration (the corpus skyline) and in time to science.
- Percentiles, shares and top-10%/1% are within-division. Top 10% ranks the division's whole corpus in the scope (`top_k["10"]`, `top10_weight`), never the `*_cohort_top10` fields. Top 1% exists in the windowed scopes only. Never sum top-paper credit across divisions; cross-division figures weight divisions equally or keep them apart.
- Cost is `adjusted_lcc` only. Missing cost, unavailable output and measured zero stay distinct. Failures stay in comparisons (as zero output in the story's figures).
- Failure rates and citation figures count the same missions: every costed packaged mission.
- The $150M threshold is editorial and inclusive (`underThreshold()` in `public.mjs`); no optimal price is inferred.
- Time to science ranks papers on lifetime citations; the story's version counts only papers on or after science start.

## Copy rules

- Every number in story copy comes from `site.story` or `site`. A sentence that claims a direction ("favors", "most", names a mission) is gated on a packaged fact and has a neutral fallback.
- **Analysis page: never write or rewrite its text.** It is Koeppel & Dreier's executive summary; methodology notes go on the Methods page.
- **Methods page:** don't reword `main`'s original text. Keep `#running-averages` and `#nc` in step with the code. A `FOOTNOTES` `anchor` must be an id on this page, or the prerender fails.
- Money is "$150M"/"$1.4B" in prose and charts (`moneyWords()`, `money()` in `src/lib/format.js`), never "million"/"billion". "Low-cost" takes a hyphen only before a noun. Otherwise TPS house style.

## Gotchas

- The root `.gitignore` ignores `dist/`, `build/` and `lib/` at any depth; this app's `.gitignore` re-includes `src/lib/` and `scripts/lib/`.
- Story steps must fit a 390×844 phone (text box under ~346px); check Safari's ~664px viewport too. Every `svh` length needs a `vh` fallback. Reduced motion renders scrubbed graphics complete.
- Svelte trims whitespace at an `{#if}` block's edges: put spaces outside the block.
- `Num.svelte`: never render a value twice (screen-reader plus decorative copies get concatenated by HTML extractors).
- Hidden data tables go inside a `.sr-only` div, never `.sr-only` on the `<table>` (it widened the page).
- The m-index drops every 1 January; always print it with the data's as-of date.
- After changing a projection in `src/lib/charts/affiliationmap.js`, rerun `scripts/basemaps.mjs`; its test fails until the committed SVGs match.
- Keep the dashboards landing page unlinked to this site until the planned launch.
