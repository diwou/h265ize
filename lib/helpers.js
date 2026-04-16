const spawn = require('child_process').spawn;
const os = require('os');
const Path = require('path');
const fs = require('fs');

const consoleLogger = require('./consoleLogger.js');
const languages = require('./languages.json');
const packageSettings = require(Path.resolve(__dirname, '../package.json'));

const colors = require('./ansiColors.js');
const _ = require('./lodashLite.js');
const yargs = require('yargs/yargs');
const { hideBin } = require('yargs/helpers');
let userSettings = {};

try {
    userSettings = require(Path.resolve(__dirname, '../settings.json')) || {};
} catch (err) {
    if (err.code !== 'MODULE_NOT_FOUND')
        throw err;
}

const settingsSchema = {
    'destination': 'string',
    'preset': 'string',
    'as-preset': 'string',
    'native-language': 'string',
    'output-format': 'string',
    'extra-options': 'string',
    'quality': 'number',
    'video-bitrate': 'number',
    'preview-length': 'number',
    'accurate-timestamps': 'boolean',
    'he-audio': 'boolean',
    'force-he-audio': 'boolean',
    'downmix-he-audio': 'boolean',
    'override': 'boolean',
    'preview': 'boolean',
    'sample': 'boolean',
    'multi-pass': 'number',
    'stats': 'boolean',
    'verbose': 'boolean',
    'watch': 'string',
    'bitdepth': 'number',
    'screenshots': 'boolean',
    'normalize-level': 'number',
    'crop': 'string',
    'crop-preview': 'boolean',
    'crop-preview-dir': 'string',
    'scale': 'number',
    'debug': 'boolean',
    'probe': 'boolean',
    'explain': 'boolean',
    'dry-run': 'boolean',
    'ignore-err': 'boolean',
    'delete': 'boolean',
    'test': 'boolean'
};

const settingsChoices = {
    'preset': ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow', 'placebo'],
    'as-preset': ['grain', 'fastdecode', 'zerolatency', 'animation', 'anime-high', 'anime-medium', 'testing-ssim', 'none'],
    'output-format': ['mkv', 'mp4', 'm4v'],
    'crop': ['normal', 'analog', 'old', 'strict'],
    'bitdepth': [0, 8, 10, 12]
};

validateSettingsObject(userSettings);

var exports = module.exports = {
    getStreamTitle: getStreamTitle,
    normalizeStreamLanguage: normalizeStreamLanguage,
    normalizeLanguage: normalizeLanguage,
    getFormatedChannels: getFormatedChannels,
    parseTimemarkSeconds: parseTimemarkSeconds,
    formatDurationHms: formatDurationHms,
    formatLongTimestamp: formatLongTimestamp,
    formatStatsTimestamp: formatStatsTimestamp,
    formatFileSize: formatFileSize,
    commandExists: commandExists,
    extractTrack: extractTrack,
    vobsubToSRT: vobsubToSRT,
    createListString: createListString,
    parseInput: parseInput,
    initStatsFile: initStatsFile,
    appendToStatsFile: appendToStatsFile,
    getCLIArguments: getCLIArguments,
    validateSettingsObject: validateSettingsObject,
    removeFromObject: removeFromObject,
    isSupportedFileType: isSupportedFileType
};

String.prototype.capitalize = function() {
    return this.charAt(0).toUpperCase() + this.slice(1);
};

function getStreamTitle(stream) {
    if (stream.title)
        return stream.title;

    if (stream.tags) {
        if (stream.tags.title)
            return stream.tags.title;

        if (stream.tags.TITLE)
            return stream.tags.TITLE;

        if (stream.tags.name)
            return stream.tags.name;

        if (stream.tags.NAME)
            return stream.tags.NAME;
    }

    return undefined;
}

function normalizeStreamLanguage(stream) {
    let lang;

    if (stream.language)
        lang = stream.language;
    else if (stream.tags) {
        lang = stream.tags.language || stream.tags.LANGUAGE || stream.tags.lang || stream.tags.LANG;
    }

    return normalizeLanguage(lang);
}

function normalizeLanguage(lang) {
    if (typeof lang === 'undefined')
        return 'Unknown';

    switch (lang.length) {
        case 2:
            return languages.alpha2Languages[lang] || "Unknown";
        case 3:
            return languages.alpha3Languages[lang] || "Unknown";
        default:
            return lang.capitalize() || "Unknown";
    }
}

function getFormatedChannels(channels) {
    if (channels === 1) {
        return 'Mono';
    } else if (channels === 2) {
        return 'Stereo';
    } else if (channels % 2) {
        return channels + '.0 Channel';
    } else {
        return (channels - 1) + '.1 Channel';
    }
}

function parseTimemarkSeconds(timemark) {
    if (!timemark || typeof timemark !== 'string')
        return 0;

    let parts = timemark.split(':');
    if (parts.length !== 3)
        return 0;

    let hours = parseInt(parts[0], 10);
    let minutes = parseInt(parts[1], 10);
    let seconds = parseFloat(parts[2]);

    if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds))
        return 0;

    return (hours * 3600) + (minutes * 60) + seconds;
}

function formatDurationHms(totalSeconds) {
    if (!Number.isFinite(totalSeconds) || totalSeconds < 0)
        return '00:00:00';

    let wholeSeconds = Math.floor(totalSeconds);
    let hours = Math.floor(wholeSeconds / 3600);
    let minutes = Math.floor((wholeSeconds % 3600) / 60);
    let seconds = wholeSeconds % 60;

    return [hours, minutes, seconds].map(function(value, index) {
        if (index === 0 && hours > 99)
            return String(value);
        return String(value).padStart(2, '0');
    }).join(':');
}

function formatLongTimestamp(date) {
    return formatDateParts(date, true, true);
}

function formatStatsTimestamp(date) {
    return formatDateParts(date, false, false);
}

function formatDateParts(date, includeWeekday, includeUppercaseAmPm) {
    if (!(date instanceof Date) || isNaN(date.getTime()))
        return '';

    const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

    let day = date.getDate();
    let month = months[date.getMonth()];
    let year = date.getFullYear();
    let hours24 = date.getHours();
    let hours12 = hours24 % 12 || 12;
    let minutes = String(date.getMinutes()).padStart(2, '0');
    let seconds = String(date.getSeconds()).padStart(2, '0');
    let ampm = hours24 < 12 ? 'AM' : 'PM';
    let ampmDisplay = includeUppercaseAmPm ? ampm : ampm.toLowerCase();
    let parts = [];

    if (includeWeekday) {
        parts.push(weekdays[date.getDay()] + ',');
    }

    parts.push(month + ' ' + day + ordinalSuffix(day) + ' ' + year);

    if (includeUppercaseAmPm) {
        parts.push(hours12 + ':' + minutes + ':' + seconds + ' ' + ampmDisplay);
    } else {
        parts.push(hours24 + ':' + minutes + ':' + seconds + ' ' + ampmDisplay);
    }

    return parts.join(' ');
}

function ordinalSuffix(day) {
    let remainder = day % 100;
    if (remainder >= 11 && remainder <= 13)
        return 'th';

    switch (day % 10) {
        case 1:
            return 'st';
        case 2:
            return 'nd';
        case 3:
            return 'rd';
        default:
            return 'th';
    }
}

function commandExists(command) {
    if (!command || typeof command !== 'string')
        return false;

    let trimmedCommand = command.trim();

    if (!trimmedCommand)
        return false;

    let paths = (process.env.PATH || '').split(Path.delimiter).filter(Boolean);
    let extensions = [''];

    if (process.platform === 'win32') {
        let pathExt = (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean);

        if (Path.extname(trimmedCommand)) {
            extensions = [''];
        } else {
            extensions = [''].concat(pathExt);
        }
    }

    if (trimmedCommand.includes(Path.sep) || (Path.sep === '\\' && trimmedCommand.includes('/'))) {
        try {
            fs.accessSync(trimmedCommand, fs.constants.X_OK);
            return true;
        } catch (err) {
            return false;
        }
    }

    return paths.some(function(dir) {
        return extensions.some(function(extension) {
            let candidate = Path.join(dir, trimmedCommand + extension);

            try {
                fs.accessSync(candidate, fs.constants.X_OK);
                return true;
            } catch (err) {
                return false;
            }
        });
    });
}

function formatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes <= 0)
        return 'n/a';

    let units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex += 1;
    }

    let precision = size >= 100 ? 0 : size >= 10 ? 1 : 2;
    let formatted = size.toFixed(precision);

    if (precision > 0) {
        formatted = formatted.replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1');
    }

    return formatted + ' ' + units[unitIndex];
}

function extractTrack(videoPath, trackIndex) {
    return new Promise(function(resolve, reject) {
        if (!commandExists('mkvextract')) {
            return reject(new Error("MKVEXTRACT_NOT_INSTALLED"));
        }

        let base = Path.basename(videoPath);
        let output = Path.join(Path.resolve(os.tmpdir(), packageSettings.name), 'TRACK' + trackIndex + '_' + base.replace(/\.[^/.]+$/, ""));

        let process = spawn('mkvextract', ['tracks', videoPath, trackIndex + ':' + output])
            .on('close', (code) => {
                if (code !== 0) {
                    return reject(new Error('MKVEXTRACT_ERROR ' + code));
                }
                resolve(output);
            });
        process.stdout.on('data', function(data) {
            outputHandler('mkvextract', data);
        });
        process.stderr.on('data', function(data) {
            outputHandler('mkvextract', data);
        });

    });
}

function outputHandler(tool, data) {
}


function vobsubToSRT(filePath) {
    return new Promise(function(resolve, reject) {
        if (!commandExists('vobsub2srt')) {
            return reject(new Error('VOBSUB2SRT_NOT_INSTALLED'));
        }
        let filePathWithoutExtension = filePath.replace(/\.[^/.]+$/, "");

        let process = spawn('vobsub2srt', [filePathWithoutExtension])
            .on('close', (code) => {
                if (code !== 0) {
                    return reject(new Error('VOBSUB2SRT_ERROR'));
                }
                resolve(filePathWithoutExtension + '.srt');
            });
        process.stdout.on('data', function(data) {
            outputHandler('vobsub2srt', data);
        });
        process.stderr.on('data', function(data) {
            outputHandler('vobsub2srt', data);
        });
    });
}

function createListString(files) {
    if (Array.isArray(files))
        return '\n\t- ' + files.join('\n\t- ');

    let array = [];
    _.each(files, function(value, key) {
        array.push(colors.yellow(key) + ': ' + value);
    });
    return '\n\t- ' + array.join('\n\t- ');
}

function parseInput(input, logger) {
    logger = logger ? logger : consoleLogger;
    return new Promise(function(resolve, reject) {
        let fileDescriptorStats;
        try {
            fileDescriptorStats = fs.lstatSync(input);
        } catch (e) {
            if (e.code === 'ENOENT') {
                logger.error('Input', input, 'does not exist.');
                return resolve([]);
            }
            throw e;
        }

        if (fileDescriptorStats.isFile()) {
                if (isSupportedFileType(input)) {
                    resolve([input]);
                } else
                    return reject('Input file \'' + input + '\' is not a recognized file format.');
        }

        else if (fileDescriptorStats.isDirectory()) {
                findVideos(input).then(function(videoPaths) {
                    logger.verbose('Folder encoding started at', colors.yellow(formatLongTimestamp(new Date())));
                    resolve(videoPaths);
                }).catch(function(err) {
                    reject(err);
            });
        }

    });
}

function findVideos(path) {
    return new Promise(function(resolve, reject) {
        let videos = [];

        try {
            collectVideoFiles(path, videos);
            resolve(videos);
        } catch (err) {
            if (err.code === 'ENOENT')
                return reject(new Error('File or directory ' + colors.yellow(path) + ' does not exist.'));

            reject(err);
        }
    });
}

function collectVideoFiles(path, videos) {
    let entries = fs.readdirSync(path, {
        withFileTypes: true
    });

    _.each(entries, function(entry) {
        let entryPath = Path.join(path, entry.name);

        if (entry.isDirectory()) {
            collectVideoFiles(entryPath, videos);
            return;
        }

        if (entry.isFile() && isSupportedFileType(entryPath))
            videos.push(entryPath);
    });
}

function isSupportedFileType(file) {
    let supportedVideoExtensions = {
        '.3g2': true,
        '.3gp': true,
        '.avi': true,
        '.divx': true,
        '.f4v': true,
        '.m2t': true,
        '.m2ts': true,
        '.m4v': true,
        '.mkv': true,
        '.mov': true,
        '.mp4': true,
        '.mpeg': true,
        '.mpg': true,
        '.mts': true,
        '.ogm': true,
        '.ogv': true,
        '.rm': true,
        '.rmvb': true,
        '.ts': true,
        '.vob': true,
        '.webm': true,
        '.wmv': true,
        '.xvid': true
    };

    return !!supportedVideoExtensions[Path.extname(file).toLowerCase()];
}

function initStatsFile(path) {
    return new Promise(function(resolve, reject) {
        loadStatsFile(path).then(function(stream) {
            resolve(stream);
        }).catch(reject);
    });
}

function loadStatsFile(path) {
    return new Promise(function(resolve, reject) {
        fs.access(path, fs.constants.F_OK, function(err) {
            let stream = fs.createWriteStream(path, {
                'flags': 'a'
            });

            if (err) {
                stream.write('Encoded Date,Relative Path,Original Size,New Size,Percentage,Duration of Encode');
            }

            resolve(stream);
        });
    });
}

function appendToStatsFile(data, statsFile) {
    return new Promise(function(resolve, reject) {
        _.each(data, function(val, i) {
            if (val.indexOf(',') > -1) {
                data[i] = '"' + val + '"';
            }
        });
        statsFile.write('\n' + data.join(','), 'utf-8', function(err) {
            if (err)
                return reject(err);
            resolve();
        });
    });
}

function validateSettingsObject(settings) {
    if (!settings || typeof settings !== 'object')
        return;

    let errors = [];

    _.each(settings, function(value, key) {
        if (!Object.prototype.hasOwnProperty.call(settingsSchema, key)) {
            errors.push('Unknown setting "' + key + '"');
            return;
        }

        if (settingsSchema[key] === 'number') {
            if (typeof value !== 'number' || !Number.isFinite(value))
                errors.push('Setting "' + key + '" must be a number.');
        } else if (settingsSchema[key] === 'boolean') {
            if (typeof value !== 'boolean')
                errors.push('Setting "' + key + '" must be true or false.');
        } else if (settingsSchema[key] === 'string') {
            if (typeof value !== 'string')
                errors.push('Setting "' + key + '" must be a string.');
        }

        if (settingsChoices[key] && settingsChoices[key].indexOf(value) === -1) {
            errors.push('Setting "' + key + '" must be one of: ' + settingsChoices[key].join(', ') + '.');
        }
    });

    if (errors.length) {
        throw new Error('Invalid settings.json:\n- ' + errors.join('\n- '));
    }
}

function getCLIArguments() {
    let parser = yargs(hideBin(process.argv))
        .version(false)
        .usage(colors.underline('Usage:') + ' $0 [options] file|directory')
        .options({
            'd': {
                alias: 'destination',
                default: userSettings['destination'] || Path.resolve(process.cwd(), 'h265'),
                describe: 'Folder where encoded files are output.',
                type: 'string',
                normalize: true,
                group: 'General:'
            },
            'm': {
                alias: 'preset',
                default: userSettings['preset'] || 'medium',
                describe: 'x265 encoder preset.',
                choices: ['ultrafast', 'superfast', 'veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow', 'placebo'],
                type: 'string',
                group: 'General:'
            },
            'as-preset': {
                default: userSettings['as-preset'] || 'none',
                describe: 'My personal presets. Descriptions of each preset\'s use and function can be found on the github page.',
                choices: ['grain', 'fastdecode', 'zerolatency', 'animation', 'anime-high', 'anime-medium', 'testing-ssim', 'none'],
                type: 'string',
                group: 'Video:'
            },
            'n': {
                alias: 'native-language',
                default: userSettings['native-language'] || '',
                describe: 'The native language used to select default audio and subtitles. You may use 3 letter or 2 letter ISO 639-2 Alpha-3/Alpha-2 codes or the full language name. Examples: [eng|en|English|jpn|ja|Japanese]',
                type: 'string',
                group: 'General:'
            },
            'f': {
                alias: 'output-format',
                default: userSettings['output-format'] || 'mkv',
                describe: 'Output container format.',
                choices: ['mkv', 'mp4', 'm4v'],
                type: 'string',
                group: 'General:'
            },
            'x': {
                alias: 'extra-options',
                default: userSettings['extra-options'] || '',
                describe: 'Extra x265 options. Options can be found on the x265 options page.',
                type: 'string',
                group: 'Video:'
            },
            'q': {
                alias: 'quality',
                default: userSettings['quality'] || 19,
                describe: 'Sets the qp quality target',
                type: 'number',
                group: 'General:'
            },
            'video-bitrate': {
                default: userSettings['video-bitrate'] || 0,
                describe: 'Sets the video bitrate, set to 0 to use qp rate control instead of a target bitrate.',
                type: 'number',
                group: 'Video:'
            },
            'l': {
                alias: 'preview-length',
                default: userSettings['preview-length'] || 30000,
                describe: 'Milliseconds to encode in preview mode. Max is half the length of input video.',
                type: 'number',
                group: 'Advanced:'
            },
            'accurate-timestamps': {
                default: userSettings['accurate-timestamps'] || false,
                describe: 'Become blu-ray complient and reduce the max keyInt to the average frame rate.',
                type: 'boolean',
                group: 'Video:'
            },
            'he-audio': {
                default: userSettings['he-audio'] || false,
                describe: 'Re-encode audio to opus at 40kbps/channel.',
                type: 'boolean',
                group: 'Audio:'
            },
            'force-he-audio': {
                default: userSettings['force-he-audio'] || false,
                describe: 'Convert all audio to HE format, including lossless formats.',
                type: 'boolean',
                group: 'Audio:'
            },
            'downmix-he-audio': {
                default: userSettings['downmix-he-audio'] || false,
                describe: 'Downmix he-audio opus to Dolby Pro Logic II at 40 kbps/channel. Enables he-audio.',
                type: 'boolean',
                group: 'Audio:'
            },
            'o': {
                alias: 'override',
                default: userSettings['override'] || false,
                describe: 'Enable override mode. Allows conversion of videos that are already encoded by the hevc codec.',
                type: 'boolean',
                group: 'General:'
            },
            'p': {
                alias: 'preview',
                default: userSettings['preview'] || false,
                describe: 'Only encode a preview of the video starting at middle of video. See -l/--preview-length for more info.',
                type: 'boolean',
                group: 'General:'
            },
            'multi-pass': {
                default: userSettings['mutli-pass'] || 0,
                describe: 'Enable multiple passes by the encoder. Must be greater than 1.',
                type: 'number',
                group: 'Video:'
            },
            'stats': {
                default: userSettings['stats'] || false,
                describe: 'Output a stats file containing stats for each video converted.',
                type: 'boolean',
                group: 'Advanced:'
            },
            'v': {
                alias: 'verbose',
                default: userSettings['verbose'] || false,
                describe: 'Enables verbose mode. Prints extra information.',
                type: 'boolean',
                group: 'General:'
            },
            'watch': {
                default: userSettings['watch'] || '',
                describe: 'Watches a directory for new video files to be converted.',
                type: 'string',
                group: 'Advanced:'
            },
            'bitdepth': {
                default: userSettings['bitdepth'] || 0,
                describe: 'Forces encoding videos at a specific bitdepth. Set to 0 to maintain original bitdepth.',
                type: 'number',
                group: 'Video:'
            },
            'screenshots': {
                default: userSettings['screenshots'] || false,
                describe: 'Take 6 screenshots at regular intervals throughout the finished encode.',
                type: 'boolean',
                group: 'Video:'
            },
            'normalize-level': {
                default: userSettings['normalize-level'] || 2,
                describe: 'Level of normalization to be applied. See https://github.com/FallingSnow/h265ize/issues/56 for more info.',
                type: 'number',
                group: 'Advanced:'
            },
            'crop': {
                default: userSettings['crop'] || 'normal',
                describe: 'Crop detection profile.',
                choices: ['normal', 'analog', 'old', 'strict'],
                type: 'string',
                group: 'Video:'
            },
            'crop-preview': {
                default: userSettings['crop-preview'] || false,
                describe: 'Save screenshots that show the chosen crop and stop before encoding starts.',
                type: 'boolean',
                group: 'Video:'
            },
            'crop-preview-dir': {
                default: userSettings['crop-preview-dir'] || '',
                describe: 'Directory where crop preview screenshots should be stored.',
                type: 'string',
                group: 'Video:'
            },
            'scale': {
                default: userSettings['scale'] || false,
                describe: 'Width videos should be scaled to. Videos will always maintain original aspect ratio. [Examples: 720, 480]',
                type: 'number',
                group: 'Video:'
            },
            'debug': {
                default: userSettings['debug'] || false,
                describe: 'Enables debug mode. Prints extra debugging information.',
                type: 'boolean',
                group: 'Advanced:'
            },
            'probe': {
                default: userSettings['probe'] || false,
                describe: 'Analyze the source and print a compact report without starting the encode stage.',
                type: 'boolean',
                group: 'Advanced:'
            },
            'explain': {
                default: userSettings['explain'] || false,
                describe: 'Explain the chosen encoding plan, including preset, crop, bitdepth, and rate-control decisions.',
                type: 'boolean',
                group: 'Advanced:'
            },
            'dry-run': {
                alias: 'show-command',
                default: userSettings['dry-run'] || userSettings['show-command'] || false,
                describe: 'Show the final ffmpeg command and stop before the encode stage runs.',
                type: 'boolean',
                group: 'Advanced:'
            },
            'ignore-err': {
                default: userSettings['ignore-err'] || false,
                describe: 'Tolerate lightly corrupted input by passing ffmpeg -err_detect ignore_err to source decoders.',
                type: 'boolean',
                group: 'Advanced:'
            },
            'delete': {
                default: userSettings['delete'] || false,
                describe: 'Delete source after encoding is complete and replaces it with new encode. [DANGER]',
                type: 'boolean',
                group: 'Advanced:'
            },
            'help': {
                describe: 'Displays help page.',
                group: 'Options:'
            },
            'test': {
                default: userSettings['test'] || false,
                describe: 'Puts h265ize in test mode. No files will be encoded.',
                type: 'boolean',
                group: 'Advanced:'
            },
            'version': {
                describe: 'Displays version information.',
                group: 'Options:'
            },
        });

    let argv = parser.argv;
    argv.showHelp = parser.showHelp.bind(parser);

    return argv;
}

function removeFromObject(obj, key) {
    if (typeof obj[key] !== 'undefined') {
        delete obj[key];
        obj.length -= 1;
    }
}
