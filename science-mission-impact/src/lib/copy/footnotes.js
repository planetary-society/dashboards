// One registry for every chart footnote, so a term is defined once and the same way everywhere.
// Entries are functions of the run's window policy (plus fullPolicy, asOf, costBaseYear and
// referenceCost) so no number is typed into copy. `anchor` is the section of /methods that explains it.

import { money } from '../format.js';
import { fullWindowLabel, fullWindowText, publicationWindowText, windowLabel } from './window.js';

const calendarYears = (p) => p.citationYears + 1;

export const FOOTNOTES = {
	publicationImpact: {
		anchor: 'high-impact',
		text: () => 'Each mission sits at its tracked publication count and era-adjusted top-10% paper credit in the selected scope. Shared top papers split credit among missions; tracked publication counts include each mission’s whole papers. The reference is total top-paper credit divided by total tracked publications across measured missions shown, not a fitted trend. Above it means more credit per tracked publication. Failed missions are marked with a slash; assumed zeros are identified on hover.'
	},
	top10: {
		anchor: 'high-impact',
		text: () =>
			'Top 10%: among the 10% most-cited papers from this division’s missions, ranked against papers published around the same time.'
	},
	top1: {
		anchor: 'high-impact',
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
		anchor: 'high-impact',
		text: () =>
			'Lifetime: all tracked publications to date. The most recent publication years are too new to rank, so those papers count as tracked publications but carry no top-10% score.'
	},
	shared: {
		anchor: 'high-impact',
		text: () =>
			'A paper naming several missions is split evenly among the missions in this division that claim it, so counts can be fractional.'
	},
	publications: {
		anchor: 'mission-papers',
		text: () => 'Tracked publications: peer-reviewed research papers we found for the mission. The list may not be complete.'
	},
	firstTop: {
		anchor: 'limits',
		text: () =>
			'First top-10% paper: the earliest-published paper that ranks in its division’s top 10% today, measured from the start of science operations. A paper dated before that start was added by hand and comes from cruise or flyby science.'
	},
	projectStart: {
		anchor: 'limits',
		text: () =>
			'Years from project start: from the recorded start of formulation to the publication date of the first top-10% paper, for missions with both dates on record.'
	},
	never: {
		anchor: 'missions',
		text: () => 'Measured zero, unavailable output, and mission failure are distinct. A missing publication source is not measured zero.'
	},
	cost: {
		anchor: 'cost',
		text: (p) => `Cost: life-cycle cost including partner contributions, in ${p.costBaseYear} dollars (NASA’s New Start Index).`
	},
	costAxis: {
		anchor: 'cost',
		text: (p) =>
			'Missions sit at their own cost on a log scale. The blue line is the running share of the division’s top papers, adding each mission in cost order; the grey line is the running share of its spending. The shaded span holds the middle half of the top papers.' +
			(p?.referenceCost ? ` A dashed line marks the adjusted ${money(p.referenceCost)} threshold: missions at or below it are compared with those above it; the line is an editorial comparison point, not an inferred scientific threshold.` : '')
	},
	qualifying: {
		anchor: 'removed',
		text: () =>
			'Qualifying papers: peer-reviewed science results. Papers that only describe a mission or its instruments are left out for every mission, so a mission with only those has none.'
	},
	mindex: {
		anchor: 'other-measures',
		text: () =>
			'm-index: a mission’s h-index divided by the years since its first peer-reviewed paper. It falls every 1 January even when nothing else changes, so it belongs to the date shown; it also discounts the long operating life that larger missions paid for.'
	},
	hindex: {
		anchor: 'other-measures',
		text: () => 'h-index: the largest h such that h papers have at least h citations each. It only grows with time, so older missions score higher.'
	},
	i100: {
		anchor: 'other-measures',
		text: () => 'Papers with 100 or more citations: an absolute bar, easier to clear in fields that cite more.'
	},
	build: {
		anchor: 'cost',
		text: () => 'Years to build: from the start of formulation to launch, for missions with both dates on record.'
	},
	ranks: {
		anchor: 'high-impact',
		text: () => 'Each paper is ranked by citations against every paper from this division’s missions, not adjusted for publication year. Tied papers are spread evenly across the ranks they share.'
	},
	strip: {
		anchor: 'mission-papers',
		text: () => 'Strip: tracked publications per year since the start of science operations.'
	}
};

/** The footnote ids that define whatever the reader is currently looking at. */
export const viewNotes = (view) => [view.top === 1 ? 'top1' : 'top10', view.scope];

function ordinal(n) {
	const words = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth'];
	return words[n] ?? `${n}th`;
}
