// Social preview (1200×675): the story's per-dollar step (FITS), drawn from the same layout code and
// packaged fits the site uses, so the card always matches the current numbers. No browser needed.
//
//   node scripts/make-preview.mjs            → ../docs/img/tps-science-mission-impact-preview.png

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { perDollarLayout, trendLine } from '../src/lib/charts/perdollar.js';
import { minorDollarTicks } from '../src/lib/charts/costaxis.js';
import { flat } from '../src/lib/copy/discussion.js';
import { compact, money, moneyTick } from '../src/lib/format.js';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(APP, '../docs/img/tps-science-mission-impact-preview.png');
const read = (p) => JSON.parse(readFileSync(resolve(APP, p), 'utf8'));

const site = read('src/lib/data/generated/site.json');
const { story } = site;
const scrolly = read('src/lib/data/generated/scrolly.json');

const W = 1200;
const H = 675;
const PAD = { top: 118, left: 56, right: 56, bottom: 12 };
const NEPTUNE = '#037CC2';
const FONT = 'Poppins, Helvetica Neue, Helvetica, Arial, sans-serif';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const innerW = W - PAD.left - PAD.right;
const innerH = H - PAD.top - PAD.bottom;
// The story's FITS step: the compared divisions, a band each, with their packaged fits.
const compared = new Set(story.comparison.divisions);
const divisions = site.divisions.filter((d) => compared.has(d.slug));
const fits = new Map(story.perDollar.map((d) => [d.division, d.fit]));
const layout = perDollarLayout(scrolly.tiles, innerW, innerH, { divisions, fits });
const [x0, x1] = layout.x.range();

// Bands, cost axis, rate scale and fits as DollarChart draws them; the squares go under the
// fits here (the stage draws them over), so the lines read at card size.
const parts = [];
for (const row of layout.rows) {
	if (row.band) parts.push(`<rect x="0" y="${row.y}" width="${innerW}" height="${row.h}" fill="#0D0D0D"/>`);
	parts.push(`<line x1="0" x2="${innerW}" y1="${row.y + 0.5}" y2="${row.y + 0.5}" stroke="#414141"/>`);
}
parts.push(`<line x1="0" x2="${innerW}" y1="${layout.bottomY + 0.5}" y2="${layout.bottomY + 0.5}" stroke="#414141"/>`);
for (const t of minorDollarTicks(...layout.x.domain())) {
	parts.push(`<line x1="${layout.x(t)}" x2="${layout.x(t)}" y1="${layout.bottomY}" y2="${layout.bottomY + 4}" stroke="#8C8C8C"/>`);
}
for (const t of layout.ticks) {
	parts.push(`<line x1="${layout.x(t)}" x2="${layout.x(t)}" y1="${layout.top}" y2="${layout.bottomY}" stroke="#414141" opacity="0.6"/>`);
	parts.push(`<text x="${layout.x(t)}" y="${layout.bottomY + 18}" fill="#C3C3C3" font-size="13" text-anchor="middle">${esc(moneyTick(t))}</text>`);
}
layout.rows.forEach((row, i) => {
	for (const r of layout.rateTicks) {
		parts.push(`<line x1="${x0}" x2="${x1}" y1="${row.rateY(r)}" y2="${row.rateY(r)}" stroke="#414141" opacity="0.7"/>`);
		// the rate scale is labelled once, on the first band
		if (i === 0) parts.push(`<text x="${x1 + 6}" y="${row.rateY(r)}" dy="0.32em" fill="#8C8C8C" font-size="11">${esc(compact(r))}</text>`);
	}
	parts.push(`<line x1="${x0}" x2="${x1}" y1="${row.shelfY + 0.5}" y2="${row.shelfY + 0.5}" stroke="#8C8C8C"/>`);
	parts.push(`<text x="0" y="${row.y + 28}" fill="#fff" font-size="16" font-weight="500">${esc(row.label)}</text>`);
	if (row.fit) {
		const meta = flat(row.fit) ? ['Nearly flat'] : [`${row.fit.tenfold.toFixed(1)}× per dollar`, 'at 10× the cost'];
		meta.forEach((m, k) => parts.push(`<text x="0" y="${row.y + 48 + k * 17}" fill="#C3C3C3" font-size="13">${esc(m)}</text>`));
	}
});
for (const { x, y, s } of layout.pos.values()) {
	parts.push(`<rect x="${x + 0.5}" y="${y + 0.5}" width="${s - 1}" height="${s - 1}" fill="#262626" stroke="#8C8C8C"/>`);
}
for (const row of layout.rows) {
	const line = row.fit && trendLine(layout, row, row.fit.slope);
	if (line) parts.push(`<line x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" stroke="${NEPTUNE}" stroke-width="3" stroke-linecap="round"/>`);
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<rect width="${W}" height="${H}" fill="#000"/>
<text x="${PAD.left}" y="64" fill="#fff" font-size="40" font-weight="300" letter-spacing="-1">Science Mission Impact</text>
<text x="${PAD.left}" y="92" fill="#8C8C8C" font-size="16">${esc(`Citations per ${money(100)} against what each NASA science mission cost, by division`)}</text>
<g transform="translate(${PAD.left}, ${PAD.top})">${parts.join('')}</g>
</svg>`;

const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toBuffer();
writeFileSync(OUT, png);
console.log(`preview: ${OUT} (${png.length.toLocaleString()} bytes)`);
