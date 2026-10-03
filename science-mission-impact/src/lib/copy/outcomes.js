// The names for the lanes' four states, shared by the key and whatever draws them.
// "Qualifying" because mission and instrument overview papers are excluded for every mission:
// a mission with only those has none that count.

/** FirstTopPaper.state → what the lanes key calls it. */
export const LANE_LABELS = Object.freeze({
	reached: 'First top-10% paper',
	none: 'Papers, none in the top 10%',
	no_papers: 'No qualifying papers',
	failure: 'Mission failed',
	unavailable: 'Output unavailable'
});
