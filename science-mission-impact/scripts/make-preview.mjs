// Social preview (1200×675): the story's per-dollar step (FITS), drawn from the same layout code and
// packaged running averages the site uses, so the card always matches the current numbers. No browser needed.
//
//   node scripts/make-preview.mjs            → ../docs/img/tps-science-mission-impact-preview.png

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { perDollarLayout, runningLine, trendBand } from '../src/lib/charts/perdollar.js';
import { COST_AXIS_LABEL, costTicks, minorDollarTicks } from '../src/lib/charts/costaxis.js';
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
// The story's FITS step: the compared divisions in a 2×2 grid, each with its packaged running average.
const compared = new Set(story.comparison.divisions);
const divisions = site.divisions.filter((d) => compared.has(d.slug));
const averages = new Map(story.perDollar.map((d) => [d.division, d.runningMean]));
// perDollarLayout places only measured missions: no outcome-only tile (no citations)
const layout = perDollarLayout(scrolly.tiles, innerW, innerH, { divisions, averages });
// DollarChart's grid labels: every decade, or every other one when a panel is too narrow for each
const costLabels = costTicks(layout.x).filter((t) => t.grid && t.label).map((t) => t.value);

// Panels, cost axes, rate scales, bootstrap bands and averages as DollarChart draws them; the
// squares go under the averages here (the stage draws them over), so the curves read at card size.
const parts = [];
layout.rows.forEach((row, i) => {
	const [rx0, rx1] = row.x.range();
	parts.push(`<rect x="${row.left}" y="${row.y}" width="${row.width}" height="${row.h}" fill="#0D0D0D"/>`);
	parts.push(`<line x1="${row.left}" x2="${row.left + row.width}" y1="${row.shelfY - 0.5}" y2="${row.shelfY - 0.5}" stroke="#414141"/>`);
	for (const t of minorDollarTicks(...row.x.domain())) {
		parts.push(`<line x1="${row.x(t)}" x2="${row.x(t)}" y1="${row.shelfY}" y2="${row.shelfY + 4}" stroke="#8C8C8C"/>`);
	}
	for (const t of costLabels) {
		parts.push(`<text x="${row.x(t)}" y="${row.shelfY + 18}" fill="#C3C3C3" font-size="12" text-anchor="middle">${esc(moneyTick(t))}</text>`);
	}
	for (const t of layout.ticks) {
		parts.push(`<line x1="${row.x(t)}" x2="${row.x(t)}" y1="${row.curveTop}" y2="${row.shelfY}" stroke="#414141" opacity="0.6"/>`);
	}
	// the pointwise 95% bootstrap band, clipped to the observed costs above the zero shelf
	const band = trendBand(layout, row, row.average?.points.map(([cost, , lo, hi]) => [cost, lo, hi]));
	if (band) {
		parts.push(`<defs><clipPath id="band-${i}"><rect x="${band.x}" y="${band.y}" width="${band.width}" height="${band.height}"/></clipPath></defs>`);
		parts.push(`<path d="${band.path}" fill="${NEPTUNE}" fill-opacity="0.14" clip-path="url(#band-${i})"/>`);
	}
	for (const r of layout.rateTicks) {
		parts.push(`<line x1="${rx0}" x2="${rx1}" y1="${row.rateY(r)}" y2="${row.rateY(r)}" stroke="#414141" opacity="0.7"/>`);
		parts.push(`<text x="${rx0 - 6}" y="${row.rateY(r)}" dy="0.32em" fill="#8C8C8C" font-size="11" text-anchor="end">${esc(compact(r))}</text>`);
	}
	parts.push(`<text x="${row.left + 4}" y="${row.y + 22}" fill="#fff" font-size="16" font-weight="500">${esc(row.label)}</text>`);
});
parts.push(`<text x="${innerW / 2}" y="${layout.bottomY + 34}" fill="#C3C3C3" font-size="13" text-anchor="middle">${esc(COST_AXIS_LABEL)}</text>`);
for (const { x, y, s } of layout.pos.values()) {
	parts.push(`<rect x="${x + 0.5}" y="${y + 0.5}" width="${s - 1}" height="${s - 1}" fill="#262626" stroke="#8C8C8C"/>`);
}
for (const row of layout.rows) {
	const curve = runningLine(layout, row);
	if (curve) parts.push(`<path d="${curve.path}" fill="none" stroke="${NEPTUNE}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`);
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
