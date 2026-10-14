const test = require('node:test');
const assert = require('node:assert/strict');
const contract = require('../ai-contract');

test('nutrition validation removes copied form labels and repairs the observed split word', () => {
    const raw = '🌱 Voeding\nBij aanplant: VVoeding\nWat geef je en wanneer? ✨\noedrijke compost of organische meststof.';
    const expected = 'Bij aanplant: Voedrijke compost of organische meststof.';

    const autofill = contract.validate('seed-info', {
        notes: 'teeltinformatie',
        sow_months: [],
        harvest_months: [],
        nutrition: raw
    });
    const nutritionOnly = contract.validate('seed-info', { nutrition: raw }, { nutritionOnly: true });

    assert.equal(autofill.nutrition, expected);
    assert.equal(nutritionOnly.nutrition, expected);
});
