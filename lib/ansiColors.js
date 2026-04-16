function wrap(open, close) {
    return function(text) {
        return open + text + close;
    };
}

function createBackgroundGroup(open, close) {
    return {
        white: wrap(open + '\u001b[37m', '\u001b[39m' + close)
    };
}

module.exports = {
    red: wrap('\u001b[31m', '\u001b[39m'),
    green: wrap('\u001b[32m', '\u001b[39m'),
    yellow: wrap('\u001b[33m', '\u001b[39m'),
    blue: wrap('\u001b[34m', '\u001b[39m'),
    magenta: wrap('\u001b[35m', '\u001b[39m'),
    cyan: wrap('\u001b[36m', '\u001b[39m'),
    white: wrap('\u001b[37m', '\u001b[39m'),
    grey: wrap('\u001b[90m', '\u001b[39m'),
    underline: wrap('\u001b[4m', '\u001b[24m'),
    bold: wrap('\u001b[1m', '\u001b[22m'),
    bgMagenta: createBackgroundGroup('\u001b[45m', '\u001b[49m')
};
