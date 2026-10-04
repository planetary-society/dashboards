// One registry for every chart footnote, so a term is defined once and the same way everywhere.
// Entries are functions of the run's window policy (plus fullPolicy, asOf, costBaseYear and
// referenceCost) so no number is typed into copy. `anchor` is the section of /methods that explains it.

import { money } from '../format.js';
import { fullWindowLabel, fullWindowText, ordinal, publicationWindowText, windowLabel } from './window.js';

const calendarYears = (p) => p.citationYears + 1;

export const FOOTNOTES = {
	top10: {
		anchor: '',
		text: () =>
			'Top 10%: among the 10% most-cited papers from this division’s missions, ranked against papers published around the same time.'
	},
	top1: {
		anchor: '',
		text: () => 'Top 1%: among the 1% most-cited papers from this division’s missions within the selected window. Not adjusted for publication year.'
	},
	full: {
		anchor: 'full-window',
		text: (p) =>
			`${fullWindowLabel}: ${fullWindowText(p.fullPolicy, p.asOf)} Citations count from the year a paper appeared through the ${ordinal(p.fullPolicy.citationYears)} calendar year after it (${calendarYears(p.fullPolicy)} calendar years in all).`
	},
	window: {
		anchor: 'early-window',
		text: (p) =>
			`${windowLabel(p)}: ${publicationWindowText(p)} Citations count from the year a paper appeared through the ${ordinal(p.citationYears)} calendar year after it (${calendarYears(p)} calendar years in all).`
	},
	lifetime: {
		anchor: '',
		text: () =>
			'Lifetime: all tracked publications to date. The most recent publication years are too new to rank, so those papers count as tracked publications but carry no top-10% score.'
	},
	shared: {
		anchor: '',
		text: () =>
			'A paper naming several missions is split evenly among the missions in this division that claim it, so counts can be fractional.'
	},
	publications: {
		anchor: 'mission-papers',
		text: () => 'Tracked publications: peer-reviewed research papers we found for the mission. The list may not be complete.'
	},
	firstTop: {
		anchor: '',
		text: () =>
			'First top-10% paper: the earliest-published paper that ranks in its division’s top 10% today, measured from the start of science operations. A paper dated before that start was added by hand and comes from cruise or flyby science.'
	},
	never: {
		anchor: 'missions',
		text: () => 'A failed mission counts as zero and is marked with a slash; a mission whose output could not be measured is left out, not counted as zero.'
	},
	cost: {
		anchor: 'cost',
		text: (p) => `Cost: life-cycle cost including partner contributions, in ${p.costBaseYear} dollars (NASA’s New Start Index).`
	},
	costAxis: {
		anchor: 'cost',
		text: (p) =>
			'Missions sit at their own cost on a log scale. The line is the running total of the division’s top-10% papers, adding missions from cheapest to costliest.' +
			(p?.referenceCost ? ` The dashed line at ${money(p.referenceCost)} is an editorial comparison point, not an inferred scientific threshold.` : '')
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
	citations: {
		anchor: '',
		text: () =>
			'Citations received by the tracked publications in the selected scope. The two windowed scopes count each paper’s citations only within its citation window.'
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
	topDecileShare: {
		anchor: '',
		text: () =>
			'The share of all citations in the selected scope that went to the 10% most-cited papers from this division’s missions. The higher it is, the more attention concentrates on a few papers.'
	},
	cutoff: {
		anchor: '',
		text: () =>
			'Cutoff: the fewest citations a paper needs to rank in the top share named, among every paper from this division’s missions in the selected scope, ties included. The count beside it is the papers at or above that line. Not adjusted for publication year.'
	},
	strip: {
		anchor: 'mission-papers',
		text: () => 'Strip: tracked publications per year since the start of science operations.'
	}
};

/** What every FOOTNOTES text reads, from the page's `site`. */
export const notePolicy = (site) => ({
	...site.windowPolicy,
	fullPolicy: site.fullPolicy,
	asOf: site.asOf,
	costBaseYear: site.costBaseYear,
	referenceCost: site.referenceCost
});

/** The joined text of footnotes `ids`, read against `site`. */
export const noteText = (ids, site) => ids.map((id) => FOOTNOTES[id].text(notePolicy(site))).join(' ');
