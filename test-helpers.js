'use strict';

const assert = require('node:assert/strict');

assert.closeTo = function(actual, expected, delta) {
    assert.ok(Math.abs(actual - expected) <= delta, 'expected ' + actual + ' to be within ' + delta + ' of ' + expected);
};

assert.include = function(value, expected) {
    assert.ok(String(value).includes(expected), 'expected ' + JSON.stringify(value) + ' to include ' + JSON.stringify(expected));
};

assert.notInclude = function(value, expected) {
    assert.ok(!String(value).includes(expected), 'expected ' + JSON.stringify(value) + ' to not include ' + JSON.stringify(expected));
};

assert.isAbove = function(value, expected) {
    assert.ok(value > expected, 'expected ' + value + ' to be above ' + expected);
};

assert.isAtLeast = function(value, expected) {
    assert.ok(value >= expected, 'expected ' + value + ' to be at least ' + expected);
};

assert.isAtMost = function(value, expected) {
    assert.ok(value <= expected, 'expected ' + value + ' to be at most ' + expected);
};

assert.isNaN = function(value) {
    assert.ok(Number.isNaN(value), 'expected ' + value + ' to be NaN');
};

assert.isNumber = function(value) {
    assert.ok(typeof value === 'number' && !Number.isNaN(value), 'expected ' + value + ' to be a number');
};

assert.isTrue = function(value) {
    assert.strictEqual(value, true);
};

assert.lengthOf = function(value, expected) {
    assert.strictEqual(value.length, expected);
};

assert.notProperty = function(object, key) {
    assert.ok(!Object.prototype.hasOwnProperty.call(object, key), 'expected object to not have property ' + key);
};

module.exports = assert;
