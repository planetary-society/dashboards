import assert from 'node:assert/strict';
import { sourceFixture } from './source-fixture.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
	checkImageResponse,
	failuresByHost,
	isFetchableUrl,
	listTileIds,
	loadMissionScope,
	planThumbs,
	pool,
	rewriteImageUrl,
	runThumbs,
	serializeManifest,
	sha256Hex,
	sniffImage
} from '../lib/thumbs-core.mjs';

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'smi-thumbs-'));
after(() => fs.rmSync(TMP_ROOT, { recursive: true, force: true }));

let n = 0;
function tmpDir() {
	const d = path.join(TMP_ROOT, `case-${++n}`);
	fs.mkdirSync(d, { recursive: true });
	return d;
}

/** A 1x1 PNG — small, real, and decodable by sharp. */
const PNG_1PX = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64'
);

describe('url helpers', () => {
	it('hashes urls stably', () => {
		const h = sha256Hex('https://example.test/a.jpg');
		assert.equal(h, sha256Hex('https://example.test/a.jpg'));
		assert.notEqual(h, sha256Hex('https://example.test/b.jpg'));
		assert.match(h, /^[0-9a-f]{64}$/);
	});

	it('rewrites assets.science.nasa.gov dynamicimage queries to a 400px square', () => {
		const out = rewriteImageUrl(
			'https://assets.science.nasa.gov/dynamicimage/assets/science/psd/solar/2023/07/ace_1.jpg?w=1041&h=781&fit=crop&crop=faces%2Cfocalpoint'
		);
		const u = new URL(out);
		assert.equal(u.hostname, 'assets.science.nasa.gov');
		assert.equal(u.pathname, '/dynamicimage/assets/science/psd/solar/2023/07/ace_1.jpg');
		assert.equal(u.searchParams.get('w'), '400');
		assert.equal(u.searchParams.get('h'), '400');
		assert.equal(u.searchParams.get('fit'), 'crop');
		assert.equal(u.searchParams.get('crop'), 'faces,focalpoint');
	});

	it('leaves other hosts and other paths on that host alone', () => {
		const wp = 'https://science.nasa.gov/wp-content/uploads/2023/06/aqua.jpg';
		assert.equal(rewriteImageUrl(wp), wp);
		const dam = 'https://assets.science.nasa.gov/content/dam/x/PIA18178.jpg';
		assert.equal(rewriteImageUrl(dam), dam);
		assert.equal(rewriteImageUrl('not a url'), 'not a url');
	});

	it('only accepts http(s) urls', () => {
		assert.equal(isFetchableUrl('https://a.test/x.jpg'), true);
		assert.equal(isFetchableUrl('http://a.test/x.jpg'), true);
		assert.equal(isFetchableUrl('data:image/png;base64,AAAA'), false);
		assert.equal(isFetchableUrl('file:///etc/passwd'), false);
		assert.equal(isFetchableUrl(''), false);
		assert.equal(isFetchableUrl(null), false);
		assert.equal(isFetchableUrl(undefined), false);
	});
});

describe('image validation', () => {
	it('sniffs common formats', () => {
		assert.equal(sniffImage(PNG_1PX), 'png');
		assert.equal(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), 'jpeg');
		assert.equal(sniffImage(Buffer.from('GIF89a........', 'ascii')), 'gif');
		assert.equal(sniffImage(Buffer.from('RIFF1234WEBPVP8 ', 'ascii')), 'webp');
		assert.equal(sniffImage(Buffer.from('<svg xmlns="x"></svg>', 'utf8')), 'svg');
		assert.equal(sniffImage(Buffer.from('<!DOCTYPE html><html>', 'utf8')), null);
		assert.equal(sniffImage(Buffer.alloc(3)), null);
	});

	it('rejects an HTML error page served as 200', () => {
		const res = checkImageResponse(
			'text/html; charset=utf-8',
			Buffer.from('<!DOCTYPE html><html><body>404</body></html>')
		);
		assert.equal(res.ok, false);
		assert.match(res.error, /not an image/);
		assert.match(res.error, /text\/html/);
	});

	it('rejects an image content-type whose body is not an image', () => {
		const res = checkImageResponse('image/jpeg', Buffer.from('<html>nope</html>'));
		assert.equal(res.ok, false);
		assert.match(res.error, /not a recognised image/);
	});

	it('accepts a real image even with a wrong content-type', () => {
		assert.deepEqual(checkImageResponse('application/octet-stream', PNG_1PX), {
			ok: true,
			type: 'png'
		});
	});
});

describe('serializeManifest', () => {
	it('sorts keys and is byte-identical for equal input', () => {
		const a = serializeManifest({
			zeta: { url: 'https://z.test/z.png', urlHash: 'h2', status: 'ok', bytes: 5 },
			alpha: { url: null, urlHash: null, status: 'none', bytes: 0 }
		});
		const b = serializeManifest({
			alpha: { url: null, urlHash: null, status: 'none', bytes: 0 },
			zeta: { url: 'https://z.test/z.png', urlHash: 'h2', status: 'ok', bytes: 5 }
		});
		assert.equal(a, b);
		assert.deepEqual(Object.keys(JSON.parse(a)), ['alpha', 'zeta']);
		assert.ok(a.endsWith('\n'));
		assert.ok(!a.includes('Date'), 'no timestamps in the manifest');
	});

	it('never writes the failure message, which varies run to run', () => {
		const withMessage = serializeManifest({
			a: { url: 'u', urlHash: 'h', status: 'ok', bytes: 1 },
			b: { url: 'u', urlHash: 'h', status: 'failed', bytes: 0, error: 'HTTP 502 Bad Gateway' }
		});
		const withAnother = serializeManifest({
			a: { url: 'u', urlHash: 'h', status: 'ok', bytes: 1 },
			b: { url: 'u', urlHash: 'h', status: 'failed', bytes: 0, error: 'TimeoutError / UND_ERR' }
		});
		assert.equal(withMessage, withAnother, 'same outcome, same bytes');
		const parsed = JSON.parse(withMessage);
		assert.equal('error' in parsed.a, false);
		assert.equal('error' in parsed.b, false);
		assert.equal(parsed.b.status, 'failed', 'the durable fact survives');
	});
});

describe('planThumbs', () => {
	const missions = [
		{ mission_id: 'ace', url: 'https://a.test/ace.jpg' },
		{ mission_id: 'aim', url: 'https://a.test/aim.jpg' },
		{ mission_id: 'smm', url: null }
	];
	const manifest = {
		ace: { url: 'https://a.test/ace.jpg', urlHash: sha256Hex('https://a.test/ace.jpg'), status: 'ok', bytes: 42 },
		aim: { url: 'https://a.test/old.jpg', urlHash: sha256Hex('https://a.test/old.jpg'), status: 'ok', bytes: 9 }
	};

	it('caches on matching hash + existing file, refetches on changed url', () => {
		const p = planThumbs({ missions, manifest, hasTile: () => true, tileIds: ['ace', 'aim'] });
		assert.deepEqual(p.cached.map((c) => c.mission_id), ['ace']);
		assert.deepEqual(p.toFetch.map((c) => c.mission_id), ['aim']);
		assert.deepEqual(p.none.map((c) => c.mission_id), ['smm']);
		assert.equal(p.cached[0].bytes, 42);
	});

	it('refetches when the tile file is gone even though the hash matches', () => {
		const p = planThumbs({ missions, manifest, hasTile: () => false, tileIds: [] });
		assert.deepEqual(p.toFetch.map((c) => c.mission_id), ['ace', 'aim']);
		assert.equal(p.cached.length, 0);
	});

	it('--force refetches everything with a url', () => {
		const p = planThumbs({ missions, manifest, hasTile: () => true, tileIds: ['ace', 'aim'], force: true });
		assert.deepEqual(p.toFetch.map((c) => c.mission_id), ['ace', 'aim']);
		assert.equal(p.cached.length, 0);
	});

	it('never caches a previously failed entry', () => {
		const failedManifest = {
			ace: { url: 'https://a.test/ace.jpg', urlHash: sha256Hex('https://a.test/ace.jpg'), status: 'failed', bytes: 0, error: 'HTTP 403' }
		};
		const p = planThumbs({ missions, manifest: failedManifest, hasTile: () => true, tileIds: ['ace'] });
		assert.ok(p.toFetch.some((j) => j.mission_id === 'ace'));
	});

	it('marks out-of-scope and image-less tiles as stale', () => {
		const p = planThumbs({
			missions,
			manifest,
			hasTile: () => true,
			tileIds: ['ace', 'aim', 'smm', 'retired_mission']
		});
		assert.deepEqual(p.stale, ['retired_mission', 'smm']);
	});
});

describe('pool', () => {
	it('preserves order and respects the limit', async () => {
		let live = 0;
		let peak = 0;
		const out = await pool([1, 2, 3, 4, 5, 6, 7], 3, async (x) => {
			live++;
			peak = Math.max(peak, live);
			await new Promise((r) => setTimeout(r, 1));
			live--;
			return x * 2;
		});
		assert.deepEqual(out, [2, 4, 6, 8, 10, 12, 14]);
		assert.ok(peak <= 3, `peak concurrency ${peak}`);
	});
});

describe('loadMissionScope', () => {
	it('uses selected statistics and verified envelopes, sorted by mission_id', () => {
		const f = sourceFixture(tmpDir());
		const { missions, unmatched } = loadMissionScope(f);
		assert.deepEqual(missions.map((m) => m.mission_id), ['fixture_astro', 'fixture_bps', 'fixture_earth', 'fixture_helio', 'fixture_psd']);
		assert.equal(missions.find((m) => m.mission_id === 'fixture_bps').url, null);
		assert.equal(missions[0].url, 'https://example.test/fixture_astro.jpg');
		assert.deepEqual(unmatched, []);
	});

	it('throws loudly when inputs are missing', () => {
		const f = sourceFixture(tmpDir());
		assert.throws(() => loadMissionScope({ rawDir: tmpDir(), config: f.config }), /Cannot read source .*index.json/);
		fs.rmSync(path.join(f.rawDir, 'stats', 'astro'), { recursive: true });
		assert.throws(() => loadMissionScope(f), /Cannot read source .*corpus_stats.json/);
	});

	it('rejects a statistics mission missing from the index before planning thumbnail removal', () => {
		const f = sourceFixture(tmpDir());
		f.index.missions.shift();
		f.write('index.json', f.index);
		assert.throws(() => loadMissionScope(f), /does not resolve through index.json/);
	});
});

describe('runThumbs (offline, real sharp)', () => {
	const missions = [
		{ mission_id: 'ace', url: 'https://a.test/ace.jpg' },
		{ mission_id: 'hst', url: 'https://a.test/hst.jpg' },
		{ mission_id: 'bad', url: 'https://a.test/bad.html' },
		{ mission_id: 'smm', url: null }
	];

	function fakeFetch(url) {
		if (url.endsWith('bad.html')) {
			return Promise.resolve({
				contentType: 'text/html',
				body: Buffer.from('<!DOCTYPE html><html>nope</html>')
			});
		}
		if (url.endsWith('hst.jpg')) {
			return Promise.reject(new Error('HTTP 403 Forbidden'));
		}
		return Promise.resolve({ contentType: 'image/png', body: PNG_1PX });
	}

	it('writes greyscale 192x192 webp tiles, records failures, and exits cleanly', async () => {
		const outDir = tmpDir();
		const calls = [];
		const summary = await runThumbs({
			missions,
			outDir,
			fetchImage: (u) => {
				calls.push(u);
				return fakeFetch(u);
			}
		});

		assert.equal(summary.ok, 1);
		assert.equal(summary.fetched, 1);
		assert.equal(summary.failed, 2);
		assert.equal(summary.none, 1);
		assert.equal(summary.cached, 0);
		assert.equal(calls.length, 3);

		assert.deepEqual(listTileIds(outDir).sort(), ['ace']);

		const { default: sharp } = await import('sharp');
		const tile = fs.readFileSync(path.join(outDir, 'ace.webp'));
		const meta = await sharp(tile).metadata();
		assert.equal(meta.format, 'webp');
		assert.equal(meta.width, 192);
		assert.equal(meta.height, 192);
		// webp always stores colour, so check the pixels are actually neutral
		// (r == g == b) rather than trusting the channel count.
		const { channels, dominant } = await sharp(tile).stats();
		assert.equal(dominant.r, dominant.g);
		assert.equal(dominant.g, dominant.b);
		assert.equal(channels[0].mean, channels[1].mean, 'greyscale');
		assert.equal(channels[1].mean, channels[2].mean, 'greyscale');

		const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));
		assert.deepEqual(Object.keys(manifest), ['ace', 'bad', 'hst', 'smm']);
		assert.equal(manifest.ace.status, 'ok');
		assert.ok(manifest.ace.bytes > 0);
		assert.equal(manifest.ace.urlHash, sha256Hex('https://a.test/ace.jpg'));
		assert.deepEqual(manifest.bad, {
			url: 'https://a.test/bad.html',
			urlHash: sha256Hex('https://a.test/bad.html'),
			status: 'failed',
			bytes: 0
		});
		assert.equal(manifest.hst.status, 'failed');
		// The message is reported, just not written to the manifest.
		assert.match(summary.failures.find((f) => f.mission_id === 'bad').error, /not an image/);
		assert.match(summary.failures.find((f) => f.mission_id === 'hst').error, /403/);
		assert.deepEqual(manifest.smm, { url: null, urlHash: null, status: 'none', bytes: 0 });
		assert.equal(summary.totalBytes, manifest.ace.bytes);
	});

	it('is cached on a second run and byte-identical in the manifest', async () => {
		const outDir = tmpDir();
		const okMissions = [{ mission_id: 'ace', url: 'https://a.test/ace.jpg' }];
		await runThumbs({ missions: okMissions, outDir, fetchImage: fakeFetch });
		const first = fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8');

		let hits = 0;
		const second = await runThumbs({
			missions: okMissions,
			outDir,
			fetchImage: (u) => {
				hits++;
				return fakeFetch(u);
			}
		});
		assert.equal(hits, 0, 'cache hit means no network');
		assert.equal(second.cached, 1);
		assert.equal(second.ok, 1);
		assert.equal(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'), first);

		const forced = await runThumbs({
			missions: okMissions,
			outDir,
			force: true,
			fetchImage: (u) => {
				hits++;
				return fakeFetch(u);
			}
		});
		assert.equal(hits, 1, '--force refetches');
		assert.equal(forced.cached, 0);
	});

	it('removes tiles for missions that left the corpus', async () => {
		const outDir = tmpDir();
		await runThumbs({
			missions: [
				{ mission_id: 'ace', url: 'https://a.test/ace.jpg' },
				{ mission_id: 'gone', url: 'https://a.test/gone.jpg' }
			],
			outDir,
			fetchImage: fakeFetch
		});
		assert.deepEqual(listTileIds(outDir).sort(), ['ace', 'gone']);

		const summary = await runThumbs({
			missions: [{ mission_id: 'ace', url: 'https://a.test/ace.jpg' }],
			outDir,
			fetchImage: fakeFetch
		});
		assert.deepEqual(summary.removed, ['gone']);
		assert.deepEqual(listTileIds(outDir), ['ace']);
		assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'))), ['ace']);
	});

	it('rewrites dynamicimage urls at fetch time but caches on the original', async () => {
		const outDir = tmpDir();
		const original =
			'https://assets.science.nasa.gov/dynamicimage/assets/x/ace.jpg?w=1041&h=781&fit=crop';
		const seen = [];
		await runThumbs({
			missions: [{ mission_id: 'ace', url: original }],
			outDir,
			fetchImage: (u) => {
				seen.push(u);
				return Promise.resolve({ contentType: 'image/png', body: PNG_1PX });
			}
		});
		assert.match(seen[0], /w=400&h=400/);
		const manifest = JSON.parse(fs.readFileSync(path.join(outDir, 'manifest.json'), 'utf8'));
		assert.equal(manifest.ace.url, original);
		assert.equal(manifest.ace.urlHash, sha256Hex(original));
	});
});

describe('failuresByHost', () => {
	it('groups by host, most failures first', () => {
		const grouped = failuresByHost([
			{ mission_id: 'a', url: 'https://x.test/1.jpg', error: 'e' },
			{ mission_id: 'b', url: 'https://y.test/1.jpg', error: 'e' },
			{ mission_id: 'c', url: 'https://x.test/2.jpg', error: 'e' },
			{ mission_id: 'd', url: 'nonsense', error: 'e' }
		]);
		assert.equal(grouped[0][0], 'x.test');
		assert.equal(grouped[0][1].length, 2);
		assert.ok(grouped.some(([h]) => h === 'unknown'));
	});
});
