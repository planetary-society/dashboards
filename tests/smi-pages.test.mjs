import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scienceMissionPaths } from '../scripts/bake/smi-pages.mjs';

test('science sitemap includes built analysis pages in both scopes and awaiting missions in lifetime only', () => {
    const root = mkdtempSync(join(tmpdir(), 'smi-sitemap-'));
    const write = (path, text = '') => {
        const target = join(root, path);
        mkdirSync(join(target, '..'), { recursive: true });
        writeFileSync(target, text);
    };
    try {
        write('science-mission-impact/smi.config.json', JSON.stringify({ divisions: [{ slug: 'astro' }] }));
        write('science-mission-impact/src/lib/data/generated/index.json', JSON.stringify([{ division: 'astro', id: 'hst' }]));
        write('science-mission-impact/src/lib/data/generated/awaiting.json', JSON.stringify([{ division: 'astro', id: 'jwst' }, { division: 'astro', id: 'unbuilt' }]));
        for (const path of ['', 'download/', 'astro/', 'astro/hst/lifetime/', 'astro/jwst/', 'astro/jwst/lifetime/', 'unlisted/']) {
            write(`docs/science-mission-impact/${path}index.html`);
        }
        assert.deepEqual(scienceMissionPaths(root), [
            '/science-mission-impact/', '/science-mission-impact/download/',
            '/science-mission-impact/astro/', '/science-mission-impact/astro/hst/lifetime/',
            '/science-mission-impact/astro/jwst/lifetime/'
        ]);
        // A package from before the awaiting list still bakes (the daily deploy runs this).
        rmSync(join(root, 'science-mission-impact/src/lib/data/generated/awaiting.json'));
        assert.ok(!scienceMissionPaths(root).includes('/science-mission-impact/astro/jwst/lifetime/'));
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
