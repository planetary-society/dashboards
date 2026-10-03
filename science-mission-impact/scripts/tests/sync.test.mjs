import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';

import {
	IGNORED_NAMES,
	PROTECTED_NAMES,
	assertDeletable,
	assertSourceSafe,
	assertTargetDir,
	formatSummary,
	isProtected,
	planSync,
	syncToDocs,
	walkTree
} from '../lib/sync-core.mjs';

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'smi-sync-'));
after(() => fs.rmSync(TMP_ROOT, { recursive: true, force: true }));

let n = 0;
function caseDir() {
	const d = path.join(TMP_ROOT, `case-${++n}`);
	fs.mkdirSync(d, { recursive: true });
	return d;
}

function write(root, rel, content) {
	const abs = path.join(root, rel);
	fs.mkdirSync(path.dirname(abs), { recursive: true });
	fs.writeFileSync(abs, content);
	return abs;
}

/**
 * A fixture whose target path really ends in docs/science-mission-impact, so
 * the suffix guard is satisfied by construction rather than bypassed.
 */
function fixture() {
	const root = caseDir();
	const source = path.join(root, 'app', '.site');
	const target = path.join(root, 'docs', 'science-mission-impact');
	fs.mkdirSync(source, { recursive: true });
	fs.mkdirSync(target, { recursive: true });
	return { root, source, target };
}

describe('isProtected', () => {
	it('protects the protected names and everything under them', () => {
		assert.equal(isProtected('dist'), true);
		assert.equal(isProtected('dist/index.json'), true);
		assert.equal(isProtected('dist/stats/us_astro_fixed_set/corpus_stats.json'), true);
		assert.equal(isProtected('reference'), true);
		assert.equal(isProtected('reference/notes/a.md'), true);
		assert.equal(isProtected('.DS_Store'), true);
		assert.equal(isProtected('_app/.DS_Store'), true);
		assert.equal(isProtected(''), true);
		assert.equal(isProtected('..'), true);
		assert.equal(isProtected('a/../../etc/passwd'), true);
	});

	it('does not protect ordinary site paths or lookalikes', () => {
		assert.equal(isProtected('index.html'), false);
		assert.equal(isProtected('_app/immutable/chunk.js'), false);
		assert.equal(isProtected('planetary/cassini/index.html'), false);
		assert.equal(isProtected('img/dist-diagram.png'), false);
		assert.equal(isProtected('a/dist/b.js'), false, 'only the top level is protected');
		assert.equal(isProtected('a/reference/b.js'), false);
	});

	it('exports exactly the required protected and ignored lists', () => {
		assert.deepEqual([...PROTECTED_NAMES], ['dist', 'reference']);
		assert.deepEqual([...IGNORED_NAMES], ['.DS_Store']);
	});
});

describe('assertTargetDir', () => {
	it('refuses any target that is not docs/science-mission-impact', () => {
		for (const bad of ['/tmp/whatever', '/Users/x/docs', '/Users/x/docs/science-mission', '/']) {
			assert.throws(() => assertTargetDir(bad), /must end with/, `should refuse ${bad}`);
		}
	});

	it('refuses the raw data directory itself', () => {
		assert.throws(
			() => assertTargetDir('/Users/casey/VisualStudioCode/dashboards/docs/science-mission-impact/dist'),
			/must end with/
		);
	});

	it('accepts the real shape', () => {
		const ok = assertTargetDir('/anywhere/docs/science-mission-impact');
		assert.equal(ok, '/anywhere/docs/science-mission-impact');
		assert.equal(assertTargetDir('/anywhere/docs/science-mission-impact/'), '/anywhere/docs/science-mission-impact');
	});
});

describe('assertSourceSafe', () => {
	it('refuses a source whose top level names a protected entry', () => {
		for (const name of PROTECTED_NAMES) {
			const { source } = fixture();
			write(source, 'index.html', 'x');
			fs.mkdirSync(path.join(source, name), { recursive: true });
			assert.throws(() => assertSourceSafe(source), /protected name/, `should refuse ${name}`);
		}
	});

	it('syncs a build that Finder has left a .DS_Store in', () => {
		const { source } = fixture();
		write(source, 'index.html', 'x');
		write(source, '.DS_Store', 'finder-junk');
		assert.equal(assertSourceSafe(source), source);
	});

	it('still refuses a source holding nothing but ignored junk', () => {
		const { source } = fixture();
		write(source, '.DS_Store', 'finder-junk');
		assert.throws(() => assertSourceSafe(source), /empty/);
	});

	it('refuses a missing or empty source', () => {
		const { root, source } = fixture();
		assert.throws(() => assertSourceSafe(source), /empty/);
		assert.throws(() => assertSourceSafe(path.join(root, 'nope')), /does not exist/);
	});

	it('accepts a normal build output', () => {
		const { source } = fixture();
		write(source, 'index.html', 'x');
		assert.equal(assertSourceSafe(source), source);
	});
});

describe('assertDeletable', () => {
	it('throws on every protected path', () => {
		assert.throws(() => assertDeletable('dist/index.json', 'unlink'), /refusing to unlink/);
		assert.throws(() => assertDeletable('reference'), /refusing to modify/);
		assert.throws(() => assertDeletable('.DS_Store'), /refusing/);
	});
	it('passes ordinary paths', () => {
		assert.equal(assertDeletable('index.html', 'unlink'), true);
	});
});

describe('walkTree', () => {
	it('never descends into protected directories', () => {
		const { target } = fixture();
		write(target, 'dist/index.json', 'raw');
		write(target, 'dist/stats/run/corpus_stats.json', 'raw');
		write(target, 'reference/a.md', 'ref');
		write(target, '.DS_Store', 'ds');
		write(target, 'index.html', 'site');
		write(target, '_app/immutable/a.js', 'js');

		const { files, dirs } = walkTree(target);
		assert.deepEqual([...files.keys()].sort(), ['_app/immutable/a.js', 'index.html']);
		assert.deepEqual([...dirs].sort(), ['_app', '_app/immutable']);
	});

	it('returns empty for a missing directory', () => {
		const { root } = fixture();
		const { files, dirs } = walkTree(path.join(root, 'nope'));
		assert.equal(files.size, 0);
		assert.equal(dirs.size, 0);
	});
});

describe('mirror against a realistic fixture', () => {
	function seeded() {
		const f = fixture();
		// Protected content that MUST survive untouched.
		write(f.target, 'dist/SENTINEL.txt', 'do-not-touch-446MB');
		write(f.target, 'dist/stats/us_astro_fixed_set/corpus_stats.json', '{"missions":[]}');
		write(f.target, 'reference/notes.md', '# reference');
		write(f.target, '.DS_Store', 'finder-junk');
		// Previous build output: one file survives, one changes, the rest are stale.
		write(f.target, 'index.html', '<html>old</html>');
		write(f.target, 'methods/index.html', '<html>methods</html>');
		write(f.target, '_app/immutable/old-hash.js', 'stale');
		write(f.target, 'planetary/retired-mission/index.html', '<html>gone</html>');
		// New build.
		write(f.source, 'index.html', '<html>new</html>');
		write(f.source, 'methods/index.html', '<html>methods</html>');
		write(f.source, '_app/immutable/new-hash.js', 'fresh');
		write(f.source, 'img/missions/ace.webp', 'webp-bytes');
		write(f.source, 'planetary/cassini/index.html', '<html>cassini</html>');
		return f;
	}

	it('plans added / updated / removed / unchanged correctly', () => {
		const f = seeded();
		const plan = planSync({ sourceDir: f.source, targetDir: f.target });
		assert.deepEqual(plan.added, [
			'_app/immutable/new-hash.js',
			'img/missions/ace.webp',
			'planetary/cassini/index.html'
		]);
		assert.deepEqual(plan.updated, ['index.html']);
		assert.deepEqual(plan.unchanged, ['methods/index.html']);
		assert.deepEqual(plan.removedFiles, [
			'_app/immutable/old-hash.js',
			'planetary/retired-mission/index.html'
		]);
		assert.deepEqual(plan.removedDirs, ['planetary/retired-mission']);
		assert.ok(!plan.removedFiles.some((r) => isProtected(r)), 'no protected path in the plan');
	});

	it('--dry-run changes nothing on disk', () => {
		const f = seeded();
		const before = snapshot(f.target);
		const result = syncToDocs({ sourceDir: f.source, targetDir: f.target, dryRun: true });
		assert.equal(result.added.length, 3);
		assert.deepEqual(snapshot(f.target), before);
		assert.match(formatSummary(result), /\[dry-run\]/);
	});

	it('mirrors, keeps protected content, and removes stale output', () => {
		const f = seeded();
		const distBefore = snapshot(path.join(f.target, 'dist'));
		const unchangedMtime = fs.statSync(path.join(f.target, 'methods/index.html')).mtimeMs;

		const result = syncToDocs({ sourceDir: f.source, targetDir: f.target });

		// Protected survives, byte for byte.
		assert.deepEqual(snapshot(path.join(f.target, 'dist')), distBefore);
		assert.equal(fs.readFileSync(path.join(f.target, 'dist/SENTINEL.txt'), 'utf8'), 'do-not-touch-446MB');
		assert.equal(fs.readFileSync(path.join(f.target, 'reference/notes.md'), 'utf8'), '# reference');
		assert.equal(fs.readFileSync(path.join(f.target, '.DS_Store'), 'utf8'), 'finder-junk');

		// Mirror is exact for everything else.
		assert.deepEqual(snapshot(f.target, { skipProtected: true }), snapshot(f.source));

		// Stale gone, including the now-empty directory.
		assert.equal(fs.existsSync(path.join(f.target, '_app/immutable/old-hash.js')), false);
		assert.equal(fs.existsSync(path.join(f.target, 'planetary/retired-mission')), false);

		// Only changed bytes were written.
		assert.equal(fs.statSync(path.join(f.target, 'methods/index.html')).mtimeMs, unchangedMtime);
		assert.equal(result.bytesWritten, byteSum(f.source, result.added.concat(result.updated)));
		assert.equal(result.bytesTotal, byteSum(f.source, [...walkTree(f.source).files.keys()]));
	});

	it('is idempotent: a second run writes nothing', () => {
		const f = seeded();
		syncToDocs({ sourceDir: f.source, targetDir: f.target });
		const after1 = snapshot(f.target);
		const second = syncToDocs({ sourceDir: f.source, targetDir: f.target });
		assert.equal(second.added.length, 0);
		assert.equal(second.updated.length, 0);
		assert.equal(second.removedFiles.length, 0);
		assert.equal(second.removedDirs.length, 0);
		assert.equal(second.bytesWritten, 0);
		assert.ok(second.unchanged.length > 0);
		assert.deepEqual(snapshot(f.target), after1);
	});

	it('creates a target that does not exist yet', () => {
		const root = caseDir();
		const source = path.join(root, '.site');
		const target = path.join(root, 'docs', 'science-mission-impact');
		write(source, 'index.html', 'hi');
		write(source, 'deep/a/b/c.txt', 'deep');
		const result = syncToDocs({ sourceDir: source, targetDir: target });
		assert.deepEqual(result.added, ['deep/a/b/c.txt', 'index.html']);
		assert.deepEqual(snapshot(target), snapshot(source));
	});

	it('refuses to touch a wrongly-named target even when everything else is fine', () => {
		const f = seeded();
		const wrong = path.join(f.root, 'docs', 'science-mission-impac');
		fs.mkdirSync(wrong, { recursive: true });
		write(wrong, 'dist/SENTINEL.txt', 'precious');
		assert.throws(() => syncToDocs({ sourceDir: f.source, targetDir: wrong }), /must end with/);
		assert.equal(fs.readFileSync(path.join(wrong, 'dist/SENTINEL.txt'), 'utf8'), 'precious');
	});

	it('refuses a source that would shadow dist/, leaving the target intact', () => {
		const f = seeded();
		write(f.source, 'dist/evil.json', 'x');
		const before = snapshot(f.target);
		assert.throws(() => syncToDocs({ sourceDir: f.source, targetDir: f.target }), /protected name/);
		assert.deepEqual(snapshot(f.target), before);
	});
});

/**
 * rel -> content for every file under root. Written independently of
 * sync-core's own walk so it is a real check, not a tautology.
 * `{ skipProtected: true }` narrows it to the part of the tree the mirror owns.
 */
function snapshot(root, { skipProtected = false } = {}) {
	const out = {};
	const stack = [''];
	while (stack.length) {
		const rel = stack.pop();
		let entries;
		try {
			entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
		} catch {
			continue;
		}
		for (const ent of entries) {
			const childRel = rel ? `${rel}/${ent.name}` : ent.name;
			if (skipProtected && isProtected(childRel)) continue;
			if (ent.isDirectory()) stack.push(childRel);
			else out[childRel] = fs.readFileSync(path.join(root, childRel), 'utf8');
		}
	}
	return out;
}

function byteSum(root, rels) {
	return rels.reduce((a, rel) => a + fs.statSync(path.join(root, rel)).size, 0);
}
