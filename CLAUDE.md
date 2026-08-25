# NASA Data Dashboards

Interactive visualizations from The Planetary Society for NASA spending and contract data. Hosted at `dashboards.planetary.org` via GitHub Pages.

## Overview

- Static site with no build step. The `docs/` folder is deployed directly to GitHub Pages.
- All frontend libraries loaded via CDN (D3.js, Grid.js, Bootstrap Icons) — no npm/bundler.
- A root `package.json` exists solely to declare `{"type": "module"}`, so Node can import the `docs/` ES modules directly (used by the tests and by `scripts/bake-seo.mjs`). There are no runtime dependencies to install.
- Data refreshed by two GitHub Actions workflows (see [Data Pipeline](#data-pipeline)).
- Source data files stored in `data/` with date suffixes. Relevant files **must** be copied to `docs/data/` for runtime use.

**Python is used to fetch and preprocess data, but not for serving the site.**

## Development

- Always use `context7` MCP to fetch the latest documentation when using any external library.
- Use the GitHub CLI `gh` to interface with GitHub.

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
│       └── fy-chart.js         # Fiscal-year FPDS actions column chart
├── nasa-science/
│   └── js/app.js               # NASA Science spending dashboard
├── appropriations-guide/
│   └── js/app.js               # FY2027 appropriations request guide
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
    │   ├── cancellations_for_convenience_awards_by_fiscal_year.csv   # FY rollup of cancelled awards (synced daily)
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

- **`scripts/bake-seo.mjs`** — Static SEO bake. Run daily by `daily-dashboard-update.yml` before the deploy, and locally with `node scripts/bake-seo.mjs`. Three outputs: (1) injects the headline facts into `docs/cancellations/index.html` between the `<!-- bake:* -->` marker pairs so crawlers that never run JavaScript still see the numbers; (2) regenerates `docs/cancellations/districts/` — one static page per congressional district plus an index, deleted and rebuilt from scratch each run; (3) rewrites `docs/sitemap.xml` to match what it actually wrote. Pure helpers live in `scripts/bake/` (`inject.mjs` for marker/JSON-LD rewriting, `templates.mjs` for the page HTML), and all copy and numbers come from the dashboard's own modules (`panel-views.js`, `terminations.js`, `doge-claims.js`), so baked text can never drift from what `app.js` renders. Every date comes from `metadata.json` rather than "today", so a no-change day produces byte-identical output. Any failure (missing marker, malformed metadata) throws so the daily job fails loudly instead of deploying a degraded page.
- **`scripts/clean_census_geojson.py`** — Cleans Census Bureau GeoJSON for D3 compatibility (see [Updating Congressional District Maps](#updating-congressional-district-maps)).
- **`.github/scripts/fetch-data.py`** — Fetches data from private repo using `PRIVATE_REPO_PERSONAL_ACCESS_TOKEN`. Modes: `--get summaries` (CSV data) and `--get html` (sentiment reports).
- **`pyproject.toml` / `uv.lock`** — Python project metadata and locked dependency set. Run `uv sync --locked` to install it.

### Data Archive

The `data/` directory contains summary CSVs for 8 NASA mission areas (Aeronautics, Exploration, Science, Space Operations, Space Technology, SSMS, STEM Education, and an all-NASA aggregate). Only Science data is currently deployed to `docs/data/science/`.

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
