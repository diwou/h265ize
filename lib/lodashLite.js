function each(collection, iteratee) {
    if (!collection)
        return collection;

    if (Array.isArray(collection)) {
        for (let index = 0; index < collection.length; index++) {
            iteratee(collection[index], index, collection);
        }
        return collection;
    }

    Object.keys(collection).forEach(function(key) {
        iteratee(collection[key], key, collection);
    });

    return collection;
}

function every(collection, predicate) {
    if (!collection)
        return true;

    return Array.prototype.every.call(collection, predicate);
}

function values(object) {
    return Object.keys(object || {}).map(function(key) {
        return object[key];
    });
}

function map(collection, iteratee) {
    if (!collection)
        return [];

    if (Array.isArray(collection))
        return collection.map(iteratee);

    return Object.keys(collection).map(function(key) {
        return iteratee(collection[key], key, collection);
    });
}

function reduce(collection, iteratee, initialValue) {
    if (!collection)
        return initialValue;

    return Array.prototype.reduce.call(collection, iteratee, initialValue);
}

function orderBy(collection, iteratees, orders) {
    let list = collection ? collection.slice() : [];
    let keys = Array.isArray(iteratees) ? iteratees : [iteratees];
    let dirs = Array.isArray(orders) ? orders : [orders];

    return list.sort(function(a, b) {
        for (let i = 0; i < keys.length; i++) {
            let iteratee = keys[i];
            let direction = (dirs[i] || dirs[0] || 'asc').toLowerCase();
            let valueA = typeof iteratee === 'function' ? iteratee(a) : a[iteratee];
            let valueB = typeof iteratee === 'function' ? iteratee(b) : b[iteratee];

            if (valueA < valueB)
                return direction === 'desc' ? 1 : -1;

            if (valueA > valueB)
                return direction === 'desc' ? -1 : 1;
        }

        return 0;
    });
}

function find(collection, predicate) {
    return Array.prototype.find.call(collection || [], predicate);
}

function filter(collection, predicate) {
    return Array.prototype.filter.call(collection || [], predicate);
}

function defaults(target) {
    target = target || {};

    for (let i = 1; i < arguments.length; i++) {
        let source = arguments[i];

        if (!source)
            continue;

        Object.keys(source).forEach(function(key) {
            if (typeof target[key] === 'undefined')
                target[key] = source[key];
        });
    }

    return target;
}

function pull(array, value) {
    if (!Array.isArray(array))
        return array;

    let index;
    while ((index = array.indexOf(value)) !== -1)
        array.splice(index, 1);

    return array;
}

function keys(object) {
    return Object.keys(object || {});
}

function flatMap(collection, iteratee) {
    let result = [];

    each(collection, function(value, index) {
        let mapped = iteratee(value, index, collection);

        if (Array.isArray(mapped))
            result = result.concat(mapped);
        else
            result.push(mapped);
    });

    return result;
}

function findLast(collection, predicate) {
    if (!collection)
        return undefined;

    for (let index = collection.length - 1; index >= 0; index--) {
        if (predicate(collection[index], index, collection))
            return collection[index];
    }

    return undefined;
}

function times(count, iteratee) {
    let result = [];

    for (let index = 0; index < count; index++)
        result.push(iteratee(index));

    return result;
}

function isNumber(value) {
    return typeof value === 'number' || Object.prototype.toString.call(value) === '[object Number]';
}

module.exports = {
    each: each,
    every: every,
    values: values,
    map: map,
    reduce: reduce,
    orderBy: orderBy,
    find: find,
    filter: filter,
    defaults: defaults,
    pull: pull,
    keys: keys,
    flatMap: flatMap,
    findLast: findLast,
    times: times,
    isNumber: isNumber
};
