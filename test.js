const assert = require('chai').assert;
const childProcess = require('child_process');
const fs = require('fs-extra');
const Path = require('path');
const h265ize = require('./h265ize');
const ASPresets = require('./lib/aspresets.json');

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
        inputOptions: function() {
            this.calls.push(['inputOptions'].concat(Array.from(arguments)));
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

function makeTempDir(prefix) {
    return fs.mkdtempSync(Path.join('/tmp', prefix));
}

function createPreviewSource(videoPath) {
    childProcess.execFileSync('ffmpeg', [
        '-y',
        '-f', 'lavfi',
        '-i', 'testsrc2=size=320x240:rate=10',
        '-t', '12',
        '-pix_fmt', 'yuv420p',
        videoPath
    ], {
        stdio: ['ignore', 'ignore', 'ignore']
    });
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

    it('formats durations as hh:mm:ss without relying on moment-duration-format', function() {
        assert.strictEqual(helpers.formatDurationHms(0), '00:00:00');
        assert.strictEqual(helpers.formatDurationHms(61.4), '00:01:01');
        assert.strictEqual(helpers.formatDurationHms(3661), '01:01:01');
        assert.strictEqual(helpers.formatDurationHms(360000), '100:00:00');
    });

    it('validates settings objects against the supported config schema', function() {
        assert.doesNotThrow(function() {
            helpers.validateSettingsObject({
                destination: '/tmp',
                preset: 'medium',
                probe: false,
                'dry-run': false,
                'ignore-err': true,
                sample: true
            });
        });

        assert.throws(function() {
            helpers.validateSettingsObject({
                qality: 26
            });
        }, /Unknown setting "qality"/);

        assert.throws(function() {
            helpers.validateSettingsObject({
                'dry-run': 'yes'
            });
        }, /must be true or false/);
    });
});

describe('AS presets', function() {
    it('includes the general-purpose x265 tune presets', function() {
        assert.deepEqual(ASPresets.grain, {
            x265Options: 'tune=grain'
        });
        assert.deepEqual(ASPresets.fastdecode, {
            x265Options: 'tune=fastdecode'
        });
        assert.deepEqual(ASPresets.zerolatency, {
            x265Options: 'tune=zerolatency'
        });
        assert.deepEqual(ASPresets.animation, {
            x265Options: 'tune=animation'
        });
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

    it('keeps the shared cropped area when detections disagree about full-frame coverage', function() {
        assert.deepEqual(h265ize.Video.aggregateCropDetections([
            { w: 1920, h: 1080, x: 0, y: 0 },
            { w: 1920, h: 804, x: 0, y: 138 },
            { w: 1918, h: 802, x: 1, y: 139 }
        ]), {
            w: 1918,
            h: 802,
            x: 1,
            y: 139
        });
    });

    it('ignores isolated smaller crop outliers when a larger crop cluster dominates', function() {
        assert.deepEqual(h265ize.Video.aggregateCropDetections([
            { w: 1920, h: 800, x: 0, y: 0 },
            { w: 1920, h: 800, x: 0, y: 0 },
            { w: 1920, h: 800, x: 0, y: 0 },
            { w: 1920, h: 650, x: 0, y: 75 }
        ]), {
            w: 1920,
            h: 800,
            x: 0,
            y: 0
        });
    });

    it('builds a readable crop decision report from clustered detections', function() {
        let report = h265ize.Video.buildCropDecisionReport([
            { w: 1918, h: 802, x: 1, y: 139 },
            { w: 1918, h: 802, x: 1, y: 139 },
            { w: 1918, h: 802, x: 1, y: 139 },
            { w: 1920, h: 650, x: 0, y: 215 }
        ], 'normal');

        assert.deepEqual(report, [
            'Profile: normal (limit 0.094, scan 3s, frames 10)',
            'Detections: 4',
            'Cluster #1: 3 sample(s), crop 1918x802:1:139',
            'Cluster #2: 1 sample(s), crop 1920x650:0:215',
            'Final crop: 1918x802:1:139'
        ]);
    });

    it('builds an explain report from the current encoding plan', function() {
        let report = h265ize.Video.buildExplainReport({
            base: 'movie.mkv',
            output: {
                path: '/out/movie.mp4'
            },
            options: {
                outputFormat: 'mp4',
                preset: 'medium',
                asPreset: 'grain',
                videoBitrate: 0,
                quality: 19,
                preview: false,
                previewLength: 30000,
                normalizeLevel: 3,
                heAudio: true,
                forceHEAudio: false,
                downmixHEAudio: true,
                crop: 'normal',
                scale: 720
            },
            videoBitDepth: 10,
            videoStream: {
                codec_name: 'hevc',
                pix_fmt: 'yuv420p10le'
            },
            x265Options: 'tune=grain:aq-mode=3',
            cropDecision: {
                w: 1918,
                h: 802,
                x: 1,
                y: 139
            },
            streams: {
                audioStreams: [{}, {}],
                subtitleStreams: [{}]
            }
        });

        assert.deepEqual(report, [
            'Source: movie.mkv',
            'Output: /out/movie.mp4',
            'Container: mp4',
            'Preset: medium (as-preset: grain)',
            'x265 params: tune=grain:aq-mode=3',
            'Video rate control: CRF 19',
            'Bitdepth: 10 bit (source yuv420p10le)',
            'Preview: disabled',
            'Audio normalization: volumedetect/volume (level 3)',
            'HE audio: enabled (optional + downmix)',
            'Crop profile: normal',
            'Crop result: 1918x802:1:139',
            'Crop preview: disabled',
            'Scale: -1:720',
            'Video codec: HEVC',
            'Audio tracks: 2',
            'Subtitle tracks: 1'
        ]);
    });

    it('builds a crop preview report with filenames', function() {
        let report = h265ize.Video.buildCropPreviewReport({
            base: 'movie.mkv',
            cropDecision: {
                w: 1918,
                h: 802,
                x: 1,
                y: 139
            }
        }, '/out/crop-preview/movie', ['movie-01.png', 'movie-02.png']);

        assert.deepEqual(report, [
            'Source: movie.mkv',
            'Preview directory: /out/crop-preview/movie',
            'Preview images: 2',
            'Preview files: movie-01.png, movie-02.png',
            'Preview crop: 1918x802:1:139'
        ]);
    });

    it('writes crop preview screenshots to a temp directory', function() {
        let tempDir = makeTempDir('h265ize-crop-preview-');
        let inputVideo = Path.join(tempDir, 'input.mkv');
        let previewDir = Path.join(tempDir, 'preview');

        createPreviewSource(inputVideo);

        return h265ize.Video.takeScreenshots(inputVideo, previewDir, nullLogger, 'crop=320:240:0:0').then(function(result) {
            assert.strictEqual(result.outputDir, previewDir);
            assert.lengthOf(result.filenames, 6);

            result.filenames.forEach(function(filename) {
                assert.isTrue(fs.existsSync(Path.join(previewDir, filename)));
            });
        }).finally(function() {
            fs.removeSync(tempDir);
        });
    });

    it('maps crop presets to the expected cropdetect settings', function() {
        assert.deepEqual(h265ize.Video.getCropProfile('normal'), {
            limit: 0.094,
            scanDuration: 3,
            frameCount: 10,
            fallbackScanDuration: 8,
            fallbackFrameCount: 120
        });
        assert.deepEqual(h265ize.Video.getCropProfile('analog'), {
            limit: 0.16,
            scanDuration: 4,
            frameCount: 12,
            fallbackScanDuration: 10,
            fallbackFrameCount: 180
        });
        assert.deepEqual(h265ize.Video.getCropProfile('old'), {
            limit: 0.16,
            scanDuration: 4,
            frameCount: 12,
            fallbackScanDuration: 10,
            fallbackFrameCount: 180
        });
        assert.strictEqual(h265ize.Video.buildCropDetectFilter('strict'), 'cropdetect=0.06:2:0');
    });

    it('builds a compact encode summary from output metadata', function() {
        let summary = h265ize.Video.buildEncodeSummary({
            format: {
                size: '627375000',
                duration: '1000',
                bit_rate: '5019000'
            },
            streams: [{
                codec_type: 'video',
                codec_name: 'h264',
                width: 1280,
                height: 720,
                bit_rate: '3733000'
            }, {
                codec_type: 'audio',
                codec_name: 'eac3',
                channels: 6,
                bit_rate: '640000',
                tags: {
                    language: 'deu'
                }
            }, {
                codec_type: 'audio',
                codec_name: 'eac3',
                channels: 6,
                bit_rate: '640000',
                tags: {
                    language: 'pol'
                }
            }, {
                codec_type: 'subtitle',
                codec_name: 'subrip',
                disposition: {
                    forced: 1
                },
                tags: {
                    language: 'deu'
                }
            }, {
                codec_type: 'subtitle',
                codec_name: 'subrip',
                tags: {
                    language: 'eng'
                }
            }]
        });

        assert.deepEqual(summary, [
            'Avg. Bitrate: 5 019 kb/s',
            'Resolution: 1280 x 720',
            'Video Bitrate: 3 733 kb/s (container estimate 3 739 kb/s) @ AVC',
            'Audio #1: German E-AC-3 640 kb/s (6 channels)',
            'Audio #2: Polish E-AC-3 640 kb/s (6 channels)',
            'Subtitle #1: German (forced & full)',
            'Subtitle #2: English (full)'
        ]);
    });

    it('builds a compact source health report from metadata', function() {
        let report = h265ize.Video.buildSourceHealthReport({
            format: {
                duration: '1000'
            },
            streams: [{
                codec_type: 'video',
                codec_name: 'hevc'
            }, {
                codec_type: 'audio',
                codec_name: 'aac',
                tags: {
                    language: 'eng'
                }
            }, {
                codec_type: 'audio',
                codec_name: 'aac',
                tags: {
                    title: 'Stereo'
                }
            }]
        });

        assert.deepEqual(report, [
            'Audio #1 is missing a title.',
            'Audio #2 is missing language metadata.'
        ]);
    });

    it('falls back to an estimated video bitrate when stream bitrate is missing', function() {
        let summary = h265ize.Video.buildEncodeSummary({
            format: {
                size: '627375000',
                duration: '1000',
                bit_rate: '5019000'
            },
            streams: [{
                codec_type: 'video',
                codec_name: 'h264',
                width: 1280,
                height: 720
            }, {
                codec_type: 'audio',
                codec_name: 'eac3',
                channels: 6,
                bit_rate: '640000',
                tags: {
                    language: 'deu'
                }
            }, {
                codec_type: 'audio',
                codec_name: 'eac3',
                channels: 6,
                bit_rate: '640000',
                tags: {
                    language: 'pol'
                }
            }]
        });

        assert.deepEqual(summary, [
            'Avg. Bitrate: 5 019 kb/s',
            'Resolution: 1280 x 720',
            'Estimated Video Bitrate: 3 739 kb/s @ AVC',
            'Audio #1: German E-AC-3 640 kb/s (6 channels)',
            'Audio #2: Polish E-AC-3 640 kb/s (6 channels)'
        ]);
    });

    it('uses frame progress when timemark is unavailable', function() {
        let progress = {
            frames: 310,
            percent: 0
        };
        let processed = {
            asMilliseconds: function() {
                return 0;
            }
        };

        let percent = h265ize.Video.getProgressPercent(progress, processed, 6602.688, 31);
        assert.strictEqual(percent.source, 'frames');
        assert.isAbove(percent.value, 0);
    });

    it('formats a frame progress display from the estimated total frame count', function() {
        assert.strictEqual(h265ize.Video.formatProgressFrames({
            frames: 132000
        }, 6602.688, 24), '132000/158465');
    });

    it('formats a labeled frame progress display from the estimated total frame count', function() {
        assert.strictEqual(h265ize.Video.formatProgressFramesLabel({
            frames: 132000
        }, 6602.688, 24), '132000/158465 frames');
    });

    it('returns n/a for frame progress when the inputs are insufficient', function() {
        assert.strictEqual(h265ize.Video.formatProgressFrames({}, null, null), 'n/a');
    });

    it('applies err_detect ignore_err to source inputs when requested', function() {
        let command = createCommandRecorder();
        let context = {
            options: {
                ignoreErr: true
            }
        };

        h265ize.Video.prototype._applyInputErrorDetection.call(context, command);
        assertHasCall(command.calls, ['inputOptions', '-err_detect', 'ignore_err']);
    });

    it('formats ffmpeg command lines for dry run output', function() {
        let command = {
            _getFfmpegPath: function(callback) {
                callback(null, '/usr/bin/ffmpeg');
            },
            _getArguments: function() {
                return ['-i', 'input file.mkv', '-c:v', 'libx265', 'output file.mkv'];
            }
        };

        return h265ize.Video.formatFfmpegCommandLine(command).then(function(line) {
            assert.strictEqual(line, "/usr/bin/ffmpeg -i 'input file.mkv' -c:v libx265 'output file.mkv'");
        });
    });

    it('falls back to frame progress when timemark stalls at the same value', function() {
        let progress = {
            frames: 132000,
            percent: 81.4,
            timemark: '01:29:34.03'
        };
        let previousProgress = {
            percent: '81.4',
            frames: 130000,
            timemark: '01:29:34.03'
        };
        let processed = {
            asMilliseconds: function() {
                return 5374003;
            }
        };

        let percent = h265ize.Video.getProgressPercent(progress, processed, 6602.688, 24, previousProgress);
        assert.strictEqual(percent.source, 'frames');
        assert.isAbove(percent.value, 81.4);
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
