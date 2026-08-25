import test from 'node:test';
import assert from 'node:assert/strict';
import {
    topRoundedPath,
    barPadding,
    labelIndices,
    yTicks
} from '../docs/cancellations/js/chart-common.js';

// These four helpers were lifted out of timeline-chart.js and fy-chart.js, which
// had grown near-verbatim copies of each of them. The charts themselves need a
// DOM and the `d3` global to exercise, so these tests pin the extracted geometry
// directly — that is where the duplication used to drift.
//
// The two call sites differ in exactly one argument: the minimum horizontal
// space an x-axis label needs. fy-chart passes 34 ('YYYY'), timeline-chart
// passes 46 ('Feb ’25'). Both values are covered below.

/** Minimum label space used by fy-chart.js */
const FY_LABEL_SPACE = 34;

/** Minimum label space used by timeline-chart.js */
const TIMELINE_LABEL_SPACE = 46;

/**
 * Build a stand-in for a D3 linear scale
 *
 * yTicks only ever calls .ticks() and .domain(), so a stub keeps the test free
 * of the d3 global the charts load from a CDN.
 *
 * @param {Array<number>} domain - Value returned by .domain()
 * @param {Array<number>} ticks - Value returned by .ticks()
 * @returns {{ticks: Function, domain: Function, requested: Array<number>}} Scale stub
 *   whose `requested` array records every tick count it was asked for
 */
function scaleStub(domain, ticks) {
    const requested = [];

    return {
        requested,
        ticks(count) {
            requested.push(count);
            return ticks;
        },
        domain: () => domain
    };
}

// --- topRoundedPath ----------------------------------------------------------

test('topRoundedPath rounds the top corners and leaves the baseline square', () => {
    assert.equal(topRoundedPath(0, 0, 40, 100), 'M0,100 V3 Q0,0 3,0 H37 Q40,0 40,3 V100 Z');
});

test('topRoundedPath clamps the radius to half the bar width', () => {
    // A 4px bar cannot carry a 3px radius on both corners
    assert.equal(topRoundedPath(0, 0, 4, 10), 'M0,10 V2 Q0,0 2,0 H2 Q4,0 4,2 V10 Z');
});

test('topRoundedPath clamps the radius to the bar height', () => {
    // 1.5px is the floor both charts apply to a small but non-zero bar
    assert.equal(
        topRoundedPath(0, 98.5, 40, 1.5),
        'M0,100 V100 Q0,98.5 1.5,98.5 H38.5 Q40,98.5 40,100 V100 Z'
    );
});

test('topRoundedPath degrades to square corners at zero height', () => {
    assert.equal(topRoundedPath(0, 50, 40, 0), 'M0,50 V50 Q0,50 0,50 H40 Q40,50 40,50 V50 Z');
});

test('topRoundedPath survives a zero-width band without producing NaN', () => {
    const path = topRoundedPath(5, 0, 0, 10);

    assert.equal(path, 'M5,10 V0 Q5,0 5,0 H5 Q5,0 5,0 V10 Z');
    assert.ok(!path.includes('NaN'));
});

test('topRoundedPath floors a negative height at a zero radius', () => {
    // Guards the Math.max(0, ...) clamp: a negative height must not yield a
    // negative radius, which would invert the corner curves
    assert.equal(topRoundedPath(0, 0, 40, -5), 'M0,-5 V0 Q0,0 0,0 H40 Q40,0 40,0 V-5 Z');
});

test('topRoundedPath accepts a caller-supplied radius', () => {
    assert.equal(topRoundedPath(0, 0, 40, 100, 10), 'M0,100 V10 Q0,0 10,0 H30 Q40,0 40,10 V100 Z');
});

test('topRoundedPath never emits NaN across degenerate geometry', () => {
    for (const width of [0, 0.5, 1, 4, 40, 300]) {
        for (const height of [0, 0.4, 1.5, 100]) {
            const path = topRoundedPath(0, 0, width, height);
            assert.ok(!path.includes('NaN'), `NaN for ${width}x${height}: ${path}`);
        }
    }
});

// --- barPadding --------------------------------------------------------------

test('barPadding floors at 0.15 so sparse charts keep chunky bars', () => {
    // 7 fiscal years across 640px: the 2px gap is a rounding error, so the
    // floor decides
    assert.equal(barPadding(640, 7), 0.15);
});

test('barPadding caps at 0.7 so dense charts thin bars instead of dissolving them', () => {
    assert.equal(barPadding(640, 300), 0.7);
    assert.equal(barPadding(1, 400), 0.7);
});

test('barPadding scales with density between the floor and the cap', () => {
    assert.equal(barPadding(640, 60), 0.1875);
    assert.equal(barPadding(640, 140), 0.4375);
});

test('barPadding treats a zero count as one band rather than dividing by zero', () => {
    // At 640px the guard is invisible — Math.max(1, 0) and a division by zero
    // both land on the 0.15 floor. A narrow container is what separates them:
    // without the guard the step is Infinity, the gap fraction collapses to 0,
    // and every narrow empty chart silently pins to the floor.
    assert.equal(barPadding(640, 0), 0.15);
    assert.equal(barPadding(10, 0), 0.2);
    assert.equal(barPadding(1, 0), 0.7);

    for (const innerWidth of [1, 10, 640]) {
        assert.ok(Number.isFinite(barPadding(innerWidth, 0)));
    }
});

test('barPadding accepts a caller-supplied minimum gap', () => {
    assert.equal(barPadding(640, 60, 4), 0.375);
});

test('barPadding always returns a fraction inside [0.15, 0.7]', () => {
    for (const innerWidth of [1, 10, 60, 320, 640, 1200]) {
        for (const count of [0, 1, 2, 7, 13, 40, 120, 400]) {
            const padding = barPadding(innerWidth, count);

            assert.ok(
                padding >= 0.15 && padding <= 0.7,
                `out of range for ${innerWidth}px / ${count}: ${padding}`
            );
        }
    }
});

// --- labelIndices ------------------------------------------------------------

test('labelIndices labels the only band when there is one, or none', () => {
    assert.deepEqual(labelIndices(1, 10, FY_LABEL_SPACE), [0]);
    assert.deepEqual(labelIndices(0, 10, FY_LABEL_SPACE), [0]);
});

test('labelIndices labels every band when they all fit', () => {
    assert.deepEqual(labelIndices(7, 80, FY_LABEL_SPACE), [0, 1, 2, 3, 4, 5, 6]);
    assert.deepEqual(
        labelIndices(13, 46, TIMELINE_LABEL_SPACE),
        [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
    );
});

test('labelIndices thins labels to fit the available step', () => {
    // 34px label into a 12px step: every third year
    assert.deepEqual(labelIndices(7, 12, FY_LABEL_SPACE), [0, 3, 6]);
    assert.deepEqual(labelIndices(25, 12, FY_LABEL_SPACE), [0, 3, 6, 9, 12, 15, 18, 21, 24]);
});

test('labelIndices drops the penultimate label when the final one would crowd it', () => {
    // every = 5 gives 0,5,10 across 13 months; 12 sits 2 steps from 10, so 10 goes
    assert.deepEqual(labelIndices(13, 10, TIMELINE_LABEL_SPACE), [0, 5, 12]);
});

test('labelIndices collapses to first and last when nothing else fits', () => {
    assert.deepEqual(labelIndices(13, 3, TIMELINE_LABEL_SPACE), [0, 12]);
    assert.deepEqual(labelIndices(7, 5, FY_LABEL_SPACE), [0, 6]);
});

test('labelIndices clamps the step to 1px so the stride stays tied to label width', () => {
    // The Math.max(1, step) guard only shows itself once the series is long
    // enough for a middle label to survive. Below ~69 bands a sub-pixel step
    // collapses to first-and-last either way; past it, dropping the clamp
    // divides by the raw sub-pixel step, inflates the stride, and loses the
    // middle label the chart could actually have fitted.
    assert.deepEqual(labelIndices(69, 0.2, FY_LABEL_SPACE), [0, 34, 68]);
    assert.deepEqual(labelIndices(93, 0.2, TIMELINE_LABEL_SPACE), [0, 46, 92]);
});

test('labelIndices always keeps the first and last band, at both label widths', () => {
    for (const minLabelSpace of [FY_LABEL_SPACE, TIMELINE_LABEL_SPACE]) {
        for (const count of [2, 3, 7, 13, 25, 60, 140]) {
            for (const step of [0.2, 1, 3, 5, 12, 34, 46, 80, 200]) {
                const indices = labelIndices(count, step, minLabelSpace);
                const label = `count=${count} step=${step} space=${minLabelSpace}`;

                assert.equal(indices[0], 0, `first not labelled: ${label}`);
                assert.equal(indices[indices.length - 1], count - 1, `last not labelled: ${label}`);
            }
        }
    }
});

test('labelIndices returns strictly ascending, in-range indices', () => {
    for (const minLabelSpace of [FY_LABEL_SPACE, TIMELINE_LABEL_SPACE]) {
        for (const count of [2, 3, 7, 13, 25, 60, 140]) {
            for (const step of [0.2, 1, 3, 5, 12, 34, 46, 80, 200]) {
                const indices = labelIndices(count, step, minLabelSpace);
                const label = `count=${count} step=${step} space=${minLabelSpace}`;

                for (const [position, index] of indices.entries()) {
                    assert.ok(
                        Number.isInteger(index) && index >= 0 && index < count,
                        `index ${index} out of range: ${label}`
                    );

                    if (position > 0) {
                        assert.ok(index > indices[position - 1], `not ascending: ${label}`);
                    }
                }
            }
        }
    }
});

// --- yTicks ------------------------------------------------------------------

test('yTicks keeps whole-numbered ticks as-is', () => {
    assert.deepEqual(yTicks(scaleStub([0, 4], [0, 1, 2, 3, 4])), [0, 1, 2, 3, 4]);
});

test('yTicks drops fractional ticks rather than formatting them away', () => {
    // Counts are whole actions; d3.format('d') would render 0.5 as "0" or "1"
    // and print duplicate gridline labels
    assert.deepEqual(yTicks(scaleStub([0, 1], [0, 0.25, 0.5, 0.75, 1])), [0, 1]);
    assert.deepEqual(yTicks(scaleStub([0, 0.5], [0, 0.1, 0.2, 0.3, 0.4, 0.5])), [0]);
});

test('yTicks falls back to a rounded-up domain when every tick is fractional', () => {
    assert.deepEqual(yTicks(scaleStub([0, 2.5], [0.5, 1.5, 2.5])), [0, 3]);
});

test('yTicks falls back when the scale offers no ticks at all', () => {
    assert.deepEqual(yTicks(scaleStub([0, 7.2], [])), [0, 8]);
});

test('yTicks de-duplicates repeated tick values', () => {
    assert.deepEqual(yTicks(scaleStub([0, 2], [0, 1, 1, 2])), [0, 1, 2]);
});

test('yTicks asks for four ticks by default and passes a custom count through', () => {
    const byDefault = scaleStub([0, 4], [0, 1, 2, 3, 4]);
    yTicks(byDefault);
    assert.deepEqual(byDefault.requested, [4]);

    const custom = scaleStub([0, 10], [0, 5, 10]);
    yTicks(custom, 2);
    assert.deepEqual(custom.requested, [2]);
});

test('yTicks never returns an empty axis', () => {
    const cases = [
        [[0, 1], [0, 0.25, 0.5, 0.75, 1]],
        [[0, 0.5], [0.1, 0.2]],
        [[0, 2.5], [0.5, 1.5, 2.5]],
        [[0, 7.2], []],
        [[0, 120], [0, 30, 60, 90, 120]]
    ];

    for (const [domain, ticks] of cases) {
        const result = yTicks(scaleStub(domain, ticks));

        assert.ok(result.length > 0, `empty axis for domain ${JSON.stringify(domain)}`);
        assert.ok(
            result.every(Number.isInteger),
            `non-integer tick for domain ${JSON.stringify(domain)}: ${JSON.stringify(result)}`
        );
    }
});
