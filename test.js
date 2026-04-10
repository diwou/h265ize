const assert = require('chai').assert;
const h265ize = require('./h265ize');

const helpers = h265ize._helpers;

const nullFunc = function() {
    return undefined;
};

const nullLogger = {
    debug: nullFunc,
    verbose: nullFunc,
    info: nullFunc,
    error: nullFunc,
    alert: nullFunc,
    warn: nullFunc
};

function createCommandRecorder() {
    return {
        calls: [],
        outputOptions: function() {
            this.calls.push(Array.from(arguments));
            return this;
        },
        audioChannels: function() {
            this.calls.push(['audioChannels'].concat(Array.from(arguments)));
            return this;
        },
        audioFilters: function() {
            this.calls.push(['audioFilters'].concat(Array.from(arguments)));
            return this;
        },
        videoFilters: function() {
            this.calls.push(['videoFilters'].concat(Array.from(arguments)));
            return this;
        }
    };
}

function assertHasCall(calls, expected) {
    assert.isTrue(calls.some(function(call) {
        return JSON.stringify(call) === JSON.stringify(expected);
    }), 'Expected call was not recorded: ' + JSON.stringify(expected));
}

describe('Helpers', function() {
    it('returns a stream title from tags when present', function() {
        assert.strictEqual(helpers.getStreamTitle({
            tags: {
                title: 'English Stereo'
            }
        }), 'English Stereo');
    });

    it('returns undefined instead of throwing when tags are missing', function() {
        assert.strictEqual(helpers.getStreamTitle({}), undefined);
    });

    it('normalizes a stream language from tags when present', function() {
        assert.strictEqual(helpers.normalizeStreamLanguage({
            tags: {
                language: 'eng'
            }
        }), 'English');
    });

    it('returns Unknown instead of throwing when stream language tags are missing', function() {
        assert.strictEqual(helpers.normalizeStreamLanguage({}), 'Unknown');
    });
});

describe('Analysis path regressions', function() {
    it('parses multiple loudnorm JSON summaries from ffmpeg stderr', function() {
        let stderr = [
            '[Parsed_loudnorm_0 @ 0x1]',
            '{',
            '  "input_i" : "-33.09",',
            '  "input_tp" : "-21.89",',
            '  "input_lra" : "2.40",',
            '  "input_thresh" : "-43.09",',
            '  "target_offset" : "-0.05"',
            '}',
            '[Parsed_loudnorm_1 @ 0x2]',
            '{',
            '  "input_i" : "-33.74",',
            '  "input_tp" : "-17.66",',
            '  "input_lra" : "7.30",',
            '  "input_thresh" : "-43.74",',
            '  "target_offset" : "-0.26"',
            '}'
        ].join('\n');

        let summaries = h265ize.Video.parseLoudnormSummaries(stderr);
        assert.lengthOf(summaries, 2);
        assert.strictEqual(summaries[0].input_i, '-33.09');
        assert.strictEqual(summaries[1].target_offset, '-0.26');
    });

    it('uses the last detected crop result from ffmpeg stderr', function() {
        let stderr = [
            '[Parsed_cropdetect_0 @ 0x1] crop=3720:1604:68:2',
            '[Parsed_cropdetect_0 @ 0x1] crop=3714:1602:72:6'
        ].join('\n');

        assert.deepEqual(h265ize.Video.extractCropFromStderr(stderr), {
            w: 3714,
            h: 1602,
            x: 72,
            y: 6
        });
    });

    it('returns null when no crop result is present in stderr', function() {
        assert.strictEqual(h265ize.Video.extractCropFromStderr('frame=10 fps=20'), null);
    });
});

describe('Video stream mapping regressions', function() {
    it('uses output-relative audio metadata and disposition indices', function() {
        let command = createCommandRecorder();
        let context = {
            encoder: {
                logger: nullLogger
            },
            ffmpegCommand: command,
            options: {
                normalizeLevel: 2,
                'native-language': 'eng'
            },
            videoStream: {
                input: 0,
                index: 0,
                width: 1920,
                height: 1080,
                codec_long_name: 'H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10',
                profile: 'High'
            },
            videoBitDepth: 8,
            streams: {
                audioStreams: [{
                    input: 0,
                    index: 1,
                    codec_name: 'aac',
                    codec_long_name: 'AAC (Advanced Audio Coding)',
                    channels: 2,
                    profile: 'LC',
                    tags: {
                        language: 'eng'
                    }
                }, {
                    input: 0,
                    index: 2,
                    codec_name: 'aac',
                    codec_long_name: 'AAC (Advanced Audio Coding)',
                    channels: 2,
                    profile: 'LC',
                    tags: {
                        language: 'jpn',
                        title: 'Japanese Stereo'
                    }
                }],
                subtitleStreams: [],
                otherStreams: []
            }
        };

        return h265ize.Video.prototype.mapStreams.call(context).then(function() {
            assertHasCall(command.calls, ['-metadata:s:a:0', 'title=English AAC LC (Stereo)']);
            assertHasCall(command.calls, ['-disposition:a:0', 'default']);
            assertHasCall(command.calls, ['-disposition:a:1', '0']);
        });
    });

    it('uses output-relative subtitle metadata and disposition indices', function() {
        let command = createCommandRecorder();
        let context = {
            encoder: {
                logger: nullLogger
            },
            ffmpegCommand: command,
            options: {
                normalizeLevel: 2,
                'native-language': 'eng'
            },
            videoStream: {
                input: 0,
                index: 0,
                width: 1920,
                height: 1080,
                codec_long_name: 'H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10',
                profile: 'High'
            },
            videoBitDepth: 8,
            streams: {
                audioStreams: [],
                subtitleStreams: [{
                    input: 0,
                    index: 3,
                    codec_long_name: 'SubRip subtitle',
                    tags: {
                        language: 'eng'
                    }
                }, {
                    input: 0,
                    index: 4,
                    codec_long_name: 'SubRip subtitle',
                    tags: {
                        language: 'jpn',
                        title: 'Japanese Full'
                    }
                }],
                otherStreams: []
            }
        };

        return h265ize.Video.prototype.mapStreams.call(context).then(function() {
            assertHasCall(command.calls, ['-metadata:s:s:0', 'title=English']);
            assertHasCall(command.calls, ['-disposition:s:0', 'default']);
            assertHasCall(command.calls, ['-disposition:s:1', '0']);
        });
    });
});
