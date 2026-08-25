/**
 * Terminations Module
 *
 * Pure helpers over `terminations.csv` and `descoped.csv`, the federal-record
 * half of the cancellations dashboard. No DOM, no fetch, no state beyond the
 * shared warn-once registry, so this module is safe to import from both the
 * browser dashboard and Node test runners.
 *
 * Every terminations.csv row is a termination action found in an award's
 * USAspending transaction history — either by its FPDS action code or by
 * explicit termination language in the transaction description. De-scoped
 * awards — NASA pulled part of the work but the award lives on — are published
 * upstream to their own `descoped.csv`, which carries the identical column
 * schema. A few terminations.csv rows are still disclosed *partials*: wound
 * down administratively (`closed_out`), or `descoped` should one ever be
 * annotated rather than routed out upstream. Partials stay in the table with
 * their own badge but are kept out of the headline count and out of every
 * dollar total, because counting a partial as a cancelled award overstates
 * the effect.
 *
 * The two files are one union to the display layer and two datasets to the
 * arithmetic: `_status` records which file a row came from, so the table, the
 * map and the district aggregates can show every affected award while the
 * headline count and every dollar total stay terminated-only.
 */

import { getGeoidFromDistrict, parseCurrency, parseIsoDateUTC } from '../../shared/js/utils.js';
import { districtOf, field, hasColumn, usaspendingUrl, warnOnce } from './panel-common.js';

// Re-exported so panel code can treat the URL builder as part of this
// dataset's API; the definition lives in panel-common (both datasets use it).
export { usaspendingUrl };

/**
 * `override_status` values meaning only part of the award was cut
 *
 * The split every count and total in this module turns on: these rows describe
 * a surviving award, everything else describes a terminated one.
 *
 * @type {string[]}
 */
const PARTIAL_STATUSES = ['descoped', 'closed_out'];

/**
 * Which upstream file a normalized row came from
 *
 * Stamped onto every row as `_status`, so a consumer holding the union can
 * split it back apart without re-reading either file. Deliberately not derived
 * from `override_status`: a descoped.csv row may carry a blank one (upstream
 * annotates only some of them), and the file it was published in is the
 * authoritative answer to "was this award cancelled or cut back?".
 *
 * @type {{terminated: string, descoped: string}}
 */
export const AWARD_STATUS = {
    terminated: 'TERMINATED',
    descoped: 'DESCOPED'
};

/**
 * Detect which optional columns a parsed CSV carries
 *
 * Silent by design: `normalizeTerminations` does the warning once, and the
 * default argument of `terminationStats` needs the same answer without
 * re-warning about a file it has already complained about.
 *
 * Districts need only one of the two column pairs — `districtOf` prefers place
 * of performance and falls back to the recipient's address — so the flag is an
 * OR rather than an AND.
 *
 * @param {Array<Object>} rows - Parsed CSV rows
 * @returns {{districts: boolean, obligated: boolean, potential: boolean}} Availability flags
 */
function detectColumns(rows) {
    return {
        districts: hasColumn(rows, 'pop_district') || hasColumn(rows, 'recipient_district'),
        obligated: hasColumn(rows, 'total_obligated'),
        potential: hasColumn(rows, 'total_potential_value')
    };
}

/**
 * Normalize parsed `terminations.csv` rows for display and analysis
 *
 * Each row is copied with derived fields attached, all underscore-prefixed so
 * they cannot collide with a future upstream column:
 *
 *   - `_obligated`  numeric `total_obligated`, or null
 *   - `_potential`  numeric `total_potential_value`, or null
 *   - `_atStake`    the award's value at stake: its ceiling where the record
 *                   reports one, else what it had obligated (see below)
 *   - `_district`   'VA-11'-style code, or '' when the row carries no district
 *   - `_geoid`      4-digit map GEOID for `_district`, or null
 *   - `_recipient`  trimmed `recipient_name`
 *   - `_partial`    true when only part of the award was cut
 *   - `_status`     which file the row came from (see `AWARD_STATUS`)
 *
 * `_atStake` is a coalesce, never a sum: contracts and IDVs report a ceiling in
 * `total_potential_value`, grants report none, and every row carrying both has
 * potential >= obligated. Deriving it here rather than inside a total means the
 * table, the cards, the district pages and the value box all reconcile to one
 * number per award.
 *
 * A column dropped upstream degrades to a single console warning and null
 * values rather than a throw: `columns` tells the display layer which value
 * boxes and table columns it can honestly render.
 *
 * `descoped.csv` shares this schema exactly, so it is normalized by this same
 * function under the `AWARD_STATUS.descoped` tag. Both files therefore share
 * the warn-once keys below: they are generated by one upstream job, so a
 * column dropped from one is a schema change worth exactly one warning.
 *
 * @param {Array<Object>} rawRows - Rows from `parseCSV`
 * @param {string} [status] - `AWARD_STATUS` tag stamped on every row
 * @returns {{rows: Array<Object>, columns: {districts: boolean, obligated: boolean,
 *   potential: boolean}}} Normalized rows and column availability flags
 */
export function normalizeTerminations(rawRows, status = AWARD_STATUS.terminated) {
    const list = Array.isArray(rawRows) ? rawRows : [];
    const columns = detectColumns(list);

    // An empty file is not a schema change, so it warns about nothing: with no
    // rows to inspect every column reads as absent and the warnings would be
    // pure noise.
    if (list.length > 0) {
        if (!columns.districts) {
            warnOnce(
                'terminations:district',
                'terminations: no pop_district or recipient_district column — district views unavailable'
            );
        }

        if (!columns.obligated) {
            warnOnce('terminations:total_obligated', 'terminations: missing total_obligated column');
        }

        if (!columns.potential) {
            warnOnce(
                'terminations:total_potential_value',
                'terminations: missing total_potential_value column'
            );
        }
    }

    const rows = list.map((row) => {
        const district = districtOf(row);
        const obligated = parseCurrency(row.total_obligated);
        const potential = parseCurrency(row.total_potential_value);

        return {
            ...row,
            _obligated: obligated,
            _potential: potential,
            _atStake: Number.isFinite(potential) ? potential : obligated,
            _district: district,
            _geoid: getGeoidFromDistrict(district),
            _recipient: field(row, 'recipient_name'),
            _partial: PARTIAL_STATUSES.includes(field(row, 'override_status')),
            _status: status
        };
    });

    return { rows, columns };
}

/**
 * Normalize both award files into one status-tagged union
 *
 * The dashboard shows every award NASA cut — terminated or descoped — in the
 * table, on the map and on district pages, but counts and totals only the
 * terminated ones. So this returns both views over the same normalized rows:
 * `rows` for anything that lists or aggregates awards, `terminated` for
 * anything a headline figure is computed from. Never sum a figure derived from
 * one against a figure derived from the other.
 *
 * `descoped.csv` is optional: it shipped after the dashboard did, so an older
 * deploy (or a 404 on a stale cache) passes nothing here and degrades to the
 * terminations-only page it has always been.
 *
 * `columns` comes from `terminations.csv` alone — it gates the value boxes,
 * which are terminated-only, so a column present in one file and absent from
 * the other must not change what the headline renders.
 *
 * The two files are trusted to be disjoint: they are generated together
 * upstream, and the test suite asserts disjointness against the real synced
 * CSVs, which gates the deploy - a stale pair (on 2026-08-25 a terminations.csv
 * predating the descope split still held all six descoped awards) fails the
 * build rather than shipping double-listed awards. No silent dedup here:
 * absorbing a duplicate would hide exactly the sync failure the gate catches.
 *
 * @param {Array<Object>} terminationRows - Rows from `parseCSV` of terminations.csv
 * @param {Array<Object>} [descopedRows] - Rows from `parseCSV` of descoped.csv
 * @returns {{rows: Array<Object>, terminated: Array<Object>, descoped: Array<Object>,
 *   columns: {districts: boolean, obligated: boolean, potential: boolean}}} Union,
 *   its two halves, and the terminated file's column availability flags
 */
export function normalizeAwards(terminationRows, descopedRows) {
    const terminations = normalizeTerminations(terminationRows);
    const descoped = normalizeTerminations(descopedRows, AWARD_STATUS.descoped);

    return {
        rows: [...terminations.rows, ...descoped.rows],
        terminated: terminations.rows,
        descoped: descoped.rows,
        columns: terminations.columns
    };
}

/**
 * Split a union of award rows back into its two halves
 *
 * The union travels as one list — the table, the map and a district's card grid
 * all show it whole — but every sentence that counts awards has to name the two
 * kinds separately. One definition of the split, so no surface invents its own.
 *
 * @param {Array<Object>} rows - Normalized rows carrying `_status`
 * @returns {{terminated: Array<Object>, descoped: Array<Object>}} The two halves
 */
export function splitByStatus(rows) {
    const terminated = [];
    const descoped = [];

    for (const row of rows || []) {
        if (row?._status === AWARD_STATUS.descoped) {
            descoped.push(row);
        } else {
            terminated.push(row);
        }
    }

    return { terminated, descoped };
}

/**
 * Collect the award ids present in a set of termination rows
 *
 * Used for the cross-panel overlap sentence, which asks how many DOGE claims
 * also appear here.
 *
 * @param {Array<Object>} rows - Termination rows
 * @returns {Set<string>} Non-empty `award_id` values
 */
export function terminationIdSet(rows) {
    const ids = new Set();

    for (const row of rows || []) {
        // Both key namespaces (bare PIID and USAspending's generated key) go
        // in: consumers matching either key — the DOGE overlap checks both —
        // then need only this one Set. The namespaces cannot collide.
        const id = field(row, 'award_id');
        if (id) ids.add(id);
        const generated = field(row, 'generated_award_id');
        if (generated) ids.add(generated);
    }

    return ids;
}

/**
 * Compute summary statistics for the Confirmed Cancellations panel
 *
 * `confirmed` and `partials` split the rows in two; the dollar totals cover the
 * confirmed side only, so the headline figure never quietly includes money from
 * awards that are still running. Totals are null — not zero — when the source
 * column is absent, so the display layer can omit the box rather than print a
 * misleading $0.
 *
 * `totalPotential` sums each row's `_atStake` (see `normalizeTerminations`) and
 * `potentialFillCount` counts the rows that had one, so the value box can say
 * how much of its universe it covers. Both ride on `columns.potential`: without
 * a ceiling column the figure would be pure obligations under a label promising
 * ceilings, so the display layer drops the box instead.
 *
 * `totalObligated` is kept even though no box shows it: it is what the grant
 * fallback draws on, and the live-data tests use it to check that the coalesce
 * never lands below the obligations it replaced.
 *
 * All values are unformatted; callers decide on presentation.
 *
 * @param {Array<Object>} rows - Normalized termination rows
 * @param {{districts: boolean, obligated: boolean, potential: boolean}} [columns] -
 *   Availability flags from `normalizeTerminations`; re-derived when omitted
 * @returns {{confirmed: number, partials: number, totalObligated: number|null,
 *   totalPotential: number|null, potentialFillCount: number, districts: number|null,
 *   recipients: number}} Statistics
 */
export function terminationStats(rows, columns = detectColumns(rows || [])) {
    const list = rows || [];
    const districts = new Set();
    const recipients = new Set();
    let confirmed = 0;
    let partials = 0;
    let totalObligated = 0;
    let totalPotential = 0;
    let potentialFillCount = 0;

    for (const row of list) {
        const district = field(row, '_district');
        if (district) districts.add(district);

        const recipient = field(row, 'recipient_name');
        if (recipient) recipients.add(recipient);

        if (row._partial) {
            partials++;
            continue;
        }

        confirmed++;
        if (Number.isFinite(row._obligated)) totalObligated += row._obligated;

        if (Number.isFinite(row._atStake)) {
            // Confirmed-only, matching the totalPotential sum it qualifies:
            // the value-box caveat must describe the same universe as the box.
            totalPotential += row._atStake;
            potentialFillCount++;
        }
    }

    return {
        confirmed,
        partials,
        totalObligated: columns.obligated ? totalObligated : null,
        totalPotential: columns.potential ? totalPotential : null,
        potentialFillCount: columns.potential ? potentialFillCount : 0,
        districts: columns.districts ? districts.size : null,
        recipients: recipients.size
    };
}

/**
 * Convert a 'YYYY-MM' key to a sortable integer month ordinal
 * @param {string} key - Month key
 * @returns {number} Months since year zero
 */
function monthOrdinal(key) {
    const [year, month] = key.split('-').map(Number);

    return year * 12 + (month - 1);
}

/**
 * Convert a month ordinal back to a 'YYYY-MM' key
 * @param {number} ordinal - Months since year zero
 * @returns {string} Month key
 */
function monthKey(ordinal) {
    const year = Math.floor(ordinal / 12);
    const month = (ordinal % 12) + 1;

    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

/**
 * Bucket termination actions into a continuous monthly series
 *
 * `action_date` is the date the federal record shows the action landing. Dates
 * are validated with `parseIsoDateUTC` and then sliced rather than fed to
 * `new Date`, which would reinterpret a date-only string in the viewer's
 * timezone and could shift an action into the neighbouring month.
 *
 * Months between the earliest and latest action are zero-filled, so the series
 * plots directly without gap handling — and the four-month lull between
 * September 2025 and January 2026 shows as the gap it is rather than closing up.
 * Rows whose date is blank or unparseable are reported in `skipped` rather than
 * silently dropped.
 *
 * @param {Array<Object>} rows - Termination rows (any subset)
 * @returns {{months: Array<{month: string, count: number}>, skipped: number}} Continuous series
 */
export function monthlyCounts(rows) {
    const buckets = new Map();
    let skipped = 0;

    for (const row of rows || []) {
        const date = field(row, 'action_date');

        if (parseIsoDateUTC(date) === null) {
            skipped++;
            continue;
        }

        const month = date.slice(0, 7);
        buckets.set(month, (buckets.get(month) || 0) + 1);
    }

    if (buckets.size === 0) return { months: [], skipped };

    const ordinals = [...buckets.keys()].map(monthOrdinal);
    const months = [];

    for (let ordinal = Math.min(...ordinals); ordinal <= Math.max(...ordinals); ordinal++) {
        const month = monthKey(ordinal);

        months.push({ month, count: buckets.get(month) || 0 });
    }

    return { months, skipped };
}

/**
 * `override_status` → badge display mapping
 *
 * A blank status is the common case (166 of 177 rows): the termination action
 * stands as first found. `still_terminated` means a human re-check confirmed
 * the termination still stands — a note about the review workflow, not a
 * different outcome, so it deliberately wears the identical label (Casey's
 * call, 2026-08-21). The CSV download keeps the distinction.
 *
 * The two partial statuses are deliberately not cancelled-red: the award
 * continues, so the badge must not read as a cancellation at a glance.
 *
 * @type {Object<string, {label: string, badgeClass: string}>}
 */
export const OVERRIDE_META = {
    '': { label: 'Terminated', badgeClass: 'badge--cancelled' },
    still_terminated: { label: 'Terminated', badgeClass: 'badge--cancelled' },
    descoped: { label: 'Descoped', badgeClass: 'badge--excluded' },
    closed_out: { label: 'Closed out', badgeClass: 'badge--excluded' }
};

/**
 * Look up the badge for an `override_status` value
 *
 * An unrecognized value is shown verbatim in the neutral badge rather than
 * being mapped onto a meaning we cannot vouch for, and warns once per distinct
 * value so a new upstream status surfaces in the console instead of silently
 * inheriting "Terminated".
 *
 * @param {string} status - Raw `override_status` value
 * @returns {{label: string, badgeClass: string}} Badge label and CSS class
 */
export function overrideMeta(status) {
    const raw = String(status ?? '').trim();
    const meta = OVERRIDE_META[raw];

    if (meta) return meta;

    warnOnce(
        `terminations:override_status:${raw}`,
        `terminations: unknown override_status value "${raw}"`
    );

    return { label: raw, badgeClass: 'badge--excluded' };
}

/**
 * Look up the badge for a normalized award row
 *
 * The file a row came from outranks its `override_status`: a `descoped.csv`
 * row describes a surviving award whether or not upstream got round to
 * annotating it, and a blank status falling through to `overrideMeta` would
 * badge it "Terminated". Rows from `terminations.csv` are unaffected, so their
 * badges — including the two disclosed partial statuses — are unchanged.
 *
 * @param {Object} row - Normalized row from `normalizeTerminations`
 * @returns {{label: string, badgeClass: string}} Badge label and CSS class
 */
export function awardMeta(row) {
    if (row?._status === AWARD_STATUS.descoped) {
        return OVERRIDE_META.descoped;
    }

    return overrideMeta(row?.override_status);
}
