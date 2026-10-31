import { longDate, spell } from '../format.js';

// Reader-facing copy for the two scopes a reader can pick (SCOPES in state/view.svelte.js). The
// prime-phase `window` scope stays in the packaged data only, so it has no name here.
export const fullWindowLabel = 'Active Mission Window';

/** `asOf`, when given, names the snapshot date instead of just referring to it. */
export const fullWindowText = (policy, asOf = null) =>
	`Mission-specific publication windows, from the month after science starts through the month ${policy.postEndYears} years after the mission ends${policy.minWindowYears ? ` (never shorter than ${policy.minWindowYears} years)` : ''}, cut at the latest date that is mature on ${asOf ? longDate(asOf) : 'the snapshot date'}. Exact exported boundaries are shown on each mission page.`;

export function ordinal(n) {
	const words = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
	return words[n] ?? `${n}th`;
}

/** The calendar years a paper's citations count over: the year it appeared and `citationYears` after. */
export const calendarYears = (p) => p.citationYears + 1;

/** The window caps each paper's citations; the number comes from the run, not copy. */
const citationClause = (p) => `Citations are counted through the ${ordinal(p.citationYears)} calendar year after each paper appears.`;

/** Two sentences on what a scope covers, for the hint beside each scope option. */
export function scopeGloss(scope, { fullPolicy } = {}) {
	if (scope === 'full') return `Papers published from the first full month after science operations begin through ${spell(fullPolicy.postEndYears)} years after the mission ends. ${citationClause(fullPolicy)}`;
	return 'Every tracked publication to date, with every citation to date.';
}

/** Display name of a scope; the window is a proper noun. */
export const scopeLabel = (scope) => (scope === 'full' ? fullWindowLabel : 'Lifetime');
