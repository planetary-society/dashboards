import { longDate } from '../format.js';

export const windowLabel = (policy) => policy?.kind === 'prime'
	? 'Prime Mission Window' : `${policy.publicationYears}-year window`;

export const publicationWindowText = (policy) => policy?.kind === 'prime'
	? `Mission-specific publication windows, from the month after science starts through the month ${policy.postPrimeYears} years after prime mission end. The source uses launch when science start is missing, and mission end for failures or missing prime end dates. Exact exported boundaries are shown on each mission page.`
	: `Papers published in the ${policy.publicationYears} years beginning one month after science starts.`;

export const fullWindowLabel = 'Active Mission Window';

/** `asOf`, when given, names the snapshot date instead of just referring to it. */
export const fullWindowText = (policy, asOf = null) =>
	`Mission-specific publication windows, from the month after science starts through the month ${policy.postEndYears} years after the mission ends${policy.minWindowYears ? ` (never shorter than ${policy.minWindowYears} years)` : ''}, cut at the latest date that is mature on ${asOf ? longDate(asOf) : 'the snapshot date'}. Exact exported boundaries are shown on each mission page.`;

/** Display name of any scope; the two windows are proper nouns. */
export function scopeLabel(scope, { windowPolicy } = {}) {
	if (scope === 'full') return fullWindowLabel;
	if (scope === 'window') return windowLabel(windowPolicy);
	return 'Lifetime';
}
