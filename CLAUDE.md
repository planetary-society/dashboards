# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

NASA Data Dashboards - interactive visualizations from The Planetary Society for NASA spending and contract data. Hosted at dashboards.planetary.org via GitHub Pages.

Two main dashboards:
- **NASA Science Spending** (`docs/nasa-science/`) - Science Mission Directorate spending by state/district
- **NASA Cancellations** (`docs/cancellations/`) - Terminated contracts and grants tracking

## Development

This is a static site with no build step. The `docs/` folder is deployed directly to GitHub Pages.

**Local development:**
```bash
# Python simple server (from repo root)
python3 -m http.server 8000 --directory docs

# Or any static file server, then open http://localhost:8000
```

**Python environment (for data fetching scripts only):**
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Architecture

### Frontend Stack
- **Vanilla JS** with ES6 modules (no framework, no bundler)
- **D3.js** for choropleth maps with zoom/pan interactions
- **Grid.js** for searchable, sortable data tables
- **Leaflet.js** available for interactive maps

### File Structure
```
docs/
├── index.html              # Landing page
├── shared/
│   ├── css/                # Shared stylesheets (variables.css, base.css, etc.)
│   └── js/
│       ├── constants.js    # STATE_FIPS_MAP, COLORS, MAP_CONFIG, DATA_URLS
│       ├── utils.js        # parseCSV, formatCurrency, getGeoidFromDistrict, etc.
│       └── components/     # Reusable UI components
│           ├── choropleth-map.js   # D3 map with bubble/choropleth modes
│           ├── data-table.js       # Grid.js wrapper
│           ├── state-selector.js   # State/district dropdown
│           ├── tabs.js             # Tab navigation
│           └── hash-router.js      # URL hash routing
├── cancellations/
│   └── js/app.js           # Dashboard-specific application code
├── nasa-science/
│   └── js/app.js           # Dashboard-specific application code
└── data/                   # Runtime data (CSV files copied here)

data/                       # Source data archive (dated CSV files)
```

### Key Patterns

**Component pattern:** Each component is a class with `init()` and `render()` methods. Example:
```javascript
import { ChoroplethMap } from '../../shared/js/components/choropleth-map.js';
const map = new ChoroplethMap('container-id', { colorScale: 'science', level: 'district' });
await map.init(DATA_URLS.districts);
map.setData(dataMap, hoverInfo);
```

**GEOID mapping:** Congressional districts use 4-digit GEOIDs (e.g., "0637" for CA-37). Use `getGeoidFromDistrict()` and `STATE_FIPS_MAP` from utils/constants.

**CSV parsing:** Use the custom `parseCSV()` function that handles quoted fields with commas.

## Data Pipeline

Data is refreshed daily via GitHub Actions:
1. `daily-dashboard-update.yml` - Fetches latest cancellations CSV from Google Sheets, commits if changed, deploys to GitHub Pages
2. `sync-spending-data.yml` - Fetches summary CSVs from a private repo

Source data files are stored in `data/` with date suffixes (e.g., `nasa_cancelled_contracts_2025-11-28.csv`). Latest version is copied to `docs/data/` for runtime use.

## Styling

CSS uses custom properties defined in `docs/shared/css/variables.css`. The Planetary Society brand colors are defined in `constants.js` under `COLORS`.

Map visualization uses stepped color scales defined in `COLORS.choropleth.scienceSteps` for consistent, colorblind-safe representations.
