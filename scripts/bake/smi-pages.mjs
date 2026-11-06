import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Only advertise pages present in the committed static site. */
export function scienceMissionPaths(root) {
    const read = (file) => JSON.parse(readFileSync(join(root, 'science-mission-impact', file), 'utf8'));
    const entities = [
        ...read('smi.config.json').divisions.map((d) => d.slug),
        ...read('src/lib/data/generated/index.json').map((m) => `${m.division}/${m.id}`)
    ];
    const listed = ['', 'analysis', 'methods', 'download', ...entities.flatMap((path) => [path, `${path}/lifetime`])];
    const built = listed.filter((path) => existsSync(join(root, 'docs/science-mission-impact', path, 'index.html')));
    const missing = listed.filter((path) => !built.includes(path));
    if (missing.length) {
        const prefix = process.env.GITHUB_ACTIONS ? '::warning::' : 'WARNING: ';
        console.log(`${prefix}${missing.length} Science Mission Impact page(s) not built, left out of the sitemap: ${missing.map((p) => p || '(overview)').join(', ')}`);
    }
    return built.map((path) => `/science-mission-impact/${path ? `${path}/` : ''}`);
}
