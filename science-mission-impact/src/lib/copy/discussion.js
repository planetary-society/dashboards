// The overview's comparison gates. Pure so node can test it.

/** Larger missions have the higher median annual output in every division shown. */
export const largerAnnualMedians = (rows) => rows.length > 1 && rows.every((d) =>
	d?.small?.median != null && d?.larger?.median != null && d.small.median < d.larger.median);

/** Every compared division has an estimated group difference, and none clearly favors small missions. */
export const noClearSmallAdvantage = (comparisons) => comparisons.length > 0 && comparisons.every((c) =>
	c?.ci?.length === 2 && c.ci.every(Number.isFinite) && (c.favors === null || c.favors === 'over'));

/** The significance level every p the copy reads is held to. */
export const ALPHA = 0.05;

/** Beyond chance at ALPHA; a missing p never is. */
export const significant = (p) => p != null && p < ALPHA;

