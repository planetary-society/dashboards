// The two author-affiliation maps. The packager (which bins institutions), the basemap script
// and the page all read these projections and grids, so a cell lands where the basemap drew it.
// Their frames (sizes, names, grids) are in mapframes.js, which a page can read without d3-geo.
import { geoAlbersUsa, geoEqualEarth } from 'd3-geo';
import { FRAMES } from './mapframes.js';

export const MAPS = {
	us: { ...FRAMES.us, projection: geoAlbersUsa().scale(1300).translate([487.5, 305]) },
	world: { ...FRAMES.world, projection: geoEqualEarth().fitWidth(FRAMES.world.width, { type: 'Sphere' }) }
};

/** Whether a located institution goes on a map: the US map takes US institutions its projection can place (not Puerto Rico or the Virgin Islands). */
export function onMap(key, { latitude, longitude, country }) {
	if (latitude == null || longitude == null) return false;
	if (key === 'us' && country !== 'US') return false;
	return MAPS[key].projection([longitude, latitude]) != null;
}

/** The SVG outline of a grid cell, given its south-west corner in degrees; null when a corner falls outside the projection. */
export function cellPath(key, lon, lat) {
	const { projection, cell } = MAPS[key];
	const corners = [[lon, lat], [lon + cell, lat], [lon + cell, lat + cell], [lon, lat + cell]].map((c) => projection(c));
	if (corners.some((c) => c == null)) return null;
	return `M${corners.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}Z`;
}
