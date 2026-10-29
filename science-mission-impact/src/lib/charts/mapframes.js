// The affiliation maps' frames without their projections, so a page can lay a map out before it
// loads d3-geo. affiliationmap.js fits its projections to these, and basemaps.test.mjs holds them to it.
export const FRAMES = {
	// us-atlas's own frame: Albers USA at 975 x 610, Alaska and Hawaii inset.
	us: { label: 'United States', short: 'US', cell: 0.5, width: 975, height: 610 },
	// Equal Earth fitted to 960 wide stands 468 high
	world: { label: 'World', cell: 2, width: 960, height: 468 }
};
