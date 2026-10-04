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
	/** CLPS running publications from the upstream latest export (smi.config.json clps). */
	clps: ClpsFacts;
	/** Paper kinds, full-mission scope, for the missions at or under the threshold; the classifications are an input file (smi.config.json paperKinds). */
	kinds: KindFacts;
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
		papersAll: number; // the same over every mission
		unavailable: number; // under-threshold missions without measured output
		launchMedian: number | null;
	};
	/** Shortfalls (Failure, Partial Failure, Partial Success: MissionRow.shortfall) either side of the threshold, every costed mission of every division. */
	failure: {
		statuses: string[];
		under: ShortfallSide;
		over: ShortfallSide;
		higher: 'under' | 'over' | null; // strictly higher rate; null on a tie or an empty side
		byDivision: { division: DivisionSlug; name: string; under: Omit<ShortfallSide, 'rate'>; over: Omit<ShortfallSide, 'rate'> }[];
	};
	divisions: {
		division: DivisionSlug; name: string; missions: number; measuredMissions: number;
		top10: number; share: number | null; costTotal: number;
	}[];
	bands: { division: DivisionSlug; name: string; p25: number | null; p50: number | null; p75: number | null }[];
	/**
	 * Missions either side of the threshold, failures included, over the rankable divisions.
	 * `top10PerMission` is the group's tie-weighted top-10% papers over its mission count. Top-10%
	 * papers are ranked within each mission's own division before they are counted together.
	 */
	comparison: {
		divisions: DivisionSlug[];
		unavailable: number; // costed missions of those divisions whose output was not measured, so counted on neither side
		/** over every costed mission of every division: the largest cost at or under the threshold, the smallest above it */
		gap: { below: number | null; above: number | null };
		groups: ComparisonGroup[];
		/** the same groups one rankable division at a time (config order), failures as zeros */
		byDivision: { division: DivisionSlug; name: string; under: ComparisonDivisionSide; over: ComparisonDivisionSide }[];
		/** the plain mean over byDivision of each side's top10PerMission, over divisions with at least one mission on both sides; null when none */
		equalWeight: { under: number | null; over: number | null };
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
	/** The division whose timing the story walks through (smi.config.json storyTimingDivision), when rankable. */
	timingDivision: DivisionSlug | null;
	/** Years from project start (formulation) to a first top-10% paper, one row per rankable division. */
	timing: {
		division: DivisionSlug; name: string;
		missions: number; // measured, with a cost
		reached: number; // with a dated first top-10% paper and a formulation date
		never: number;
		under: { missions: number; reached: number; failed: number }; // the same, at or under the threshold
		fastest: { id: string; name: string; cost: number; years: number } | null;
		medianYears: number | null; // over the missions that reached one
		/** the reached missions by cost (then name), cut at round(n/3) and round(2n/3); an empty third has null range and medians */
		byCostThird: {
			key: 'low' | 'mid' | 'high'; missions: number; costRange: [number, number] | null;
			medianYears: number | null; medianBuildYears: number | null; // formulation to first top paper / to launch
		}[];
	}[];
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
	}[];
	missingCosts: number;
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

export type ComparisonDivisionSide = Pick<ComparisonGroup, 'missions' | 'failed' | 'withTop' | 'top10' | 'top10PerMission'>;

export interface ShortfallSide {
	missions: number;
	failed: number;
	rate: number | null; // null for an empty side
}

/** site.clps: refereed papers by calendar month. Month m counts papers dated before start + m months; null until that month has fully elapsed at the as-of date. */
export interface ClpsFacts {
	program: string;
	start: string; // YYYY-MM-DD, the first CLPS launch
	horizonMonths: number;
	/** launch order. papers: refereed papers on record; null when output is unavailable (not zero) */
	missions: { id: string; name: string; fullName: string; launchDate: string | null; primeStart: string | null; status: string | null; cost: number | null; papers: number | null }[];
	/** every lander pooled, a shared paper once; index = month, length horizonMonths + 1 */
	series: (number | null)[];
	/** aligned by months since their prime-mission start (launch when absent); always reach the horizon */
	comparators: { id: string; name: string; fullName: string; start: string; cost: number | null; papers: number; series: (number | null)[] }[];
	/** at the last month CLPS has a value for: each line's running total; behindAll = every comparator strictly ahead (null with none) */
	comparison: { month: number; clps: number; comparators: { id: string; name: string; papers: number }[]; behindAll: boolean | null };
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
	/** The prime-phase windows combined; the full-mission scope has no month-by-month companion. */
	windowSeries: WindowSeries & { missionsIncluded: number; missionsImmature: string[] };
	mostCited: PaperRef | null;
	/** Pooled statistics of every paper from the division's missions, a shared paper once; null when a scope reports no pool. */
	stats: Record<Scope, DivisionScopeStats | null>;
	/** null when the division is not rankable. lifetime[1] is always null (top 1% needs a window). */
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

export interface WindowSeries extends Partial<WindowBounds> {
	/** Monthly buckets from each actual publication-window opening, variable length. */
	papersByMonth: number[];
	/** Citing calendar-year offset from the publication-window opening year. */
	citationsByYearOffset: number[];
	outputBasis?: string;
	/** Division only: measured mission windows covering any part of each elapsed publication year. */
	missionsByYear?: number[];
}

export interface MissionRow {
	id: string;
	name: string;
	cost: number | null; // adjusted LCC, $M 2025
	launchYear: number | null;
	failed: boolean;
	shortfall: boolean; // Failure, Partial Failure or Partial Success
	type: string | null; // mission_type, e.g. "Orbiter"
	indices: MissionIndices;
	yearsToBuild: number | null; // formulation start to launch
	papers: number | null; // lifetime
	citations: number | null; // lifetime
	hasThumb: boolean;
	full: MissionScopeStats & { status: string }; // available | ...
	window: MissionScopeStats & { status: string }; // rolling status: available | immature | ...
	lifetime: MissionScopeStats;
	/** papers per year since science start (index 0 = first year), capped at 20 */
	strip: number[];
}

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
		type: string | null;
		dates: { formulation: string | null; launch: string | null; scienceStart: string | null; primeEnd: string | null; missionEnd: string | null };
	};
	indices: MissionIndices;
	facts: { papers: number | null; citations: number | null; publicationYears: [number, number] | null };
	lifetimeSeries: LifetimeSeries | null;
	windowSeries: (WindowSeries & { status: string }) | null;
	mostCited: PaperRef | null;
	/**
	 * Papers by citation rank among all of the division's mission papers, in ten equal bins,
	 * tie-weighted, each paper counted whole. bins[0] = bottom tenth … bins[9] = top tenth;
	 * top1 = the part of bins[9] inside the division's top 1%. Pooled, not era-adjusted.
	 */
	ranks: Record<Scope, RankHistogram | null>;
	// spread is null when the scope's papers is null (unavailable is never a measured zero)
	full: MissionScopeStats & { status: string; spread: CitationSpread | null };
	window: MissionScopeStats & { status: string; spread: CitationSpread | null };
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
		w: (number | null)[]; // citations within the prime-phase window
		we: (number | null)[]; // era-adjusted top-10% weight, prime-phase window
		w1: (number | null)[]; // top-1% weight, prime-phase window, pooled
		i: (0 | 1)[]; // 1 = added by curation rather than the query
	};
}

/** generated/scrolly.json */
export interface Scrolly {
	tiles: ScrollyTile[]; // every analysed mission, launch order (date, then name; undated last)
}

export interface ScrollyTile {
	id: string;
	name: string;
	division: DivisionSlug;
	launchYear: number | null;
	launchDate: string | null; // YYYY-MM-DD
	cost: number | null; // adjusted $M
	papers: number | null; // full-mission window
	papersLifetime: number | null; // every paper on record, the mission page headline
	citations: number | null; // full-mission window; what the per-dollar step divides by cost
	yearsToBuild: number | null; // formulation start to launch
	hasThumb: boolean;
	failed: boolean;
	shortfall: boolean; // Failure, Partial Failure or Partial Success
	/** of division top papers */
	share: { full: { 10: number | null; 1: number | null }; window: { 10: number | null; 1: number | null }; lifetime: { 10: number | null; 1: null } };
	/** only what the layouts read; the full FirstTopPaper is on the mission doc */
	first: Record<Scope, LaneFirst>;
}

export type LaneFirst = Pick<FirstTopPaper, 'state' | 'yearsFromScienceStart' | 'yearsFromFormulation'>;

export type KindKey = 'results' | 'data' | 'mission' | 'review' | 'future' | 'other';
type KindCounts = Record<KindKey, { papers: number; citations: number }>;

/** One mission at or under the threshold; counts are in-window (full-mission scope) papers only. */
export interface KindMission {
	id: string;
	name: string;
	division: DivisionSlug;
	cost: number | null;
	papers: number;
	citations: number;
	byKind: KindCounts;
	nonScienceShare: number | null; // null when papers is 0
}

export interface KindExample extends KindMission {
	fullName: string;
	/**
	 * The whole record (every classified row, any scope, lifetime citations): the example lists
	 * the whole record because the mission page does. The bars either side stay in-window.
	 */
	lifetime: {
		papers: number;
		citations: number;
		byKind: KindCounts;
		/** citations desc, then bibcode */
		list: { bibcode: string; title: string | null; year: number | null; firstAuthor: string | null; citations: number; inScope: boolean; kind: KindKey; note: string }[];
		/** first of list */
		top: { bibcode: string; title: string | null; citations: number; kind: KindKey; note: string; citationShare: number | null } | null;
		/** most-cited row of kind 'results' */
		firstResult: { bibcode: string; title: string | null; citations: number; citationShare: number | null } | null;
	};
}

/** site.kinds: what role each mission's flight data play in its papers (scripts/lib/kinds.mjs). */
export interface KindFacts {
	scope: 'full';
	asOf: string;
	method: string;
	kinds: { key: KindKey; label: string; short: string; science: boolean }[];
	/** papers desc, then citations desc, then name; zero-paper missions included */
	missions: KindMission[];
	withPapers: number;
	withoutPapers: number;
	total: { papers: number; citations: number; byKind: KindCounts };
	/** fewest and most in-window citations of one mission paper; null with no papers */
	citationRange: { min: number; max: number } | null;
	nonScience: { papers: number; paperShare: number | null; citations: number; citationShare: number | null };
	/** The smallest corpora (0 < papers <= maxPapers, smi.config.json paperKinds.smallMax), where a single review can dominate the citations. */
	small: {
		maxPapers: number;
		missions: number;
		papers: number;
		citations: number;
		nonScience: { papers: number; paperShare: number | null; citations: number; citationShare: number | null };
	};
	/** missions with papers whose non-science papers outnumber their science papers */
	majorityNonScience: number;
	/**
	 * Top-10% credit (tie-weighted, era-adjusted: the credit `StoryFacts.comparison` counts) of the
	 * classified in-window papers, split by kind; per mission it sums to the mission's full.top10.
	 * share = nonScience / total, null when total is 0.
	 */
	topCredit: { total: number; nonScience: number; share: number | null; byKind: Record<KindKey, number> };
	/** smi.config.json paperKinds.examples order */
	examples: KindExample[];
}
