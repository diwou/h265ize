const assert = require('./test-helpers');
const { describe, it } = require('node:test');
const childProcess = require('child_process');
const fs = require('fs');
const Path = require('path');
const stripAnsi = require('strip-ansi');
const h265ize = require('./h265ize');
const ASPresets = require('./lib/aspresets.json');
const FfmpegCommandBuilder = require('./lib/ffmpegCommandBuilder.js');
const pauseController = require('./lib/pauseController.js');

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

function removeTempDir(path) {
    fs.rmSync(path, {
        recursive: true,
        force: true
    });
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

const matroskaFixtureDir = Path.join(__dirname, 'fixtures', 'matroska');

function probeMatroskaFixture(fileName) {
    let output = childProcess.execFileSync('ffprobe', [
        '-v', 'error',
        '-show_streams',
        '-show_format',
        '-print_format', 'json',
        Path.join(matroskaFixtureDir, fileName)
    ], {
        encoding: 'utf8'
    });

    return JSON.parse(output);
}

function getFormatTitle(metadata) {
    return metadata.format && metadata.format.tags && (metadata.format.tags.TITLE || metadata.format.tags.title);
}

function countStreams(metadata, codecType) {
    return metadata.streams.filter(function(stream) {
        return stream.codec_type === codecType;
    }).length;
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

    it('falls back to uppercase title and language tags', function() {
        assert.strictEqual(helpers.getStreamTitle({
            tags: {
                TITLE: 'English Stereo'
            }
        }), 'English Stereo');

        assert.strictEqual(helpers.normalizeStreamLanguage({
            tags: {
                LANGUAGE: 'eng'
            }
        }), 'English');
    });

    it('formats durations as hh:mm:ss with the native helper', function() {
        assert.strictEqual(helpers.formatDurationHms(0), '00:00:00');
        assert.strictEqual(helpers.formatDurationHms(61.4), '00:01:01');
        assert.strictEqual(helpers.formatDurationHms(3661), '01:01:01');
        assert.strictEqual(helpers.formatDurationHms(360000), '100:00:00');
    });

    it('formats file sizes with a local helper', function() {
        assert.strictEqual(helpers.formatFileSize(0), 'n/a');
        assert.strictEqual(helpers.formatFileSize(1024), '1 KB');
        assert.strictEqual(helpers.formatFileSize(2.05 * 1024 * 1024 * 1024), '2.05 GB');
    });

    it('detects commands through the local command helper', function() {
        assert.strictEqual(helpers.commandExists(process.execPath), true);
        assert.strictEqual(helpers.commandExists('/definitely/not/a/real/command'), false);
    });

    it('resolves pause controller waiters after unpausing', async function() {
        let controller = pauseController.createPauseController();
        pauseController.pause(controller);

        let settled = false;
        let waiter = pauseController.waitFor(controller).then(function() {
            settled = true;
        });

        await Promise.resolve();
        assert.strictEqual(settled, false);

        pauseController.unpause(controller);
        await waiter;

        assert.strictEqual(settled, true);
        assert.strictEqual(controller.paused, false);
    });

    it('recursively finds supported videos in nested directories', function() {
        let tempDir = makeTempDir('h265ize-parse-input-');
        let nestedDir = Path.join(tempDir, 'nested');
        let copiedFile = Path.join(nestedDir, 'fixture.mkv');

        fs.mkdirSync(nestedDir, {
            recursive: true
        });
        fs.copyFileSync(Path.join(matroskaFixtureDir, 'test1.mkv'), copiedFile);
        fs.writeFileSync(Path.join(nestedDir, 'notes.txt'), 'ignore me');

        return helpers.parseInput(tempDir, nullLogger).then(function(paths) {
            assert.deepEqual(paths, [copiedFile]);
        }).finally(function() {
            removeTempDir(tempDir);
        });
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

    it('builds direct ffmpeg command arguments from the local builder', function() {
        let command = new FfmpegCommandBuilder('/tmp/input.mkv');
        command.inputOptions('-ss', '12.345');
        command.outputOptions('-map', 0);
        command.videoCodec('libx265');
        command.audioCodec('copy');
        command.outputOptions('-crf 19');
        command.outputOptions('-updatefirst 1');
        command.output('/tmp/output.mkv');

        assert.deepEqual(command._getArguments(), [
            '-ss', '12.345',
            '-i', '/tmp/input.mkv',
            '-map', 0,
            '-crf', '19',
            '-updatefirst', '1',
            '-c:v', 'libx265',
            '-c:a', 'copy',
            '/tmp/output.mkv'
        ]);
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
    it('parses ffprobe frame rates without mathjs', function() {
        assert.strictEqual(h265ize.Video.parseFrameRate('24/1'), 24);
        assert.closeTo(h265ize.Video.parseFrameRate('24000/1001'), 23.976023976, 1e-9);
        assert.strictEqual(h265ize.Video.parseFrameRate('30'), 30);
        assert.isNaN(h265ize.Video.parseFrameRate('N/A'));
        assert.isNaN(h265ize.Video.parseFrameRate(''));
    });

    it('parses available ffmpeg filters from the direct ffmpeg listing', function() {
        let filters = h265ize.Video.parseAvailableFilters([
            ' TS aap               AA->A      Apply Affine Projection algorithm to first audio stream.',
            ' TS dynaudnorm        A->A       Dynamic Audio Normalizer.',
            ' .. loudnorm          A->A       EBU R128 loudness normalization',
            ' T. volume            A->A       Change input volume.',
            ' .. volumedetect      A->A       Detect audio volume.'
        ].join('\n'));

        assert.isTrue(filters.dynaudnorm);
        assert.isTrue(filters.loudnorm);
        assert.isTrue(filters.volume);
        assert.isTrue(filters.volumedetect);
        assert.isTrue(filters.aap);
    });

    it('normalizes raw ffmpeg progress fields to the legacy progress shape', function() {
        let progress = h265ize.Video.normalizeFfmpegProgress({
            frame: '43606',
            fps: '73.4',
            time: '00:24:13.53',
            size: '1554',
            bitrate: '1,566.0kbits/s'
        });

        assert.strictEqual(progress.frames, 43606);
        assert.strictEqual(progress.currentFps, 73.4);
        assert.strictEqual(progress.timemark, '00:24:13.53');
        assert.strictEqual(progress.targetSize, 1554);
        assert.strictEqual(progress.currentKbps, 1566);
    });

    it('falls back to r_frame_rate when avg_frame_rate is unavailable', function() {
        let frameRateInfo = h265ize.Video.getFrameRateInfo({
            avg_frame_rate: 'N/A',
            r_frame_rate: '25/1'
        });

        assert.strictEqual(frameRateInfo.value, 25);
        assert.strictEqual(frameRateInfo.source, 'r_frame_rate');

        assert.strictEqual(h265ize.Video.getFrameRate({
            avg_frame_rate: 'N/A',
            r_frame_rate: '25/1'
        }), 25);

        frameRateInfo = h265ize.Video.getFrameRateInfo({
            avg_frame_rate: 'N/A',
            r_frame_rate: 'N/A'
        });

        assert.isNaN(frameRateInfo.value);
        assert.strictEqual(frameRateInfo.source, 'none');
    });

    it('falls back to the remaining duration for ETA when fps is unavailable', function() {
        assert.strictEqual(h265ize.Video.estimateEtaSeconds(6780, 19.3, 1315.98, NaN, NaN, 1315.98), 5464.02);
        assert.closeTo(h265ize.Video.estimateEtaSeconds(6780, 19.3, 1315.98, NaN, NaN, 1315.98), 5464.02, 1e-9);
    });

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
            removeTempDir(tempDir);
        });
    });

    it('probes fixture metadata through the direct ffprobe wrapper', function() {
        let fixture = Path.join(matroskaFixtureDir, 'test1.mkv');

        return h265ize.Video.getMetadata({
            path: fixture
        }).then(function(metadata) {
            assert.isNumber(metadata.format.duration);
            assert.isAbove(metadata.format.duration, 0);
            assert.isAtLeast(metadata.streams.length, 1);
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
            'Avg. Bitrate: 5,019 kb/s',
            'Resolution: 1280 x 720',
            'Video Bitrate: 3,733 kb/s (container estimate 3,739 kb/s) @ AVC',
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
            'Avg. Bitrate: 5,019 kb/s',
            'Resolution: 1280 x 720',
            'Estimated Video Bitrate: 3,739 kb/s @ AVC',
            'Audio #1: German E-AC-3 640 kb/s (6 channels)',
            'Audio #2: Polish E-AC-3 640 kb/s (6 channels)'
        ]);
    });

    it('estimates missing audio bitrates from the remaining container bitrate', function() {
        let summary = h265ize.Video.buildEncodeSummary({
            format: {
                size: '125000000',
                duration: '100',
                bit_rate: '1000000'
            },
            streams: [{
                codec_type: 'video',
                codec_name: 'h264',
                width: 1920,
                height: 1080,
                bit_rate: '700000'
            }, {
                codec_type: 'audio',
                codec_name: 'aac',
                channels: 2
            }]
        });

        assert.deepEqual(summary, [
            'Avg. Bitrate: 1,000 kb/s',
            'Resolution: 1920 x 1080',
            'Video Bitrate: 700 kb/s (container estimate 1,000 kb/s) @ AVC',
            'Audio #1: Unknown AAC ~300 kb/s (2 channels)'
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

    it('formats a progress bar from the given percentage', function() {
        assert.strictEqual(h265ize.Video.formatProgressBar(50, 10), '[#####-----]');
        assert.strictEqual(h265ize.Video.formatProgressBar(NaN, 10), '[??????????]');
    });

    it('keeps the progress bar width within sensible bounds for terminal width', function() {
        assert.strictEqual(h265ize.Video.getProgressBarWidth('prefix line', 8, 24, 120), 24);
        assert.strictEqual(h265ize.Video.getProgressBarWidth('a very long prefix line that eats space', 8, 24, 50), 8);
    });

    it('builds a progress line that drops lower priority details on narrow terminals', function() {
        let status = {
            percentValue: 63.4,
            percent: '63.4',
            fpsText: '73',
            frameProgress: '43606/218142 frames',
            elapsedFormated: '00:09:56',
            speed: '2.433',
            timemark: '00:24:13.53',
            eta: '00:39:50',
            estimatedFileSize: '~1.56 GB'
        };

        let wideLine = h265ize.Video.buildProgressLine(status, 140);
        assert.include(wideLine, '73fps');
        assert.include(wideLine, '43606/218142 frames');
        assert.include(wideLine, 'timemark [00:24:13.53]');
        assert.include(wideLine, '~1.56 GB');

        let narrowLine = h265ize.Video.buildProgressLine(status, 70);
        assert.include(narrowLine, '[ffmpeg]');
        assert.include(narrowLine, '63.4%');
        assert.include(stripAnsi(narrowLine), '73fps');
        assert.include(stripAnsi(narrowLine), 'ETA 00:39:50');
        assert.notInclude(stripAnsi(narrowLine), 'timemark [00:24:13.53]');
        assert.notInclude(stripAnsi(narrowLine), '~1.56 GB');

        let veryNarrowLine = h265ize.Video.buildProgressLine(status, 48);
        let veryNarrowBar = (stripAnsi(veryNarrowLine).match(/\[[#\-\?]+\]/) || [''])[0];
        assert.isAtMost(veryNarrowBar.length - 2, 6);
    });

    it('finalizes the progress line to 100 percent with a matching frame count', function() {
        let final = h265ize.Video.buildFinalProgressStatus({
            frames: 120,
            percent: 99.9,
            timemark: '00:01:00',
            currentFps: 40
        }, 60, 30, 61, '/tmp/output.mkv', {
            frames: 120,
            percent: '99.9',
            timemark: '00:01:00'
        });

        assert.strictEqual(final.percent, '100');
        assert.strictEqual(final.percentValue, 100);
        assert.strictEqual(final.frameProgress, '1800/1800 frames');
        assert.strictEqual(final.eta, '00:00:00');
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

describe('Matroska fixtures', function() {
    it('ships the complete bundled Matroska validation set with tag sidecars', function() {
        for (let index = 1; index <= 8; index += 1) {
            let baseName = 'test' + index;
            assert.isTrue(fs.existsSync(Path.join(matroskaFixtureDir, baseName + '.mkv')), baseName + '.mkv is missing');
            assert.isTrue(fs.existsSync(Path.join(matroskaFixtureDir, baseName + '-tag.xml')), baseName + '-tag.xml is missing');
        }
    });

    it('probes every bundled Matroska fixture without failing', function() {
        for (let index = 1; index <= 8; index += 1) {
            let metadata = probeMatroskaFixture('test' + index + '.mkv');

            assert.isAtLeast(metadata.streams.length, 1, 'test' + index + '.mkv should expose at least one stream');
            assert.isAtLeast(countStreams(metadata, 'video'), 1, 'test' + index + '.mkv should include a video stream');
        }
    });

    it('probes the basic Big Buck Bunny fixture', function() {
        let metadata = probeMatroskaFixture('test1.mkv');

        assert.strictEqual(metadata.streams.length, 2);
        assert.strictEqual(countStreams(metadata, 'video'), 1);
        assert.strictEqual(countStreams(metadata, 'audio'), 1);
        assert.strictEqual(metadata.streams[0].codec_name, 'msmpeg4v2');
        assert.strictEqual(metadata.streams[1].codec_name, 'mp3');
        assert.strictEqual(getFormatTitle(metadata), 'Big Buck Bunny - test 1');
        assert.strictEqual(metadata.format.duration, '87.336000');
    });

    it('probes the Elephant Dream audio bitrate fixture', function() {
        let metadata = probeMatroskaFixture('test3.mkv');

        assert.strictEqual(metadata.streams.length, 2);
        assert.strictEqual(countStreams(metadata, 'video'), 1);
        assert.strictEqual(countStreams(metadata, 'audio'), 1);
        assert.strictEqual(metadata.streams[1].codec_name, 'mp3');
        assert.strictEqual(metadata.streams[1].bit_rate, '172001');
        assert.strictEqual(getFormatTitle(metadata), 'Elephant Dream - test 3');
        assert.strictEqual(metadata.format.duration, '49.064000');
    });

    it('probes the Matroska file with missing duration metadata', function() {
        let metadata = probeMatroskaFixture('test4.mkv');

        assert.strictEqual(metadata.streams.length, 2);
        assert.strictEqual(countStreams(metadata, 'video'), 1);
        assert.strictEqual(countStreams(metadata, 'audio'), 1);
        assert.strictEqual(metadata.streams[0].codec_name, 'theora');
        assert.strictEqual(metadata.streams[1].codec_name, 'vorbis');
        assert.notProperty(metadata.format, 'duration');
    });

    it('probes the multi-track fixture with subtitles and commentary audio', function() {
        let metadata = probeMatroskaFixture('test5.mkv');
        let audioStreams = metadata.streams.filter(function(stream) {
            return stream.codec_type === 'audio';
        });
        let subtitleStreams = metadata.streams.filter(function(stream) {
            return stream.codec_type === 'subtitle';
        });

        assert.strictEqual(metadata.streams.length, 11);
        assert.strictEqual(audioStreams.length, 2);
        assert.strictEqual(subtitleStreams.length, 8);
        assert.strictEqual(metadata.streams[0].codec_name, 'h264');
        assert.strictEqual(getFormatTitle(metadata), 'Big Buck Bunny - test 8');
        assert.isTrue(audioStreams.some(function(stream) {
            return stream.tags && stream.tags.title === 'Commentary';
        }));
        assert.isTrue(subtitleStreams.some(function(stream) {
            return stream.tags && stream.tags.language === 'jpn';
        }));
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
