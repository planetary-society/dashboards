// Mirror <app>/.site/ into docs/science-mission-impact/ without ever touching
// the gitignored raw data that lives alongside it.
//
// docs/science-mission-impact/ holds three things:
//   dist/       ~446 MB of gitignored raw stats data (NEVER touch)
//   reference/  hand-kept reference material        (NEVER touch)
//   <the built site>                                (mirrored from .site/)
//
// Three independent guards stand between this script and dist/:
//   1. assertTargetDir  — refuses any target not ending in docs/science-mission-impact
//   2. assertSourceSafe — refuses a source whose top level names a protected entry
//   3. isProtected      — re-checked immediately before every single unlink/rmdir
//
// Paths are injectable so scripts/tests/sync.test.mjs can exercise all of this
// against a $TMPDIR fixture.

import fs from 'node:fs';
import path from 'node:path';

/** Never deleted, never overwritten, never descended into. */
export const PROTECTED_NAMES = Object.freeze(['dist', 'reference']);

/**
 * Never mirrored and never deleted either, but never a reason to stop: Finder
 * drops .DS_Store into any folder someone has opened, including the build
 * output, and that is not a fact about the build worth failing a refresh over.
 */
export const IGNORED_NAMES = Object.freeze(['.DS_Store']);

/** The only directory name this script is allowed to mirror into. */
export const REQUIRED_TARGET_SUFFIX = path.join('docs', 'science-mission-impact');

/**
 * True for any relative path the mirror must leave alone: anything under a
 * protected top-level entry, plus an ignored name at any depth.
 * @param {string} relPath posix-style relative path
 */
export function isProtected(relPath) {
	const parts = String(relPath).split('/').filter((p) => p && p !== '.');
	if (parts.length === 0) return true; // the target root itself
	if (parts.includes('..')) return true; // never escape the target
	if (PROTECTED_NAMES.includes(parts[0])) return true;
	if (IGNORED_NAMES.includes(parts[parts.length - 1])) return true;
	return false;
}

/** Guard 1: the resolved target must be the real docs folder. */
export function assertTargetDir(targetDir) {
	const resolved = path.resolve(targetDir);
	if (!resolved.endsWith(REQUIRED_TARGET_SUFFIX)) {
		throw new Error(
			`refusing to sync: target must end with "${REQUIRED_TARGET_SUFFIX}", got "${resolved}"`
		);
	}
	return resolved;
}

/**
 * Guard 2: if the built site ever contains a top-level `dist` or `reference`,
 * the mirror's protected-path skipping would silently drop it — and, worse, a
 * future edit to the skip rules could make it collide with the real raw data.
 * Refuse instead. Ignored names are exempt: dropping them is the point, so
 * there is nothing to warn about and nothing that could collide.
 */
export function assertSourceSafe(sourceDir) {
	const resolved = path.resolve(sourceDir);
	if (!fs.existsSync(resolved)) {
		throw new Error(`source directory does not exist: ${resolved}\n(build the app first)`);
	}
	if (!fs.statSync(resolved).isDirectory()) {
		throw new Error(`source is not a directory: ${resolved}`);
	}
	const clashes = fs
		.readdirSync(resolved)
		.filter((name) => PROTECTED_NAMES.includes(name))
		.sort();
	if (clashes.length) {
		throw new Error(
			`refusing to sync: source contains protected name(s) at top level: ${clashes.join(', ')}`
		);
	}
	// Ignored names do not count towards "has something to mirror": a .site/
	// holding nothing but Finder junk is a failed build, not a sync.
	const entries = fs.readdirSync(resolved).filter((name) => !IGNORED_NAMES.includes(name));
	if (entries.length === 0) {
		throw new Error(`refusing to sync: source directory is empty: ${resolved}`);
	}
	return resolved;
}

/**
 * Walk a tree, skipping protected paths entirely (never even readdir'd).
 * @returns {{files: Map<string, {size: number}>, dirs: Set<string>}}
 */
export function walkTree(root) {
	const files = new Map();
	const dirs = new Set();
	const stack = [''];
	while (stack.length) {
		const rel = stack.pop();
		let entries;
		try {
			entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
		} catch (err) {
			if (err.code === 'ENOENT' || err.code === 'ENOTDIR') continue;
			throw err;
		}
		for (const ent of entries) {
			const childRel = rel ? `${rel}/${ent.name}` : ent.name;
			if (isProtected(childRel)) continue;
			const abs = path.join(root, childRel);
			if (ent.isDirectory()) {
				dirs.add(childRel);
				stack.push(childRel);
			} else {
				let st;
				try {
					st = fs.statSync(abs);
				} catch {
					continue;
				}
				if (st.isDirectory()) {
					dirs.add(childRel);
					stack.push(childRel);
				} else {
					files.set(childRel, { size: st.size });
				}
			}
		}
	}
	return { files, dirs };
}

function sameBytes(a, b) {
	return fs.readFileSync(a).equals(fs.readFileSync(b));
}

/**
 * Compute the mirror plan. Pure with respect to the filesystem (reads only).
 * @param {{sourceDir: string, targetDir: string}} args
 */
export function planSync({ sourceDir, targetDir }) {
	const src = walkTree(sourceDir);
	const dst = walkTree(targetDir);

	const added = [];
	const updated = [];
	const unchanged = [];
	let bytesWritten = 0;
	let bytesTotal = 0;

	for (const rel of [...src.files.keys()].sort()) {
		const size = src.files.get(rel).size;
		bytesTotal += size;
		const existing = dst.files.get(rel);
		if (!existing) {
			added.push(rel);
			bytesWritten += size;
		} else if (
			existing.size !== size ||
			!sameBytes(path.join(sourceDir, rel), path.join(targetDir, rel))
		) {
			updated.push(rel);
			bytesWritten += size;
		} else {
			unchanged.push(rel);
		}
	}

	const removedFiles = [...dst.files.keys()].filter((rel) => !src.files.has(rel)).sort();
	// Deepest first, so a directory is empty by the time we rmdir it.
	const removedDirs = [...dst.dirs]
		.filter((rel) => !src.dirs.has(rel))
		.sort((a, b) => b.split('/').length - a.split('/').length || (a < b ? 1 : -1));
	const addedDirs = [...src.dirs].filter((rel) => !dst.dirs.has(rel)).sort();

	return { added, updated, unchanged, removedFiles, removedDirs, addedDirs, bytesWritten, bytesTotal };
}

/**
 * Apply a plan. Every delete re-checks isProtected() right before it happens —
 * a plan can only have come from walkTree(), which already skips them, but a
 * second check costs nothing and this is the operation that cannot be undone.
 */
export function applySync({ sourceDir, targetDir, plan, dryRun = false }) {
	if (dryRun) return plan;

	fs.mkdirSync(targetDir, { recursive: true });
	for (const rel of plan.addedDirs) {
		assertDeletable(rel, 'mkdir');
		fs.mkdirSync(path.join(targetDir, rel), { recursive: true });
	}
	for (const rel of [...plan.added, ...plan.updated]) {
		assertDeletable(rel, 'write');
		const dest = path.join(targetDir, rel);
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		fs.copyFileSync(path.join(sourceDir, rel), dest);
	}
	for (const rel of plan.removedFiles) {
		assertDeletable(rel, 'unlink');
		fs.rmSync(path.join(targetDir, rel), { force: true });
	}
	for (const rel of plan.removedDirs) {
		assertDeletable(rel, 'rmdir');
		try {
			fs.rmdirSync(path.join(targetDir, rel));
		} catch (err) {
			// A non-empty dir here means something unexpected is inside it;
			// leave it rather than forcing a recursive delete.
			if (err.code !== 'ENOTEMPTY' && err.code !== 'ENOENT') throw err;
		}
	}
	return plan;
}

/** Guard 3. Throws rather than returning false — this must never be ignorable. */
export function assertDeletable(relPath, op = 'modify') {
	if (isProtected(relPath)) {
		throw new Error(`refusing to ${op} protected path: ${relPath}`);
	}
	return true;
}

/**
 * Full run: guards, plan, apply. Returns the plan plus the resolved paths.
 * @param {{sourceDir: string, targetDir: string, dryRun?: boolean}} args
 */
export function syncToDocs({ sourceDir, targetDir, dryRun = false }) {
	const target = assertTargetDir(targetDir);
	const source = assertSourceSafe(sourceDir);
	const plan = planSync({ sourceDir: source, targetDir: target });
	applySync({ sourceDir: source, targetDir: target, plan, dryRun });
	return { ...plan, sourceDir: source, targetDir: target, dryRun };
}

export function formatSummary(result) {
	const lines = [];
	const tag = result.dryRun ? '[dry-run] ' : '';
	lines.push(`${tag}source: ${result.sourceDir}`);
	lines.push(`${tag}target: ${result.targetDir}`);
	lines.push(`${tag}protected (untouched): ${PROTECTED_NAMES.join(', ')}`);
	lines.push(`${tag}ignored (never mirrored): ${IGNORED_NAMES.join(', ')}`);
	lines.push('');
	for (const rel of result.added) lines.push(`${tag}  + ${rel}`);
	for (const rel of result.updated) lines.push(`${tag}  ~ ${rel}`);
	for (const rel of result.removedFiles) lines.push(`${tag}  - ${rel}`);
	for (const rel of result.removedDirs) lines.push(`${tag}  - ${rel}/`);
	if (result.added.length || result.updated.length || result.removedFiles.length || result.removedDirs.length) {
		lines.push('');
	}
	lines.push(
		`${tag}added ${result.added.length}  updated ${result.updated.length}  ` +
			`removed ${result.removedFiles.length + result.removedDirs.length}  ` +
			`unchanged ${result.unchanged.length}`
	);
	lines.push(
		`${tag}bytes written ${result.bytesWritten}  site total ${result.bytesTotal} ` +
			`(${(result.bytesTotal / 1024 / 1024).toFixed(2)} MiB)`
	);
	return lines.join('\n');
}
