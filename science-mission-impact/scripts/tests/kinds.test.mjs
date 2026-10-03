import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { KINDS, buildKinds, validatePaperKinds } from '../lib/kinds.mjs';
import { Warnings } from '../lib/invariants.mjs';

const entry = (mission, bibcode, kind, note = '') => ({ mission, bibcode, kind, note });
const file = (papers) => validatePaperKinds({ asOf: '2026-10-03', method: 'Read every paper.', papers });
const row = (bibcode, citations, inScope = true, lifetime = citations ?? 0) => ({
	bibcode, title: `T ${bibcode}`, year: 2020, firstAuthor: 'A', inScope, citations: inScope ? citations : null, citationsLifetime: lifetime
});

const missions = () => [
	{ id: 'mixed', name: 'Mixed', fullName: 'Mixed Sat', division: 'earth', cost: 50, papers: 3, citations: 60,
		rows: [row('m1', 40), row('m2', 15), row('m3', 5), row('m4', null, false, 50)] },
	{ id: 'empty', name: 'Empty', fullName: 'Empty Sat', division: 'helio', cost: 20, papers: 0, citations: 0, rows: [] },
	{ id: 'rev', name: 'Rev', fullName: 'Rev Sat', division: 'earth', cost: 30, papers: 1, citations: 10, rows: [row('r1', 10)] }
];
const entries = () => [
	entry('mixed', 'm1', 'results'),
	entry('mixed', 'm2', 'mission', 'Instrument paper.'),
	entry('mixed', 'm3', 'review'),
	entry('mixed', 'm4', 'future'), // out of scope: allowed, not counted in-window
	entry('rev', 'r1', 'review', 'A review.')
];
const build = (over = {}) =>
	buildKinds({ kindsFile: file(entries()), missions: missions(), examples: ['rev', 'mixed'], smallMax: 2, warnings: new Warnings(), ...over });

describe('validatePaperKinds', () => {
	const ok = { asOf: '2026-10-03', method: 'm', papers: [entry('a', 'b', 'results')] };
	it('returns entries keyed by mission and bibcode', () => {
		assert.deepEqual(validatePaperKinds(ok).byMission.get('a').get('b'), { kind: 'results', note: '' });
	});
	it('throws on bad input', () => {
		assert.throws(() => validatePaperKinds(null), /not an object/);
		assert.throws(() => validatePaperKinds({ ...ok, asOf: '2026-10' }), /asOf/);
		assert.throws(() => validatePaperKinds({ ...ok, method: 3 }), /method/);
		assert.throws(() => validatePaperKinds({ ...ok, papers: {} }), /papers must be an array/);
		assert.throws(() => validatePaperKinds({ ...ok, papers: [{ mission: 'a', kind: 'results', note: '' }] }), /missing "bibcode"/);
		assert.throws(() => validatePaperKinds({ ...ok, papers: [entry('a', 'b', 'science')] }), /unknown kind "science"/);
		assert.throws(() => validatePaperKinds({ ...ok, papers: [{ ...entry('a', 'b', 'data'), note: 1 }] }), /non-string note/);
		assert.throws(() => validatePaperKinds({ ...ok, papers: [entry('a', 'b', 'data'), entry('a', 'b', 'other')] }), /duplicates \(a, b\)/);
		assert.throws(() => validatePaperKinds({ ...ok, papers: [{ ...entry('a', 'b', 'data'), confidence: 'medium' }] }), /confidence/);
		assert.doesNotThrow(() => validatePaperKinds({ ...ok, papers: [{ ...entry('a', 'b', 'data'), confidence: 'low' }] }));
	});
});

describe('buildKinds', () => {
	it('counts in-scope papers by kind with zeros present', () => {
		const k = build();
		assert.equal(k.scope, 'full');
		assert.deepEqual(k.kinds.map((x) => x.key), KINDS.map((x) => x.key));
		assert.deepEqual(k.missions.map((m) => m.id), ['mixed', 'rev', 'empty']);
		const mixed = k.missions[0];
		assert.deepEqual(mixed.byKind, {
			results: { papers: 1, citations: 40 }, data: { papers: 0, citations: 0 }, mission: { papers: 1, citations: 15 },
			review: { papers: 1, citations: 5 }, future: { papers: 0, citations: 0 }, other: { papers: 0, citations: 0 }
		});
		assert.equal(mixed.nonScienceShare, 0.66667);
		assert.equal(k.missions[2].nonScienceShare, null);
		assert.equal(k.missions[2].byKind.results.papers, 0);
		assert.equal(k.withPapers, 2);
		assert.equal(k.withoutPapers, 1);
		assert.equal(k.total.papers, 4);
		assert.equal(k.total.citations, 70);
		assert.deepEqual(k.total.byKind.review, { papers: 2, citations: 15 });
		assert.deepEqual(k.nonScience, { papers: 3, paperShare: 0.75, citations: 30, citationShare: 0.42857 });
		assert.equal(k.majorityNonScience, 2);
	});

	it('sums the small corpora: above the cap and zero-paper missions excluded', () => {
		// mixed has 3 papers (over the cap of 2), empty has 0; only rev qualifies
		assert.deepEqual(build().small, {
			maxPapers: 2, missions: 1, papers: 1, citations: 10,
			nonScience: { papers: 1, paperShare: 1, citations: 10, citationShare: 1 }
		});
		// cap 3 takes mixed too: non-science citations 15 + 5 + 10 of 70
		assert.deepEqual(build({ smallMax: 3 }).small.nonScience, { papers: 3, paperShare: 0.75, citations: 30, citationShare: 0.42857 });
		assert.deepEqual(build({ smallMax: 3 }).small.missions, 2);
		const none = build({ missions: missions().filter((m) => m.id === 'mixed'), examples: ['mixed'], kindsFile: file(entries().filter((e) => e.mission === 'mixed')), smallMax: 1 }).small;
		assert.deepEqual(none, { maxPapers: 1, missions: 0, papers: 0, citations: 0, nonScience: { papers: 0, paperShare: null, citations: 0, citationShare: null } });
	});

	it('lists examples in config order with the whole lifetime record', () => {
		const [rev, mixed] = build().examples;
		assert.equal(rev.id, 'rev');
		assert.equal(rev.fullName, 'Rev Sat');
		assert.equal(rev.papers, 1); // in-window fields kept
		assert.deepEqual(rev.lifetime.top, { bibcode: 'r1', title: 'T r1', citations: 10, kind: 'review', note: 'A review.', citationShare: 1 });
		assert.equal(rev.lifetime.firstResult, null);
		assert.equal(mixed.papers, 3);
		assert.equal(mixed.lifetime.papers, 4);
		assert.equal(mixed.lifetime.citations, 110);
		assert.deepEqual(mixed.lifetime.byKind.future, { papers: 1, citations: 50 });
		assert.deepEqual(mixed.lifetime.list.map((r) => [r.bibcode, r.inScope]), [['m4', false], ['m1', true], ['m2', true], ['m3', true]]);
		assert.equal(mixed.lifetime.top.kind, 'future');
		assert.equal(mixed.lifetime.top.citationShare, 0.45455);
		assert.deepEqual(mixed.lifetime.firstResult, { bibcode: 'm1', title: 'T m1', citations: 40, citationShare: 0.36364 });
	});

	it('throws on an unclassified in-scope paper, naming it', () => {
		const ms = missions();
		ms[0].rows.push(row('m5', 0));
		ms[0].papers = 4;
		assert.throws(() => build({ missions: ms }), /\(mixed, m5, T m5\)/);
	});

	it('only warns on unclassified out-of-scope papers', () => {
		const ms = missions();
		ms[0].rows.push(row('m6', null, false), row('m7', null, false));
		const warnings = new Warnings();
		assert.equal(build({ missions: ms, warnings }).examples[1].lifetime.papers, 4); // skipped from the record
		assert.deepEqual(warnings.items, ['paper kinds: mixed has 2 unclassified paper(s) outside the full-mission window']);
	});

	it('throws on stale entries', () => {
		const stale = (extra) => build({ kindsFile: file([...entries(), extra]) });
		assert.throws(() => stale(entry('mixed', 'gone', 'results')), /mixed gone/);
		assert.throws(() => stale(entry('nope', 'x', 'results')), /unknown mission "nope"/);
	});

	it('throws when counts disagree with the tile', () => {
		const ms = missions();
		ms[2].citations = 11;
		assert.throws(() => build({ missions: ms }), /rev .*1 papers \/ 10 citations.*1 \/ 11/);
	});

	it('requires missions and examples among them', () => {
		assert.throws(() => build({ missions: [], examples: [] }), /no missions/);
		assert.throws(() => build({ examples: ['marco'] }), /marco/);
	});
});
