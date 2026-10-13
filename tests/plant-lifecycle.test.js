const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldAdvanceToGrowing } = require('../plant-lifecycle');

test('gezaaide plant groeit na een kalendermaand', () => {
    const plant = { status: 'Gezaaid', sownAt: '2026-09-13' };
    assert.equal(shouldAdvanceToGrowing(plant, new Date(2026, 9, 12)), false);
    assert.equal(shouldAdvanceToGrowing(plant, new Date(2026, 9, 13)), true);
});

test('einde van de maand schuift naar de laatste dag van de volgende maand', () => {
    const plant = { status: 'Gezaaid', sownAt: '2026-01-31' };
    assert.equal(shouldAdvanceToGrowing(plant, new Date(2026, 1, 27)), false);
    assert.equal(shouldAdvanceToGrowing(plant, new Date(2026, 1, 28)), true);
});

test('onbekende zaaidatum en niet-actieve plant blijven ongemoeid', () => {
    assert.equal(shouldAdvanceToGrowing({ status: 'Gezaaid' }, new Date(2026, 9, 13)), false);
    assert.equal(shouldAdvanceToGrowing({ status: 'Voorraad', sownAt: '2026-01-01' }, new Date(2026, 9, 13)), false);
});
