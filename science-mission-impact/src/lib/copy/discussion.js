// Per-dollar trend wording and small-side helpers the overview story and the division scatter share.
// A trend "rises" or "falls" only from the packaged fit's slope, is "nearly flat" by its tenfold, and
// carries the caveat only when dropping one mission reverses it. Pure (no $lib, no $app) so node can
// test it. "Small" means at or under the threshold.

/** A division whose every costed mission is small, so it has nothing to compare: `d` is a story.divisions row. */
export const allSmall = (d) => d.missions > 0 && d.missions === d.missionsAll;

/** "Nearly flat": under a quarter more (or less) per dollar at ten times the cost. `fit` is a packaged perDollar fit. */
export const flat = (fit) => Math.abs(fit.tenfold - 1) < 0.25;
export const direction = (fit) => (fit.slope > 0 ? 'positive' : fit.slope < 0 ? 'negative' : 'flat');
export const times = (v) => (Math.abs(v - 2) < 0.05 ? 'twice' : `${v.toFixed(1)} times`);
/** A trend the copy won't state plainly: nearly flat, or reversed by leaving out one mission. */
export const soft = (fit) => flat(fit) || fit.holds === false;
/** A rise the copy states and sizes with no caveat: tested, holding, and not nearly flat. */
export const firm = (fit) => fit.slope > 0 && fit.holds === true && !flat(fit);
/** The caveat a trend carries when leaving out one mission reverses it. */
export const TIPS = 'leaving out a single mission tips it the other way';
/** A rise's size in words: "a mission that cost 10 times as much drew about twice as many citations per dollar". */
export const tenfold = (fit) => `a mission that cost 10 times as much drew about ${times(fit.tenfold)} as many citations per dollar`;

