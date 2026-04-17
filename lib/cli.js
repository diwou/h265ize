const Path = require('path');

const colors = require('./ansiColors.js');
const stripAnsi = require('./stripAnsi.js');

const optionDefinitions = [
    {
        name: 'destination',
        short: 'd',
        type: 'string',
        group: 'General:',
        describe: 'Folder where encoded files are output.'
    },
    {
        name: 'preset',
        short: 'm',
        type: 'string',
        group: 'General:',
        describe: 'x265 encoder preset.',
        choices: ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow', 'placebo']
    },
    {
        name: 'as-preset',
        type: 'string',
        group: 'Video:',
        describe: 'My personal presets. Descriptions of each preset\'s use and function can be found on the github page.',
        choices: ['grain', 'fastdecode', 'zerolatency', 'animation', 'anime-high', 'anime-medium', 'testing-ssim', 'none']
    },
    {
        name: 'native-language',
        short: 'n',
        type: 'string',
        group: 'General:',
        describe: 'The native language used to select default audio and subtitles. You may use 3 letter or 2 letter ISO 639-2 Alpha-3/Alpha-2 codes or the full language name. Examples: [eng|en|English|jpn|ja|Japanese]'
    },
    {
        name: 'output-format',
        short: 'f',
        type: 'string',
        group: 'General:',
        describe: 'Output container format.',
        choices: ['mkv', 'mp4', 'm4v']
    },
    {
        name: 'extra-options',
        short: 'x',
        type: 'string',
        group: 'Video:',
        describe: 'Extra x265 options. Options can be found on the x265 options page.'
    },
    {
        name: 'quality',
        short: 'q',
        type: 'number',
        group: 'General:',
        describe: 'Sets the qp quality target'
    },
    {
        name: 'video-bitrate',
        type: 'number',
        group: 'Video:',
        describe: 'Sets the video bitrate, set to 0 to use qp rate control instead of a target bitrate.'
    },
    {
        name: 'preview-length',
        short: 'l',
        type: 'number',
        group: 'Advanced:',
        describe: 'Milliseconds to encode in preview mode. Max is half the length of input video.'
    },
    {
        name: 'accurate-timestamps',
        type: 'boolean',
        group: 'Video:',
        describe: 'Become blu-ray compliant and reduce the max keyInt to the average frame rate.'
    },
    {
        name: 'he-audio',
        type: 'boolean',
        group: 'Audio:',
        describe: 'Re-encode audio to opus at 40kbps/channel.'
    },
    {
        name: 'force-he-audio',
        type: 'boolean',
        group: 'Audio:',
        describe: 'Convert all audio to HE format, including lossless formats.'
    },
    {
        name: 'downmix-he-audio',
        type: 'boolean',
        group: 'Audio:',
        describe: 'Downmix he-audio opus to Dolby Pro Logic II at 40 kbps/channel. Enables he-audio.'
    },
    {
        name: 'override',
        short: 'o',
        type: 'boolean',
        group: 'General:',
        describe: 'Enable override mode. Allows conversion of videos that are already encoded by the hevc codec.'
    },
    {
        name: 'preview',
        short: 'p',
        type: 'boolean',
        group: 'General:',
        describe: 'Only encode a preview of the video starting at middle of video. See -l/--preview-length for more info.'
    },
    {
        name: 'multi-pass',
        type: 'number',
        group: 'Video:',
        describe: 'Enable multiple passes by the encoder. Must be greater than 1.'
    },
    {
        name: 'stats',
        type: 'boolean',
        group: 'Advanced:',
        describe: 'Output a stats file containing stats for each video converted.'
    },
    {
        name: 'verbose',
        short: 'v',
        type: 'boolean',
        group: 'General:',
        describe: 'Enables verbose mode. Prints extra information.'
    },
    {
        name: 'watch',
        type: 'string',
        group: 'Advanced:',
        describe: 'Watches a directory for new video files to be converted.'
    },
    {
        name: 'bitdepth',
        type: 'number',
        group: 'Video:',
        describe: 'Forces encoding videos at a specific bitdepth. Set to 0 to maintain original bitdepth.'
    },
    {
        name: 'screenshots',
        type: 'boolean',
        group: 'Video:',
        describe: 'Take 6 screenshots at regular intervals throughout the finished encode.'
    },
    {
        name: 'normalize-level',
        type: 'number',
        group: 'Advanced:',
        describe: 'Level of normalization to be applied. See https://github.com/FallingSnow/h265ize/issues/56 for more info.'
    },
    {
        name: 'crop',
        type: 'string',
        group: 'Video:',
        describe: 'Crop detection profile.',
        choices: ['normal', 'analog', 'old', 'strict']
    },
    {
        name: 'crop-preview',
        type: 'boolean',
        group: 'Video:',
        describe: 'Save screenshots that show the chosen crop and stop before encoding starts.'
    },
    {
        name: 'crop-preview-dir',
        type: 'string',
        group: 'Video:',
        describe: 'Directory where crop preview screenshots should be stored.'
    },
    {
        name: 'scale',
        type: 'number',
        group: 'Video:',
        describe: 'Width videos should be scaled to. Videos will always maintain original aspect ratio. [Examples: 720, 480]'
    },
    {
        name: 'debug',
        type: 'boolean',
        group: 'Advanced:',
        describe: 'Enables debug mode. Prints extra debugging information.'
    },
    {
        name: 'probe',
        type: 'boolean',
        group: 'Advanced:',
        describe: 'Analyze the source and print a compact report without starting the encode stage.'
    },
    {
        name: 'explain',
        type: 'boolean',
        group: 'Advanced:',
        describe: 'Explain the chosen encoding plan, including preset, crop, bitdepth, and rate-control decisions.'
    },
    {
        name: 'dry-run',
        alias: 'show-command',
        type: 'boolean',
        group: 'Advanced:',
        describe: 'Show the final ffmpeg command and stop before the encode stage runs.'
    },
    {
        name: 'ignore-err',
        type: 'boolean',
        group: 'Advanced:',
        describe: 'Tolerate lightly corrupted input by passing ffmpeg -err_detect ignore_err to source decoders.'
    },
    {
        name: 'delete',
        type: 'boolean',
        group: 'Advanced:',
        describe: 'Delete source after encoding is complete and replaces it with new encode. [DANGER]'
    },
    {
        name: 'help',
        type: 'boolean',
        group: 'Options:',
        describe: 'Displays help page.'
    },
    {
        name: 'test',
        type: 'boolean',
        group: 'Advanced:',
        describe: 'Puts h265ize in test mode. No files will be encoded.'
    },
    {
        name: 'version',
        type: 'boolean',
        group: 'Options:',
        describe: 'Displays version information.'
    }
];

const optionByName = {};
const aliasToName = {};
const shortToName = {};
const groupOrder = ['General:', 'Video:', 'Advanced:', 'Audio:', 'Options:'];

optionDefinitions.forEach(function(definition) {
    optionByName[definition.name] = definition;
    if (definition.alias)
        aliasToName[definition.alias] = definition.name;
    if (definition.short)
        shortToName[definition.short] = definition.name;
});

function parseCLIArguments(argv, settings) {
    argv = Array.isArray(argv) ? argv.slice() : process.argv.slice(2);
    settings = settings || {};
    let defaults = buildDefaultValues(settings);

    let args = {
        _: [],
        $0: Path.basename(process.argv[1] || 'h265ize')
    };

    optionDefinitions.forEach(function(definition) {
        let value = getSettingDefault(definition.name, settings, defaults, definition);
        setResolvedOption(args, definition.name, value);
    });

    for (let i = 0; i < argv.length; i++) {
        let token = argv[i];

        if (token === '--') {
            args._ = args._.concat(argv.slice(i + 1));
            break;
        }

        if (token.indexOf('--') === 0) {
            i = parseLongOption(argv, i, token, args);
            continue;
        }

        if (token.indexOf('-') === 0 && token.length > 1) {
            i = parseShortOption(argv, i, token, args);
            continue;
        }

        args._.push(token);
    }

    args.showHelp = function() {
        console.log(formatHelp(args.$0, defaults));
    };

    return args;
}

function buildDefaultValues(settings) {
    function getSetting(name, fallback) {
        if (Object.prototype.hasOwnProperty.call(settings, name))
            return settings[name];
        return fallback;
    }

    return {
        destination: getSetting('destination', Path.resolve(process.cwd(), 'h265')),
        preset: getSetting('preset', 'medium'),
        'as-preset': getSetting('as-preset', 'none'),
        'native-language': getSetting('native-language', ''),
        'output-format': getSetting('output-format', 'mkv'),
        'extra-options': getSetting('extra-options', ''),
        quality: getSetting('quality', 19),
        'video-bitrate': getSetting('video-bitrate', 0),
        'preview-length': getSetting('preview-length', 30000),
        'accurate-timestamps': getSetting('accurate-timestamps', false),
        'he-audio': getSetting('he-audio', false),
        'force-he-audio': getSetting('force-he-audio', false),
        'downmix-he-audio': getSetting('downmix-he-audio', false),
        override: getSetting('override', false),
        preview: getSetting('preview', false),
        'multi-pass': getSetting('mutli-pass', getSetting('multi-pass', 0)),
        stats: getSetting('stats', false),
        verbose: getSetting('verbose', false),
        watch: getSetting('watch', ''),
        bitdepth: getSetting('bitdepth', 0),
        screenshots: getSetting('screenshots', false),
        'normalize-level': getSetting('normalize-level', 2),
        crop: getSetting('crop', 'normal'),
        'crop-preview': getSetting('crop-preview', false),
        'crop-preview-dir': getSetting('crop-preview-dir', ''),
        scale: getSetting('scale', false),
        debug: getSetting('debug', false),
        probe: getSetting('probe', false),
        explain: getSetting('explain', false),
        'dry-run': getSetting('dry-run', getSetting('show-command', false)),
        'show-command': getSetting('dry-run', getSetting('show-command', false)),
        'ignore-err': getSetting('ignore-err', false),
        delete: getSetting('delete', false),
        test: getSetting('test', false),
        help: false,
        version: false
    };
}

function getSettingDefault(name, settings, defaults, definition) {
    if (Object.prototype.hasOwnProperty.call(settings, name))
        return settings[name];

    if (definition.alias && Object.prototype.hasOwnProperty.call(settings, definition.alias))
        return settings[definition.alias];

    if (definition.short && Object.prototype.hasOwnProperty.call(settings, definition.short))
        return settings[definition.short];

    if (Object.prototype.hasOwnProperty.call(defaults, name))
        return defaults[name];

    return defaultValueForType(definition.type);
}

function defaultValueForType(type) {
    if (type === 'boolean')
        return false;
    if (type === 'number')
        return 0;
    return '';
}

function parseLongOption(argv, index, token, args) {
    let nameValue = token.slice(2);
    let value;
    let name = nameValue;
    let equalsIndex = nameValue.indexOf('=');

    if (equalsIndex >= 0) {
        name = nameValue.slice(0, equalsIndex);
        value = nameValue.slice(equalsIndex + 1);
    }

    if (name.indexOf('no-') === 0) {
        name = name.slice(3);
        value = false;
    }

    let resolved = resolveName(name);
    let definition = optionByName[resolved];

    if (definition && definition.type !== 'boolean' && typeof value === 'undefined') {
        let next = argv[index + 1];
        if (typeof next !== 'undefined' && !isLikelyOptionToken(next)) {
            value = next;
            index++;
        }
    }

    if (definition && definition.type === 'boolean') {
        if (typeof value === 'undefined') {
            let next = argv[index + 1];
            if (typeof next !== 'undefined' && !isLikelyOptionToken(next) && isBooleanLikeToken(next)) {
                value = parseBoolean(next);
                index++;
            } else {
                value = true;
            }
        } else {
            value = parseBoolean(value);
        }
    } else if (definition && definition.type === 'number') {
        value = parseNumber(value);
    } else if (definition) {
        value = typeof value === 'undefined' ? true : String(value);
    } else {
        value = typeof value === 'undefined' ? true : value;
    }

    setResolvedOption(args, resolved, value);
    return index;
}

function parseShortOption(argv, index, token, args) {
    let bundle = token.slice(1);

    for (let charIndex = 0; charIndex < bundle.length; charIndex++) {
        let short = bundle[charIndex];
        let resolved = resolveShort(short);
        let definition = optionByName[resolved];
        let value;
        let hasTrailingValue = charIndex < bundle.length - 1;

        if (!definition) {
            setResolvedOption(args, resolved, true);
            continue;
        }

        if (definition.type === 'boolean') {
            value = true;
        } else if (hasTrailingValue) {
            value = bundle.slice(charIndex + 1);
            charIndex = bundle.length;
        } else {
            let next = argv[index + 1];
            if (typeof next !== 'undefined' && !isLikelyOptionToken(next)) {
                value = next;
                index++;
            } else {
                value = '';
            }
        }

        if (definition.type === 'number') {
            value = parseNumber(value);
        } else if (definition.type !== 'boolean') {
            value = String(value);
        }

        setResolvedOption(args, resolved, value);
    }

    return index;
}

function resolveName(name) {
    if (Object.prototype.hasOwnProperty.call(optionByName, name))
        return name;
    if (Object.prototype.hasOwnProperty.call(aliasToName, name))
        return aliasToName[name];
    return name;
}

function resolveShort(short) {
    if (Object.prototype.hasOwnProperty.call(shortToName, short))
        return shortToName[short];
    return short;
}

function setResolvedOption(args, resolved, value) {
    let definition = optionByName[resolved];

    if (!definition) {
        setArgValueMirrors(args, resolved, value);
        return;
    }

    setArgValueMirrors(args, definition.name, value);
    if (definition.alias)
        setArgValueMirrors(args, definition.alias, value);
    if (definition.short)
        setArgValueMirrors(args, definition.short, value);
}

function setArgValueMirrors(args, name, value) {
    args[name] = value;

    let camelName = toCamelCase(name);
    if (camelName && camelName !== name)
        args[camelName] = value;
}

function toCamelCase(name) {
    if (typeof name !== 'string')
        return name;

    return name.replace(/-([a-z0-9])/g, function(match, char) {
        return char.toUpperCase();
    });
}

function parseBoolean(value) {
    if (typeof value === 'boolean')
        return value;

    let normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].indexOf(normalized) >= 0)
        return true;
    if (['0', 'false', 'no', 'off'].indexOf(normalized) >= 0)
        return false;
    return Boolean(value);
}

function parseNumber(value) {
    let parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function isLikelyOptionToken(token) {
    if (typeof token !== 'string' || token.length < 2 || token[0] !== '-')
        return false;

    if (token === '-')
        return false;

    return true;
}

function isBooleanLikeToken(token) {
    if (typeof token !== 'string')
        return false;

    let normalized = token.trim().toLowerCase();
    return ['1', '0', 'true', 'false', 'yes', 'no', 'on', 'off'].indexOf(normalized) >= 0;
}

function formatHelp(programName, defaults) {
    let lines = [];
    lines.push(colors.underline('Usage:') + ' ' + programName + ' [options] file|directory');
    lines.push('');

    groupOrder.forEach(function(groupName) {
        let groupOptions = optionDefinitions.filter(function(definition) {
            return definition.group === groupName;
        });

        if (!groupOptions.length)
            return;

        lines.push(groupName);

        let labels = groupOptions.map(formatOptionLabel);
        let labelWidth = Math.min(Math.max(...labels.map(function(label) {
            return stripAnsi(label).length;
        })), 24);
        labelWidth = Math.max(labelWidth, 22);

        groupOptions.forEach(function(definition, index) {
            let label = labels[index];
            let padding = Math.max(1, labelWidth - stripAnsi(label).length + 2);
            let detail = definition.describe;

            if (definition.choices)
                detail += ' [Möglichkeiten: "' + definition.choices.join('", "') + '"]';

            let defaultValue = getDefaultDisplayValue(definition, defaults);
            if (typeof defaultValue !== 'undefined')
                detail += ' [Standard: ' + JSON.stringify(defaultValue) + ']';

            let wrapped = wrapText(detail, 78 - labelWidth);

            if (wrapped.length) {
                lines.push(label + ' '.repeat(padding) + wrapped[0]);
                for (let i = 1; i < wrapped.length; i++)
                    lines.push(' '.repeat(labelWidth + 2) + wrapped[i]);
            } else {
                lines.push(label);
            }
        });

        lines.push('');
    });

    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function formatOptionLabel(definition) {
    let parts = [];

    if (definition.short)
        parts.push('-' + definition.short);

    let longLabel = '--' + definition.name;
    if (definition.alias)
        longLabel += ', --' + definition.alias;

    parts.push(longLabel);
    return parts.join(', ');
}

function getDefaultDisplayValue(definition, defaults) {
    if (!defaults || !Object.prototype.hasOwnProperty.call(defaults, definition.name))
        return undefined;

    return defaults[definition.name];
}

function wrapText(text, width) {
    if (!width || width < 20)
        return [text];

    let words = String(text).split(/\s+/);
    let lines = [];
    let line = '';

    words.forEach(function(word) {
        if (!word)
            return;

        let nextLine = line ? line + ' ' + word : word;
        if (nextLine.length > width && line) {
            lines.push(line);
            line = word;
        } else {
            line = nextLine;
        }
    });

    if (line)
        lines.push(line);

    return lines;
}

module.exports = {
    parseCLIArguments: parseCLIArguments,
    formatHelp: formatHelp,
    optionDefinitions: optionDefinitions
};
