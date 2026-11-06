import { resolve } from '$app/paths';
import { scopePath } from './state/scope.js';

// Every page is prerendered as <path>/index.html, so internal links always end in a slash;
// GitHub Pages would otherwise answer with a redirect.
export const home = () => resolve('/');
export const divisionHref = (slug, scope = 'full') => resolve(scopePath(`/${slug}/`, scope));
export const missionHref = (slug, id, scope = 'full') => resolve(scopePath(`/${slug}/${id}/`, scope));
export const methodsHref = (anchor = '') => resolve('/methods/') + (anchor ? `#${anchor}` : '');
export const downloadHref = () => resolve('/download/');
export const analysisHref = (anchor = '') => resolve('/analysis/') + (anchor ? `#${anchor}` : '');
export const asset = (path) => resolve('/') + path.replace(/^\//, '');

export const thumbSrc = (id) => asset(`img/missions/${id}.webp`);
export const papersUrl = (id) => asset(`data/papers/${id}.json`);
export const exportUrl = (filename) => asset(`data/exports/${filename}`);
/** `kind` is 'missions' or 'divisions'. */
export const mapsUrl = (kind, id) => asset(`data/maps/${kind}/${id}.json`);
export const basemapSrc = (key) => asset(`img/maps/${key}.svg`);

export const scixAbstract = (bibcode) => `https://scixplorer.org/abs/${encodeURIComponent(bibcode)}/abstract`;

export const SITE_ORIGIN = 'https://dashboards.planetary.org';
export const canonical = (pathname) => SITE_ORIGIN + pathname;
