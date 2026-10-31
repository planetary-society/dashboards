/**
 * DATA CONTRACT — the shape of everything scripts/package-data.mjs writes and the app reads.
 *
 * Small files go to src/lib/data/generated/ (imported at build, prerendered into HTML).
 * Large files go to static/data/ (fetched by the browser on intent).
 *
 * Conventions
 * - Missions are identified by `id` (the raw mission_id slug). Stats files key by short_title;
 *   the packager joins through raw index.json and nothing downstream sees short_title as a key.
 * - "Top papers" counts are tie-weighted (fractional). They are summed, never counted, and
 *   shown to one decimal below 10.
 * - Three citation scopes. `full` is the default everywhere: each mission's full-mission
 *   window, from the month after science starts through the mission end plus
 *   `Site.fullPolicy.postEndYears`, cut at the latest end mature on the as-of date, each paper
 *   cited over its own `citationYears`. `window` is the prime-phase window (prime end +
 *   `Site.windowPolicy.postPrimeYears`); `lifetime` is every paper to date.
 * - Top 10% is era-adjusted (cohort_* fields) in every scope. Top 1% exists for the two
 *   windowed scopes only (pooled, not era-adjusted). `null` = not available. `0` = measured zero.
 * - No figure is pinned in app code or copy; all numbers on the site come from these files.
 * - Dates are ISO strings from the raw data. Nothing uses the build date. ADS paper dates are
 *   month-resolution pubdates ("2003-01-00"); a duration reads an unknown day as the 1st and an
 *   unknown month as 1 July.
 * - Names are display names: smi.config.json `names` where set, else upstream's short_title /
 *   full_name. Paper titles and authors are plain text (ADS markup cleaned by scripts/lib/text.mjs).
 */

export type Scope = 'full' | 'window' | 'lifetime';
export type Top = 10 | 1;
export type DivisionSlug = string;
export type WindowPolicy =
	| { kind: 'prime'; postPrimeYears: number; citationYears: number; maturityGraceMonths: number }
	| { kind: 'fixed'; publicationYears: number; citationYears: number };
/** The full-mission window: opens at science start, ends at mission end + postEndYears. */
export interface FullMissionPolicy {
	kind: 'full';
	postEndYears: number;
	citationYears: number;
	minWindowYears: number | null; // a window is never shorter than this, when set
}

export interface CitationCoverage {
	status: 'complete' | 'incomplete';
	expected: number; // source-reported total, unchanged
	observed: number; // dated records available to the timeline
	missing: number;
}

export interface WindowBounds {
	start: string | null;
	end: string | null; // exclusive
	matureDate: string | null;
	status: string;
	months: number;
	citationBuckets: number;
}

/** generated/site.json */
export interface Site {
	asOf: string; // run as_of_date, identical across runs
	fetchedMin: string;
	fetchedMax: string;
	codeRevision: string;
	codeRevisionDirty: boolean; // true when any stats run came from a working tree with uncommitted changes
	missions: number; // analysed missions
	papersDistinct: number; // globally distinct bibcodes across all divisions
	citationsDistinct: number; // citations of those distinct papers
	launchYears: [number, number];
	publicationYears: [number, number];
	windowPolicy: WindowPolicy;
	fullPolicy: FullMissionPolicy;
	citationHistory: { maxMissing: number; maxMissingFraction: number };
	costBaseYear: number | null; // dollars that costs are adjusted to (config; mirrors the analysis)
	yearCohortMinN: number | null; // minimum papers per publication-year band in the era adjustment
	attribution: { acknowledgement: string; adsTermsUrl: string; missionMetadataSource: string };
	/** The mission-selection sentence per division, verbatim from each run's `run.filter.description`. */
	filters: Record<DivisionSlug, string>;
	story: StoryFacts;
	/** Each division's own rows of the story, read in every scope, for the division page's scope switch. */
	divisionFacts: Record<DivisionSlug, Record<Scope, {
		divisions: StoryFacts['divisions'][number];
		failure: StoryFacts['failure']['byDivision'][number];
		comparison: StoryFacts['comparison']['byDivision'][number] | null;
		perDollar: StoryFacts['perDollar'][number] | null;
	}>>;
	/** CLPS running publications from the upstream latest export (smi.config.json clps). */
	clps: ClpsFacts;
	/** The Analysis page's figures (`buildAnalysis` in scripts/lib/analysis.mjs), from the packaged division documents. */
	analysis: AnalysisFacts;
}

/** How a mission was chosen, from upstream `selection_strategy`: 'Competed' / 'Directed'; null for 'Unknown' or blank. */
export type Selection = 'competed' | 'directed' | null;

/** Who ran a mission, from upstream `management_model`: 'Agency-led' / 'PI-led' / 'Commercial-led'; null for 'Unknown' or blank. */
export type Management = 'agency' | 'pi' | 'commercial' | null;

/** A cost tier ($M, the snapshot's adjusted dollar year): membership is lo < cost <= hi. The first tier's lo is 0; the last tier's hi is null (open). */
export interface CostTier {
	lo: number;
	hi: number | null;
}

/**
 * One distribution of N50-per-$M values, failures included at what they published (mostly zero). Quartiles by linear
 * interpolation between order statistics (numpy's default); whiskers at the most extreme values
 * within 1.5 IQR of the box (Tukey). Null fields when `missions` is 0.
 */
export interface RateSpread {
	missions: number;
	zeros: number; // missions whose N50 is 0
	median: number | null;
	q1: number | null;
	q3: number | null;
	whiskers: [number, number] | null;
}

/** One mission on the Analysis page: costed, with measured full-scope output (a failure with no papers is a measured zero). */
export interface AnalysisMission {
	id: string;
	name: string;
	division: DivisionSlug;
	cost: number; // adjusted LCC, $M, > 0
	tier: number; // index into AnalysisFacts.tiers
	group: number; // index into AnalysisFacts.groups
	failed: boolean;
	shortfall: boolean;
	selection: Selection;
	n50: number; // full scope: papers + citations / its division's c (nc.divisions[].c)
	rate: number; // n50 / cost: N50 per $M
}

export type AnalysisSpreadGroup = RateSpread & { shortfall: number; failed: number };

export interface AnalysisFastest {
	id: string;
	name: string;
	division: DivisionSlug;
	years: number; // formulation start to the first top-10% paper
}

export interface EfficiencyCell {
	missions: number;
	n50Share: number; // the tier's share of the division's N50
	costShare: number; // the tier's share of the division's cost
	ratio: number; // n50Share / costShare
}

export interface AnalysisFacts {
	scope: 'full'; // N50, failures, efficiency, selection, standouts
	timeScope: 'lifetime'; // time to the first top-10% paper: each paper ranked on its lifetime citations
	referenceCost: number; // = story.referenceCost; both tiers and groups have an edge at it
	tiers: CostTier[]; // smi.config.json analysis.costTiers
	groups: CostTier[]; // smi.config.json analysis.costGroups
	/** N_c = papers + citations / c, where c is the division's top-50% citation cutoff in the full scope (so N50). */
	nc: {
		percent: 50;
		focus: DivisionSlug | null; // story.focusDivision; its paper histogram is story.primer.counts
		divisions: {
			division: DivisionSlug;
			name: string;
			papers: number; // the division's full-scope papers
			c: number; // = cutoffs['50']
			cutoffs: { '50': number; '10': number; '1': number }; // citations at the top-k% line, full scope
		}[];
	};
	missions: AnalysisMission[]; // every division, by cost then id; eligible empty failures included
	/** left off `missions`: no positive cost / output not measured */
	excluded: { noCost: number; unmeasured: number };
	/**
	 * Outcomes over every costed packaged mission, measured or not (the same missions as StoryFacts.failure,
	 * whose Fisher test the page reads).
	 */
	failures: {
		/** One per tier; byDivision lists every configured division in config order, zeros kept. */
		tiers: {
			missions: number;
			ok: number; // not a shortfall
			failed: number; // outright failure
			partial: number; // shortfall but not failed (partial failure or partial success)
			rate: number | null; // (failed + partial) / missions
			byDivision: { division: DivisionSlug; ok: number; failed: number; partial: number }[];
		}[];
		under: { missions: number; shortfall: number; rate: number | null }; // 0 < cost <= referenceCost
		over: { missions: number; shortfall: number; rate: number | null };
		/** How much more each successful small mission would have to produce to match the larger missions' expected output per mission flown: (1 - over.rate) / (1 - under.rate) - 1. */
		successPremium: number | null;
	};
	/** N50 per $M in each cost group, every division together (N50 is already relative to each division's own c). */
	groupRates: AnalysisSpreadGroup[];
	/** Years to each mission's first top-10% paper in the lifetime ranking (MissionRow.lifetime.first), by tier. Failures are left out: they have no time to the event. */
	time: {
		tiers: {
			missions: number; // in the tier, failures left out
			reached: number; // with a first top-10% paper
			without: number; // missions - reached
			undated: number; // reached, but no formulation date on record
			formulation: MedianYears; // years from formulation start
			science: MedianYears; // years from the start of science
		}[];
		failedExcluded: number;
		fastest: AnalysisFastest | null; // shortest from formulation, any tier (ties: cost, then id)
		byDivision: { division: DivisionSlug; name: string; fastest: AnalysisFastest | null }[]; // config order
	};
	/** Within each rankable division: each tier's share of the division's N50 over its share of the division's cost. */
	efficiency: {
		divisions: {
			division: DivisionSlug;
			name: string;
			cells: (EfficiencyCell | null)[]; // per tier; null = no missions in it
			under: { missions: number; ratio: number | null; top10: number }; // at or under referenceCost; top10 = their full-scope top-10% credit
			best: { tier: number; ratio: number; holds: boolean } | null; // highest ratio; holds = still highest whichever single mission is left out
		}[];
	};
	/** N50 per $M by how missions were selected, in each cost group. */
	selection: {
		groups: { competed: RateSpread; directed: RateSpread }[];
		unclassified: number; // missions with selection null
	};
	/** Per rankable division: missions at or under referenceCost whose N50 per $M beats the median of the division's costlier missions, highest first. */
	standouts: {
		division: DivisionSlug;
		name: string;
		overMedian: number | null;
		missions: { id: string; name: string; cost: number; rate: number }[];
	}[];
}

/** Years over the reached missions: the median, the minimum and the median's distribution-free 95% interval (`medianInterval` in analysis.mjs: order statistics; null below six missions). */
export interface MedianYears {
	median: number | null;
	min: number | null;
	ci: [number, number] | null;
}

export interface DivisionSummary {
	slug: DivisionSlug;
	name: string;
	nav: string;
	missions: number;
	papers: number; // division-distinct
	citations: number;
	publicationYears: [number, number];
	rankable: boolean; // false when the division pool is too small to compare mission costs
}

/**
 * Numbers the narrative quotes. Each is derived from individual mission values in the `full`
 * scope at the top-10% level; none is typed into copy. Only rankable divisions enter the
 * cross-division figures (`comparison`, `pooledBand`, `perDollar`), and every one of those
 * weights the divisions equally or keeps them apart: top-paper credit is never summed across
 * fields as if their citation cultures were one.
 */
export interface StoryFacts {
	/** The threshold, adjusted $M (smi.config.json thresholdCost). Inclusive: under is 0 < cost <= referenceCost, over is cost > referenceCost. */
	referenceCost: number;
	scope: 'full';
	/** Every division: the missions at or under the threshold. papers sum per-mission full-scope counts over measured missions (a shared paper counts once per claiming mission: "mission papers"). */
	threshold: {
		missions: number;
		total: number; // costed missions
		ids: string[];
		papers: number; // under-threshold mission papers
		costMedian: number | null; // median adjusted $M of the missions at or under the threshold
	};
	/**
	 * Shortfalls (Failure, Partial Failure, Partial Success: MissionRow.shortfall) either side of the threshold, over
	 * every costed packaged mission, whatever its output.
	 */
	failure: {
		statuses: string[];
		// Wilson 95% interval for failed / missions; the costliest outright failure on the side, $M
		under: ShortfallSide & { interval: [number, number] | null; lostCostMax: number | null };
		over: ShortfallSide & { interval: [number, number] | null; lostCostMax: number | null };
		higher: 'under' | 'over' | null; // strictly higher rate; null on a tie or an empty side
		fisherP: number | null; // two-sided Fisher exact test, under against over shortfall counts; null when a side is empty
		byDivision: { division: DivisionSlug; name: string; under: Omit<ShortfallSide, 'rate'>; over: Omit<ShortfallSide, 'rate'> }[];
	};
	divisions: {
		division: DivisionSlug; name: string; missions: number; measuredMissions: number;
		top10: number; share: number | null;
		/** the small side's shares, all over the same missions: costed, with output measured in the scope */
		missionShare: number | null;
		costShare: number | null;
		citationShare: number | null; // rankable divisions only
	}[];
	bands: { division: DivisionSlug; name: string; p25: number | null; p50: number | null; p75: number | null }[];
	/**
	 * Missions either side of the threshold, failures included, over the rankable divisions.
	 * `top10PerMission` is the group's tie-weighted top-10% papers over its mission count. Top-10%
	 * papers are ranked within each mission's own division before they are counted together.
	 */
	comparison: {
		divisions: DivisionSlug[];
		groups: ComparisonGroup[];
		/** the same groups one rankable division at a time (config order), failures as zeros */
		byDivision: { division: DivisionSlug; name: string; under: ComparisonDivisionSide; over: ComparisonDivisionSide }[];
	};
	/**
	 * Where the middle half of top papers sits across the rankable divisions: each division's
	 * running top-10% share is averaged with equal weight at every observed cost, and the
	 * quarter marks are the costs at which that mean first reaches 25%, 50% and 75%.
	 * `divisions` names the ones that entered (those holding any top credit); null when none do.
	 * `costShare` / `missionShare`: the equal-weight mean, over those divisions, of each one's share
	 * of spending / of costed missions at p25 ≤ cost ≤ p75 (read off its top-10% cost curve).
	 */
	pooledBand: { divisions: DivisionSlug[]; p25: number; p50: number; p75: number; costShare: number; missionShare: number } | null;
	/** The division the story walks through (smi.config.json storyDivision), when rankable. */
	focusDivision: DivisionSlug | null;
	/**
	 * The story's primer on the focus division: its distinct papers in the scope by citation count
	 * (`counts[c]` drew exactly c, up to the most cited paper), the era-adjusted top-10%
	 * papers among each (`top`; `topPapers` their sum) and the pooled top-10% cutoff
	 * over every era (`cutoff`). Null without a focus division.
	 */
	primer: { division: DivisionSlug; name: string; counts: number[]; top: number[]; papers: number; cutoff: number; topPapers: number } | null;
	/**
	 * The yearly-rate charts' `top10PerYear` facts (full-scope top-10% credit over the full window's
	 * years), one row per rankable division, kept apart: its costed mission with the highest rate and
	 * that mission's side of the threshold; each side's missions, how many had no top-10% papers
	 * (`none`) and its median rate; and the small side's best with how many larger missions it
	 * out-produced (`above`).
	 */
	rate: {
		divisions: {
			division: DivisionSlug;
			name: string;
			largest: { id: string; name: string; perYear: number; size: 'under' | 'over' } | null;
			small: { missions: number; none: number; median: number | null };
			larger: { missions: number; none: number; median: number | null };
			bestSmall: { id: string; name: string; perYear: number; above: number } | null;
		}[];
	};
	/** Citations per $100M either side of the threshold, one row per rankable division. */
	perDollar: {
		division: DivisionSlug; name: string;
		groups: { key: ComparisonKey; missions: number; cost: number; citations: number; perHundredM: number | null }[];
		/** the side with the higher rate, only if it stays higher with any one measured mission dropped; null when a side is empty, tied or the order flips */
		favors: ComparisonKey | null;
		/** the measured missions whose removal alone reverses the order (or empties a side): what favors === null rests on; empty when favors is set or there is no order */
		flipsOn: { id: string; name: string; side: ComparisonKey }[];
		margin: number | null; // |under − over| ÷ the higher rate; null when a rate is null or both are 0
		largestUnder: { id: string; name: string; share: number } | null; // most-cited under mission, its share of the under side's citations
		/** The trend with cost, threshold ignored; null below three measured missions with citations or when the fit fails. */
		fit: PerDollarFit | null;
		/** Overview and division charts: local arithmetic mean mission rates, plus the overview's independent threshold comparison. */
		runningMean: PerDollarRunningMean;
	}[];
}

export interface PerDollarRunningMean {
	/** Tricube half-width in log10 cost; the window spans costs within 10^halfWidth. */
	halfWidth: number;
	resamples: number;
	/** Mean citations per $100M and 95% pointwise bootstrap bounds; unsupported windows stay null, true zeros stay zero. */
	points: [cost: number, mean: number | null, lower: number | null, upper: number | null][];
	/** Independently resampled within the threshold groups; null with fewer than three missions on either side. */
	comparison: {
		under: { missions: number; mean: number };
		over: { missions: number; mean: number };
		difference: number; // under mean minus over mean
		ci: [number, number]; // 95% percentile bootstrap interval for the difference
		holds: boolean; // every single-mission removal preserves the observed direction
		favors: ComparisonKey | null; // interval excludes zero and holds is true
	} | null;
}

/**
 * A division's per-dollar trend (`perDollarFit` in scripts/lib/public.mjs): a negative binomial regression of each
 * measured mission's citations on log cost (ln E[citations] = a + b ln cost, dispersion estimated), every measured
 * mission counted, one with no citations (mostly failures) as zero. The line the charts draw is its mean:
 * log10(citations per $100M) = intercept + slope · log10(cost), slope = b − 1.
 */
export interface PerDollarFit {
	missions: number; // measured missions with citations
	zeros: number; // measured missions without
	slope: number; // b − 1, log rate per log cost
	intercept: number; // a / ln 10 + 2
	tenfold: number; // 10^slope: the rate's multiple at ten times the cost
	citesTenfold: number; // 10^(slope + 1): the citations' own multiple (the same line before dividing by cost)
	p: number; // two-sided Wald test of a flat rate (b = 1)
	ci: [number, number]; // 95% Wald interval for `tenfold`
	/** 95% pointwise Wald interval for the mean citations per $100M, sampled across observed costs; not a prediction interval. */
	band: [cost: number, lowerRate: number, upperRate: number][];
	/** leaving out each measured mission in turn: no fit reverses the sign of `slope`; null below four with citations or when a fit fails */
	holds: boolean | null;
	pRange: [number, number] | null; // the lowest and highest p over those fits; null exactly when `holds` is
	noFailures: { tenfold: number; p: number } | null; // the same fit without the outright failures; null when it can't be fitted
	/** full-scope fits only: the prime-mission (window-scope) refit, which fitKind requires to agree before calling a line clear */
	prime?: { slope: number; tenfold: number; p: number; pRange: [number, number] | null; holds: boolean | null };
}

export type ComparisonKey = 'under' | 'over'; // at or under the threshold (0 < cost <= referenceCost) / above it
export interface ComparisonGroup {
	key: ComparisonKey;
	missions: number;
	failed: number;
	withTop: number; // missions holding any top-10% credit
	top10: number;
	top10PerMission: number | null;
	top1: number;
	top1PerMission: number | null;
	cost: number; // summed adjusted $M
	citations: number;
	median: number | null; // median top-10% credit per mission
	papersMedian: number | null;
	noPapers: number; // missions with a measured zero papers (failures included)
	largest: { id: string; name: string; top10: number; share: number } | null; // most top-10% credit, its share of the group's; null when the group has none
	costMin: number | null;
	costMax: number | null;
	launchYears: [number, number] | null;
	launchMedian: number | null; // whole year, over missions with a launch year
	topType: { type: string; missions: number } | null; // most common mission type, ties by name
}

export type ComparisonDivisionSide = Pick<ComparisonGroup, 'missions' | 'failed' | 'withTop' | 'top10' | 'top10PerMission' | 'largest'>;

export interface ShortfallSide {
	missions: number;
	failed: number; // shortfalls: Failure, Partial Failure or Partial Success
	lost: number; // outright failures (MissionRow.failed) among them
	rate: number | null; // null for an empty side
}

/** site.clps: refereed papers by calendar month. Month m counts papers dated before start + m months; null until that month has fully elapsed at the as-of date. */
export interface ClpsFacts {
	program: string;
	start: string; // YYYY-MM-DD, the first CLPS launch
	horizonMonths: number;
	/** launch order. papers: refereed papers on record; null when output is unavailable (not zero) */
	missions: { id: string; name: string; fullName: string; failed: boolean; shortfall: boolean; cost: number | null; papers: number | null }[];
	/** every lander pooled, a shared paper once; index = month, length horizonMonths + 1 */
	series: (number | null)[];
	/** aligned by months since their prime-mission start (launch when absent); always reach the horizon */
	comparators: { id: string; name: string; fullName: string; start: string; cost: number | null; papers: number; series: (number | null)[] }[];
	/**
	 * At the last month CLPS has a value for: each line's running total (each comparator with its cost, $M); behindAll =
	 * every comparator strictly ahead (null with none). `landers`: each lander with records (launch order) at its own age,
	 * whole months elapsed at the as-of date since its prime start (launch when absent), its refereed papers at that age
	 * and each comparator's at the same age (a paper dated before its prime start counts from month 0). A lander whose
	 * prime start is after the as-of date is not listed. behindEach = every listed lander behind every comparator,
	 * each strictly ahead (null with no lander or no comparator). cost = every lander's cost summed, $M, null when any
	 * lacks one; costEach = that cost over the landers.
	 */
	comparison: {
		month: number; clps: number; comparators: { id: string; name: string; cost: number | null; papers: number }[]; behindAll: boolean | null;
		landers: { id: string; name: string; age: number; papers: number; comparators: { id: string; papers: number }[] }[];
		behindEach: boolean | null;
		cost: number | null;
		costEach: number | null;
	};
	/**
	 * The Analysis page's papers per dollar: smi.config.json clps.surface's missions (config order) at
	 * `month` (= comparison.month), each from its prime-mission start (launch when absent); a failure
	 * with no records counts 0.
	 */
	surface: {
		month: number;
		/** papers = comparison.clps (pooled); cost = the landers' costs summed, $M, null when any lacks one */
		clps: { papers: number; cost: number | null };
		/**
		 * What `behind` tests: only the landers that did not fail outright, pooled (a shared paper once) on the
		 * program's clock (from `start`, at `month`), and their costs summed ($M; null when one lacks a cost)
		 */
		flown: { papers: number; cost: number | null };
		missions: { id: string; name: string; fullName: string; start: string; cost: number | null; selection: Selection; failed: boolean; papers: number }[];
		/**
		 * Over the successful missions against `flown`: total = every one strictly ahead in papers;
		 * perDollar = every costed one strictly ahead in papers per dollar (null when `flown` lacks a
		 * cost or no mission has one). null when no mission succeeded.
		 */
		behind: { total: boolean; perDollar: boolean | null } | null;
	};
}


/**
 * Missions of one division in cost order with running totals: the bin-free view of "where the
 * top papers come from". Missions without a cost are left out (and named in `unplaced`).
 */
export interface CostCurve {
	/** ascending cost; topShare/costShare are cumulative and end at 1 (topShare all 0 when the division has no top papers) */
	points: { id: string; cost: number; topShare: number; costShare: number }[];
	/** the cost of the mission at which cumulative topShare first reaches 25%, 50%, 75% */
	band: { p25: number | null; p50: number | null; p75: number | null };
	cheapestWithTop: { id: string; name: string; cost: number } | null;
	unplaced: string[]; // mission ids with no cost
}

/** generated/index.json — routing + lookups */
export interface MissionIndexEntry {
	id: string;
	name: string; // display name (smi.config.json names, else short_title)
	fullName: string;
	division: DivisionSlug;
	cost: number | null;
	launchYear: number | null;
	hasThumb: boolean;
}

export interface DivisionScopeStats {
	missions: number; // missions pooled in the scope
	papers: number; // distinct papers in the division pool
	citations: number;
	mean: number | null; // citations per paper, weight()-rounded
	median: number | null;
	uncited: number; // papers with 0 citations
	hIndex: number | null; // h-index of the pooled papers
	topDecileCitationShare: number | null; // share of the pool's citations held by its 10% most-cited papers (0..1, share()-rounded)
	/** smi.config.json tierPercents order. citations = the fewest a paper needs to rank in the top `percent`; papers = distinct papers at or above it, ties included. */
	cutoffs: { percent: number; citations: number; papers: number }[];
}

/** generated/divisions/<slug>.json */
export interface Division {
	slug: DivisionSlug;
	name: string;
	facts: { missions: number; papers: number; citations: number; publicationYears: [number, number] };
	rankable: boolean;
	lifetimeSeries: LifetimeSeries;
	/** The same series in the Active Mission Window: its papers, each cited through its citation window. */
	fullSeries: LifetimeSeries | null;
	/** The division's papers counted once each; cells in static/data/maps/divisions/<slug>.json. */
	affiliations: AffiliationSummary | null;
	mostCited: PaperRef | null;
	/** The ten most cited papers per scope, each paper once (windows count in-window citations). missions: ids sharing it, highest count first. */
	topPapers: Record<Scope, (Omit<PaperRef, 'missionId'> & { missions: string[] })[]>;
	/** Pooled statistics of every paper from the division's missions, a shared paper once; null when a scope reports no pool. */
	stats: Record<Scope, DivisionScopeStats | null>;
	/** null when the division is not rankable. lifetime[1] is always null (top 1% needs a window). */
	/** The full-mission papers by citation count, as StoryFacts.primer publishes them for the focus division. */
	citationHistogram: { full: { counts: number[]; top: number[]; papers: number } };
	costCurves: { full: { 10: CostCurve; 1: CostCurve }; window: { 10: CostCurve; 1: CostCurve }; lifetime: { 10: CostCurve; 1: null } } | null;
	/** Spearman rank correlation of each index with adjusted cost, over non-failed missions with a cost. */
	indexCorrelation: { m: { rho: number | null; n: number }; h: { rho: number | null; n: number } };
	missions: MissionRow[];
}

/** Citation indices as computed upstream from the curated paper list, lifetime scope. `m` moves with the calendar year of `Site.asOf`. */
export interface MissionIndices {
	h: number | null;
	m: number | null; // h ÷ (as-of year − year of first refereed paper + 1)
	i100: number | null; // papers with at least 100 citations
	g: number | null; // largest g such that the g most-cited papers together hold at least g² citations
	tori: number | null; // total research impact (reference- and author-normalised citations, self-citations removed), from the local citation graph; weight()-rounded
	riq: number | null; // research impact quotient: 1000 × √tori ÷ years since the first paper
}

/** A windowed scope's own h, g and m (`windowIndices` in scripts/lib/measures.mjs): h and g over each paper's windowed citations, by the rule that reproduces upstream's lifetime figures; m = h ÷ the window's span in years. Null without a dated window. */
export interface WindowIndices {
	h: number;
	g: number;
	m: number;
}

/** Mission doc only: the shape of one scope's citation distribution. */
export interface CitationSpread {
	mean: number | null; // citations ÷ papers from the source-reported totals; null when papers is null or 0; weight()-rounded
	median: number | null; // median per-paper citation count in the scope, over the mission's paper rows; null when no papers
	uncited: number | null; // papers with 0 citations in the scope
	i10: number | null; // papers with ≥ 10 citations in the scope (upstream `<prefix>_thresholds.by_name.i10.count`)
	i100: number | null; // the same at ≥ 100
}

export interface RankHistogram {
	bins: number[];
	top1: number;
}

export interface LifetimeSeries {
	years: number[];
	papers: number[]; // per year, not cumulative
	citations: number[]; // by citing year, not cumulative; shared papers counted once
	citationCoverage: CitationCoverage;
	partialFromYear: number | null; // first incomplete year (the as-of year)
}


export interface MissionRow {
	id: string;
	name: string;
	cost: number | null; // adjusted LCC, $M 2025
	size: MissionSize;
	launchYear: number | null;
	failed: boolean;
	shortfall: boolean; // Failure, Partial Failure or Partial Success
	type: string | null; // mission_type, e.g. "Orbiter"
	selection: Selection;
	management: Management; // packaged for later analysis; no page reads it yet
	indices: MissionIndices;
	papers: number | null; // lifetime
	citations: number | null; // lifetime
	// full-scope top-10% credit over the full window's years (yearlyTopRate in measures.mjs); null when the full scope is unavailable or the window has no length
	top10PerYear: number | null;
	hasThumb: boolean;
	full: MissionScopeStats & { status: string }; // available | ...
	window: MissionScopeStats & { status: string }; // rolling status: available | immature | ...
	lifetime: MissionScopeStats;
}

/** The story's membership, stamped by the packager: 'under' is 0 < cost <= the threshold; null without a cost. */
export type MissionSize = 'under' | 'over' | null;

export interface MissionScopeStats {
	outputBasis: string;
	bounds?: WindowBounds;
	papers: number | null;
	citations: number | null;
	top10: number | null; // era-adjusted tie-weighted papers
	top10ShareOfDivision: number | null;
	top1: number | null; // windowed scopes only
	top1ShareOfDivision: number | null;
	first: FirstTopPaper; // first top-10% paper
}

/**
 * The earliest-published paper in the scope with era-adjusted top-10% weight (the same flag the
 * top10 counts sum; a paper tied at the cutoff counts), dated by its ADS pubdate. Exists exactly
 * when top10 > 0.
 */
export interface FirstTopPaper {
	/** reached: has one. none: has papers, none qualify. no_papers. failure: mission failed and has none. unavailable: output not measured. */
	state: 'reached' | 'none' | 'no_papers' | 'failure' | 'unavailable';
	/** from the prime-mission start, else launch */
	yearsFromScienceStart: number | null;
	/** from the start of formulation, when both dates are on record: the project-start reading of the same paper */
	yearsFromFormulation: number | null;
	bibcode: string | null;
	date: string | null; // ADS pubdate, month resolution ("2003-01-00"; "2003-00-00" = year only)
}

export interface PaperRef {
	bibcode: string;
	title: string;
	firstAuthor: string | null;
	authors?: string[] | null; // first four, ADS "Last, First" (byline() in format.js)
	authorCount?: number | null;
	year: number | null;
	citations: number;
	missionId?: string;
}

/** generated/missions/<id>.json */
export interface Mission {
	id: string;
	name: string;
	fullName: string;
	division: DivisionSlug;
	divisionName: string;
	hasThumb: boolean;
	meta: {
		status: string;
		failed: boolean;
		cost: number | null; // adjusted $M 2025
		lcc: number | null; // $M as the catalog reports it, before adjustment
		type: string | null;
		program: string | null;
		target: string | null;
		launchVehicle: string | null;
		dates: { formulation: string | null; launch: string | null; scienceStart: string | null; primeEnd: string | null; missionEnd: string | null };
	};
	indices: MissionIndices;
	facts: { papers: number | null; citations: number | null; publicationYears: [number, number] | null };
	lifetimeSeries: LifetimeSeries | null;
	/** Cells in static/data/maps/missions/<id>.json; null when no paper has a mapped institution. */
	affiliations: AffiliationSummary | null;
	mostCited: PaperRef | null;
	/**
	 * Papers by citation rank among all of the division's mission papers, in ten equal bins,
	 * tie-weighted, each paper counted whole. bins[0] = bottom tenth … bins[9] = top tenth;
	 * top1 = the part of bins[9] inside the division's top 1%. Pooled, not era-adjusted.
	 */
	ranks: Record<Scope, RankHistogram | null>;
	// spread is null when the scope's papers is null (unavailable is never a measured zero)
	full: MissionScopeStats & { status: string; spread: CitationSpread | null; indices: WindowIndices | null };
	window: MissionScopeStats & { status: string; spread: CitationSpread | null; indices: WindowIndices | null };
	lifetime: MissionScopeStats & { spread: CitationSpread | null };
	query: {
		arms: string | null; // the mission-specific part of source_query
		filters: string | null; // the standard tail, identical in form across missions
		url: string | null; // query_url as given
		fetchedAt: string | null;
		reconciliation: { adsReturned: number; curatedOut: number; curatedIn: number; libraryOut: number; otherOut: number; duplicates: number; final: number } | null;
	};
	curation: { includes: CurationItem[]; excludes: CurationItem[] };
	topCited: PaperRef[]; // up to 20, prerendered
	/** null when the mission has no papers; the URL comes from papersUrl(id), not from here */
	papersFile: { rows: number } | null;
}

export interface CurationItem {
	bibcode: string | null;
	doi: string | null;
	title: string | null;
	reason: string;
	authority: string; // "agent" | "human"
	date: string | null;
}

/**
 * static/data/papers/<id>.json — columnar, one array per column, equal lengths.
 * Sorted by citations descending. Year is a column because ADS bibcode years can differ from `year`.
 * A null in a windowed column means the paper is outside that cohort.
 */
export interface PapersFile {
	id: string;
	asOf: string;
	rows: number;
	columns: {
		b: string[]; // bibcode
		y: (number | null)[]; // year
		t: (string | null)[]; // title
		a: (string | null)[]; // first author
		c: number[]; // lifetime citations
		s: number[]; // shared_by (missions in the division claiming it)
		e: (number | null)[]; // era-adjusted top-10% weight, lifetime (null = year not scored)
		f: (number | null)[]; // citations within the full-mission window
		fe: (number | null)[]; // era-adjusted top-10% weight, full-mission window
		f1: (number | null)[]; // top-1% weight, full-mission window, pooled
		i: (0 | 1)[]; // 1 = added by curation rather than the query
	};
}

/**
 * Where the authors of every tracked paper (lifetime) worked: upstream's ADS canonical
 * affiliations, located through ROR (scripts/lib/affiliations.mjs). The US map takes US
 * institutions inside its projection; the world map every located one.
 */
export type AffiliationMapKey = 'us' | 'world';
export interface AffiliationSummary {
	papers: number; // every packaged paper
	us: AffiliationMapSummary;
	world: AffiliationMapSummary;
}
export interface AffiliationMapSummary {
	mapped: number; // papers with at least one institution on this map
	top: { name: string; papers: number }[]; // the three institutions with the most papers
}
/** static/data/maps/{missions/<id>,divisions/<slug>}.json */
export interface AffiliationFile {
	places: string[]; // each cell's institution with the most papers, shared by both maps
	us: AffiliationGrid;
	world: AffiliationGrid;
}
export interface AffiliationGrid {
	cell: number; // degrees per side
	/** [west, south, papers with an author in the cell (each once), index into places, institutions in the cell], most papers first */
	cells: [number, number, number, number, number][];
}

/** generated/scrolly.json */
export interface Scrolly {
	/** every analysed mission, then the failure chart's outcome-only missions, in one launch order (date, then name; undated last) */
	tiles: ScrollyTile[];
}

export interface ScrollyTile {
	id: string;
	name: string;
	division: DivisionSlug;
	launchYear: number | null;
	launchDate: string | null; // YYYY-MM-DD
	cost: number | null; // adjusted $M
	size: MissionSize;
	papers: number | null; // full-mission window
	papersLifetime: number | null; // every paper on record, the mission page headline
	citationsLifetime: number | null; // every citation of those papers; the corpus skyline's citation step
	citations: number | null; // full-mission window; what the per-dollar step divides by cost
	top10: number | null; // full-mission top-10% credit, as published
	top10PerYear: number | null; // the mission row's; the rate bars
	hasThumb: boolean;
	failed: boolean;
	shortfall: boolean; // Failure, Partial Failure or Partial Success
	/** of division top papers */
	share: { full: { 10: number | null; 1: number | null }; window: { 10: number | null; 1: number | null }; lifetime: { 10: number | null; 1: null } };
}
