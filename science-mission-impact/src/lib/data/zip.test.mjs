import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crc32, inflateRawSync } from 'node:zlib';
import { zipOne } from './zip.js';

test('zipOne writes a readable, deterministic one-file archive', () => {
	const text = 'bibcode,title\r\n2001Test,"café, ☄"\r\n';
	const zip = zipOne('all.csv', text, '2026-11-03');
	assert.equal(zip.readUInt32LE(0), 0x04034b50);
	const nameLength = zip.readUInt16LE(26);
	assert.equal(zip.subarray(30, 30 + nameLength).toString(), 'all.csv');
	const packed = zip.subarray(30 + nameLength, 30 + nameLength + zip.readUInt32LE(18));
	const data = inflateRawSync(packed);
	assert.equal(data.toString('utf8'), text);
	assert.equal(zip.readUInt32LE(14), crc32(data));
	assert.equal(zip.readUInt16LE(12), ((2026 - 1980) << 9) | (11 << 5) | 3);
	const end = zip.length - 22;
	assert.equal(zip.readUInt32LE(end), 0x06054b50);
	assert.equal(zip.readUInt32LE(zip.readUInt32LE(end + 16)), 0x02014b50, 'central directory where the end record says');
	assert.deepEqual(zipOne('all.csv', text, '2026-11-03'), zip);
});
