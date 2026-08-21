# Master Ledger Dashboard Upgrade — Implementation Plan

**Date:** 2026-07-30
**Author:** Casey Dreier / Claude
**Status:** Proposed

## Purpose

The cancellations dashboard currently displays a copy of the tracking repo's
_daily snapshot_: 144 rows, 13 columns, no status vocabulary, and DOGE's
claimed savings regex-scraped out of Description prose. The tracking repo now
publishes an append-only **master ledger**
(`nasa-cancellations-tracking/consolidated/master_ledger.csv`, 359 awards,
30 columns) that distinguishes:

- **Claims from outcomes** — what DOGE asserted vs. what the award data shows
  (`Claiming Source` / `Claimed Status` / `Claimed Savings` / `Claim Date` /
  `Claim Divergence`).
- **Statuses** — awards currently flagged (`listed`), confirmed terminated but
  no longer surfaced (`still_terminated`, `closed_out`, `descoped`), reversed
  (`reinstated`, `vacated`, `continued`), excluded by methodology
  (`excluded_by_design`), or awaiting review.
- **Evidence depth** — 1–4 corroborating sources per award, including
  detection nets (formal termination action codes, end-date truncations,
  pure grant clawbacks) invisible to text search.

This plan migrates the dashboard to the ledger and adds a **lens selector** —
four overlapping confidence views, one active at a time, driving every
component (value boxes, map, tables, district cards) from a single filtered
subset:

> **Cancelled | DOGE | Suspicious | Reversed**

The headline count steps from 144 to roughly 340 with this migration. That is
real detection expansion (IDV vehicles, end-date truncations, grant
clawbacks), and it is annotated with a visible footnote rather than hidden.

---

## Reference

### Data paths

| What                                   | Path                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------ |
| Source of truth                        | `nasa-cancellations-tracking` repo, `consolidated/master_ledger.csv`     |
| Deployed copy (new)                    | `docs/data/cancellations/master_ledger_latest.csv`                       |
| Deployed copy (old, removed in Task 9) | `docs/data/cancellations/nasa_cancelled_contracts_latest.csv`            |
| Metadata                               | `docs/data/cancellations/metadata.json` (written inline by the workflow) |
| Refresh workflow                       | `.github/workflows/daily-dashboard-update.yml`                           |

### Ledger columns (30, as of 2026-07-30)

| Group              | Columns                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Identity           | `Award ID`, `Recipient`, `District`, `Sources`, `URL`, `Business Categories`                                                       |
| Observation        | `First Seen`, `Last Seen`, `Status`, `Status Detail`                                                                               |
| Award data         | `Latest Modification Number`, `Latest Modification Date`, `Start Date`, `End Date`, `Award Amount`, `Total Outlays`, `Description` |
| Claim (write-once) | `Claiming Source`, `Claimed Status`, `Claimed Savings`, `Claim Date`, `Claim Revisions`                                            |
| Trend (derived)    | `First Award Amount`, `Transaction Baseline Amount`, `First End Date`, `Amount Trend`, `End Date Trend`, `Claim Divergence`        |
| Verification       | `Auto Status`, `Auto Verified Date`                                                                                                |

Task 0 adds a 31st column, `Detection` (see below). Re-read the live header
before implementing — the schema is actively evolving.

### Status vocabulary (from `build_master_ledger.py`, counts as of 2026-07-30)

| Status                                           | Meaning                                                                | Count |
| ------------------------------------------------ | ---------------------------------------------------------------------- | ----- |
| `listed`                                         | present in the most recent daily snapshot                              | 336   |
| `still_terminated`                               | termination stands; a later mod replaced the matching text             | 1     |
| `closed_out`                                     | closeout/deobligation superseded the termination mod; still terminated | 1     |
| `descoped`                                       | partial de-scope / stop-work short of full termination                 | 1     |
| `reinstated`                                     | stop-work/termination rescinded — award active again                   | 6     |
| `vacated`                                        | termination vacated/set aside by court order                           | 0     |
| `continued`                                      | award resumed / received new obligations after the flag                | 4     |
| `excluded_by_design`                             | methodology exclusion (termination for cause, pre-window)              | 9     |
| `needs_manual_review` / `dropped_pending_review` | unresolved; requires review                                            | 1     |
| `source_retired`                                 | dropped only because FPDS ezsearch was retired                         | 0     |

### Data-shape gotchas (measured against the live ledger)

1. **CRLF + embedded newline.** The ledger uses `\r\n` row endings and at
   least one quoted field contains an embedded newline. The shared
   `parseCSV` (`docs/shared/js/utils.js:14`, line parser at `:43`) handles
   quoted commas and `""` escapes but **not** embedded newlines, and never
   strips `\r` — it would corrupt one row and taint every row's last column.
   Fixed in Task 2 before anything reads the ledger.
2. **3 rows have a blank `District`.** The map already skips them (null
   geoid); the district table must label them "Unknown" rather than grouping
   under `""`.
3. **`formatCurrency` returns `'N/A'` for negative values**
   (`utils.js:80`). No ledger `Award Amount` is negative today, but keep this
   in mind anywhere `Claimed Savings` or clawback values render.
4. **Dead column config.** `createContractsTable`
   (`docs/shared/js/components/data-table.js:288`) still references
   `Nominal End Date`, which no longer exists in any feed. Replaced in
   Task 7.
5. **`extractReportedSavings` will silently return 0.** The dashboard
   regex-parses `"Reported savings: $…"` from the Description prefix
   (`docs/cancellations/js/app.js:148`). The ledger _strips_ DOGE preambles
   from Description — the claim lives in the `Claimed Savings` column now.
   Deleted in Task 5.

---

## The four lenses

One selector, one lens active at a time. Lenses **overlap** (a DOGE-claimed
award is usually also a confirmed cancellation); they are alternative
evidentiary framings of the same ledger, not a partition. Every component
recomputes from the active lens's subset.

| Lens                    | Predicate (exact)                                                                                                                                               | Headline                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| **Cancelled** (default) | `Status ∈ {listed, still_terminated, closed_out, descoped}` AND NOT date-only evidence (see Suspicious)                                                         | "Awards terminated since Jan 2025"        |
| **DOGE**                | `Claiming Source == "DOGE"` — any status; this is the claims ledger. Shows claimed savings vs. actual obligations and flags `Claim Divergence`                  | "Awards claimed as cancelled by DOGE"     |
| **Suspicious**          | cancelled-status AND the only detection evidence is an end-date truncation: no termination action code, no termination language, no clawback, no external claim | "Awards with suspicious end-date changes" |
| **Reversed**            | `Status ∈ {reinstated, vacated, continued}` — terminations that were rescinded, vacated by a court, or where the award simply kept going                        | "Terminations reversed or not upheld"     |

Invariant worth testing: **Cancelled and Suspicious partition the
cancelled-status set** — every cancelled-status award is in exactly one of
the two.

`excluded_by_design` and the review statuses appear in **no lens**. They are
visible in the Raw Data tab (which always shows all rows, with a Status
column) and explained in the About tab.

---

## Task 0: Carry detection evidence into the ledger (tracking repo — prerequisite)

**Why:** "Suspicious" is not computable from today's ledger. Each source
already writes a human-readable detection string into its result frame's
`status` cell (e.g. `"End date truncated 893 days by mod P00001 on
2026-01-20"`, `"Terminate-for-convenience action P00180 on 2026-05-06"`,
`"Clawback of 100% ($448,257) on 2026-01-14"`), but that column is dropped at
the snapshot boundary: `search.SNAPSHOT_COLUMNS` (`search.py:64`) does not
include it.

**Changes (in `nasa-cancellations-tracking`):**

1. Add `"Detection"` to `SNAPSHOT_COLUMNS`; populate it in
   `Search._add_source_awards` from the winning source row's `status` cell
   (same `.loc` lookup the Description already uses).
2. Add `"Detection"` to `build_master_ledger.LEDGER_COLUMNS` as a
   **refreshed** column (latest snapshot wins, like `End Date`).
3. Tests: snapshot column present and populated per source; ledger carries it
   through both build paths; full + `--update` rebuilds stay byte-identical
   apart from the new column.

**Dashboard predicate once Task 0 lands:**

```js
const dateOnly = (row) =>
  /End date truncated/.test(row.Detection) &&
  !/(action|language transaction|Clawback)/.test(row.Detection) &&
  !row["Claiming Source"];
```

**Fallback if Task 0 is deferred** (inferior — loses corroboration detail):
`row.Sources === 'LocalUSASpendingMirror' && row['End Date Trend'] === 'moved_up'`.

## Task 1: Data pipeline

**File:** `.github/workflows/daily-dashboard-update.yml`

- Replace the "pick the lexically-last `consolidated/*.csv`" download step
  with an explicit fetch of
  `https://raw.githubusercontent.com/planetary-society/nasa-cancellations-tracking/main/consolidated/master_ledger.csv`.
  Derive the date for `metadata.json` from the latest commit touching that
  file (`gh api repos/.../commits?path=consolidated/master_ledger.csv&per_page=1`)
  rather than from a filename.
- Deploy to `docs/data/cancellations/master_ledger_latest.csv` via the same
  `cmp -s` change-guard; extend the inline metadata echo:
  `{"lastUpdated": "<date>", "rowCount": <n>}`.
- Keep the old `nasa_cancelled_contracts_latest.csv` branch working until
  Task 9 removes it (the deployed site must never 404 mid-migration).

**Files:** `docs/shared/js/constants.js`, `docs/cancellations/index.html`

- `DATA_URLS.cancellations` → `'../data/cancellations/master_ledger_latest.csv'`
  (`constants.js:111`).
- Download links (`index.html:191-192`) → the deployed CSV itself
  (`../data/cancellations/master_ledger_latest.csv`, `download` attribute).
  Remove the Google Sheet URLs here and in `DATA_URLS` (`constants.js:116`) —
  the displayed data and the downloadable data must be the same bytes.

## Task 2: Harden shared `parseCSV`

**File:** `docs/shared/js/utils.js` (shared — nasa-science reads through it
too; the change must be behavior-preserving for well-formed input)

Replace the split-on-`\n`-then-parse-lines approach (`parseCSV:14`,
`parseCSVLine:43`) with a single state-machine tokenizer over the whole text:

- Inside quotes: `""` → literal quote; `,`, `\n`, `\r\n` are field content.
- Outside quotes: `,` ends a field; `\n` / `\r\n` ends a row; `\r` is never
  emitted into a value.
- Preserve existing behaviors: header row keys the objects, values trimmed,
  short rows padded with `''`, trailing blank line ignored.

**Tests:** new `tests/parse-csv.test.mjs` using the repo's `node --test` +
`node:assert/strict` pattern (`tests/nasa-science-dc.test.mjs` is the model;
no package.json required). Cases: embedded quoted newline, CRLF file, `""`
escapes, trailing newline, short row padding — plus one integrity case
parsing the deployed ledger copy and asserting row count matches
`metadata.json.rowCount`.

## Task 3: Pure category module

**New file:** `docs/cancellations/js/ledger-categories.js` — no DOM, no
fetch; everything unit-testable.

```js
export const CANCELLED_STATUSES = ['listed', 'still_terminated', 'closed_out', 'descoped'];
export const REVERSED_STATUSES  = ['reinstated', 'vacated', 'continued'];

export function categorize(row)   // -> {cancelled, doge, suspicious, reversed} booleans
export function applyLens(rows, lens)  // -> filtered array
export function summarize(rows)   // -> {count, totalObligations, totalOutlays,
                                  //     claimedSavings, divergedClaims, districts}
export function deriveBadges(row) // -> {statusPill: {label, cls}, sourceCount,
                                  //     divergence, trendGlyphs: []}
```

`categorize` implements the lens table verbatim (Task 0 predicate for
`suspicious`; `cancelled` = cancelled-status && !suspicious). `summarize`
reuses `parseCurrency`/`sumBy` semantics from `utils.js`.

**Tests:** `tests/ledger-categories.test.mjs` — unit cases per lens from
hand-built rows, plus integrity cases against the deployed ledger CSV
(parsed with the real shared `parseCSV`): Cancelled + Suspicious partition
the cancelled-status set; Reversed count matches the status counts; no lens
contains `excluded_by_design` or review statuses.

## Task 4: Lens selector UI

**Files:** `docs/cancellations/index.html`, `docs/shared/css/components.css`

- Markup: a `.lens-bar` between the page tabs and the value boxes — four
  buttons written directly in HTML with `data-tab`-style wiring:

```html
<nav id="lens-bar" class="lens-bar" aria-label="Evidence view">
  <button class="lens-tab active" data-lens="cancelled">
    Cancelled <span class="lens-count"></span>
  </button>
  <button class="lens-tab" data-lens="doge">
    DOGE Claims <span class="lens-count"></span>
  </button>
  <button class="lens-tab" data-lens="suspicious">
    Suspicious <span class="lens-count"></span>
  </button>
  <button class="lens-tab" data-lens="reversed">
    Reversed <span class="lens-count"></span>
  </button>
</nav>
```

- Behavior: reuse the `TabNavigation` mechanics (`tabs.js:16`) with a custom
  `tabClass: 'lens-tab'` and an `onTabChange` that calls
  `dashboard.applyLens(lens)`. Do **not** use `createPageTabs` — it drops the
  options object (`tabs.js:161`), so `onTabChange` would never fire. Since
  lens buttons don't toggle `tab-content` panels, either pass a no-op
  `contentClass` or wire plain click listeners; whichever reads simpler in
  review.
- One-line subtitle under the bar describing the active lens (text from the
  lens table's Headline column), plus the count-change footnote (Task 6).
- No URL-hash encoding of the lens: `HashRouter` (`hash-router.js`) supports
  only flat routes and already carries tab + district deep links. Lens is
  session state.
- CSS: promote the appropriations-guide badge convention
  (`docs/appropriations-guide/index.html:393-410` — light-100 background,
  -700 text from the same ramp, `--border-radius-full`, `--text-xs`,
  uppercase) into `components.css` as shared classes:

```css
.badge {
  /* base: padding 2px 8px, radius-full, text-xs, medium, uppercase */
}
.badge--cancelled {
  background: var(--red-100);
  color: var(--red-700);
}
.badge--doge {
  background: var(--purple-100);
  color: var(--purple-700);
}
.badge--suspicious {
  background: var(--orange-100);
  color: var(--orange-700);
}
.badge--reversed {
  background: var(--green-100);
  color: var(--green-700);
}
.badge--excluded {
  background: var(--gray-100);
  color: var(--gray-700);
}
```

plus `.lens-bar` / `.lens-tab` styled after the existing `.card-tab`
segmented look (`components.css:346-405`). Mobile: horizontal scroll with
`-webkit-overflow-scrolling: touch`, same treatment page tabs get.

## Task 5: `applyLens()` pipeline in app.js

**File:** `docs/cancellations/js/app.js`

- `processData()` parses once into `this.allRows`, attaching
  `row._cat = categorize(row)` and parsed numerics. Delete
  `extractReportedSavings` (`app.js:148`) — read
  `parseCurrency(row['Claimed Savings'])`. Delete the `'total'`-row filter
  (`app.js:165` — the ledger has no total row).
- `applyLens(lens)`:
  1. `this.cleanedData = applyLens(this.allRows, lens)`
  2. `this.calculateDistrictData()` (unchanged mechanics)
  3. `ValueBox.render(...)` with the lens-specific boxes (Task 6)
  4. `this.map.setData(this.districtCounts, this.hoverInfo, this.maxContracts)` —
     safe to re-call: `render()` uses a keyed D3 join
     (`choropleth-map.js:342`, `:371`). **Caveat:** the legend renders once at
     init from the old max — refresh it on `setData` (small change inside
     `choropleth-map.js`, guarded so other dashboards are unaffected).
  5. `DataTable.render(columns, rows)` on all three tables — destroy-and-
     rebuild is the documented-safe path (`data-table.js:40`).
- Map colors: add a `cancellationsSteps` array to `COLORS.choropleth`
  (`constants.js:65` area). Today `colorScale: 'cancellations'` finds no
  steps and collapses to one flat color with no legend.
- District summary view (`renderDistrictAwards`) filters from
  `this.cleanedData`, so it inherits the active lens automatically; its
  stats line should name the lens ("under the Cancelled view").

## Task 6: Value boxes per lens

**File:** `docs/shared/js/components/value-box.js`
(`createCancellationsValueBoxes:130` gains a `lens` parameter)

Stay at exactly **4 boxes per lens** — `.value-boxes-row` is a fixed
`repeat(4, 1fr)` grid with 4 hardcoded animation delays
(`components.css:204`, `:233-236`); not worth touching.

| Lens       | Box 1                  | Box 2                      | Box 3                   | Box 4                      |
| ---------- | ---------------------- | -------------------------- | ----------------------- | -------------------------- |
| Cancelled  | Awards terminated      | Value of terminated awards | Savings claimed by DOGE | Districts affected         |
| DOGE       | Awards claimed by DOGE | Claimed savings            | Actual obligated value  | Claims diverging from data |
| Suspicious | Awards flagged         | Value at risk              | Avg. days truncated     | Districts affected         |
| Reversed   | Terminations reversed  | Value restored             | Court vacaturs          | Districts affected         |

Footnote line under the boxes (all lenses):
_"Detection expanded July 2026 (IDV vehicles, end-date truncations, grant
clawbacks); counts are not comparable to earlier versions of this page."_

## Task 7: Tables + district cards enrichment

**Files:** `docs/cancellations/js/app.js`,
`docs/shared/js/components/data-table.js`

- **Raw Data table** (stop using `createContractsTable` — it's the dead
  `Nominal End Date` config; build the column list in app.js):
  `Award ID (link)`, `Status` (badge via `formatter` → `gridjs.html`,
  pattern at `data-table.js:266`), `District`, `Recipient`,
  `Award Amount` (currency), `Total Outlays` (currency),
  `Claimed Savings` (currency), `Sources` (dot-count ●●○○ with full names in
  `title`), `First Seen` (`hideOnMobile`), `Detection` (`hideOnMobile`),
  `Description` (truncated), hidden `URL`. Raw Data always shows **all**
  rows regardless of lens — it is the audit view; the Status column carries
  the distinction.
- **District award cards** (`renderAwardCard`, `app.js:556`): status badge in
  the header row; when a claim exists, a three-up Claimed / Obligated /
  Outlaid row; trend glyphs from `deriveBadges` (▼ amount cut, ◀ end date
  pulled in) with `title` tooltips.
- **District table**: blank `District` → `"Unknown"` label (unlinked — no
  geoid to route to).
- **Escaping**: run every ledger text field through `escapeHtml`
  (`utils.js:337`) before interpolation into `gridjs.html` or card template
  strings — Description/Recipient are upstream-controlled text.

## Task 8: About tab + copy

**File:** `docs/cancellations/index.html`

- Rewrite "How Awards Are Identified" around the four lenses; add a
  "Claims vs. Outcomes" section adapted from the tracking repo README
  (claims are write-once and never pruned; outcomes are derived; divergence
  is a comparison, not a judgement).
- Document Reversed with its best example (the court-vacated Harvard
  termination) and `excluded_by_design` (termination for cause is contractor
  failure, not policy cancellation — deliberately excluded).
- Note the weekly re-verification (`Auto Status` in the download).
- Update the JSON-LD `Dataset.description` and the meta descriptions if the
  page's framing changes; bump `temporalCoverage` phrasing if needed.

## Task 9: Cleanup + final verification

- Remove: old CSV + its workflow branch, `extractReportedSavings` remnants,
  Google Sheet constants, dead `Nominal End Date`/`createContractsTable`
  config if now unused by every dashboard.
- Verification checklist:
  1. `node --test tests/` — parseCSV, categories, and both integrity tests
     green.
  2. Local serve (`python3 -m http.server` from `docs/`): all four lenses
     recompute boxes, map (with legend), summary tables, and Raw Data badge
     rendering; district deep link `#CA-37` works under each lens; back
     button restores state; mobile ≤768px shows the lens bar scrollable and
     card labels via `data-column-id`.
  3. Category invariants printed by the tests: Cancelled + Suspicious
     partition the cancelled-status set; no lens contains excluded/review
     rows.
  4. Workflow dry-run via `workflow_dispatch` on a branch: deployed CSV
     matches the tracking repo's ledger byte-for-byte; `metadata.json` has
     the ledger commit date and rowCount.
  5. Browser console clean on load and on every lens switch.

---

## Execution strategy

Implementation is delegated to **Opus 5 subagents** with tight per-task
scopes (files, conventions, test expectations); **Fable orchestrates**,
reviews every diff, and runs the tests. Run **`/simplify`** (read-only
Explore reviewers only) after Tasks 2/3, after Tasks 4/5, and after
Tasks 6/7. Task 0 lands in `nasa-cancellations-tracking` first and
independently — the dashboard work starts against the ledger with the
`Detection` column already present, so the Suspicious fallback predicate
never ships.

## Mobile behavior

Lens bar: horizontal scroll (same pattern as page tabs). Value boxes: the
existing responsive collapse. Raw Data: `Detection`/`First Seen` hidden via
`hideOnMobile`; Grid.js mobile card labels come free from `data-column-id`.
Map: already visible on mobile at 300px with zoom disabled
(`index.html:104-112`).

## Error handling

- Ledger fetch failure → existing `showError` path (`app.js:431`).
- Unknown `Status` value (vocabulary will evolve): treat as no-lens
  (Raw-Data-only) and `console.warn` once per unknown value — never throw,
  never silently count it as cancelled.
- `metadata.json` missing `rowCount` → skip the integrity assertion, keep
  the date fallback behavior that exists today (`app.js:405`).
