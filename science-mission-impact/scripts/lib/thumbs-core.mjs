// Pure-ish helpers for scripts/fetch-thumbs.mjs.
//
// Everything that touches the network or sharp is injectable so the tests in
// scripts/tests/thumbs.test.mjs run offline. The only ambient I/O here is
// reading the raw stats/index JSON and writing the tile + manifest, both of
// which the tests point at a $TMPDIR fixture.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { assertKnownIds } from './config.mjs';
import { loadSourceCatalog } from './source.mjs';
import { groupBy } from './util.mjs';

/** Tiles are square, small, and sit on a black page: crop to the subject. */
export const TILE_SIZE = 192;
export const WEBP_QUALITY = 70;

/** Some hosts 403 a bare fetch; present as a normal browser. */
export const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
	'(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';

export const ACCEPT = 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8';

export const FETCH_TIMEOUT_MS = 20_000;
export const CONCURRENCY = 6;

/** sha256 of a string, hex. */
export function sha256Hex(s) {
	return createHash('sha256').update(s, 'utf8').digest('hex');
}

/**
 * science.nasa.gov's image renderer serves whatever size the query asks for.
 * The source URLs ask for ~1041x781; we only ever show 192x192, so ask for a
 * 400px square crop instead. Saves roughly an order of magnitude of bandwidth.
 *
 * NOTE: the manifest caches on sha256 of the *original* URL, so if this rule
 * ever changes, re-run with --force to pick up the new sizes.
 */
export function rewriteImageUrl(rawUrl) {
	let u;
	try {
		u = new URL(rawUrl);
	} catch {
		return rawUrl;
	}
	if (u.hostname !== 'assets.science.nasa.gov') return rawUrl;
	if (!u.pathname.startsWith('/dynamicimage/')) return rawUrl;
	u.search = '';
	u.searchParams.set('w', '400');
	u.searchParams.set('h', '400');
	u.searchParams.set('fit', 'crop');
	u.searchParams.set('crop', 'faces,focalpoint');
	return u.toString();
}

/** http(s) only — no file://, no data:. */
export function isFetchableUrl(rawUrl) {
	if (typeof rawUrl !== 'string' || rawUrl.length === 0) return false;
	try {
		const u = new URL(rawUrl);
		return u.protocol === 'http:' || u.protocol === 'https:';
	} catch {
		return false;
	}
}

/** Best-effort magic-byte sniff. Returns a short type name or null. */
export function sniffImage(buf) {
	if (!buf || buf.length < 12) return null;
	const b = buf;
	if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
	if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
	if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'gif';
	if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
	if (b[0] === 0x42 && b[1] === 0x4d) return 'bmp';
	if (b.toString('ascii', 0, 4) === 'II*\0' || b.toString('ascii', 0, 4) === 'MM\0*') return 'tiff';
	if (b.toString('ascii', 4, 12) === 'ftypavif' || b.toString('ascii', 4, 12) === 'ftypheic')
		return 'avif';
	const head = b.toString('utf8', 0, 300).trimStart().toLowerCase();
	if (head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) return 'svg';
	return null;
}

/**
 * Reject anything that isn't an image before it reaches sharp, so that a login
 * page or an HTML 404 served with a 200 is reported as such rather than as a
 * cryptic decoder error.
 * @returns {{ ok: true, type: string } | { ok: false, error: string }}
 */
export function checkImageResponse(contentType, buf) {
	const ct = String(contentType || '').split(';')[0].trim().toLowerCase();
	const sniffed = sniffImage(buf);
	if (sniffed) return { ok: true, type: sniffed };
	if (ct.startsWith('image/')) {
		return { ok: false, error: `content-type ${ct} but body is not a recognised image` };
	}
	return { ok: false, error: `not an image (content-type: ${ct || 'none'})` };
}

/**
 * Deterministic manifest: keys sorted, stable field order, trailing newline.
 *
 * The failure *message* is deliberately not serialised. It varies with the
 * weather -- a timeout one day, a 502 the next -- and writing it here would
 * make the committed manifest churn on runs where nothing actually changed.
 * `status: 'failed'` is the durable fact; the message goes to the console and
 * into the refresh report's rerun list.
 */
export function serializeManifest(entries) {
	const out = {};
	for (const id of Object.keys(entries).sort()) {
		const e = entries[id];
		out[id] = { url: e.url ?? null, urlHash: e.urlHash ?? null, status: e.status, bytes: e.bytes ?? 0 };
	}
	return JSON.stringify(out, null, 2) + '\n';
}

/** Read a manifest.json, tolerating absence or corruption. */
export function readManifest(file) {
	try {
		const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
	} catch {
		return {};
	}
}

/**
 * Missions in scope = every short_title in the configured corpus_stats runs,
 * joined to index.json and its verified envelope. Missing identities are fatal;
 * unmatched remains an empty array for the existing thumbnail caller contract.
 * The image is smi.config.json `thumbnails.overrides[id]` when set, else upstream's
 * image_url: the URL fetched, hashed for the cache and recorded in the manifest.
 * @returns {{missions: Array<{mission_id: string, short_title: string, url: string|null}>, unmatched: string[]}}
 */
export function loadMissionScope({ rawDir, config }) {
	const source = loadSourceCatalog(rawDir, config);
	const overrides = config.thumbnails?.overrides ?? {};
	assertKnownIds('thumbnails.overrides', Object.keys(overrides), new Set(source.missions.keys()));
	const missions = [...source.missions.values()].map(({ id, shortTitle, corpus }) => ({
		mission_id: id,
		short_title: shortTitle,
		url: overrides[id] ?? (isFetchableUrl(corpus.image_url) ? corpus.image_url : null)
	}));
	missions.sort((a, b) => (a.mission_id < b.mission_id ? -1 : a.mission_id > b.mission_id ? 1 : 0));
	return { missions, unmatched: [] };
}

/**
 * Decide what to do without touching the network.
 * @param {object} args
 * @param {Array<{mission_id: string, url: string|null}>} args.missions
 * @param {Record<string, any>} args.manifest previous manifest entries
 * @param {(id: string) => boolean} args.hasTile does <id>.webp exist?
 * @param {string[]} args.tileIds every <id>.webp currently on disk
 * @param {boolean} [args.force]
 */
export function planThumbs({ missions, manifest, hasTile, tileIds = [], force = false }) {
	const inScope = new Set(missions.map((m) => m.mission_id));
	const toFetch = [];
	const cached = [];
	const none = [];

	for (const m of missions) {
		if (!m.url) {
			none.push({ mission_id: m.mission_id });
			continue;
		}
		const hash = sha256Hex(m.url);
		const prev = manifest[m.mission_id];
		const isCached =
			!force &&
			prev &&
			prev.status === 'ok' &&
			prev.urlHash === hash &&
			hasTile(m.mission_id);
		if (isCached) {
			cached.push({ mission_id: m.mission_id, url: m.url, urlHash: hash, bytes: prev.bytes ?? 0 });
		} else {
			toFetch.push({ mission_id: m.mission_id, url: m.url, urlHash: hash });
		}
	}

	// Tiles to delete: missions that left the corpus, plus missions that no
	// longer carry an image_url at all.
	const noneIds = new Set(none.map((n) => n.mission_id));
	const stale = tileIds.filter((id) => !inScope.has(id) || noneIds.has(id)).sort();

	return { toFetch, cached, none, stale };
}

/** Bounded-concurrency map that preserves input order. */
export async function pool(items, limit, worker) {
	const results = new Array(items.length);
	let next = 0;
	const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
		for (;;) {
			const i = next++;
			if (i >= items.length) return;
			results[i] = await worker(items[i], i);
		}
	});
	await Promise.all(runners);
	return results;
}

/** The real network fetch. Injectable so tests never touch it. */
export async function defaultFetchImage(url, { timeoutMs = FETCH_TIMEOUT_MS } = {}) {
	const res = await fetch(url, {
		redirect: 'follow',
		signal: AbortSignal.timeout(timeoutMs),
		headers: {
			'User-Agent': USER_AGENT,
			Accept: ACCEPT,
			'Accept-Language': 'en-US,en;q=0.9'
		}
	});
	if (!res.ok) {
		throw new Error(`HTTP ${res.status} ${res.statusText || ''}`.trim());
	}
	const body = Buffer.from(await res.arrayBuffer());
	return { contentType: res.headers.get('content-type') || '', body };
}

/** The real sharp transform. Injectable so tests can stub sharp out. */
export async function defaultTransform(buf) {
	const { default: sharp } = await import('sharp');
	return await sharp(buf, { failOn: 'none' })
		.resize(TILE_SIZE, TILE_SIZE, { fit: 'cover', position: 'attention' })
		.greyscale()
		.webp({ quality: WEBP_QUALITY })
		.toBuffer();
}

/** List the <id>.webp basenames already in outDir. */
export function listTileIds(outDir) {
	try {
		return fs
			.readdirSync(outDir)
			.filter((f) => f.endsWith('.webp'))
			.map((f) => f.slice(0, -'.webp'.length));
	} catch (err) {
		if (err.code === 'ENOENT') return [];
		throw err;
	}
}

/**
 * Fetch, transform and write every tile. Never throws on a per-mission
 * failure: failures land in the manifest and in the returned summary.
 *
 * @param {object} args
 * @param {Array<{mission_id: string, url: string|null}>} args.missions
 * @param {string} args.outDir
 * @param {boolean} [args.force]
 * @param {typeof defaultFetchImage} [args.fetchImage]
 * @param {typeof defaultTransform} [args.transform]
 * @param {(msg: string) => void} [args.log]
 */
export async function runThumbs({
	missions,
	outDir,
	force = false,
	fetchImage = defaultFetchImage,
	transform = defaultTransform,
	concurrency = CONCURRENCY,
	log = () => {}
}) {
	fs.mkdirSync(outDir, { recursive: true });
	const manifestFile = path.join(outDir, 'manifest.json');
	const previous = readManifest(manifestFile);
	const tileFor = (id) => path.join(outDir, `${id}.webp`);

	const plan = planThumbs({
		missions,
		manifest: previous,
		hasTile: (id) => fs.existsSync(tileFor(id)),
		tileIds: listTileIds(outDir),
		force
	});

	const entries = {};
	for (const c of plan.cached) {
		entries[c.mission_id] = { url: c.url, urlHash: c.urlHash, status: 'ok', bytes: c.bytes };
	}
	for (const n of plan.none) {
		entries[n.mission_id] = { url: null, urlHash: null, status: 'none', bytes: 0 };
	}

	const failures = [];
	await pool(plan.toFetch, concurrency, async (job) => {
		try {
			const fetchUrl = rewriteImageUrl(job.url);
			const { contentType, body } = await fetchImage(fetchUrl);
			const check = checkImageResponse(contentType, body);
			if (!check.ok) throw new Error(check.error);
			const webp = await transform(body);
			fs.writeFileSync(tileFor(job.mission_id), webp);
			entries[job.mission_id] = {
				url: job.url,
				urlHash: job.urlHash,
				status: 'ok',
				bytes: webp.length
			};
			log(`  ok      ${job.mission_id} (${webp.length} B)`);
		} catch (err) {
			const message = describeError(err);
			entries[job.mission_id] = {
				url: job.url,
				urlHash: job.urlHash,
				status: 'failed',
				bytes: 0,
				error: message
			};
			failures.push({ mission_id: job.mission_id, url: job.url, error: message });
			log(`  FAILED  ${job.mission_id}: ${message}`);
		}
	});

	const removed = [];
	for (const id of plan.stale) {
		try {
			fs.rmSync(tileFor(id), { force: true });
			removed.push(id);
		} catch {
			/* ignore */
		}
	}

	fs.writeFileSync(manifestFile, serializeManifest(entries));

	const ok = Object.values(entries).filter((e) => e.status === 'ok').length;
	const failed = failures.length;
	const totalBytes = Object.values(entries).reduce((a, e) => a + (e.bytes || 0), 0);

	return {
		ok,
		cached: plan.cached.length,
		fetched: plan.toFetch.length - failed,
		failed,
		none: plan.none.length,
		removed,
		failures,
		totalBytes,
		manifestFile,
		entries
	};
}

/** Unwrap the layered causes node's fetch hands back, incl. proxy denials. */
export function describeError(err) {
	const parts = [];
	let cur = err;
	const seen = new Set();
	while (cur && !seen.has(cur)) {
		seen.add(cur);
		const name = cur.name && cur.name !== 'Error' ? `${cur.name}: ` : '';
		const msg = `${name}${cur.message ?? String(cur)}`;
		if (msg && !parts.includes(msg)) parts.push(msg);
		if (cur.code && !parts.includes(cur.code)) parts.push(cur.code);
		cur = cur.cause;
	}
	return parts.join(' / ') || 'unknown error';
}

/** Group failures by host so a blocked CDN shows up as one line, not thirty. */
export function failuresByHost(failures) {
	const hostOf = (url) => {
		try {
			return new URL(url).host;
		} catch {
			return 'unknown';
		}
	};
	return [...groupBy(failures, (f) => hostOf(f.url)).entries()].sort(
		(a, b) => b[1].length - a[1].length
	);
}
