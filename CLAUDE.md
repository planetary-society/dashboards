# NASA Data Dashboards
Interactive visualizations from The Planetary Society for NASA spending and contract data. Hosted at `dashboards.planetary.org` via GitHub Pages.

## Overview
* This is a static site with no build step. The `docs/` folder is deployed directly to GitHub Pages.
* Data is refreshed using GitHub Actions workflows
* Source data files are stored in `data/` with date suffixes (e.g., `nasa_cancelled_contracts_2025-11-28.csv`). Relevant files **must** be copied to `docs/data/` for runtime use.

**Python is used to fetch and preprocess data, but not for serving the site.**

## Development
* Always use `context7` MCP to fetch the latest documentation when using any external library.
* Use the GitHub CLI `gh` to interface with GitHub.

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

## Styling
* CSS uses custom properties defined in `docs/shared/css/variables.css`. The Planetary Society brand colors are defined in `constants.js` under `COLORS`.
* Map visualization uses stepped color scales defined in `COLORS.choropleth.scienceSteps` for consistent, colorblind-safe representations.

## Updating Congressional District Maps

When a new Congress begins (e.g., 119th → 120th), update the district boundaries:

1. Download new GeoJSON from Census Bureau: https://www.census.gov/geographies/mapping-files/time-series/geo/cartographic-boundary.html
2. **Run the cleaning script** (required for D3.js compatibility):
   ```bash
   python3 scripts/clean_census_geojson.py \
       path/to/downloaded_file.geojson \
       docs/data/us_congressional_districts.geojson
   ```
3. Update property references if needed (e.g., `CD119FP` → `CD120FP` in choropleth-map.js)

**Why cleaning is required:** Census Bureau GeoJSON files have 3D coordinates and RFC 7946 winding order, but D3.js needs 2D coordinates and clockwise winding. Without cleaning, districts render as invisible.
