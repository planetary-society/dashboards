import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCSV, parseIsoDateUTC, pluralCount } from '../docs/shared/js/utils.js';

test('parseIsoDateUTC parses strict calendar dates and rejects everything else', () => {
    assert.equal(parseIsoDateUTC('2026-02-10'), Date.UTC(2026, 1, 10));
    assert.equal(parseIsoDateUTC('1970-01-01'), 0);

    // Rollovers, wrong formats, and garbage are all null — never a shifted date
    assert.equal(parseIsoDateUTC('2026-13-45'), null);
    assert.equal(parseIsoDateUTC('2026-02-30'), null);
    assert.equal(parseIsoDateUTC('2/10/2026'), null);
    assert.equal(parseIsoDateUTC('2026-02-10T00:00:00'), null);
    assert.equal(parseIsoDateUTC(''), null);
    assert.equal(parseIsoDateUTC(null), null);
    assert.equal(parseIsoDateUTC(undefined), null);
});

test('pluralCount localizes and pluralizes', () => {
    assert.equal(pluralCount(1, 'award'), '1 award');
    assert.equal(pluralCount(2, 'day'), '2 days');
    assert.equal(pluralCount(0, 'claim'), '0 claims');
    assert.equal(pluralCount(1234, 'award'), `${(1234).toLocaleString()} awards`);
    // Fractional medians pluralize
    assert.equal(pluralCount(1.5, 'day'), '1.5 days');
});

test('parseCSV keeps newlines embedded in a quoted field', () => {
    const rows = parseCSV('a,b\n1,"line one\nline two"\n2,plain');

    assert.equal(rows.length, 2);
    assert.equal(rows[0].b, 'line one\nline two');
    assert.equal(rows[1].b, 'plain');
});

test('parseCSV handles CRLF line endings without leaking \\r into the last column', () => {
    const rows = parseCSV('a,b,c\r\n1,2,3\r\n4,5,6\r\n');

    assert.equal(rows.length, 2);
    assert.deepEqual(Object.keys(rows[0]), ['a', 'b', 'c']);
    assert.equal(rows[0].c, '3');
    assert.equal(rows[1].c, '6');

    for (const row of rows) {
        for (const value of Object.values(row)) {
            assert.ok(!value.includes('\r'), `unexpected carriage return in ${JSON.stringify(value)}`);
        }
    }
});

test('parseCSV normalizes CRLF embedded inside a quoted field', () => {
    const rows = parseCSV('a,b\r\n1,"line one\r\nline two"\r\n');

    assert.equal(rows.length, 1);
    assert.equal(rows[0].b, 'line one\nline two');
});

test('parseCSV unescapes "" as a literal quote', () => {
    const rows = parseCSV('a,b\n1,"He said ""hello"""\n2,"a "" b"');

    assert.equal(rows[0].b, 'He said "hello"');
    assert.equal(rows[1].b, 'a " b');
});

test('parseCSV keeps commas inside quoted fields', () => {
    const rows = parseCSV('a,b,c\n1,"x, y, z",3');

    assert.equal(rows[0].b, 'x, y, z');
    assert.equal(rows[0].c, '3');
});

test('parseCSV ignores a trailing newline', () => {
    assert.equal(parseCSV('a,b\n1,2\n').length, 1);
    assert.equal(parseCSV('a,b\r\n1,2\r\n').length, 1);
    assert.equal(parseCSV('a,b\n1,2\n\n').length, 1);
});

test('parseCSV pads short rows with empty strings', () => {
    const rows = parseCSV('a,b,c\n1,2\n');

    assert.deepEqual(rows[0], { a: '1', b: '2', c: '' });
});

test('parseCSV trims values and uses trimmed header keys', () => {
    const rows = parseCSV('a , b\n  1  ,  2  \n');

    assert.deepEqual(Object.keys(rows[0]), ['a', 'b']);
    assert.deepEqual(rows[0], { a: '1', b: '2' });
});

test('parseCSV returns an empty array for empty input', () => {
    assert.deepEqual(parseCSV(''), []);
    assert.deepEqual(parseCSV('\n'), []);
    assert.deepEqual(parseCSV('a,b\n'), []);
});

test('parseCSV reads the deployed master ledger intact', () => {
    // The deployed copy refreshes daily, so expectations come from metadata
    // and file shape rather than hard-coded counts
    const rows = parseCSV(readFileSync('docs/data/cancellations/master_ledger_latest.csv', 'utf8'));
    const metadata = JSON.parse(readFileSync('docs/data/cancellations/metadata.json', 'utf8'));

    if (typeof metadata.rowCount === 'number') {
        assert.equal(rows.length, metadata.rowCount);
    } else {
        assert.ok(rows.length > 0);
    }

    const columnCount = Object.keys(rows[0]).length;
    assert.ok(columnCount >= 30, `expected at least 30 columns, got ${columnCount}`);

    for (const row of rows) {
        assert.equal(Object.keys(row).length, columnCount);

        for (const value of Object.values(row)) {
            assert.ok(!value.includes('\r'), `unexpected carriage return in ${JSON.stringify(value)}`);
        }
    }
});
