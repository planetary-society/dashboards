// One registry for every chart footnote, so a term is defined once and the same way everywhere.
// Entries are functions of the run's window policy (plus fullPolicy, asOf, costBaseYear,
// referenceCost and the page's scope) so no number is typed into copy. `anchor` is the section of /methods that explains it.

import { moneyWords, spell } from '../format.js';
import { fullWindowLabel, fullWindowText, ordinal } from './window.js';

const calendarYears = (p) => p.citationYears + 1;

export const FOOTNOTES = {
	top10: {
		anchor: '',
		text: () =>
			'Top-10% papers: the 10% most-cited papers from this division’s missions, all publication years ranked together. They mark the results other scientists used most.'
	},
	top1: {
		anchor: '',
		text: () => 'Top 1%: among the 1% most-cited papers from this division’s missions within the selected window, all publication years ranked together.'
	},
	full: {
		anchor: 'full-window',
		text: (p) =>
			`${fullWindowLabel}: ${fullWindowText(p.fullPolicy, p.asOf)} Citations count from the year a paper appeared through the ${ordinal(p.fullPolicy.citationYears)} calendar year after it (${calendarYears(p.fullPolicy)} calendar years in all).`
	},
	lifetime: {
		anchor: '',
		text: () =>
			'Lifetime: all tracked publications and every citation they have drawn to date. Older papers have had longer to collect citations, so they fill most of the Lifetime top 10%.'
	},
	shared: {
		anchor: '',
		text: () =>
			'A paper naming several missions is split evenly among the missions in this division that claim it, so counts can be fractional.'
	},
	publications: {
		anchor: 'mission-papers',
		text: () =>
			'Tracked publications: peer-reviewed papers we found that name the mission or its instruments in their titles, abstracts, or keywords. Papers that used the data without naming it are missed.'
	},
	cost: {
		anchor: 'cost',
		text: (p) =>
			`Life-cycle cost: NASA’s reported cost to build, launch, and operate a mission through its prime mission, plus documented partner contributions, in ${p.costBaseYear} dollars. Extended missions are not included.`
	},
	mindex: {
		anchor: '',
		text: () =>
			'm-index: a mission’s h-index divided by the years since its first peer-reviewed paper. It falls every 1 January even when nothing else changes, so it belongs to the date shown; it also discounts the long operating life that larger missions paid for.'
	},
	hindex: {
		anchor: '',
		text: () => 'h-index: the largest h such that h papers have at least h citations each. It only grows with time, so older missions score higher.'
	},
	gindex: {
		anchor: '',
		text: () => 'g-index: the largest g for which the g most-cited papers together hold at least g² citations. Like the h-index, but it lets the most-cited papers count for more.'
	},
	tori: {
		anchor: '',
		text: () =>
			'tori (total research impact, from ADS): for every paper citing one of the mission’s papers, 1 divided by the citing paper’s reference count times the cited paper’s author count, summed, with self-citations removed. It favors citations from papers with short reference lists and from outside the mission’s own authors. Computed over the tracked citation graph, which can be slightly incomplete.'
	},
	riq: {
		anchor: '',
		text: () =>
			'riq (research impact quotient): 1,000 times the square root of tori, divided by the years since the mission’s first paper. A rate, not a total, so it does not keep growing with age the way the h-index and tori do.'
	},
	small: {
		anchor: 'threshold',
		text: (p) =>
			`Small missions: a life-cycle cost of ${moneyWords(p.referenceCost)} or less, in ${p.costBaseYear} dollars. The line is our choice, not a NASA category.`
	},
	perDollar: {
		anchor: 'per-dollar',
		text: () =>
			`Citations per ${moneyWords(100)}: the missions’ citations in the window chosen above, divided by their total cost. Costs cover the prime mission only.`
	},
	perDollarChart: {
		anchor: 'per-dollar',
		text: () =>
			`Each square is a mission at its cost and its citations per ${moneyWords(100)}, both on log scales. The line is the best fit through the missions with citations, drawn dashed grey when it is nearly flat or leaving out one mission would reverse it; missions with none sit on the bottom row.`
	},
	failed: {
		anchor: 'failures',
		text: () => 'Lost outright, or a partial failure or partial success. A lost mission counts as zero science; a partial one counts what it published.'
	},
	citations: {
		anchor: 'windows',
		text: (p) =>
			p.scope === 'lifetime'
				? 'Citations: every citation these publications have drawn to date. Older missions have had longer to collect them.'
				: `Citations: how often other papers cited these publications. Each paper’s citations count over the year it appeared and the ${spell(p.fullPolicy.citationYears)} years after, so older missions get no head start.`
	},
	meanCitations: {
		anchor: '',
		text: () => 'Mean citations: total citations divided by tracked publications in the selected scope. One blockbuster paper can lift it.'
	},
	medianCitations: {
		anchor: '',
		text: () =>
			'Median citations: the middle paper’s citation count in the selected scope; half the papers have more, half fewer. A single blockbuster sways it less than the mean.'
	},
	uncited: {
		anchor: '',
		text: () => 'Uncited publications: papers with no citations in the selected scope.'
	},
	affiliations: {
		anchor: 'affiliations',
		text: () =>
			'The institutions ADS lists for each paper’s authors, as printed on the paper, located through the Research Organization Registry. A square counts a paper once, however many of its authors worked there.'
	}
};

/** What every FOOTNOTES text reads, from the page's `site` and the scope it shows. */
export const notePolicy = (site, scope = 'full') => ({
	fullPolicy: site.fullPolicy,
	asOf: site.asOf,
	costBaseYear: site.costBaseYear,
	referenceCost: site.referenceCost,
	scope
});

/** The joined text of footnotes `ids`, read against `site` in `scope`. */
export const noteText = (ids, site, scope) => ids.map((id) => FOOTNOTES[id].text(notePolicy(site, scope))).join(' ');
