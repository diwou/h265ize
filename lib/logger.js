const fs = require('fs');
const Path = require("path");
const colors = require('colors');
const stripAnsi = require('strip-ansi');
const readline = require("readline");
const keypress = require('keypress');

const packageSettings = require(Path.join(__dirname, '../package.json'));
const helpers = require(Path.join(__dirname, './helpers.js'));

const logFile = Path.join(process.cwd(), 'h265ize.log');
const levelOrder = ['error', 'warn', 'alert', 'info', 'verbose', 'debug'];
const levelColors = {
    error: 'red',
    warn: 'yellow',
    alert: 'magenta',
    info: 'white',
    verbose: 'cyan',
    debug: 'grey'
};

function shouldLog(currentLevel, messageLevel) {
    return levelOrder.indexOf(messageLevel) <= levelOrder.indexOf(currentLevel);
}

function createMeta(args) {
    let meta = {};
    if (!args.length)
        return meta;

    let lastArg = args[args.length - 1];
    if (lastArg && typeof lastArg === 'object' && !Array.isArray(lastArg) && !(lastArg instanceof Error)) {
        meta = Object.assign({}, lastArg);
        args.pop();
    }
    return meta;
}

function formatMessage(level, args, meta, useColors) {
    let label;
    let logLevel;

    if (useColors) {
        label = level === 'error' ? colors[levelColors.error]('[' + packageSettings.name + ']') : colors.green('[' + packageSettings.name + ']');
        logLevel = (level === 'info' || level === 'error') ? '' : colors[levelColors[level]]('[' + level + ']') + ' ';
    } else {
        label = '[' + packageSettings.name + ']';
        logLevel = (level === 'info' || level === 'error') ? '' : '[' + level + '] ';
    }

    let message = args.map(function(arg) {
        if (typeof arg === 'string')
            return arg;
        if (arg instanceof Error)
            return arg.stack || arg.message;
        return String(arg);
    }).join(' ');

    if (meta.__divider)
        message += '\n' + '-'.repeat(process.stdout.columns || 80);

    if (Object.keys(meta).length) {
        let visibleMeta = Object.assign({}, meta);
        delete visibleMeta.__clearLine;
        delete visibleMeta.__divider;
        if (Object.keys(visibleMeta).length) {
            message += helpers.createListString(visibleMeta);
        }
    }

    return label + ': ' + logLevel + message;
}

module.exports = function(level) {
    let currentLevel = level;
    let lastLineWasCleared = false;
    let lastMessageLength = 0;
    let keypressListener;
    let fileStream = null;

    function write(levelName, targetArgs) {
        if (!shouldLog(currentLevel, levelName))
            return;

        let args = Array.prototype.slice.call(targetArgs);
        let meta = createMeta(args);

        if (meta.__clearLine && lastLineWasCleared) {
            readline.moveCursor(process.stdout, -1000, -Math.ceil(lastMessageLength / (process.stdout.columns || 80)));
            readline.clearLine(process.stdout, 0);
            lastLineWasCleared = true;
        } else if (meta.__clearLine) {
            lastLineWasCleared = true;
        } else {
            lastLineWasCleared = false;
        }

        let consoleLine = formatMessage(levelName, args, meta, true);
        let fileLine = stripAnsi(formatMessage(levelName, args, meta, false));
        lastMessageLength = stripAnsi(consoleLine).length;

        if (levelName === 'error' || levelName === 'warn')
            console.error(consoleLine);
        else
            console.log(consoleLine);

        if (fileStream && shouldLog('debug', levelName))
            fileStream.write(fileLine + '\n');
    }

    let logger = {
        transports: {},
        debug: function() { write('debug', arguments); },
        verbose: function() { write('verbose', arguments); },
        info: function() { write('info', arguments); },
        alert: function() { write('alert', arguments); },
        warn: function() { write('warn', arguments); },
        error: function() { write('error', arguments); }
    };

    logger.transports['default-logger'] = {
        get level() {
            return currentLevel;
        },
        set level(value) {
            currentLevel = value;
        }
    };

    if (level === 'debug') {
        fileStream = fs.createWriteStream(logFile, { flags: 'a' });
        logger.transports.file = { filename: logFile };
        logger.debug('Log file location:', logFile);
    }

    if (module.parent && module.parent.name === 'h265ize' && process.stdin.isTTY) {
        keypress(process.stdin);
        process.stdin.setRawMode(true);
        process.stdin.resume();

        if (keypressListener === true)
            process.stdin.removeListener('keypress', keypressListener);

        keypressListener = process.stdin.on('keypress', function(ch, key) {
            if (key && key.name == 'd') {
                let logLevelIsDebug = (currentLevel === 'debug');
                logger.info('Debugging', logLevelIsDebug ? 'disabled.' : 'enabled.');
                currentLevel = logLevelIsDebug ? 'info' : 'debug';
            }
        });
    }

    return logger;
};
