import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scopePath, scopeLocation, legacyScopeLocation, routeScope } from './scope.js';

test('scope paths preserve the production base and both entity depths', () => {
	for (const path of ['/science-mission-impact/earth/', '/science-mission-impact/earth/terra/']) {
		assert.equal(scopePath(path, 'full'), path);
		assert.equal(scopePath(path, 'lifetime'), `${path}lifetime/`);
		assert.equal(scopePath(`${path}lifetime/`, 'full'), path);
		assert.equal(scopePath(`${path}lifetime/`, 'lifetime'), `${path}lifetime/`);
	}
});

test('scope navigation preserves fragments and tracking parameters but drops incompatible filters', () => {
	const url = new URL('https://example.test/science-mission-impact/earth/terra/?top=1&utm_source=test&scope=full&x=cost#papers');
	assert.equal(scopeLocation(url, 'lifetime'), '/science-mission-impact/earth/terra/lifetime/?utm_source=test#papers');
	assert.equal(scopeLocation(url, 'full'), '/science-mission-impact/earth/terra/?top=1&utm_source=test#papers');
});

test('legacy scope links resolve once and explicit scope paths win', () => {
	const url = (path) => new URL(`https://example.test${path}`);
	assert.equal(legacyScopeLocation(url('/earth/terra/?scope=lifetime#papers'), 'full'), '/earth/terra/lifetime/#papers');
	assert.equal(legacyScopeLocation(url('/earth/terra/?scope=lifetime&top=1'), 'full'), '/earth/terra/?top=1');
	assert.equal(legacyScopeLocation(url('/earth/terra/lifetime/?scope=full&top=1'), 'lifetime'), '/earth/terra/lifetime/');
	assert.equal(legacyScopeLocation(url('/earth/terra/lifetime/'), 'lifetime'), null);
	assert.equal(legacyScopeLocation(url('/earth/terra/?top=1'), 'full'), null);
	assert.equal(legacyScopeLocation(url('/methods/?scope=lifetime'), undefined), null);
	assert.equal(legacyScopeLocation(url('/earth/?scope=window&top=invalid'), 'full'), '/earth/');
});

test('a page renders lifetime only from the lifetime routes', () => {
	assert.equal(routeScope({ id: '/[division]/[mission]/lifetime' }), 'lifetime');
	assert.equal(routeScope({ id: '/[division]/lifetime' }), 'lifetime');
	assert.equal(routeScope({ id: '/[division]/[mission]' }), 'full');
});
