/**
 * Marker Injection Module
 *
 * Pure string rewrites over the cancellations dashboard's HTML, used by the
 * daily SEO bake. No fs, no DOM: the caller reads and writes the file, this
 * module only transforms text.
 *
 * The contract with `docs/cancellations/index.html` is a pair of HTML comments
 * per injection point:
 *
 *     <!-- bake:headline -->…rewritten daily…<!-- /bake:headline -->
 *
 * A marker that has gone missing — renamed, deleted, or swallowed by an edit —
 * must fail the job loudly rather than let the page keep serving a stale
 * sentence, so every function here throws instead of returning the input
 * unchanged. Prettier reformats the page after every deploy, so the matchers
 * tolerate arbitrary whitespace inside the comments and any content, including
 * newlines, between them.
 *
 * Every function is idempotent: running the bake twice over the same input with
 * the same values produces byte-identical output.
 */

import { escapeHtml } from '../../docs/shared/js/utils.js';

/** Matches an ISO calendar day, the only date shape the page's JSON-LD accepts */
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Escape a string for literal use inside a regular expression
 * @param {string} value - Literal text
 * @returns {string} Pattern-safe text
 */
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Count the matches of a global pattern without consuming the regex's state
 * @param {string} text - Text to scan
 * @param {RegExp} pattern - Global pattern
 * @returns {number} Match count
 */
function countMatches(text, pattern) {
    return (text.match(pattern) || []).length;
}

/**
 * Replace the content between a `bake:` marker pair with escaped text
 *
 * The marker pair must appear exactly once. Zero occurrences means the page no
 * longer carries the injection point; more than one means an ambiguous target —
 * both are build failures, named after the marker so the fix is obvious from
 * the Action log alone.
 *
 * The replacement goes in escaped (`escapeHtml`), so a recipient name or a
 * count sentence can never inject markup into the page.
 *
 * @param {string} html - Full page HTML
 * @param {string} name - Marker name, e.g. 'headline'
 * @param {string} text - Plain text to place between the markers
 * @returns {string} Rewritten HTML
 * @throws {Error} When the marker pair is absent or duplicated
 */
export function injectMarker(html, name, text) {
    const marker = `<!-- bake:${name} -->`;
    const tag = escapeRegExp(name);
    const openRe = new RegExp(`<!--\\s*bake:${tag}\\s*-->`, 'g');
    const closeRe = new RegExp(`<!--\\s*/bake:${tag}\\s*-->`, 'g');

    const opens = countMatches(html, openRe);
    const closes = countMatches(html, closeRe);

    if (opens === 0 || closes === 0) {
        throw new Error(`bake marker ${marker} not found in the document`);
    }
    if (opens > 1 || closes > 1) {
        throw new Error(
            `bake marker ${marker} appears ${Math.max(opens, closes)} times; it must appear exactly once`
        );
    }

    const pairRe = new RegExp(
        `(<!--\\s*bake:${tag}\\s*-->)[\\s\\S]*?(<!--\\s*/bake:${tag}\\s*-->)`
    );

    if (!pairRe.test(html)) {
        // Both halves exist but not as a pair — a closing marker before its
        // opening one, which no amount of reformatting produces by accident.
        throw new Error(`bake marker ${marker} is not followed by its closing marker`);
    }

    // Function replacement, never a replacement string: '$&' in an award
    // description would otherwise re-inject the matched markers.
    return html.replace(pairRe, (_match, open, close) => open + escapeHtml(text) + close);
}

/**
 * Rewrite every JSON-LD `"dateModified"` value on the page
 *
 * The page carries the field once today, but nested datasets may each grow one,
 * so all occurrences are rewritten rather than the first: a search-engine-facing
 * date that disagrees with its siblings is worse than no date. Zero occurrences
 * is a build failure for the same reason a missing marker is.
 *
 * @param {string} html - Full page HTML
 * @param {string} isoDate - Replacement date, 'YYYY-MM-DD'
 * @returns {string} Rewritten HTML
 * @throws {Error} When the date is malformed or the field is absent
 */
export function setJsonLdDateModified(html, isoDate) {
    if (!ISO_DAY_RE.test(isoDate)) {
        throw new Error(`dateModified must be an ISO 'YYYY-MM-DD' date, got "${isoDate}"`);
    }

    // Only the value is rewritten; the surrounding whitespace and key are kept
    // verbatim so prettier's formatting of the JSON-LD block survives the bake.
    const fieldRe = /("dateModified"\s*:\s*")[^"]*(")/g;

    if (countMatches(html, fieldRe) === 0) {
        throw new Error('no "dateModified" field found in the document');
    }

    return html.replace(fieldRe, (_match, prefix, suffix) => prefix + isoDate + suffix);
}
