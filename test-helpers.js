'use strict';

const assert = require('node:assert/strict');

function closeTo(actual, expected, delta) {
    assert.ok(Math.abs(actual - expected) <= delta, 'expected ' + actual + ' to be within ' + delta + ' of ' + expected);
}

function include(value, expected) {
    assert.ok(String(value).includes(expected), 'expected ' + JSON.stringify(value) + ' to include ' + JSON.stringify(expected));
}

function notInclude(value, expected) {
    assert.ok(!String(value).includes(expected), 'expected ' + JSON.stringify(value) + ' to not include ' + JSON.stringify(expected));
}

function isAbove(value, expected) {
    assert.ok(value > expected, 'expected ' + value + ' to be above ' + expected);
}

function isAtLeast(value, expected) {
    assert.ok(value >= expected, 'expected ' + value + ' to be at least ' + expected);
}

function isAtMost(value, expected) {
    assert.ok(value <= expected, 'expected ' + value + ' to be at most ' + expected);
}

function isNaNValue(value) {
    assert.ok(Number.isNaN(value), 'expected ' + value + ' to be NaN');
}

function isNumber(value) {
    assert.ok(typeof value === 'number' && !Number.isNaN(value), 'expected ' + value + ' to be a number');
}

function isTrue(value) {
    assert.strictEqual(value, true);
}

function lengthOf(value, expected) {
    assert.strictEqual(value.length, expected);
}

function notProperty(object, key) {
    assert.ok(!Object.prototype.hasOwnProperty.call(object, key), 'expected object to not have property ' + key);
}

module.exports = Object.assign({}, assert, {
    deepEqual: assert.deepStrictEqual,
    closeTo: closeTo,
    include: include,
    notInclude: notInclude,
    isAbove: isAbove,
    isAtLeast: isAtLeast,
    isAtMost: isAtMost,
    isNaN: isNaNValue,
    isNumber: isNumber,
    isTrue: isTrue,
    lengthOf: lengthOf,
    notProperty: notProperty
});
