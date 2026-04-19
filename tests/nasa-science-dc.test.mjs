import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createScienceValueBoxes } from '../docs/shared/js/components/value-box.js';

function parseCsv(filePath) {
    const [headerLine, ...lines] = readFileSync(filePath, 'utf8').trim().split('\n');
    const headers = headerLine.split(',');

    return lines.map((line) => {
        const values = line.split(',');
        return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
    });
}

test('NASA Science deployed summary CSVs include District of Columbia', () => {
    const stateRows = parseCsv('docs/data/science/NASA-state-Science-summary.csv');
    const districtRows = parseCsv('docs/data/science/NASA-district-Science-summary.csv');

    const dcState = stateRows.find((row) => row.state === 'DC');
    const dcDistrict = districtRows.find((row) => row.district === 'DC-98');

    assert.ok(dcState, 'expected docs/data/science/NASA-state-Science-summary.csv to include DC');
    assert.ok(dcDistrict, 'expected docs/data/science/NASA-district-Science-summary.csv to include DC-98');
    assert.equal(dcDistrict.state, 'DC');
    assert.equal(dcDistrict.fy_2023_obligations, dcState.fy_2023_obligations);
    assert.equal(dcDistrict.fy_2024_obligations, dcState.fy_2024_obligations);
    assert.equal(dcDistrict.fy_2025_obligations, dcState.fy_2025_obligations);
});

test('NASA Science value boxes use supplied geography totals instead of hardcoded 50 and 435', () => {
    const boxes = createScienceValueBoxes({
        recentFY: 2025,
        recentFYSpending: '$1.0B',
        statesCount: 51,
        totalStateGeographies: 51,
        districtsReached: 436,
        totalDistrictGeographies: 436,
        percentDistricts: 100
    });

    assert.equal(boxes[1].value, '51 of 51');
    assert.equal(boxes[2].value, '436 of 436');
});
