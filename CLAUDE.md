# NASA Data Dashboards

Interactive visualizations from The Planetary Society for NASA spending and contract data. Hosted at `dashboards.planetary.org` via GitHub Pages.

## Overview

- Static site with no build step. The `docs/` folder is deployed directly to GitHub Pages.
- All frontend libraries loaded via CDN (D3.js, Grid.js, Bootstrap Icons) — no npm/bundler.
- A root `package.json` exists solely to declare `{"type": "module"}`, so Node can import the `docs/` ES modules directly (used by the tests and by `scripts/bake-seo.mjs`). There are no runtime dependencies to install.
- **One exception to "no build step":** `science-mission-impact/` is a SvelteKit app with its own `package.json` and lockfile (see [Science Mission Impact](#science-mission-impact)). Its build output is committed to `docs/science-mission-impact/`, so the deploy stays a plain file copy and the root stays dependency-free.
- Data refreshed by two GitHub Actions workflows (see [Data Pipeline](#data-pipeline)).
- Source data files stored in `data/` with date suffixes. Relevant files **must** be copied to `docs/data/` for runtime use.

**Python is used to fetch and preprocess data, but not for serving the site.**

## Development

- Always use `context7` MCP to fetch the latest documentation when using any external library.
- Use the GitHub CLI `gh` to interface with GitHub.
- Root `Justfile` holds every task runner recipe (`just --list`): `test`, `bake`, and the `smi-*` recipes for the Science Mission Impact app.

### Frontend Stack

- **Vanilla JS** with ES6 modules (no framework, no bundler)
- **D3.js** for choropleth maps with zoom/pan interactions
- **Grid.js** for searchable, sortable data tables
- **Leaflet.js** available for interactive maps

### File Structure

```
docs/
├── index.html                  # Landing page
├── sitemap.xml                 # GENERATED — rewritten by scripts/bake-seo.mjs
├── cancellations/
│   ├── css/panels.css          # Page-local styles for the two-panel layout
│   ├── districts/              # GENERATED — do not hand-edit; regenerate via
│   │                           #   `node scripts/bake-seo.mjs` (deleted and
│   │                           #   rebuilt from scratch every run)
│   └── js/
│       ├── app.js              # Contract cancellations dashboard (owns the DOM)
│       ├── panel-common.js     # Shared plumbing for the panel modules
│       ├── panel-views.js      # Display copy + view-model builders (pure)
│       ├── terminations.js     # Pure helpers over terminations.csv
│       ├── doge-claims.js      # Pure derivation over doge_claims.csv
│       ├── fy-awards.js        # Pure reader for the FY rollup CSV
│       ├── chart-common.js     # Helpers shared by the two D3 bar charts
│       ├── timeline-chart.js   # Monthly activity column chart
│       └── fy-chart.js         # Terminated-awards-by-fiscal-year column chart
├── nasa-science/
│   └── js/app.js               # NASA Science spending dashboard
├── appropriations-guide/
│   └── js/app.js               # FY2027 appropriations request guide
├── science-mission-impact/     # GENERATED — build output mirrored by
│   │                           #   `scripts/sync-to-docs.mjs`; do not hand-edit
│   ├── dist/                   # Gitignored raw analysis data (the packaging
│   └── reference/              #   input); the sync never touches either
├── shared/
│   ├── css/
│   │   ├── variables.css       # Design tokens (colors, typography, spacing, breakpoints)
│   │   ├── base.css            # CSS reset, body/typography foundations
│   │   ├── components.css      # Navbar, cards, value boxes, tabs, badges, spinners
│   │   ├── layout.css          # Container, grid system, responsive utilities
│   │   └── tables.css          # Grid.js overrides and custom table styling
│   └── js/
│       ├── constants.js        # STATE_FIPS_MAP, FIPS_STATE_MAP, COLORS, MAP_CONFIG, DATA_URLS, BREAKPOINTS, ICONS, CONTACT
│       ├── utils.js            # parseCSV, formatCurrency, fetchText, escapeHtml, debounce, groupBy, etc.
│       └── components/
│           ├── choropleth-map.js   # D3 map with bubble/choropleth modes
│           ├── data-table.js       # Grid.js wrapper
│           ├── state-selector.js   # State/district dropdown with map integration
│           ├── tabs.js             # Tab navigation (TabNavigation + CardTabs)
│           ├── hash-router.js      # URL hash routing
│           ├── navbar.js           # Reusable navigation bar
│           └── value-box.js        # Summary statistic boxes + factory functions
└── data/
    ├── us_congressional_districts.geojson    # D3-compatible district boundaries
    ├── gz_2010_us_040_00_5m.json             # State boundary TopoJSON
    ├── cancellations/
    │   ├── terminations.csv                  # Federal-record terminations (synced daily)
    │   ├── doge_claims.csv                   # DOGE's claimed cancellations (synced daily)
    │   ├── cancellations_for_convenience_awards_by_fiscal_year.csv   # FY rollup: fiscal_year,terminated_awards (synced daily)
    │   ├── metadata.json                     # {"lastUpdated": "...", "files": {"terminations": {...}, "doge_claims": {...}}}
    │   └── master_ledger_latest.csv          # DEPRECATED — no longer read by the dashboard; kept one cycle for external links
    ├── science/
    │   ├── NASA-district-Science-summary.csv
    │   └── NASA-state-Science-summary.csv
    └── appropriations_requests/
        ├── fy2027_appropriations_request_forms.csv
        ├── fy2027_generic_directions.md
        └── guides/                           # Per-member JSON (generic.json, TX-20_castro.json, etc.)

data/                           # Source data archive (dated CSV files, 8 NASA mission areas)

science-mission-impact/         # SvelteKit app (own package.json + lockfile)
├── scripts/                    # package-data.mjs, fetch-thumbs.mjs, sync-to-docs.mjs,
│                               #   refresh.mjs + pure helpers in scripts/lib/
├── src/                        # routes, charts, copy, packaged data (src/lib/data/)
├── static/                     # fonts, images, per-mission paper JSON
└── smi.config.json             # Stats run labels, division slugs (also read by the sitemap bake)
```

### Key Patterns

**Dashboard class pattern:** Each dashboard is a class with `async init()`, instantiated in `DOMContentLoaded`:

```javascript
document.addEventListener("DOMContentLoaded", () => {
  new MyDashboard().init();
});
```

**Data loading:**

```javascript
import { fetchText, parseCSV } from "../../shared/js/utils.js";
const csvText = await fetchText(DATA_URLS.terminations);
this.rawData = parseCSV(csvText);
```

**Component usage:**

```javascript
import { ChoroplethMap } from "../../shared/js/components/choropleth-map.js";
const map = new ChoroplethMap("container-id", {
  colorScale: "science",
  level: "district",
});
await map.init(DATA_URLS.districts);
map.setData(dataMap, hoverInfo);
```

**Event delegation** (preferred pattern for dynamic content):

```javascript
container.addEventListener("click", (e) => {
  const btn = e.target.closest(".my-button");
  if (btn) {
    /* handle */
  }
});
```

**GEOID mapping:** Congressional districts use 4-digit GEOIDs (e.g., "0637" for CA-37). Use `getGeoidFromDistrict()` and `STATE_FIPS_MAP` from utils/constants.

**CSV parsing:** Use the custom `parseCSV()` from utils — it handles quoted fields with commas.

### Shared Utilities Reference

**`utils.js`** — key exports:

| Category       | Functions                                                                     |
| -------------- | ----------------------------------------------------------------------------- |
| Data parsing   | `parseCSV`, `parseCurrency`, `formatCurrency`, `formatDate`, `truncateText`   |
| Fetch helpers  | `fetchText`, `fetchJSON`                                                      |
| GEOID/district | `getGeoidFromDistrict`, `getDistrictFromGeoid`, `getStateFips`                |
| Collections    | `groupBy`, `sumBy`, `countUnique`                                             |
| DOM/browser    | `escapeHtml`, `htmlToElement`, `isMobile`, `isTablet`, `debounce`, `throttle` |

**`constants.js`** — key exports:

| Export           | Description                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `STATE_FIPS_MAP` | State abbreviation → FIPS code (e.g., `"CA"` → `"06"`)                                           |
| `FIPS_STATE_MAP` | Reverse: FIPS code → state abbreviation                                                          |
| `COLORS`         | Brand colors + choropleth scales (`scienceSteps`, `spendingSteps`, etc.)                         |
| `MAP_CONFIG`     | Continental US bounds, default center/zoom, border styles                                        |
| `DATA_URLS`      | Paths to all runtime data files (districts, states, terminations, dogeClaims, fyAwards, science) |
| `BREAKPOINTS`    | `{sm: 480, md: 768, lg: 1024, xl: 1280}`                                                         |
| `ICONS`          | Bootstrap Icon names for common UI elements                                                      |
| `CONTACT`        | Organization email, name, website                                                                |

### Component API Quick Reference

**ChoroplethMap** (`choropleth-map.js`):

- Options: `mapType` (`'bubble'`/`'choropleth'`), `colorScale`, `level` (`'district'`/`'state'`), `showStateBoundaries`, `showLegend`
- Methods: `init(geoUrl)`, `setData(dataMap, hoverInfo)`, `zoomToState(abbr)`, `resetZoom()`, `highlightDistrict(code)`, `setStateClickHandler(fn)`, `setDistrictClickHandler(fn)`

**ValueBox** (`value-box.js`):

- Factory functions: `createScienceValueBoxes(stats)`, `createSpendingValueBoxes(stats)`

## Styling

- CSS custom properties defined in `docs/shared/css/variables.css`. Brand colors in `constants.js` under `COLORS`.
- Map visualization uses stepped color scales (`COLORS.choropleth.scienceSteps`, `spendingSteps`) for colorblind-safe representations.
- Component styles (navbar, cards, value boxes, tabs, badges) are in `components.css` — check there before adding new styles.

## Data Pipeline

### GitHub Actions Workflows

- **`daily-dashboard-update.yml`** — Runs daily at 17:00 UTC. Downloads every CSV named in the workflow's `DATA_FILES` env (`terminations`, `doge_claims`, `cancellations_for_convenience_awards_by_fiscal_year`) from the `output/` directory of `planetary-society/nasa-cancellations-tracking`, copies over the deployed copies only when a file actually changed, rewrites `metadata.json` with a per-file `lastUpdated`/`rowCount` (each date taken from the most recent upstream commit touching that file), and deploys `docs/` to GitHub Pages. The download, compare and metadata steps all iterate `DATA_FILES`, so syncing another file is a one-line change. The top-level `lastUpdated` — the date the page states — is the max over `terminations`/`doge_claims` only, so regenerating the fiscal-year rollup never makes the page claim newer award data than it has.
- **`sync-spending-data.yml`** — Runs daily at 06:00 UTC. Runs `.github/scripts/fetch-data.py --get summaries` to pull science spending CSVs from private repo (`planetary-society/nasa-spending-impact-generator`). Commits but does not deploy (deployment happens via the other workflow).

### Scripts

- **`scripts/bake-seo.mjs`** — Static SEO bake. Run daily by `daily-dashboard-update.yml` before the deploy, and locally with `node scripts/bake-seo.mjs`. Three outputs: (1) injects the headline facts into `docs/cancellations/index.html` between the `<!-- bake:* -->` marker pairs so crawlers that never run JavaScript still see the numbers; (2) regenerates `docs/cancellations/districts/` — one static page per congressional district plus an index, deleted and rebuilt from scratch each run; (3) rewrites `docs/sitemap.xml` to match what it actually wrote (Science Mission Impact division URLs come from `science-mission-impact/smi.config.json`). Pure helpers live in `scripts/bake/` (`inject.mjs` for marker/JSON-LD rewriting, `templates.mjs` for the page HTML), and all copy and numbers come from the dashboard's own modules (`panel-views.js`, `terminations.js`, `doge-claims.js`), so baked text can never drift from what `app.js` renders. Every date comes from `metadata.json` rather than "today", so a no-change day produces byte-identical output. Any failure (missing marker, malformed metadata) throws so the daily job fails loudly instead of deploying a degraded page.
- **`scripts/clean_census_geojson.py`** — Cleans Census Bureau GeoJSON for D3 compatibility (see [Updating Congressional District Maps](#updating-congressional-district-maps)).
- **`.github/scripts/fetch-data.py`** — Fetches data from private repo using `PRIVATE_REPO_PERSONAL_ACCESS_TOKEN`. Modes: `--get summaries` (CSV data) and `--get html` (sentiment reports).
- **`pyproject.toml` / `uv.lock`** — Python project metadata and locked dependency set. Run `uv sync --locked` to install it.

### Data Archive

The `data/` directory contains summary CSVs for 8 NASA mission areas (Aeronautics, Exploration, Science, Space Operations, Space Technology, SSMS, STEM Education, and an all-NASA aggregate). Only Science data is currently deployed to `docs/data/science/`.

## Science Mission Impact

SvelteKit (Svelte 5) + `adapter-static` mini-site at `dashboards.planetary.org/science-mission-impact/`: a bibliometric analysis of the publications and citations produced by NASA science missions. Source in `science-mission-impact/`, prerendered output committed to `docs/science-mission-impact/` — **never hand-edit the output**; change the source and re-sync.

- **Data source:** the sibling `science-mission-citations` project's `dist/fixed/` dataset. Mission schema 5 and statistics schema 11 are recognized; configured run folders are `stats/{astro,bps,earth,helio,psd}`. Positional directories override `SMI_RAW_DIR`, which overrides the default; relative paths resolve from the app directory. Overrides name a dataset directory directly, with no automatic prefix or legacy/latest fallback. The gitignored `docs/science-mission-impact/dist/` is an older copy. The closing CLPS chart (`scripts/lib/clps.mjs` -> `site.clps`) reads a second dataset named explicitly by `smi.config.json` `clps.rawDir` (`dist/latest`; never a fallback), through the same verified loader; it must share the schema versions and the as-of date, and is checked in `--check` preflight too. Raw data is never in CI, so **packaging runs locally only**.
- **Paper kinds:** an input file, `science-mission-impact/data/paper-kinds.json` (path in `smi.config.json` `paperKinds.file`), classifies every refereed paper of the missions at or under the threshold into six kinds (`results`, `data` count as science; `mission`, `review`, `future`, `other` do not); `scripts/lib/kinds.mjs` validates it and computes `site.kinds` in the full-mission scope. Membership is strict: an unclassified in-window paper of a mission at or under the threshold fails packaging (out-of-window ones only warn), a stale entry (unknown mission or bibcode) fails, and per-mission counts must equal the tile's. The two worked examples are `smi.config.json` `paperKinds.examples`; `paperKinds.smallMax` caps the small-corpora fact `site.kinds.small`.
- **Source checks:** `just smi-check [raw_dir]` (or `npm run data -- --check` in the app) validates manifests, selected mission identities, schemas, processing failures, and dashboard compatibility without writing files. Statistics select membership; the index is only an inventory. Companion paths are dataset-relative and their bytes/SHA-256 are checked before use.
- **Pipeline:** `just smi-refresh [raw_dir]` = read-only preflight → thumbnails → package data/report → tests → preview image → build → sync to `docs/`. Preflight validates all source references and packaging calculations before thumbnail changes or output cleanup. `--allow-broken-claims` is an accepted legacy no-op and bypasses no checks.
- **Three citation scopes, `full` by default:** every measure exists in the upstream `full_mission` scope (`full` here: the month after science starts through mission end + `run.full_mission_policy.post_prime_years`, cut at the latest mature end; `Site.fullPolicy`), the prime-phase `window` (`Site.windowPolicy`) and `lifetime`. The reader's view (`src/lib/state/view.svelte.js`, URL `?scope=`) defaults to `full`; top 1% exists in the two windowed scopes only. The full-mission scope has no month-by-month companions, so the division/mission timeline charts still draw the prime-phase window. A dataset without the `full_mission` scope or `run.full_mission_policy` fails preflight (regenerate upstream with `process.py --full-mission-window`). Reader-facing names: `full` is shown as 'Active Mission Window', `window` as 'Prime Mission Window' (`src/lib/copy/window.js`).
- **Analysis compatibility:** packaging uses each mission's exported publication cohorts and maturity status. Division accumulation reports changing measured-window coverage; unavailable output is never a measured zero. Cost comparisons and discussion figures derive from individual mission values, without importing cost-bin aggregates or legacy narrative claims.
- **Citation histories:** shared papers use the upstream representative rule (highest raw citation count, then title), never a union of competing histories. Headline totals remain source-reported. Only source-declared incomplete histories may have small missing sets: at most `citationHistory.maxMissing` and `maxMissingFraction` of each affected timeline's total (defaults: 5 and 0.001). Timelines label observed/expected/missing counts. Excess edges, undeclared gaps and larger shortfalls still fail preflight.
- **Recipes** (root `Justfile`): `smi-install` (npm ci), `smi-check` (read-only preflight), `smi-data` (package), `smi-thumbs` (cached mission thumbnails), `smi-test`, `smi-build` (build + sync), `smi-dev`.
- **Data-derived public figures:** the packager is the only producer — per-division shares, cost curves and 25–75% cost spans are computed from individual mission values in `package-data.mjs`, and every story figure by `buildDiscussion` in `scripts/lib/public.mjs` into `site.story` (`threshold` missions and mission papers at or under it, `failure` shortfall rates either side of it with `byDivision`, `comparison` either side of the threshold with failures as zeros plus per-group medians, `largest` contributor and the cost `gap` around the threshold, the equal-weight `pooledBand` from `pooledBand()` in `costcurve.mjs` with its `costShare`, `timing` per division with `fastest`/`medianYears`/`byCostThird` from `FirstTopPaper.yearsFromFormulation`, `perDollar` citations per $100M where `favors` is set only when the ordering survives dropping any one mission). Copy says "favors", "most" or names a mission only when the packaged fact says so. `src/lib/data/server.js` renders the generated JSON as-is; it recalculates nothing. Dates and distinct-paper totals retain their source provenance. The threshold is `smi.config.json` `thresholdCost` ($150M adjusted), published as `story.referenceCost`, with inclusive membership: under is `0 < cost <= thresholdCost`, over is `cost > thresholdCost` (`underThreshold()` in `public.mjs`). Two mission flags: `failed` (Failure only; failures count as zero output) and `shortfall` (Failure, Partial Failure or Partial Success; drives `failure`). Scrolly tiles are in launch order (`byLaunch`); the division the timing step walks through is `smi.config.json` `storyTimingDivision`.
- **Story arc** (`src/lib/scrolly/Story.svelte`, a title step and fifteen story steps over one stage of mission squares; the overview page ends with the story and the division doors): the title question alone on black → the missions in a launch-order grid (their squares arrive on scroll) → the corpus as a skyline of per-mission publication columns over hanging launch-year stacks (`rugLayout`, `skylineLayout`; the counter runs to `papersDistinct`) → the motivation photo (`static/img/story/`, never `img/missions/`) → the missions at or under the threshold (`story.threshold`, inclusive) → their full-window publications as inner fills on one study-wide ruler → two linear bars of top-10% papers per mission either side of the threshold, failures counted as zero (`ComparisonLabels`) → shortfall rates by division with a flame X (`failureLayout`, `.mark-shortfall`; the legend slash `.mark-failure` is separate) → where the middle half of top papers sits, per division and pooled (`costLayout` over the rankable divisions) → years from project start to a first top-10% paper for one division (`projectTimeLayout`) → citations per $100M per division (`perDollarLayout`) → the kinds of paper the missions at or under the threshold produced, one 100%-stacked bar per mission (`kindsLayout`, `KindBars`, `site.kinds`), led by the non-science share of citations among the smallest corpora (`kinds.small`: missions with 0 < papers <= `smi.config.json paperKinds.smallMax`) → one example mission’s whole record listed by kind (`exampleLayout`, `KindExample`, `example.lifetime`: every classified paper to date with lifetime citations, because the mission page lists them all; the `results` papers at full contrast, the rest faded; an aside states the in-window count, and the bars either side stay in-window; the examples come from `smi.config.json paperKinds.examples`, never a hard-coded id) → the same bars by citations → CLPS in two steps by months since start (`ClpsChart`, `site.clps`): the landers' line draws in over the first (`draw`), then LCROSS and Mars Pathfinder together over the second (`drawComparators`); copy says "less science" only when `clps.comparison.behindAll`. Cross-division figures only ever weight divisions equally or keep them apart; top-paper credit is never summed across fields. Division timing charts also use actual cost; tables sort across all missions. Missing costs and unavailable output stay distinct from measured zero. The $150M threshold is an editorial line for comparison, not a finding; no optimal price is inferred from the sample. Reduced motion renders every scrubbed graphic complete. Steps are separated by `--step-gap` in `Scroller.svelte` so one step's text leaves the screen before the next arrives. Every square carries its mission thumbnail in every step (`Squares.svelte`): a state is drawn over the picture, never instead of it — bright for a mission with something in it, dimmed for an empty one, a colour wash for the two solid states, and the hairlines (grey, white for emphasis, flame) on an overlay above the image, since an inset shadow on the square would paint under it.
- **Secondary measures:** h-index, i100 and a dated m-index chart are shown for readers of the accompanying paper; they never drive the story. m-index falls every 1 January, so it is always printed with the data's as-of date.
- **Analysis rules:** percentiles and shares are always within-division; the full-mission window is the default scope for every comparison. High impact = top 10% within division, era-adjusted in every scope; top 1% exists in the windowed scopes only and is not era-adjusted. Cost curves exclude missing/nonpositive costs from both denominators.
- **Gitignore traps:** the root `.gitignore` (a Python template) ignores `dist/`, `build/` and `lib/` at any depth — the app's own `.gitignore` re-includes `src/lib/` and `scripts/lib/`, and SvelteKit builds to `.site/` rather than `build/`.

## Updating Congressional District Maps

When a new Congress begins (e.g., 119th → 120th), update the district boundaries:

1. Download new GeoJSON from Census Bureau: https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html
2. **Run the cleaning script** (required for D3.js compatibility):
   ```bash
   uv run python scripts/clean_census_geojson.py \
       path/to/downloaded_file.geojson \
       docs/data/us_congressional_districts.geojson
   ```
3. Update property references if needed (e.g., `CD119FP` → `CD120FP` in choropleth-map.js)

**Why cleaning is required:** Census Bureau GeoJSON files have 3D coordinates and RFC 7946 winding order, but D3.js needs 2D coordinates and clockwise winding. Without cleaning, districts render as invisible.
