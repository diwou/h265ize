const Path = require('path');
const os = require('os');
const EventEmitter = require('events');
const spawn = require('child_process').spawn;

const _ = require('../lodashLite.js');
const colors = require('colors');
const filesize = require('filesize');
const fs = require('fs');
const Promise = require('bluebird');
const Pauser = require('promise-pauser');
const ffmpeg = require('fluent-ffmpeg');
const MemoryStream = require('memorystream');

const helpers = require(Path.join(__dirname, '../helpers.js'));
const ASPresets = require('../aspresets.json');

let counter = 0;

function ensureDir(path, callback) {
    fs.mkdir(path, {
        recursive: true
    }, function(err) {
        if (err && err.code !== 'EEXIST')
            return callback(err);
        callback(null);
    });
}

function moveFile(source, destination, options, callback) {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }

    options = options || {};

    function finishMove() {
        fs.rename(source, destination, function(err) {
            if (!err)
                return callback(null);

            if (err.code !== 'EXDEV')
                return callback(err);

            fs.copyFile(source, destination, function(copyErr) {
                if (copyErr)
                    return callback(copyErr);

                fs.unlink(source, callback);
            });
        });
    }

    if (options.clobber) {
        fs.rm(destination, {
            force: true
        }, function(err) {
            if (err)
                return callback(err);
            finishMove();
        });
        return;
    }

    finishMove();
}

function removePath(path, callback) {
    fs.rm(path, {
        recursive: true,
        force: true
    }, callback);
}

function parseLoudnormSummaries(stderr) {
    let summaries = [];
    let lines = stderr.split(/\r?\n/);
    let collecting = false;
    let buffer = [];

    _.each(lines, function(line) {
        let trimmed = line.trim();

        if (!collecting && trimmed === '{') {
            collecting = true;
            buffer = ['{'];
            return;
        }

        if (!collecting)
            return;

        buffer.push(trimmed);

        if (trimmed === '}') {
            summaries.push(JSON.parse(buffer.join('\n')));
            collecting = false;
            buffer = [];
        }
    });

    return summaries;
}

function extractCropFromStderr(stderr) {
    const cropRegexp = /crop=(-?[0-9]+):(-?[0-9]+):(-?[0-9]+):(-?[0-9]+)/g;
    let match;
    let lastMatch = null;

    while ((match = cropRegexp.exec(stderr)) !== null) {
        lastMatch = match;
    }

    if (lastMatch === null)
        return null;

    return {
        w: parseInt(lastMatch[1], 10),
        h: parseInt(lastMatch[2], 10),
        x: parseInt(lastMatch[3], 10),
        y: parseInt(lastMatch[4], 10)
    };
}

function cropDetectionSignature(crop) {
    return [crop.x, crop.y, crop.w, crop.h].map(function(value) {
        return parseInt(value, 10);
    });
}

function cropDetectionsAreSimilar(a, b, tolerance) {
    let valuesA = cropDetectionSignature(a);
    let valuesB = cropDetectionSignature(b);

    return _.every(valuesA, function(value, index) {
        return Math.abs(value - valuesB[index]) <= tolerance;
    });
}

function clusterCropDetections(detections, tolerance) {
    let parents = detections.map(function(_, index) {
        return index;
    });

    function find(index) {
        if (parents[index] !== index)
            parents[index] = find(parents[index]);
        return parents[index];
    }

    function union(a, b) {
        let rootA = find(a);
        let rootB = find(b);

        if (rootA !== rootB)
            parents[rootB] = rootA;
    }

    for (let i = 0; i < detections.length; i++) {
        for (let j = i + 1; j < detections.length; j++) {
            if (cropDetectionsAreSimilar(detections[i], detections[j], tolerance))
                union(i, j);
        }
    }

    let clusters = {};

    _.each(detections, function(crop, index) {
        let root = find(index);
        if (!clusters[root])
            clusters[root] = [];
        clusters[root].push(crop);
    });

    return _.values(clusters);
}

function aggregateCropCluster(cluster) {
    if (!cluster.length)
        return null;

    let left = Number.NEGATIVE_INFINITY;
    let top = Number.NEGATIVE_INFINITY;
    let right = Number.POSITIVE_INFINITY;
    let bottom = Number.POSITIVE_INFINITY;

    _.each(cluster, function(val) {
        let x = parseInt(val.x, 10);
        let y = parseInt(val.y, 10);
        let w = parseInt(val.w, 10);
        let h = parseInt(val.h, 10);

        left = Math.max(left, x);
        top = Math.max(top, y);
        right = Math.min(right, x + w);
        bottom = Math.min(bottom, y + h);
    });

    let width = right - left;
    let height = bottom - top;

    if (width <= 0 || height <= 0)
        return null;

    return {
        w: width,
        h: height,
        x: left,
        y: top
    };
}

function summarizeCropDetections(detections) {
    if (!detections.length)
        return null;

    const tolerance = 4;
    let clusters = clusterCropDetections(detections, tolerance);

    if (!clusters.length)
        return null;

    clusters = _.map(clusters, function(cluster) {
        let totalArea = _.reduce(cluster, function(sum, crop) {
            return sum + (parseInt(crop.w, 10) * parseInt(crop.h, 10));
        }, 0);

        return {
            detections: cluster,
            crop: aggregateCropCluster(cluster),
            totalArea: totalArea,
            score: (cluster.length * 1000000000000) + totalArea
        };
    });

    clusters = _.orderBy(clusters, ['score'], ['desc']);

    return {
        tolerance: tolerance,
        clusters: clusters,
        bestCluster: clusters[0] || null,
        crop: clusters[0] ? clusters[0].crop : null
    };
}

function aggregateCropDetections(detections) {
    let summary = summarizeCropDetections(detections);
    return summary ? summary.crop : null;
}

function buildCropDecisionReport(detections, profileName) {
    let summary = summarizeCropDetections(detections);

    if (!summary)
        return null;

    let profile = getCropProfile(profileName);
    let lines = [];

    lines.push('Profile: ' + profileName + ' (limit ' + profile.limit + ', scan ' + profile.scanDuration + 's, frames ' + profile.frameCount + ')');
    lines.push('Detections: ' + detections.length);

    _.each(summary.clusters, function(cluster, index) {
        let crop = cluster.crop;
        let cropText = crop ? crop.w + 'x' + crop.h + ':' + crop.x + ':' + crop.y : 'n/a';
        lines.push('Cluster #' + (index + 1) + ': ' + cluster.detections.length + ' sample(s), crop ' + cropText);
    });

    lines.push('Final crop: ' + (summary.crop ? summary.crop.w + 'x' + summary.crop.h + ':' + summary.crop.x + ':' + summary.crop.y : 'none'));

    return lines;
}

function parseFrameRate(frameRate) {
    if (frameRate === null || typeof frameRate === 'undefined')
        return NaN;

    let normalized = String(frameRate).trim();

    if (!normalized || normalized.toUpperCase() === 'N/A')
        return NaN;

    if (normalized.includes('/')) {
        let parts = normalized.split('/');

        if (parts.length === 2) {
            let numerator = Number(parts[0].trim());
            let denominator = Number(parts[1].trim());

            if (Number.isFinite(numerator) && Number.isFinite(denominator) && denominator !== 0)
                return numerator / denominator;
        }
    }

    let parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : NaN;
}

function getFrameRate(videoStream) {
    return getFrameRateInfo(videoStream).value;
}

function getFrameRateInfo(videoStream) {
    if (!videoStream)
        return {
            value: NaN,
            source: 'none'
        };

    let frameRate = parseFrameRate(videoStream.avg_frame_rate);

    if (Number.isFinite(frameRate) && frameRate > 0)
        return {
            value: frameRate,
            source: 'avg_frame_rate'
        };

    frameRate = parseFrameRate(videoStream.r_frame_rate);

    if (Number.isFinite(frameRate) && frameRate > 0)
        return {
            value: frameRate,
            source: 'r_frame_rate'
        };

    return {
        value: NaN,
        source: 'none'
    };
}

function estimateEtaSeconds(duration, percentValue, elapsedSeconds, frameRate, currentFps, processedSeconds) {
    if (Number.isFinite(frameRate) && frameRate > 0 && Number.isFinite(currentFps) && currentFps > 0 && Number.isFinite(duration) && duration > 0) {
        return ((100 - percentValue) / 100) * duration * (frameRate / currentFps);
    }

    if (Number.isFinite(processedSeconds) && processedSeconds > 0 && Number.isFinite(duration) && duration > processedSeconds)
        return duration - processedSeconds;

    if (Number.isFinite(percentValue) && percentValue > 0 && Number.isFinite(elapsedSeconds) && elapsedSeconds > 0)
        return elapsedSeconds * ((100 - percentValue) / percentValue);

    return NaN;
}

function getCropProfile(profileName) {
    const profiles = {
        normal: {
            limit: 0.094,
            scanDuration: 3,
            frameCount: 10,
            fallbackScanDuration: 8,
            fallbackFrameCount: 120
        },
        analog: {
            limit: 0.16,
            scanDuration: 4,
            frameCount: 12,
            fallbackScanDuration: 10,
            fallbackFrameCount: 180
        },
        old: {
            limit: 0.16,
            scanDuration: 4,
            frameCount: 12,
            fallbackScanDuration: 10,
            fallbackFrameCount: 180
        },
        strict: {
            limit: 0.06,
            scanDuration: 3,
            frameCount: 10,
            fallbackScanDuration: 8,
            fallbackFrameCount: 120
        }
    };

    return profiles[profileName] || profiles.normal;
}

function buildCropDetectFilter(profileName) {
    let profile = getCropProfile(profileName);
    return 'cropdetect=' + profile.limit + ':2:0';
}

function formatThousands(value) {
    return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatBitrate(value) {
    if (!Number.isFinite(value) || value <= 0)
        return 'n/a';

    return formatThousands(value / 1000) + ' kb/s';
}

function formatEstimatedBitrate(value) {
    let bitrate = formatBitrate(value);

    return bitrate === 'n/a' ? bitrate : '~' + bitrate;
}

function estimateOutputFileSize(progress, outputPath, percentValue) {
    if (!Number.isFinite(percentValue) || percentValue <= 0)
        return 'n/a';

    let sizeSoFar = Number(progress && progress.targetSize);

    if (Number.isFinite(sizeSoFar) && sizeSoFar > 0)
        return filesize((sizeSoFar * 1000) / (percentValue / 100));

    if (!fs.existsSync(outputPath))
        return 'n/a';

    let outputSize = fs.statSync(outputPath).size;

    if (!Number.isFinite(outputSize) || outputSize <= 0)
        return 'n/a';

    return filesize(outputSize / (percentValue / 100));
}

function formatEstimatedFileSize(progress, outputPath, percentValue) {
    let estimate = estimateOutputFileSize(progress, outputPath, percentValue);
    return estimate === 'n/a' ? estimate : '~' + estimate;
}

function quoteFfmpegArgument(argument) {
    let value = String(argument);

    if (!value.length)
        return "''";

    if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value))
        return value;

    return "'" + value.replace(/'/g, "'\\''") + "'";
}

function formatFfmpegCommandLine(command) {
    return new Promise(function(resolve, reject) {
        command._getFfmpegPath(function(err, ffmpegPath) {
            if (err)
                return reject(err);

            let args;
            try {
                args = command._getArguments();
            } catch (error) {
                return reject(error);
            }

            resolve([ffmpegPath || 'ffmpeg'].concat(args).map(quoteFfmpegArgument).join(' '));
        });
    });
}

function getEstimatedFrameCount(duration, frameRate) {
    if (!Number.isFinite(duration) || !Number.isFinite(frameRate) || duration <= 0 || frameRate <= 0)
        return null;

    return Math.max(Math.round(duration * frameRate), 0);
}

function formatProgressFrames(progress, duration, frameRate) {
    let totalFrames = getEstimatedFrameCount(duration, frameRate);
    let currentFrames = Number(progress && progress.frames);

    if (!Number.isFinite(currentFrames) || currentFrames < 0 || !Number.isFinite(totalFrames) || totalFrames <= 0)
        return 'n/a';

    return currentFrames + '/' + totalFrames;
}

function formatProgressFramesLabel(progress, duration, frameRate) {
    let frameProgress = formatProgressFrames(progress, duration, frameRate);
    return frameProgress === 'n/a' ? frameProgress : frameProgress + ' frames';
}

function getProgressPercent(progress, processedSeconds, duration, frameRate, previousProgress) {
    let percentFromTimemark = (processedSeconds / duration) * 100;

    let selected = null;

    if (Number.isFinite(percentFromTimemark) && percentFromTimemark > 0)
        selected = {
            value: percentFromTimemark,
            source: 'timemark'
        };

    let percentFromFrames = Number(progress.frames) && Number.isFinite(duration) && Number.isFinite(frameRate) && duration > 0 && frameRate > 0
        ? (Number(progress.frames) / (duration * frameRate)) * 100
        : 0;

    if (Number.isFinite(percentFromFrames) && percentFromFrames > 0 && (!selected || percentFromFrames > selected.value))
        selected = {
            value: percentFromFrames,
            source: 'frames'
        };

    let percentFromFfmpeg = Number(progress.percent);

    if (Number.isFinite(percentFromFfmpeg) && percentFromFfmpeg > 0 && (!selected || percentFromFfmpeg > selected.value))
        selected = {
            value: percentFromFfmpeg,
            source: 'ffmpeg'
        };

    if (!selected) {
        return {
            value: 0,
            source: 'none'
        };
    }

    if (previousProgress && selected.source === 'timemark' && progress.timemark && previousProgress.timemark === progress.timemark) {
        let previousPercent = Number(previousProgress.percent);
        let previousFrames = Number(previousProgress.frames);

        if (Number.isFinite(percentFromFrames) && percentFromFrames > selected.value + 0.25 && Number.isFinite(previousFrames) && Number(progress.frames) > previousFrames) {
            selected = {
                value: percentFromFrames,
                source: 'frames'
            };
        } else if (Number.isFinite(percentFromFfmpeg) && percentFromFfmpeg > selected.value + 0.25 && Number.isFinite(previousPercent) && percentFromFfmpeg > previousPercent) {
            selected = {
                value: percentFromFfmpeg,
                source: 'ffmpeg'
            };
        }
    }

    return selected;
}

function getCodecLabel(stream) {
    if (!stream || !stream.codec_name)
        return 'Unknown';

    const codec = stream.codec_name.toLowerCase();
    const codecLabels = {
        h264: 'AVC',
        hevc: 'HEVC',
        av1: 'AV1',
        vp9: 'VP9',
        vp8: 'VP8',
        mpeg4: 'MPEG-4',
        mpeg2video: 'MPEG-2',
        ac3: 'AC-3',
        eac3: 'E-AC-3',
        aac: 'AAC',
        opus: 'Opus',
        flac: 'FLAC',
        truehd: 'TrueHD',
        dts: 'DTS',
        hdmv_pgs_subtitle: 'PGS',
        subrip: 'SubRip',
        ass: 'ASS',
        srt: 'SRT'
    };

    return codecLabels[codec] || codec.toUpperCase();
}

function getStreamBitrate(stream) {
    if (!stream)
        return null;

    let bitrate = stream.bit_rate;

    if (!bitrate && stream.tags) {
        bitrate = stream.tags.BPS || stream.tags['BPS-eng'] || stream.tags['BPS-ENG'];
    }

    bitrate = parseInt(bitrate, 10);

    return Number.isFinite(bitrate) && bitrate > 0 ? bitrate : null;
}

function sumStreamBitrates(streams) {
    return _.reduce(streams, function(sum, stream) {
        let bitrate = getStreamBitrate(stream);
        return sum + (bitrate || 0);
    }, 0);
}

function getSubtitleDescriptor(stream) {
    let language = helpers.normalizeStreamLanguage(stream);
    let title = helpers.getStreamTitle(stream);
    let disposition = stream.disposition || {};
    let parts = [];

    if (disposition.forced)
        parts.push('forced');

    if (title && title.trim() && title.trim().toLowerCase() !== language.toLowerCase()) {
        parts.push(title.trim());
    } else {
        parts.push('full');
    }

    return language + ' (' + parts.join(' & ') + ')';
}

function buildEncodeSummary(metadata, originalMetadata) {
    if (!metadata || !metadata.format || !Array.isArray(metadata.streams))
        return null;

    let lines = [];
    let videoStream = _.find(metadata.streams, function(stream) {
        return stream.codec_type === 'video';
    });
    let audioStreams = _.filter(metadata.streams, function(stream) {
        return stream.codec_type === 'audio';
    });
    let subtitleStreams = _.filter(metadata.streams, function(stream) {
        return stream.codec_type === 'subtitle';
    });
    let duration = parseFloat(metadata.format.duration);
    let size = parseFloat(metadata.format.size);
    let formatBitrateValue = parseInt(metadata.format.bit_rate, 10);
    let audioBitrateEstimate = null;

    if (!Number.isFinite(formatBitrateValue) || formatBitrateValue <= 0) {
        if (Number.isFinite(size) && Number.isFinite(duration) && duration > 0) {
            formatBitrateValue = (size * 8) / duration;
        }
    }

    lines.push('Avg. Bitrate: ' + formatBitrate(formatBitrateValue));

    if (videoStream) {
        let width = parseInt(videoStream.width, 10);
        let height = parseInt(videoStream.height, 10);

        if (Number.isFinite(width) && Number.isFinite(height)) {
            lines.push('Resolution: ' + width + ' x ' + height);
        }
    } else if (originalMetadata && originalMetadata.streams) {
        let originalVideoStream = _.find(originalMetadata.streams, function(stream) {
            return stream.codec_type === 'video';
        });
        if (originalVideoStream) {
            let width = parseInt(originalVideoStream.width, 10);
            let height = parseInt(originalVideoStream.height, 10);
            if (Number.isFinite(width) && Number.isFinite(height))
                lines.push('Resolution: ' + width + ' x ' + height);
        }
    }

    if (videoStream) {
        let videoBitrate = getStreamBitrate(videoStream);
        let estimatedVideoBitrate = null;
        let videoBitrateText;

        if (Number.isFinite(formatBitrateValue)) {
            estimatedVideoBitrate = Math.max(formatBitrateValue - sumStreamBitrates(audioStreams) - sumStreamBitrates(subtitleStreams), 0);
        }

        let videoBitrateLabel = 'Video Bitrate: ';

        if (!videoBitrate || !Number.isFinite(videoBitrate) || videoBitrate <= 0) {
            videoBitrate = estimatedVideoBitrate;
            videoBitrateLabel = 'Estimated Video Bitrate: ';
            videoBitrateText = formatBitrate(videoBitrate);
        } else {
            videoBitrateText = formatBitrate(videoBitrate);

            if (Number.isFinite(estimatedVideoBitrate) && estimatedVideoBitrate > 0) {
                let bitrateDifference = Math.abs(videoBitrate - estimatedVideoBitrate);

                if (bitrateDifference >= 1000) {
                    videoBitrateText += ' (container estimate ' + formatBitrate(estimatedVideoBitrate) + ')';
                }
            }
        }

        lines.push(videoBitrateLabel + videoBitrateText + ' @ ' + getCodecLabel(videoStream));

        if (Number.isFinite(formatBitrateValue) && Number.isFinite(videoBitrate) && videoBitrate > 0) {
            let knownAudioBitrateSum = sumStreamBitrates(audioStreams);
            let knownSubtitleBitrateSum = sumStreamBitrates(subtitleStreams);
            let missingAudioBitrateCount = _.reduce(audioStreams, function(count, stream) {
                return count + (getStreamBitrate(stream) ? 0 : 1);
            }, 0);

            let audioBitrateRemainder = Math.max(formatBitrateValue - videoBitrate - knownAudioBitrateSum - knownSubtitleBitrateSum, 0);

            if (missingAudioBitrateCount > 0 && audioBitrateRemainder > 0) {
                audioBitrateEstimate = audioBitrateRemainder / missingAudioBitrateCount;
            }
        }
    }

    _.each(audioStreams, function(stream, i) {
        let language = helpers.normalizeStreamLanguage(stream);
        let bitrate = getStreamBitrate(stream);
        let bitrateText = bitrate ? formatBitrate(bitrate) : formatEstimatedBitrate(audioBitrateEstimate);
        let channels = Number(stream.channels) || 0;
        let channelLabel = channels === 1 ? '1 channel' : channels + ' channels';
        lines.push('Audio #' + (i + 1) + ': ' + language + ' ' + getCodecLabel(stream) + ' ' + bitrateText + ' (' + channelLabel + ')');
    });

    _.each(subtitleStreams, function(stream, i) {
        lines.push('Subtitle #' + (i + 1) + ': ' + getSubtitleDescriptor(stream));
    });

    return lines;
}

function buildSourceHealthReport(metadata) {
    if (!metadata || !metadata.format || !Array.isArray(metadata.streams))
        return null;

    let warnings = [];
    let duration = parseFloat(metadata.format.duration);
    let videoStreams = _.filter(metadata.streams, function(stream) {
        return stream.codec_type === 'video';
    });
    let audioStreams = _.filter(metadata.streams, function(stream) {
        return stream.codec_type === 'audio';
    });

    if (!Number.isFinite(duration) || duration <= 0)
        warnings.push('Duration metadata is missing or invalid.');

    if (!videoStreams.length) {
        warnings.push('No video stream detected.');
    } else if (videoStreams.length > 1) {
        warnings.push('Multiple video streams detected.');
    }

    _.each(videoStreams, function(stream, i) {
        if (stream.codec_name === 'unknown') {
            warnings.push('Video #' + (i + 1) + ' has an unknown codec.');
        }
    });

    _.each(audioStreams, function(stream, i) {
        let language = helpers.normalizeStreamLanguage(stream);
        let title = helpers.getStreamTitle(stream);

        if (language === 'Unknown') {
            warnings.push('Audio #' + (i + 1) + ' is missing language metadata.');
        }

        if (!title || !title.trim()) {
            warnings.push('Audio #' + (i + 1) + ' is missing a title.');
        }
    });

    return warnings;
}

function buildExplainReport(video) {
    if (!video)
        return null;

    let lines = [];
    let inputStream = video.videoStream || {};
    let cropProfileName = video.options && video.options.crop ? video.options.crop : 'normal';

    lines.push('Source: ' + (video.base || video.path));

    if (video.output && video.output.path)
        lines.push('Output: ' + video.output.path);

    if (video.options && video.options.outputFormat)
        lines.push('Container: ' + video.options.outputFormat);

    if (video.options) {
        let presetLine = video.options.preset || 'medium';
        if (video.options.asPreset && video.options.asPreset !== 'none')
            presetLine += ' (as-preset: ' + video.options.asPreset + ')';
        lines.push('Preset: ' + presetLine);

        if (video.x265Options)
            lines.push('x265 params: ' + video.x265Options);

        if (video.options.videoBitrate) {
            lines.push('Video rate control: target bitrate ' + formatBitrate(video.options.videoBitrate));
        } else {
            lines.push('Video rate control: CRF ' + video.options.quality);
        }

        lines.push('Bitdepth: ' + (video.videoBitDepth || 'auto') + ' bit' + (inputStream.pix_fmt ? ' (source ' + inputStream.pix_fmt + ')' : ''));

        if (video.options.preview) {
            lines.push('Preview: enabled (' + video.options.previewLength + ' ms)');
        } else {
            lines.push('Preview: disabled');
        }

        if (video.options.normalizeLevel >= 5) {
            lines.push('Audio normalization: dynaudnorm (level ' + video.options.normalizeLevel + ')');
        } else if (video.options.normalizeLevel >= 4) {
            lines.push('Audio normalization: loudnorm (level ' + video.options.normalizeLevel + ')');
        } else if (video.options.normalizeLevel >= 3) {
            lines.push('Audio normalization: volumedetect/volume (level ' + video.options.normalizeLevel + ')');
        } else {
            lines.push('Audio normalization: disabled');
        }

        if (video.options.heAudio || video.options.forceHEAudio || video.options.downmixHEAudio) {
            let heMode = video.options.forceHEAudio ? 'forced' : 'optional';
            if (video.options.downmixHEAudio)
                heMode += ' + downmix';
            lines.push('HE audio: enabled (' + heMode + ')');
        } else {
            lines.push('HE audio: disabled');
        }

        lines.push('Crop profile: ' + cropProfileName);

        if (video.cropDecision) {
            lines.push('Crop result: ' + video.cropDecision.w + 'x' + video.cropDecision.h + ':' + video.cropDecision.x + ':' + video.cropDecision.y);
        } else {
            lines.push('Crop result: none');
        }

        if (video.options.cropPreview) {
            lines.push('Crop preview: enabled' + (video.options.cropPreviewDir ? ' (' + video.options.cropPreviewDir + ')' : ''));
        } else {
            lines.push('Crop preview: disabled');
        }

        if (video.options.scale) {
            lines.push('Scale: -1:' + video.options.scale);
        }
    }

    if (inputStream.codec_name) {
        lines.push('Video codec: ' + getCodecLabel(inputStream));
    }

    if (video.streams && video.streams.audioStreams && video.streams.audioStreams.length) {
        lines.push('Audio tracks: ' + video.streams.audioStreams.length);
    }

    if (video.streams && video.streams.subtitleStreams && video.streams.subtitleStreams.length) {
        lines.push('Subtitle tracks: ' + video.streams.subtitleStreams.length);
    }

    return lines;
}

function buildCropPreviewReport(video, previewDir, filenames) {
    if (!video)
        return null;

    let lines = [];
    lines.push('Source: ' + (video.base || video.path));
    lines.push('Preview directory: ' + previewDir);
    lines.push('Preview images: ' + (filenames && filenames.length ? filenames.length : 6));

    if (filenames && filenames.length) {
        lines.push('Preview files: ' + filenames.join(', '));
    }

    if (video.cropDecision) {
        lines.push('Preview crop: ' + video.cropDecision.w + 'x' + video.cropDecision.h + ':' + video.cropDecision.x + ':' + video.cropDecision.y);
    } else {
        lines.push('Preview crop: none');
    }

    return lines;
}

class Video {
    constructor(path, options) {

        // Check if file exists
        fs.accessSync(path, fs.constants.F_OK);

        this.encoder = null;
        this.id = counter++;

        // Path related data
        this.path = path;
        let pathParsed = Path.parse(this.path);
        this.base = pathParsed.base;
        this.dir = pathParsed.dir;
        this.ext = pathParsed.ext;
        this.name = pathParsed.name;
        this.root = pathParsed.root;

        // Setup encoding options
        this.options = {};
        _.defaults(this.options, options, {
            preview: false,
            quality: 19,
            override: false,
            stats: false,
            cropPreview: false,
            cropPreviewDir: '',
            dryRun: false,
            HEAudioBitrate: 40,
            destination: os.homedir()
        });
        this.output = {
            base: this.name + (this.options.preview ? '-preview' : '') + '.' + this.options.outputFormat,
            dir: this.options.destination,
            sample: this.name + '-sample.' + this.options.outputFormat
        };
        this.output.path = Path.join(this.output.dir, this.output.base);

        this.running = false;
        this.paused = false;
        this.status;

        this.ffmpegCommand = this._applyInputErrorDetection(new ffmpeg().input(this.path).renice(10))
            .videoCodec('libx265').audioCodec('copy').outputOptions('-c:s', 'copy')
            .outputOptions('-c:d', 'copy');
        this.promiseChain;
        this.pauser = Pauser.pauser();
        this.inputCounter = 0;
        this.pass = 0;
        this.x265Options = '';
        this.previewStream = new MemoryStream();
        this.temp = {
            files: []
        };

        this.events = new EventEmitter();

        this.currentStageNum = -1;
        this.currentStage = {
            name: 'Pending',
            action: 'pending'
        };
        this.stages = [{
            name: 'Initialize filesystem',
            action: 'initializing filesystem',
            promise: this.filesystem
        }, {
            name: 'Get Initial Metadata',
            action: 'getting intial metadata',
            promise: this.getInitialMetadata
        }, {
            name: 'Process Streams',
            action: 'processing streams',
            promise: this.processStreams
        }, {
            name: 'Probe',
            action: 'probing source',
            promise: this.probe
        }, {
            name: 'Set AS Preset',
            action: 'setting as preset',
            promise: this.setASPreset
        }, {
            name: 'Upconvert',
            action: 'upconverting',
            promise: this.upconvert
        }, {
            name: 'Set Video Bit Depth',
            action: 'detecting video bit depth',
            promise: this.setVideoBitDepth
        }, {
            name: 'Normalize Audio',
            action: 'normalizing audio',
            promise: this.normalizeAudio
        }, {
            name: 'Auto Crop',
            action: 'detecting crop',
            promise: this.autoCrop
        }, {
            name: 'Deinterlace',
            action: 'deinterlacing',
            promise: this.deinterlace
        }, {
            name: 'Map Streams',
            action: 'mapping streams',
            promise: this.mapStreams
        }, {
            name: 'Map High Efficiency Audio',
            action: 'mapping high effeciency audio',
            promise: this.heAudio
        }, {
            name: 'Explain',
            action: 'explaining encoding plan',
            promise: this.explain
        }, {
            name: 'Crop Preview',
            action: 'creating crop preview',
            promise: this.cropPreview
        }, {
            name: 'Encode',
            action: 'encoding',
            promise: this.encode
        }, {
            name: 'Multipass',
            action: 'generating multipass',
            promise: this.multiPass
        }, {
            name: 'Verify Encode',
            action: 'verifying encode',
            promise: this.verifyEncode
        }, {
            name: 'Move Output',
            action: 'moving output',
            promise: this.move
        }, {
            name: 'Screenshots',
            action: 'creating screenshots',
            promise: this.screenshots
        }, {
            name: 'Sample',
            action: 'creating sample',
            promise: this.sample
        }, {
            name: 'Stats',
            action: 'appending stats',
            promise: this.appendStats
        }, {
            name: 'Summary',
            action: 'creating summary',
            promise: this.encodeSummary
        }];
    }

    _addX265Option(option) {
        this.x265Options += this.x265Options.length ? ':' + option : option;
    }

    _applyInputErrorDetection(command) {
        if (this.options.ignoreErr && command && typeof command.inputOptions === 'function') {
            command.inputOptions('-err_detect', 'ignore_err');
        }

        return command;
    }

    _getCommandLine(command) {
        return formatFfmpegCommandLine(command);
    }

    filesystem() {
        let _self = this;
        return new Promise(function(resolve, reject) {


            if (fs.existsSync(_self.output.path)) {
                return reject(new Error('Output ' + colors.yellow('"' + _self.output.path + '"') + ' already exists.'));
            }

            resolve();

        });
    }

    getInitialMetadata() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            Video.getMetadata(_self).then(function(metadata) {
                _self.metadata = metadata;
                resolve();
            }, reject);

        });
    }

    processStreams() {
        let _self = this;
        return new Promise(function(resolve, reject) {

            let videoStreams = [],
                audioStreams = [],
                subtitleStreams = [],
                otherStreams = [];

            // Dissect each video stream
            _.each(_self.metadata.streams, function(stream) {
                _self.encoder.logger.debug('Working on stream:', stream.index);
                stream.input = 0;

                // this.encoder.logger.debug(stream);

                if (!stream.codec_type) {
                    _self.encoder.logger.warn('A codec was not provided for stream ' + stream.index + '. Your ffmpeg is most likely out of date. At least version 2.8.2 is recommended.');
                }

                switch (stream.codec_type) {
                    case 'video':
                        if (stream.codec_name === 'hevc' && !_self.options.override && !_self.options.probe && !_self.options.dryRun)
                            return reject(new Error('Already encoded in h265. Skipping... (use the --override flag to encode hevc videos)'));
                        videoStreams.push(stream);
                        break;
                    case 'audio':
                        audioStreams.push(stream);
                        break;
                    case 'subtitle':
                        subtitleStreams.push(stream);
                        break;
                    default:
                        if (stream.codec_name === 'unknown') {
                            _self.encoder.logger.warn('Codec stream with index ' + stream.index + ' will not be included because it has an unknown codec.');
                            break;
                        }
                        otherStreams.push(stream);
                        break;
                }
            });

            // Preview Mode
            if (_self.options.preview) {
                _self.ffmpegCommand.seekInput(_self.metadata.format.duration / 2).duration(_self.options.previewLength / 1000);
            }

            if (_self.options.multiPass > 1) {
                _self._addX265Option('pass=1:stats=' + Path.join(os.tmpdir(), 'x265stats.log'));
            }

            _self.streams = {
                videoStreams: videoStreams,
                audioStreams: audioStreams,
                subtitleStreams: subtitleStreams,
                otherStreams: otherStreams
            };
            resolve();
        });
    }

    probe() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            if (!_self.options.probe)
                return resolve();

            let summaryLines = buildEncodeSummary(_self.metadata, _self.metadata) || [];
            let healthWarnings = buildSourceHealthReport(_self.metadata) || [];

            _self.encoder.logger.info('Probe summary:', {
                __divider: true
            });
            _self.encoder.logger.info('Source:', _self.base);

            _.each(summaryLines, function(line) {
                _self.encoder.logger.info(line);
            });

            if (healthWarnings.length) {
                _self.encoder.logger.warn('Source health warnings:');
                _.each(healthWarnings, function(line) {
                    _self.encoder.logger.warn(line);
                });
            } else {
                _self.encoder.logger.info('Source health: OK');
            }

            reject(new Error('PROBECOMPLETE'));
        });
    }

    setASPreset() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            if (!_self.options.asPreset)
                return resolve();

            if (_self.options.asPreset === 'none')
                return resolve();

            for (let preset of _self.options.asPreset.split(':')) {
                let ASPreset = ASPresets[preset];
                if (!ASPreset)
                    return reject(new Error('Unknown as-preset option ' + colors.yellow(preset) + '.'));

                for (let option in ASPreset) {
                    switch (option) {
                        case 'x265Options':
                            _self._addX265Option(ASPreset[option]);
                            break;
                        case 'preset':
                            _self.options.preset = ASPreset[option];
                            break;
                        case 'videoFilters':
                            _self.ffmpegCommand.videoFilters(ASPreset[option]);
                            break;
                        case 'bitdepth':
                            _self.options.bitdepth = ASPreset[option];
                            break;
                        default:
                            return reject(new Error('Unknown as-preset setting ' + colors.yellow(option) + ' for as-preset ' + colors.yellow(_self.options.asPreset) + '.'));
                    }
                }
            }
            resolve();
        });
    }

    upconvert() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            if (_self.options.upconvert || _self.options.test)
                return resolve();


            let trackUpconvertProcesses = [];

            // Here you can process all subtitles
            _.each(_self.streams.subtitleStreams, function(subtitle, i) {

                // Detect dvdsub subtitles
                if (subtitle.codec_name === 'dvdsub' || subtitle.codec_name === 'dvd_subtitle') {

                    // Convert dvdsub subtitle to srt
                    trackUpconvertProcesses.push(new Promise(function(resolve, reject) {
                        helpers.extractTrack(_self.path, subtitle.index).then(helpers.vobsubToSRT).then(function(filePath) {
                            _self.ffmpegCommand.input(filePath);
                            _self.temp.files.push(filePath);
                            Video.getMetadata(_self).then(function(metadata) {
                                metadata.streams[0].title = subtitle.title;
                                metadata.streams[0].language = subtitle.language;
                                metadata.streams[0].tags = subtitle.tags;
                                metadata.streams[0].disposition = subtitle.disposition;
                                metadata.streams[0].input = ++_self.inputCounter;

                                _self.streams.subtitleStreams[i] = metadata.streams[0];
                                resolve();
                            }, reject);
                        }).catch(reject);
                    }));
                }
            });

            _self.encoder.logger.debug('Upconverting', trackUpconvertProcesses.length, 'tracks.');
            // Execute all upconvert processes
            Promise.all(trackUpconvertProcesses).then(function() {
                resolve();
            }).catch(function(err) {
                _self.encoder.logger.warn('Upconvert error: ' + err.message + ' - Skipping upconvert...');
                reject(err);
            });

            resolve();
        });
    }

    setVideoBitDepth() {
        let _self = this;
        return new Promise(function(resolve, reject) {

            // Video streams
            let videoIndex = 0,
                videoBitDepth = 8;

            if (_self.streams.videoStreams.length > 1) {
                // TODO implement feature
                _self.encoder.logger.alert('More than one video stream detected. Using the video stream with the greatest duration.');
                videoIndex = 0;
            }
            let videoStream = _self.videoStream = _self.streams.videoStreams[videoIndex];

            // Check for 12bit or 10bit video
            if (videoStream.pix_fmt.indexOf('12le') > -1 || videoStream.pix_fmt.indexOf('12be') > -1) {
                videoBitDepth = 12;
            } else if (videoStream.pix_fmt.indexOf('10le') > -1 || videoStream.pix_fmt.indexOf('10be') > -1) {
                videoBitDepth = 10;
            }
            _self.videoBitDepth = videoBitDepth;

            // Set video encoding profile
            if (_self.options.bitdepth === 12) {
                _self.ffmpegCommand.outputOptions('-pix_fmt', 'yuv420p12le');
            } else if (_self.options.bitdepth === 10) {
                _self.ffmpegCommand.outputOptions('-pix_fmt', 'yuv420p10le');
            } else if (_self.options.bitdepth === 8) {
                _self.ffmpegCommand.outputOptions('-pix_fmt', 'yuv420p');
            } else {
                switch (_self.videoBitDepth) {
                    case 16:
                        _self.ffmpegCommand.outputOptions('-pix_fmt', 'yuv420p16le');
                        break;
                    case 14:
                        _self.ffmpegCommand.outputOptions('-pix_fmt', 'yuv420p14le');
                        break;
                    case 12:
                        _self.ffmpegCommand.outputOptions('-pix_fmt', 'yuv420p12le');
                        break;
                    case 10:
                        _self.ffmpegCommand.outputOptions('-pix_fmt', 'yuv420p10le');
                        break;
                    default:
                        _self.ffmpegCommand.outputOptions('-pix_fmt', 'yuv420p');
                        break;
                }
            }

            // Make sure we are only attempting to use 8 bit with fallback
            // binary
            // TODO
            // if (usingFallbackFfmpeg) {
            //     let options = command._currentOutput.options.get();
            //     let selectedPixFmt = options[options.indexOf('-pix_fmt') + 1];
            //     if (selectedPixFmt !== 'yuv420p') {
            //         return reject({
            //             level: 'error',
            //             message: 'Bit depth about 8 bit are not supported by the fallback ffmpeg library. Try installing ffmpeg.'
            //         });
            //     }
            // }

            resolve();
        });
    }

    normalizeAudio() {
        let _self = this;
        return new Promise(function(resolve, reject) {

            if (!_self.options.normalizeLevel || _self.options.normalizeLevel < 3) {
                return resolve();
            }

            let availableFilters;

            ffmpeg.getAvailableFilters(function(err, filters) {
                availableFilters = filters;
                normalize();
            });

            function normalize() {

                _self.stages[_self.currentStageNum].command = _self._applyInputErrorDetection(new ffmpeg(_self.path, {
                        logger: _self.encoder.logger
                    }).inputOptions('-hide_banner')).outputOptions('-f', 'null').output('-')
                    .on('start', function(commandLine) {
                        if (_self.paused)
                            _self.pause();
                        _self.encoder.logger.debug('Running Query:', commandLine);
                    })
                    .on('error', function(err, stdout, stderr) {
                        _self.encoder.logger.debug(err.stack);

                        _self.encoder.logger.debug(stderr);

                        if (err.message.startsWith('ffmpeg was killed with signal'))
                            reject(new Error('ENDING'));
                        else
                            reject(err);
                    });
                let vdc = _self.stages[_self.currentStageNum].command;

                if (_self.options.preview) {
                    vdc.seekInput(_self.metadata.format.duration / 2).duration(_self.options.previewLength / 1000);
                }

                // Only map streams we are going to work on
                _.each(_self.streams.audioStreams, function(stream, i) {
                    vdc.outputOptions('-map', stream.input + ':' + stream.index);
                });


                /************ This is where the normalization detection happens ***/

                //
                if (_self.options.normalizeLevel >= 5) {
                    _self.encoder.logger.debug('Normalizing audio via dynaudnorm.');

                    if (!availableFilters.dynaudnorm) {
                        return reject(new Error('Installed ffmpeg version does not support the dynaudnorm audio filter'));
                    }

                    return reject(new Error('dynaudnorm is not currently implemented'));

                }

                //
                else if (_self.options.normalizeLevel >= 4) {
                    _self.encoder.logger.debug('Normalizing audio via loudnorm.');

                    if (!availableFilters.loudnorm) {
                        return reject(new Error('Installed ffmpeg version does not support the loudnorm audio filter'));
                    }

                    // Oh loudnorm multipass, lets begin
                    _.each(_self.streams.audioStreams, function(stream, i) {
                        vdc.outputOptions('-filter_complex', '[' + stream.input + ':' + stream.index + ']loudnorm=I=-16:TP=-2.0:LRA=11:print_format=json');
                    });

                    vdc.on('end', function(stdout, stderr) {
                        delete _self.stages[_self.currentStageNum].command;
                        let summaries = parseLoudnormSummaries(stderr);

                        if (!summaries.length) {
                            return reject(new Error('Could not parse loudnorm analysis output.'));
                        }

                        _.each(_self.streams.audioStreams, function(stream, i) {
                            let parsedAttributes = summaries[i] || summaries[summaries.length - 1];
                            _self.ffmpegCommand.outputOptions('-c:a:' + i, 'aac');
                            let bitratePerChannel = 128;
                            _self.ffmpegCommand.outputOptions('-b:a:' + i, bitratePerChannel * stream.channels + 'k');
                            _self.ffmpegCommand.outputOptions('-af:a:' + i,
                                'loudnorm=I=-16:TP=-2.0:LRA=11:measured_I=' + parsedAttributes.input_i +
                                ':measured_LRA=' + parsedAttributes.input_lra +
                                ':measured_TP=' + parsedAttributes.input_tp +
                                ':measured_thresh=' + parsedAttributes.input_thresh +
                                ':offset=' + parsedAttributes.target_offset +
                                ':linear=true:print_format=summary');
                        });
                        return resolve();
                    });

                    vdc.run();
                }

                // "simple" audio RMS-based normalization to -2.0 dBFS
                else if (_self.options.normalizeLevel >= 3) {
                    _self.encoder.logger.debug('Normalizing audio via volumedetect & volume.');

                    if (!availableFilters.volumedetect || !availableFilters.volume) {
                        return reject(new Error('Installed ffmpeg version does not support volumedetect audio filter and/or volume audio filter'));
                    }

                    const volumeRegexp = /max_volume: (-?[0-9]+\.[0-9]+)/g;
                    let volumeLevels = [];
                    _.each(_self.streams.audioStreams, function(stream, i) {
                        vdc.outputOptions('-filter_complex', '[' + stream.input + ':' + stream.index + ']volumedetect');
                    });

                    vdc.on('stderr', function(stderrLine) {
                        if (stderrLine.startsWith('[Parsed_volumedetect')) {
                            let match = volumeRegexp.exec(stderrLine);
                            if (match) {
                                volumeLevels.push(parseFloat(match[1]));
                            }
                        }
                    }).on('end', function(stderr) {
                        delete _self.stages[_self.currentStageNum].command;
                        _.each(_self.streams.audioStreams, function(stream, i) {
                            let detectedVolume = typeof volumeLevels[i] === 'number' ? volumeLevels[i] : 0;
                            let volume = detectedVolume * -1 - 2.0;
                            _self.ffmpegCommand.outputOptions('-af:a:' + i, 'volume=' + volume + 'dB');
                            _self.ffmpegCommand.outputOptions('-c:a:' + i, 'aac');
                            // FIXME Hardcoded bitrate
                            let bitratePerChannel = 128;
                            _self.ffmpegCommand.outputOptions('-b:a:' + i, bitratePerChannel * stream.channels + 'k');
                        });
                        return resolve();
                    });

                    vdc.run();
                }
            }

        });
    }

    autoCrop() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            if (_self.options.normalizeLevel < 1) {
                return resolve();
            }

            const cropProfileName = _self.options.crop || 'normal';
            const cropProfile = getCropProfile(cropProfileName);
            const cropFilter = buildCropDetectFilter(cropProfileName);
            const intervals = 12;
            const interval = _self.metadata.format.duration / (intervals + 1);

            function detectCrop(start, fallback) {
                return new Promise(function(resolve, reject) {
                    let seekStart = Math.max(0, start);
                    let scanDuration = cropProfile.scanDuration;
                    let frameCount = cropProfile.frameCount;

                    if (fallback) {
                        // Rewind slightly and scan a bit longer without falling back to a full-file pass.
                        seekStart = Math.max(0, start - 2);
                        scanDuration = cropProfile.fallbackScanDuration;
                        frameCount = cropProfile.fallbackFrameCount;
                    }

                    _self.stages[_self.currentStageNum].command = _self._applyInputErrorDetection(new ffmpeg(_self.path, {
                            logger: _self.encoder.logger
                        }).seekInput(seekStart)
                        .outputOptions('-map', _self.videoStream.input + ':' + _self.videoStream.index)
                        .videoCodec('rawvideo').videoFilters(cropFilter).outputOptions('-f', 'null').output('-'));

                    if (fallback) {
                        _self.encoder.logger.warn('Crop detection failed at sample point. Retrying with a short fallback scan window.');
                    }

                    _self.stages[_self.currentStageNum].command.duration(scanDuration).frames(frameCount);

                    let crop = {};

                    _self.stages[_self.currentStageNum].command
                        .on('start', function(commandLine) {
                            if (_self.paused)
                                _self.pause();

                            _self.encoder.logger.debug('Running Query:', commandLine);
                        })
                        .on('end', function(stdout, stderr) {
                            delete _self.stages[_self.currentStageNum].command;
                            let detectedCrop = extractCropFromStderr(stderr);
                            if (detectedCrop === null) {
                                return reject(new Error('Could not run crop detection.'));
                            }

                            crop.w = detectedCrop.w;
                            crop.h = detectedCrop.h;
                            crop.x = detectedCrop.x;
                            crop.y = detectedCrop.y;
                            resolve(crop);
                        })
                        // .on('stderr', function(line) {
                        //     this.encoder.logger.debug(line);
                        // })
                        .on('error', function(err, stdout, stderr) {
                            _self.encoder.logger.debug(err.stack);

                            if (err.message.startsWith('ffmpeg was killed with signal'))
                                return reject(new Error('ENDING'));
                            else
                                return reject(err);
                        });

                    _self.stages[_self.currentStageNum].command.run();
                });
            }

            //
            let i = intervals,
                counter = 1,
                cropDetections = [];

            _self.encoder.logger.debug('Crop detection profile:', cropProfileName, {
                limit: cropProfile.limit,
                scanDuration: cropProfile.scanDuration,
                frameCount: cropProfile.frameCount
            });

            // This just runs all the ffmpeg crop detections in sync so you
            // dont end up with a million threads running
            function syncHandler(crop) {
                if (crop)
                    cropDetections.push(crop);
                if (i > 0) {
                    _self.encoder.logger.info('Crop Detection:', (counter++) + '/' + intervals, {
                        __clearLine: true
                    });
                    let startTime = interval * i--;
                    detectCrop(startTime).then(syncHandler, function() {
                        return detectCrop(startTime, true).then(function(crop) {
                            cropDetections.push(crop);
                            cropDetectionComplete(cropDetections);
                        }, reject);
                    });
                } else
                    cropDetectionComplete(cropDetections);
            }
            syncHandler();



            function cropDetectionComplete(detections) {
                let crop = aggregateCropDetections(detections);
                let reportLines = buildCropDecisionReport(detections, cropProfileName);

                _self.cropDecision = crop;
                _self.cropDecisionReport = reportLines;
                _self.cropDecisionProfile = cropProfileName;
                _self.cropDecisionDetections = detections.length;

                if (reportLines) {
                    _self.encoder.logger.info('Crop decision:', {
                        __divider: true
                    });
                    _.each(reportLines, function(line) {
                        _self.encoder.logger.info(line);
                    });
                }

                if (!crop)
                    return resolve();

                if (crop.w !== _self.videoStream.width || crop.h !== _self.videoStream.height) {
                    _self.encoder.logger.alert('Output will be cropped to', crop.w + 'x' + crop.h + '.', 'Originally', _self.videoStream.width + 'x' + _self.videoStream.height);
                    _self.ffmpegCommand.videoFilters('crop=' + crop.w + ':' + crop.h + ':' + crop.x + ':' + crop.y);
                }
                resolve();
            }
        });
    }

    deinterlace() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            if (_self.options.normalizeLevel < 3)
                return resolve();

            let framesToScan = 250;
            _self.stages[_self.currentStageNum] = _self._applyInputErrorDetection(ffmpeg(_self.path).videoFilters('idet').frames(framesToScan))
                .outputOptions('-map', _self.videoStream.input + ':' + _self.videoStream.index)
                .format('rawvideo').outputOptions('-f', 'null').output('-')
                .on('start', function(commandLine) {
                    if (_self.paused)
                        _self.pause();

                    _self.encoder.logger.debug('Running Query:', commandLine);
                })
                .on('end', function(stdout, stderr) {
                    let lines = stderr.split('\n');
                    let detectionLine = _.findLast(lines, function(line) {
                        return line.indexOf('Multi frame detection:') > -1 || line.indexOf('Single frame detection:') > -1;
                    });

                    if (!detectionLine) {
                        return reject(new Error('Could not parse idet output.'));
                    }

                    let normalizedDetectionLine = detectionLine.replace(/ /g, '');
                    let numFrames = normalizedDetectionLine.match(new RegExp('TFF:([0-9]+)BFF:([0-9]+)Progressive:([0-9]+)'));
                    if (!numFrames) {
                        return reject(new Error('Could not parse idet frame counters.'));
                    }

                    let interlacedFrameCount = parseInt(numFrames[1]) + parseInt(numFrames[2]);
                    let progressiveFrameCount = parseInt(numFrames[3]);

                    if (interlacedFrameCount >= progressiveFrameCount) {
                        _self.interlaced = true;
                        _self.ffmpegCommand.videoFilters('yadif');
                        _self.encoder.logger.alert('Interlaced video detected. Output will be deinterlaced.');
                        return resolve();
                    } else {
                        _self.interlaced = false;
                        return resolve();
                    }
                })
                .on('error', function(err, stdout, stderr) {
                    _self.encoder.logger.debug(err.stack);

                    if (err.message.startsWith('ffmpeg was killed with signal'))
                        return reject(new Error('ENDING'));
                    else
                        return reject(err);
                })
                .run();
        });
    }

    mapStreams() {
        let _self = this;
        return new Promise(function(resolve, reject) {

            _self.ffmpegCommand.outputOptions('-map', _self.videoStream.input + ':' + _self.videoStream.index);
            _self.encoder.logger.debug('Video stream', _self.videoStream.input + ':' + _self.videoStream.index, 'mapped.', {
                size: _self.videoStream.width + 'x' + _self.videoStream.height,
                codec: _self.videoStream.codec_long_name,
                profile: _self.videoStream.profile,
                'bit depth': _self.videoBitDepth
            });

            // Handle native language detection and default audio track selection
            _.each(_self.streams.audioStreams, function(stream, i) {
                let normalizedLanguage = helpers.normalizeStreamLanguage(stream);
                if (normalizedLanguage === helpers.normalizeLanguage(_self.options['native-language']) && !_self.defaultAudioIndex) {
                    _self.defaultAudioIndex = stream.index;
                }
            });

            // Audio streams
            _.each(_self.streams.audioStreams, function(stream, i) {

                let audioTitle = helpers.getStreamTitle(stream);
                let normalizedLanguage = helpers.normalizeStreamLanguage(stream);

                _self.ffmpegCommand.outputOptions('-map', stream.input + ':' + stream.index);
                if (!(audioTitle) && _self.options.normalizeLevel >= 2) {

                    let channelsFormated = helpers.getFormatedChannels(stream.channels);
                    audioTitle = normalizedLanguage + ' ' + stream.codec_name.toUpperCase() + ((stream.profile && stream.profile !== 'unknown') ? (' ' + stream.profile) : '') + ' (' + channelsFormated + ')';
                    _self.encoder.logger.alert('Audio does not have a title. Title set to', '"' + audioTitle + '".');
                    _self.ffmpegCommand.outputOptions('-metadata:s:a:' + i, 'title=' + audioTitle);
                }

                // Set default audio using output-relative indices.
                if (_self.defaultAudioIndex != null) {
                    _self.ffmpegCommand.outputOptions('-disposition:a:' + i, _self.defaultAudioIndex === stream.index ? 'default' : '0');
                }

                let extraInfo = {
                    title: audioTitle,
                    language: normalizedLanguage,
                    codec: stream.codec_long_name,
                    channels: stream.channels
                };

                if (stream.profile)
                    extraInfo.profile = stream.profile;
                else
                    extraInfo['bit-depth'] = stream.bits_per_raw_sample;

                _self.encoder.logger.debug('Audio stream', stream.input + ':' + stream.index, 'mapped.', extraInfo);
            });

            // Subtitle streams
            _.each(_self.streams.subtitleStreams, function(stream, i) {

                // Handle native language
                let normalizedLanguage = helpers.normalizeStreamLanguage(stream);
                if (normalizedLanguage === helpers.normalizeLanguage(_self.options['native-language']) && !_self.defaultAudioIndex && !_self.defaultSubtitleIndex) {
                    _self.defaultSubtitleIndex = stream.index;
                }

                _self.ffmpegCommand.outputOptions('-map', stream.input + ':' + stream.index);
                if (!helpers.getStreamTitle(stream) && _self.options.normalizeLevel >= 2) {
                    _self.encoder.logger.alert('Subtitle does not have a title. Title set to', normalizedLanguage + '.');
                    _self.ffmpegCommand.outputOptions('-metadata:s:s:' + i, 'title=' + normalizedLanguage);
                }
                if (_self.defaultSubtitleIndex != null) {
                    _self.ffmpegCommand.outputOptions('-disposition:s:' + i, _self.defaultSubtitleIndex === stream.index ? 'default' : '0');
                }
                _self.encoder.logger.debug('Subtitle stream', stream.input + ':' + stream.index, 'mapped.', {
                    title: helpers.getStreamTitle(stream) || normalizedLanguage,
                    language: normalizedLanguage,
                    codec: stream.codec_long_name
                });
            });

            // Other streams (Attachments: fonts, pictures, etc.)
            _.each(_self.streams.otherStreams, function(stream, i) {
                _self.ffmpegCommand.outputOptions('-map', stream.input + ':' + stream.index);
                _self.encoder.logger.debug('Other stream', stream.input + ':' + stream.index, 'mapped.');
            });

            resolve();
        });
    }

    heAudio() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            if (!_self.options.heAudio)
                return resolve();

            _.each(_self.streams.audioStreams, function(stream, i) {
                if (stream.codec_name !== 'flac' || _self.options.forceHeAudio) {
                    _self.encoder.logger.verbose('Audio stream', colors.yellow(helpers.getStreamTitle(stream) + ' (index: ' + stream.index + ')'), 'will be encoded to HE Audio.');
                    _self.ffmpegCommand.outputOptions('-c:a:' + i, 'libopus');
                    _self.ffmpegCommand.outputOptions('-af', "aformat=channel_layouts='7.1|5.1|stereo'");
                    _self.ffmpegCommand.outputOptions('-frame_duration', 60);
                    if (_self.options.downmixHeAudio && stream.channels > 3) {
                        // Downmix HE Audio
                        _self.ffmpegCommand.audioChannels(2).audioFilters('aresample=matrix_encoding=dplii');
                        stream.channels = 2;
                    }

                    let bitrate = _self.options.HEAudioBitrate * stream.channels;
                    _self.ffmpegCommand.outputOptions('-b:a:' + i, bitrate + 'k');

                    // Handle setting a new title
                    let audioTitle = helpers.getStreamTitle(stream);
                    let normalizedLanguage = helpers.normalizeStreamLanguage(stream);
                    if (!(audioTitle) && _self.options.normalizeLevel >= 2) {
                        let channelsFormated = helpers.getFormatedChannels(stream.channels);
                        audioTitle = normalizedLanguage + ' OPUS (' + channelsFormated + ')';
                        _self.encoder.logger.alert('Audio does not have a title. Title set to', '"' + audioTitle + '".');
                        _self.ffmpegCommand.outputOptions('-metadata:s:a:' + i, 'title=' + audioTitle);
                    }
                } else {
                    _self.encoder.logger.alert('Audio stream', colors.yellow(helpers.getStreamTitle(stream) + ' (index: ' + stream.index + ')'), 'won\'t be encoded with HE Audio because it is in a lossless format.');
                }
            });

            resolve();
        });
    }

    explain() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            if (!_self.options.explain)
                return resolve();

            let reportLines = buildExplainReport(_self) || [];

            _self.encoder.logger.info('Explain summary:', {
                __divider: true
            });

            _.each(reportLines, function(line) {
                _self.encoder.logger.info(line);
            });

            reject(new Error('EXPLAINCOMPLETE'));
        });
    }

    cropPreview() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            if (!_self.options.cropPreview)
                return resolve();

            let previewDir = _self.options.cropPreviewDir || Path.join(_self.output.dir, 'crop-preview', _self.name);
            let cropFilter = _self.cropDecision ? 'crop=' + _self.cropDecision.w + ':' + _self.cropDecision.h + ':' + _self.cropDecision.x + ':' + _self.cropDecision.y : null;

            Video.takeScreenshots(_self.path, previewDir, _self.encoder.logger, cropFilter).then(function(result) {
                let reportLines = buildCropPreviewReport(_self, result && result.outputDir || previewDir, result && result.filenames) || [];

                _self.encoder.logger.info('Crop preview:', {
                    __divider: true
                });

                _.each(reportLines, function(line) {
                    _self.encoder.logger.info(line);
                });

                reject(new Error('CROPPREVIEWCOMPLETE'));
            }, reject);
        });
    }

    encode() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            _self.pass++;
            let startTime = Date.now();

            if (_self.options.test)
                return reject(new Error('Test mode! Skipping...'));

            let frameRateInfo = getFrameRateInfo(_self.videoStream);
            let frameRate = frameRateInfo.value;

            // Accurate Timestamps
            if (_self.options.accurateTimestamps && Number.isFinite(frameRate) && frameRate > 0)
                _self._addX265Option('keyint=' + frameRate.toFixed(0));

            // Scale video
            if (_self.options.scale)
                _self.ffmpegCommand.videoFilters('scale=-1:' + _self.options.scale);

            // Video bitrate target or constant quality?
            if (_self.options.videoBitrate) {
                _self.ffmpegCommand.videoBitrate(_self.options.videoBitrate);
            } else {
                _self.ffmpegCommand.outputOptions('-crf ' + _self.options.quality);
            }

            // H265 preset
            if (_self.options.preset)
                _self.ffmpegCommand.outputOptions('-preset', _self.options.preset);

            // H265 extra options
            if (_self.options.extraOptions)
                _self._addX265Option(_self.options.extraOptions);

            if (_self.x265Options)
                _self.ffmpegCommand.outputOptions('-x265-params', _self.x265Options);

            _self.ffmpegCommand
                .on('progress', function(progress) {
                    let elapsedSeconds = (Date.now() - startTime) / 1000;
                    let processedSeconds = helpers.parseTimemarkSeconds(progress.timemark);
                    let previousProgress = _self.progress;
                    let progressPercent = getProgressPercent(progress, processedSeconds, _self.metadata.format.duration, frameRate, previousProgress);
                    let percentValue = progressPercent.value;
                    let percent = percentValue.toFixed(1);
                    let frameProgress = formatProgressFramesLabel(progress, _self.metadata.format.duration, frameRate);
                    let estimatedFileSize = formatEstimatedFileSize(progress, _self.output.path, percentValue);
                    let percentFromTimemark = (processedSeconds / _self.metadata.format.duration) * 100;
                    let percentFromFrames = Number(progress.frames) && Number.isFinite(_self.metadata.format.duration) && Number.isFinite(frameRate) && _self.metadata.format.duration > 0 && frameRate > 0 ? (Number(progress.frames) / (_self.metadata.format.duration * frameRate)) * 100 : 0;
                    _self.elapsedFormated = helpers.formatDurationHms(elapsedSeconds);

                    let speed = Number.isFinite(frameRate) && frameRate > 0 && Number.isFinite(progress.currentFps) && progress.currentFps > 0
                        ? (progress.currentFps / frameRate).toFixed(3)
                        : 'n/a';

                    let etaSeconds = estimateEtaSeconds(_self.metadata.format.duration, percentValue, elapsedSeconds, frameRate, progress.currentFps, processedSeconds);
                    let eta = helpers.formatDurationHms(etaSeconds);

                    if (_self.options.debug) {
                        _self.encoder.logger.debug('Progress diagnostics:', {
                            frameRateSource: frameRateInfo.source,
                            timemark: progress.timemark,
                            duration: _self.metadata.format.duration,
                            percentFromTimemark: Number.isFinite(percentFromTimemark) ? percentFromTimemark.toFixed(3) : 'n/a',
                            percentFromFrames: Number.isFinite(percentFromFrames) && percentFromFrames > 0 ? percentFromFrames.toFixed(3) : 'n/a',
                            percentFromFfmpeg: Number.isFinite(Number(progress.percent)) ? Number(progress.percent).toFixed(3) : 'n/a',
                            percentSource: progressPercent.source,
                            percentUsed: percent,
                            frameProgress: frameProgress,
                            targetSize: typeof progress.targetSize !== 'undefined' ? progress.targetSize : 'n/a',
                            estimatedFileSize: estimatedFileSize,
                            speed: speed,
                            eta: eta
                        });
                    }

                    _self.encoder.logger.info(colors.bgMagenta.white('[ffmpeg]'), 'Processing:', progress.currentFps + 'fps',
                        '|', frameProgress,
                        '|', percent + '%',
                        '|', 'timemark', '[' + progress.timemark + ']',
                        '|', colors.yellow(_self.elapsedFormated), '[x' + speed + ']',
                        'ETA', colors.blue(eta), colors.blue(estimatedFileSize), {
                            __clearLine: true
                        });

                    _self.progress = {
                        fps: progress.currentFps,
                        percent: percent,
                        processed: processedSeconds,
                        frames: progress.frames,
                        timemark: progress.timemark,
                        targetSize: progress.targetSize,
                        elapsed: _self.elapsedFormated,
                        eta: eta,
                        speed: speed
                    };

                    _self.events.emit('progress', _self.progress);
                })
                .on('start', function(commandLine) {
                    if (_self.paused)
                        _self.pause();
                    _self.temp.files.push(_self.output.path);
                    _self.encoder.logger.debug('Running Query:', commandLine);
                })
                .on('end', function() {
                    _.pull(_self.temp.files, _self.output.path);
                    resolve();
                })
                .on('error', function(err, stdout, stderr) {

                    if (err.message.startsWith('ffmpeg was killed with signal'))
                        reject(new Error('FFMPEGKILLED'));
                    else
                        reject(new Error('ffmpeg exited with an error.' + stdout + stderr));
                });
            _self.ffmpegCommand.output(_self.output.path, {
                end: true
            });

            if (_self.encoder.enablePreviewStream)
                _self.ffmpegCommand
                .output(_self.previewStream)
                .noAudio()
                .videoCodec('bmp')
                .format('image2')
                .outputOptions('-vf', 'fps=3 [slow];[slow] scale=-1:240')
                .outputOptions('-pix_fmt', 'bgr24')
                .outputOptions('-updatefirst 1');

            // Preview Mode
            if (_self.options.preview) {
                _self.ffmpegCommand.seekInput(_self.metadata.format.duration / 2).duration(_self.options.previewLength / 1000);
            }

            if (_self.options.dryRun) {
                return _self._getCommandLine(_self.ffmpegCommand).then(function(commandLine) {
                    _self.encoder.logger.info('Dry run command:', commandLine, {
                        __divider: true
                    });
                    reject(new Error('DRYRUNCOMPLETE'));
                }, reject);
            }

            // Make output directory
            if (!_self.options.delete)
                ensureDir(_self.output.dir, function(err) {
                    if (err) {
                        _self.encoder.logger.warn(_self.base, 'was unable to be encoded. The following error was given:');
                        _self.encoder.logger.warn(err);
                    }
                });
            _self.ffmpegCommand.run();
        });
    }

    multiPass() {
        let _self = this;
        return new Promise(function(resolve, reject) {

            if (!_self.options.multiPass || _self.options.multiPass <= 1)
                return resolve();

            if (!_self.options.videoBitrate)
                return reject(new Error('Multipass is only compatable with bitrate encoding, not constant quality encoding.'));

            if (_self.pass >= _self.options.multiPass)
                return resolve();

            let newInput = _self.output.path + '-pass' + _self.pass;
            _self.ffmpegCommand = new ffmpeg(newInput, {
                    logger: _self.encoder.logger
                })
                //.inputOptions('-loglevel', 48)
                .outputOptions('-map', 0)
                .outputOptions('-c', 'copy')
                .outputOptions('-c:v', 'libx265');

            let statsLogLocation = Path.resolve(os.tmpdir(), 'x265stats.log');

            if (_self.options.multiPass === _self.pass + 1) {
                _self._addX265Option('pass=2:stats=' + statsLogLocation);
            } else {
                _self._addX265Option('pass=3:stats=' + statsLogLocation);
            }

            return moveFile(_self.output.path, newInput, {
                clobber: true
            }, function(err) {
                if (err) {
                    _self.encoder.logger.error(err.message);
                    _self.encoder.logger.debug(err.stack);

                    return reject(new Error('Error moving file ' + colors.yellow(_self.output.path) + ' to ' + colors.yellow(newInput) + '.'));
                }

                _self._updatePath(newInput);
                _self.temp.files.push(statsLogLocation);
                _self.temp.files.push(newInput);

                _self.encoder.logger.verbose('Running pass', _self.pass + 1 + '.');
                return _self.setVideoBitDepth().then(function() {
                    return _self.encode.call(_self);
                }).then(function() {
                    return _self.multiPass.call(_self);
                }).then(resolve, reject);
            });
        });
    }

    verifyEncode() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            Video.getMetadata(_self, true).then(function(metadata) {
                const oldMetadata = _self.metadata;
                const timeDiffLimit = 1; // in seconds
                _self.output.metadata = metadata;
                _self.ratio = (_self.output.metadata.format.size / oldMetadata.format.size * 100).toFixed(2);
                _self.encoder.logger.debug('Original Duration:', oldMetadata.format.duration + '(s)\t', 'New Duration:', metadata.format.duration + '(s)');
                let timeDiff = oldMetadata.format.duration - metadata.format.duration;
                if (timeDiff > timeDiffLimit && !_self.options.preview) {
                    _self.encoder.logger.warn('New encode is', timeDiff, 'seconds longer than the original. The max is', timeDiffLimit, 'seconds.');
                    fs.unlinkSync(_self.output.path);
                    reject(new Error('Processed encode did not meet max time slippage requirements.'));
                } else {
                    resolve();
                }
            });
        });
    }

    move() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            if (!_self.options.delete)
                return resolve();

            const newDestination = Path.join(_self.dir, _self.output.base);
            _self.encoder.logger.debug('Removing original and moving file to ', newDestination);
            removePath(_self.path, function(err) {
                if (err) return reject(err);
                _self.encoder.watchIgnore.push(newDestination);
                moveFile(_self.output.path, newDestination,
                    function(err) {
                        if (err) return reject(err);
                        _self._updateDestination(_self.dir);
                        resolve();
                    });
            })
        });
    }

    screenshots() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            if (!_self.options.screenshots)
                return resolve();

            Video.takeScreenshots(_self.output.path, Path.join(_self.output.dir, 'screenshots'), _self.encoder.logger).then(resolve, reject);
        });
    }

    sample() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            if (!_self.options.sample)
                return resolve();

            if (_self.options.preview) {
                _self.encoder.logger.warn('Cannot create sample: Preview and sample flags cannot be used together.');
                return resolve();
            }

            let startTime = Date.now();
            let frameRateInfo = getFrameRateInfo(_self.videoStream);
            let frameRate = frameRateInfo.value;
            let command = _self.stages[_self.currentStageNum].command = _self._applyInputErrorDetection(new ffmpeg(_self.path, {
                logger: _self.encoder.logger
            }).seekInput(_self.metadata.format.duration / 2).duration(_self.options.previewLength / 1000).outputOptions('-c', 'copy').output(_self.output.sample));

            command
                .on('progress', function(progress) {
                    let elapsedSeconds = (Date.now() - startTime) / 1000;
                    let processedSeconds = helpers.parseTimemarkSeconds(progress.timemark);
                    let previousProgress = _self.progress;
                    let progressPercent = getProgressPercent(progress, processedSeconds, _self.metadata.format.duration, frameRate, previousProgress);
                    let percentValue = progressPercent.value;
                    let percent = percentValue.toFixed(1);
                    let frameProgress = formatProgressFramesLabel(progress, _self.metadata.format.duration, frameRate);
                    let estimatedFileSize = formatEstimatedFileSize(progress, _self.output.sample, percentValue);
                    let percentFromTimemark = (processedSeconds / _self.metadata.format.duration) * 100;
                    let percentFromFrames = Number(progress.frames) && Number.isFinite(_self.metadata.format.duration) && Number.isFinite(frameRate) && _self.metadata.format.duration > 0 && frameRate > 0 ? (Number(progress.frames) / (_self.metadata.format.duration * frameRate)) * 100 : 0;
                    _self.elapsedFormated = helpers.formatDurationHms(elapsedSeconds);

                    // let speed = 'x' + getSpeedRatio(progress.timemark, elapsed);
                    let speed = Number.isFinite(frameRate) && frameRate > 0 && Number.isFinite(progress.currentFps) && progress.currentFps > 0
                        ? (progress.currentFps / frameRate).toFixed(3)
                        : 'n/a';

                    let etaSeconds = estimateEtaSeconds(_self.metadata.format.duration, percentValue, elapsedSeconds, frameRate, progress.currentFps, processedSeconds);
                    let eta = helpers.formatDurationHms(etaSeconds);

                    if (_self.options.debug) {
                        _self.encoder.logger.debug('Progress diagnostics:', {
                            frameRateSource: frameRateInfo.source,
                            timemark: progress.timemark,
                            duration: _self.metadata.format.duration,
                            percentFromTimemark: Number.isFinite(percentFromTimemark) ? percentFromTimemark.toFixed(3) : 'n/a',
                            percentFromFrames: Number.isFinite(percentFromFrames) && percentFromFrames > 0 ? percentFromFrames.toFixed(3) : 'n/a',
                            percentFromFfmpeg: Number.isFinite(Number(progress.percent)) ? Number(progress.percent).toFixed(3) : 'n/a',
                            percentSource: progressPercent.source,
                            percentUsed: percent,
                            frameProgress: frameProgress,
                            targetSize: typeof progress.targetSize !== 'undefined' ? progress.targetSize : 'n/a',
                            estimatedFileSize: estimatedFileSize,
                            speed: speed,
                            eta: eta
                        });
                    }

                    _self.encoder.logger.info(colors.bgMagenta.white('[ffmpeg]'), 'Processing:', progress.currentFps + 'fps',
                        '|', frameProgress,
                        '|', percent + '%',
                        '|', 'timemark', '[' + progress.timemark + ']',
                        '|', colors.yellow(_self.elapsedFormated), '[x' + speed + ']',
                        'ETA', colors.blue(eta), colors.blue(estimatedFileSize), {
                            __clearLine: true
                        });

                    _self.progress = {
                        fps: progress.currentFps,
                        percent: percent,
                        processed: processedSeconds,
                        frames: progress.frames,
                        timemark: progress.timemark,
                        targetSize: progress.targetSize,
                        elapsed: _self.elapsedFormated,
                        eta: eta,
                        speed: speed
                    };

                    _self.events.emit('progress', _self.progress);
                })
                .on('start', function(commandLine) {
                    if (_self.paused)
                        _self.pause();
                    _self.temp.files.push(_self.output.path);
                    _self.encoder.logger.debug('Running Query:', commandLine);
                })
                .on('end', function() {
                    _.pull(_self.temp.files, _self.output.path);
                    resolve();
                })
                .on('error', function(err, stdout, stderr) {
                    _self.encoder.logger.debug(err.stack);

                    if (err.message.startsWith('ffmpeg was killed with signal'))
                        reject(new Error('FFMPEGKILLED'));
                    else
                        reject(err);
                });
        });
    }

    appendStats() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            if (!_self.options.stats)
                return resolve();

                helpers.initStatsFile(Path.join(process.cwd(), 'h265ize.csv')).then(function(stream) {
                    helpers.appendToStatsFile([
                        helpers.formatStatsTimestamp(new Date()),
                        _self.path,
                        filesize(_self.metadata.format.size),
                        filesize(_self.output.metadata.format.size),
                        _self.ratio + '%',
                        _self.elapsedFormated
                    ], stream)
                    .then(function() {
                        stream.close();
                        resolve();
                    });
            });

        });
    }

    encodeSummary() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            let summaryLines = buildEncodeSummary(_self.output.metadata, _self.metadata);

            if (!summaryLines)
                return resolve();

            _self.encoder.logger.info('Encode summary:');
            _.each(summaryLines, function(line) {
                _self.encoder.logger.info(line);
            });
            resolve();
        });
    }

    start() {
        if (this.running)
            return new Error('ALREADYRUNNING');

        if (this.paused) {
            return this.resume();
        }

        this.startTime = new Date();
        this.encoder.logger.verbose('Encoding started at', colors.yellow(helpers.formatLongTimestamp(this.startTime)));
        this.running = true;

        let _self = this;
        this.promiseChain = Promise.reduce(this.stages, function(stageNum, stage) {
            _self.currentStageNum = _self.currentStageNum + 1;
            _self.currentStage = _self.stages[_self.currentStageNum];

            _self.encoder.logger.verbose('Running stage:', stage.name);
            _self.events.emit('stage', stage.name);

            return stage.promise.call(_self).tap(Pauser.waitFor(_self.pauser));

        }, this.currentStageNum).then(function() {
            _self.finishedAt = new Date();
            _self.status = 'finished';
            _self.events.emit('finished', _self);
            _self.stop();

        }, function(err) {
            if (err && err.message === 'PROBECOMPLETE') {
                _self.finishedAt = new Date();
                _self.status = 'finished';
                _self.events.emit('finished', _self);
                _self.stop();
                return;
            }

            if (err && err.message === 'EXPLAINCOMPLETE') {
                _self.finishedAt = new Date();
                _self.status = 'finished';
                _self.events.emit('finished', _self);
                _self.stop();
                return;
            }

            if (err && err.message === 'CROPPREVIEWCOMPLETE') {
                _self.finishedAt = new Date();
                _self.status = 'finished';
                _self.events.emit('finished', _self);
                _self.stop();
                return;
            }

            if (err && err.message === 'DRYRUNCOMPLETE') {
                _self.finishedAt = new Date();
                _self.status = 'finished';
                _self.encoder.logger.info('Dry run finished without running the encode stage.', {
                    __divider: true
                });
                _self.events.emit('finished', _self);
                _self.stop();
                return;
            }

            _self.error = err;
            _self.events.emit('failed', _self);
            _self.stop();

        });

        this.events.emit('running');
    }

    resume() {
        this.paused = false;
        this.running = true;
        this.pauser.unpause();

        // Check if there is command active
        if (this.stages[this.currentStageNum].command) {

            // Resume running command
            this.stages[this.currentStageNum].command.kill('SIGCONT');
        }

        // Special handling for the encode stage
        if (this.stages[this.currentStageNum].name === 'Encode') {
            this.ffmpegCommand.kill('SIGCONT');
        }

        this.encoder.logger.info('Resumed...');
        this.events.emit('resumed');
    }

    pause() {
        this.paused = true;
        this.running = false;
        this.pauser.pause();

        // Check if there is command active
        if (this.stages[this.currentStageNum].command) {

            // Resume running command
            this.stages[this.currentStageNum].command.kill('SIGTSTP');
        }

        // Special handling for the encode stage
        if (this.stages[this.currentStageNum].name === 'Encode') {
            this.ffmpegCommand.kill('SIGTSTP');
        }

        this.encoder.logger.info('Paused...');
        this.events.emit('paused');
    }

    stop() {

        if (!this.running)
            return new Error('NOTRUNNING');

        this.running = false;
        this.paused = false;

        // End encoding
        if (this.ffmpegCommand)
            this.ffmpegCommand.kill();

        this.promiseChain.cancel();

        if (!this.error && this.status !== 'finished') {
            this.status = 'failed';
            this.error = new Error('Stopped prematurely.');
            this.events.emit('failed', this);
        }

        return this.cleanUp();
    }

    cleanUp() {
        let _self = this;
        return new Promise(function(resolve, reject) {
            _.each(_self.temp.files, function(path, i) {
                if (fs.existsSync(path))
                    fs.unlinkSync(path);
            });
            resolve();
        });
    }

    _updatePath(path) {
        this.path = path;

        let pathParsed = Path.parse(this.path);
        this.base = pathParsed.base;
        this.dir = pathParsed.dir;
        this.ext = pathParsed.ext;
        this.name = pathParsed.name;
        this.root = pathParsed.root;
    }

    _updateDestination(path) {
        this.options.destination = path;
        this.output = {
            base: this.name + (this.options.preview ? '-preview' : '') + '.' + this.options.outputFormat,
            dir: this.options.destination,
            sample: this.name + '-sample.' + this.options.outputFormat
        };
        this.output.path = Path.join(this.output.dir, this.output.base);
    }

    static getMetadata(video, ofOutput) {
        return new Promise(function(resolve, reject) {
            let path = ofOutput ? video.output.path : video.path;
            ffmpeg.ffprobe(path, function(err, metadata) {
                if (err) {
                    // video.encoder.logger.error(err.message);
                    // video.encoder.logger.debug('ffprobe error stack:', err.stack);
                    return reject(err);
                }

                // video.encoder.logger.debug('Container data:', {
                if (metadata.format.format_name !== 'srt' && !_.isNumber(metadata.format.duration)) {
                    // video.encoder.logger.alert('Could not retrieve video duration. Computing duration...');
                    video.stages[video.currentStageNum].command = video._applyInputErrorDetection(new ffmpeg().input(video.path).outputOptions('-f', 'null').output('-')).on('start', function() {
                        if (video.paused)
                            video.pause();
                    }).on('end', function(stdout, stderr) {
                        delete video.stages[video.currentStageNum].command;
                        let lines = stderr.split('\n');
                        let lastTime = lines[lines.length - 3];
                        let duration = lastTime.match(new RegExp('time=(([0-9]|\:|\.)+) bitrate'))[1];

                        if (duration.indexOf('.') <= duration.length - 3) {
                            duration += '000';
                        }

                        metadata.format.duration = helpers.parseTimemarkSeconds(duration);
                        resolve(metadata);
                    }).run();
                } else {
                    resolve(metadata);
                }
            });
        });
    }

    static takeScreenshots(path, destination, logger, videoFilters) {
        return new Promise(function(resolve, reject) {
            let outputDir = Path.join(destination);
            let capturedFilenames = [];
            let screenshotCount = 6;

            function runScreenshot(timestamp, outputPath) {
                return new Promise(function(resolve, reject) {
                    let args = [
                        '-hide_banner',
                        '-loglevel', 'error',
                        '-y',
                        '-ss', timestamp.toFixed(3),
                        '-i', path,
                        '-frames:v', '1'
                    ];

                    if (videoFilters) {
                        args.push('-vf', videoFilters);
                    }

                    args.push(outputPath);

                    let child = spawn('ffmpeg', args, {
                        stdio: ['ignore', 'pipe', 'pipe']
                    });
                    let stderr = '';

                    child.stderr.on('data', function(data) {
                        stderr += data.toString();
                    });

                    child.on('error', reject);
                    child.on('close', function(code) {
                        if (code !== 0) {
                            return reject(new Error('ffmpeg screenshot generation failed with code ' + code + (stderr ? ': ' + stderr.trim() : '')));
                        }

                        resolve();
                    });
                });
            }

            ensureDir(outputDir, function(err) {
                if (err) {
                    return reject(err);
                }

                ffmpeg.ffprobe(path, function(probeErr, metadata) {
                    if (probeErr) {
                        return reject(probeErr);
                    }

                    let duration = metadata && metadata.format ? Number(metadata.format.duration) : NaN;
                    if (!Number.isFinite(duration) || duration <= 0) {
                        return reject(new Error('Could not determine screenshot source duration.'));
                    }

                    let timestamps = _.times(screenshotCount, function(index) {
                        return (duration * (index + 1)) / (screenshotCount + 1);
                    });

                    if (timestamps.length < screenshotCount) {
                        logger.alert('Only generating', colors.yellow(timestamps.length), 'screenshots.');
                    }

                    Promise.each(timestamps, function(timestamp, index) {
                        let filename = Path.basename(path, Path.extname(path)) + '-' + (index + 1) + '.png';
                        capturedFilenames.push(filename);
                        return runScreenshot(timestamp, Path.join(outputDir, filename));
                    }).then(function() {
                        resolve({
                            outputDir: outputDir,
                            filenames: capturedFilenames
                        });
                    }, reject);
                });
            });

        });
    }
}

Video.parseLoudnormSummaries = parseLoudnormSummaries;
Video.extractCropFromStderr = extractCropFromStderr;
Video.aggregateCropDetections = aggregateCropDetections;
Video.buildCropDecisionReport = buildCropDecisionReport;
Video.buildCropPreviewReport = buildCropPreviewReport;
Video.buildExplainReport = buildExplainReport;
Video.parseFrameRate = parseFrameRate;
Video.getFrameRate = getFrameRate;
Video.getFrameRateInfo = getFrameRateInfo;
Video.estimateEtaSeconds = estimateEtaSeconds;
Video.getCropProfile = getCropProfile;
Video.buildCropDetectFilter = buildCropDetectFilter;
Video.buildEncodeSummary = buildEncodeSummary;
Video.buildSourceHealthReport = buildSourceHealthReport;
Video.getProgressPercent = getProgressPercent;
Video.formatProgressFrames = formatProgressFrames;
Video.formatProgressFramesLabel = formatProgressFramesLabel;
Video.formatFfmpegCommandLine = formatFfmpegCommandLine;

module.exports = Video;
