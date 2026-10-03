# NASA Data Dashboards — task runner. `just --list` to see recipes.

smi := "science-mission-impact"

# List recipes
default:
    @just --list

# Root test suite (gates the daily deploy)
test:
    npm test

# Static SEO bake for the cancellations dashboard
bake:
    node scripts/bake-seo.mjs

# --- Science Mission Impact (docs/science-mission-impact) ---------------------

# Install the mini-site's dependencies
smi-install:
    cd {{smi}} && npm ci

# Whole pipeline: read-only preflight → thumbnails → package data → tests → preview → build → sync.
# Defaults to ../science-mission-citations/dist/fixed. Overrides name a dataset directory directly
# (relative paths resolve from science-mission-impact/). Then pass any of
# --skip-thumbs or --skip-build (skips the sync too).
smi-refresh raw_dir="" *flags:
    cd {{smi}} && SMI_RAW_DIR="{{raw_dir}}" npm run refresh -- {{flags}}

# Package the raw analysis output into the site's data files
smi-data raw_dir="":
    cd {{smi}} && SMI_RAW_DIR="{{raw_dir}}" npm run data

# Check source integrity and dashboard compatibility without writing output
smi-check raw_dir="":
    cd {{smi}} && SMI_RAW_DIR="{{raw_dir}}" npm run data -- --check

# Fetch and crop mission thumbnails (cached; --force to refetch)
smi-thumbs *args:
    cd {{smi}} && npm run thumbs -- {{args}}

# Packaging and pipeline tests
smi-test:
    cd {{smi}} && npm test

# Build the site and mirror it into docs/science-mission-impact (never touches dist/)
smi-build:
    cd {{smi}} && npm run build

# Dev server
smi-dev:
    cd {{smi}} && npm run dev
