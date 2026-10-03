// Social preview (1200×675): the story's cost-axis step, drawn from the same layout code and packaged
// data the site uses, so the card always matches the current numbers. No browser needed.
//
//   node scripts/make-preview.mjs            → ../docs/img/tps-science-mission-impact-preview.png

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { costLayout, costCurve } from '../src/lib/scrolly/layouts.js';
import { minorDollarTicks, stepAfterPath } from '../src/lib/charts/costaxis.js';
import { costItems } from '../src/lib/scrolly/items.js';
import { money, moneyTick } from '../src/lib/format.js';

const APP = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(APP, '../docs/img/tps-science-mission-impact-preview.png');
const read = (p) => JSON.parse(readFileSync(resolve(APP, p), 'utf8'));

const site = read('src/lib/data/generated/site.json');
const { story } = site;
const scrolly = read('src/lib/data/generated/scrolly.json');

const W = 1200;
const H = 675;
const PAD = { top: 118, left: 56, right: 56, bottom: 40 };
const NEPTUNE = '#037CC2';
const FONT = 'Poppins, Helvetica Neue, Helvetica, Arial, sans-serif';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const innerW = W - PAD.left - PAD.right;
const innerH = H - PAD.top - PAD.bottom;
const tiles = scrolly.tiles;
const layout = costLayout(tiles, innerW, innerH, { divisions: site.divisions });
const unranked = new Set(site.divisions.filter((d) => !d.rankable).map((d) => d.slug));
// The squares come from the same modules the site renders the step with: the unranked set,
// the per-division ruler and the inner-square area are all decided there, so the card cannot
// drift from the chart it is a picture of.
const items = costItems(tiles, layout, { scope: story.scope, top: 10, unranked, referenceCost: story.referenceCost });
const bandOf = new Map(story.bands.map((b) => [b.division, b]));
const [x0, x1] = layout.x.range();

// The same furniture CostAxis.svelte draws: a band per division, the cost ticks, each
// division's running shares as step lines and the span holding the middle half of its top papers.
const parts = [];
for (const t of minorDollarTicks(...layout.x.domain())) {
	parts.push(`<line x1="${layout.x(t)}" x2="${layout.x(t)}" y1="18" y2="22" stroke="#8C8C8C"/>`);
}
for (const t of layout.ticks) {
	parts.push(`<line x1="${layout.x(t)}" x2="${layout.x(t)}" y1="${layout.top}" y2="${layout.bottomY}" stroke="#262626"/>`);
	parts.push(`<text x="${layout.x(t)}" y="14" fill="#C3C3C3" font-size="14" text-anchor="middle">${esc(moneyTick(t))}</text>`);
}
for (const row of layout.rows) {
	if (row.band) parts.push(`<rect x="0" y="${row.y}" width="${innerW}" height="${row.h}" fill="#0D0D0D" opacity="0.6"/>`);
	parts.push(`<line x1="0" x2="${innerW}" y1="${row.y + 0.5}" y2="${row.y + 0.5}" stroke="#414141"/>`);
	parts.push(`<text x="0" y="${row.y + 26}" fill="#fff" font-size="16" font-weight="500">${esc(row.label)}</text>`);
	parts.push(`<text x="0" y="${row.y + 45}" fill="#8C8C8C" font-size="12">${row.missions} missions</text>`);
	parts.push(`<line x1="${x0}" x2="${x1}" y1="${row.shelfY + 0.5}" y2="${row.shelfY + 0.5}" stroke="#8C8C8C"/>`);
	if (unranked.has(row.slug)) continue;
	const span = bandOf.get(row.slug);
	if (span?.p25 != null) {
		parts.push(`<rect x="${layout.x(span.p25)}" y="${row.curveTop}" width="${layout.x(span.p75) - layout.x(span.p25)}" height="${row.shelfY - row.curveTop}" fill="${NEPTUNE}" opacity="0.22"/>`);
		parts.push(`<text x="${layout.x(span.p25)}" y="${row.shelfY + 17}" fill="#fff" font-size="13">${esc(`${money(span.p25)} to ${money(span.p75)}`)}</text>`);
	}
	const y = (v) => row.shelfY - v * (row.shelfY - row.curveTop);
	const points = costCurve(row.members, (t) => t.share[story.scope][10]);
	for (const [key, stroke, width] of [['costShare', '#8C8C8C', 1], ['topShare', NEPTUNE, 2]]) {
		const d = stepAfterPath(points, { x: layout.x, y, x0, x1, value: (p) => p[key] });
		parts.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}"/>`);
	}
}
parts.push(`<line x1="0" x2="${innerW}" y1="${layout.bottomY + 0.5}" y2="${layout.bottomY + 0.5}" stroke="#414141"/>`);
for (const t of tiles) {
	const item = items.get(t.id);
	if (!item) continue;
	const { x, y, s, inner } = item;
	const side = inner * s;
	parts.push(`<rect x="${x + 0.5}" y="${y + 0.5}" width="${s - 1}" height="${s - 1}" fill="#000" stroke="${side > 0 ? '#6E6E6E' : '#4D4D4D'}"/>`);
	if (side > 0) {
		const o = (s - side) / 2;
		parts.push(`<rect x="${x + o}" y="${y + o}" width="${side}" height="${side}" fill="${NEPTUNE}"/>`);
	}
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="${FONT}">
<rect width="${W}" height="${H}" fill="#000"/>
<text x="${PAD.left}" y="64" fill="#fff" font-size="40" font-weight="300" letter-spacing="-1">Science Mission Impact</text>
<text x="${PAD.left}" y="92" fill="#8C8C8C" font-size="16">Where each NASA science division's most-cited papers come from, by what the mission cost</text>
<g transform="translate(${PAD.left}, ${PAD.top})">${parts.join('')}</g>
</svg>`;

const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toBuffer();
writeFileSync(OUT, png);
console.log(`preview: ${OUT} (${png.length.toLocaleString()} bytes)`);
