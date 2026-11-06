import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scienceMissionPaths } from '../scripts/bake/smi-pages.mjs';

test('science sitemap includes only built catalog pages in both scopes', () => {
    const root = mkdtempSync(join(tmpdir(), 'smi-sitemap-'));
    const write = (path, text = '') => {
        const target = join(root, path);
        mkdirSync(join(target, '..'), { recursive: true });
        writeFileSync(target, text);
    };
    try {
        write('science-mission-impact/smi.config.json', JSON.stringify({ divisions: [{ slug: 'astro' }] }));
        write('science-mission-impact/src/lib/data/generated/index.json', JSON.stringify([{ division: 'astro', id: 'hst' }]));
        for (const path of ['', 'download/', 'astro/', 'astro/hst/lifetime/', 'unlisted/']) {
            write(`docs/science-mission-impact/${path}index.html`);
        }
        assert.deepEqual(scienceMissionPaths(root), [
            '/science-mission-impact/', '/science-mission-impact/download/',
            '/science-mission-impact/astro/', '/science-mission-impact/astro/hst/lifetime/'
        ]);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
