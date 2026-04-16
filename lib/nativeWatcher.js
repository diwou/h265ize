const fs = require('fs');
const Path = require('path');

function shouldIgnorePath(path, ignoredPattern) {
    if (ignoredPattern && ignoredPattern.test(path))
        return true;

    return /(^|[\\/])\./.test(path);
}

function collectDirectories(root) {
    let directories = [];

    function walk(directory) {
        let stat;

        try {
            stat = fs.statSync(directory);
        } catch (err) {
            return;
        }

        if (!stat.isDirectory())
            return;

        directories.push(directory);

        let entries;

        try {
            entries = fs.readdirSync(directory, {
                withFileTypes: true
            });
        } catch (err) {
            return;
        }

        entries.forEach(function(entry) {
            if (!entry.isDirectory())
                return;

            walk(Path.join(directory, entry.name));
        });
    }

    walk(Path.resolve(root));
    return directories;
}

function createNativeWatcher(root, options) {
    options = options || {};

    let ignoredPattern = options.ignored;
    let onAdd = typeof options.onAdd === 'function' ? options.onAdd : function() {};
    let onError = typeof options.onError === 'function' ? options.onError : function() {};
    let stabilityThreshold = Number(options.stabilityThreshold) > 0 ? Number(options.stabilityThreshold) : 3000;
    let pollInterval = Number(options.pollInterval) > 0 ? Number(options.pollInterval) : 1000;
    let watchers = new Map();
    let pending = new Map();
    let closed = false;

    function clearPending(path) {
        let entry = pending.get(path);
        if (entry && entry.timer)
            clearTimeout(entry.timer);
        pending.delete(path);
    }

    function safeStat(path) {
        try {
            return fs.statSync(path);
        } catch (err) {
            return null;
        }
    }

    function queueAdd(path) {
        if (closed || shouldIgnorePath(path, ignoredPattern))
            return;

        let entry = pending.get(path);
        if (!entry) {
            entry = {
                lastSize: null,
                stableSince: Date.now(),
                timer: null
            };
            pending.set(path, entry);
        }

        entry.stableSince = Date.now();

        if (entry.timer)
            clearTimeout(entry.timer);

        entry.timer = setTimeout(function poll() {
            if (closed) {
                clearPending(path);
                return;
            }

            let stat = safeStat(path);
            if (!stat || !stat.isFile()) {
                clearPending(path);
                return;
            }

            if (entry.lastSize !== stat.size) {
                entry.lastSize = stat.size;
                entry.stableSince = Date.now();
            }

            if (Date.now() - entry.stableSince >= stabilityThreshold) {
                clearPending(path);
                onAdd(path);
                return;
            }

            entry.timer = setTimeout(poll, pollInterval);
        }, pollInterval);
    }

    function watchDirectory(directory) {
        if (closed || watchers.has(directory))
            return;

        let watcher;

        try {
            watcher = fs.watch(directory, {
                persistent: true
            }, function(eventType, filename) {
                if (closed || !filename)
                    return;

                let fullPath = Path.join(directory, filename.toString());
                if (shouldIgnorePath(fullPath, ignoredPattern))
                    return;

                let stat = safeStat(fullPath);
                if (stat && stat.isDirectory()) {
                    collectDirectories(fullPath).forEach(watchDirectory);
                    return;
                }

                if (stat && stat.isFile()) {
                    queueAdd(fullPath);
                    return;
                }

                queueAdd(fullPath);
            });
        } catch (err) {
            onError(err);
            return;
        }

        watchers.set(directory, watcher);
    }

    collectDirectories(root).forEach(watchDirectory);

    return {
        close: function() {
            closed = true;

            pending.forEach(function(entry) {
                if (entry.timer)
                    clearTimeout(entry.timer);
            });
            pending.clear();

            watchers.forEach(function(watcher) {
                watcher.close();
            });
            watchers.clear();
        }
    };
}

module.exports = {
    createNativeWatcher: createNativeWatcher,
    collectDirectories: collectDirectories,
    shouldIgnorePath: shouldIgnorePath
};
