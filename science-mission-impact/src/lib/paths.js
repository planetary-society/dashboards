import { resolve } from '$app/paths';

// Every page is prerendered as <path>/index.html, so internal links always end in a slash;
// GitHub Pages would otherwise answer with a redirect.
const withSlash = (path) => (path.endsWith('/') ? path : `${path}/`);

export const home = () => resolve('/');
export const divisionHref = (slug) => resolve(withSlash(`/${slug}`));
export const missionHref = (slug, id) => resolve(withSlash(`/${slug}/${id}`));
export const methodsHref = (anchor = '') => resolve('/methods/') + (anchor ? `#${anchor}` : '');
export const asset = (path) => resolve('/') + path.replace(/^\//, '');

export const thumbSrc = (id) => asset(`img/missions/${id}.webp`);
export const papersUrl = (id) => asset(`data/papers/${id}.json`);

export const adsAbstract = (bibcode) => `https://scixplorer.org/abs/${encodeURIComponent(bibcode)}/abstract`;

export const SITE_ORIGIN = 'https://dashboards.planetary.org';
export const canonical = (pathname) => SITE_ORIGIN + pathname;
