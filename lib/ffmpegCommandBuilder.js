function createOutput() {
    return {
        target: null,
        outputOptions: [],
        videoFilters: [],
        audioFilters: [],
        videoCodec: null,
        audioCodec: null,
        format: null,
        noAudio: false,
        audioChannels: null
    };
}

function flattenArgs(target, args) {
    for (let i = 0; i < args.length; i++) {
        target.push(args[i]);
    }
}

function FfmpegCommandBuilder(inputPath) {
    this.ffmpegProc = null;
    this._inputs = [];
    this._outputs = [createOutput()];
    this._currentInput = null;
    this._currentOutput = this._outputs[0];
    this._renice = null;

    if (typeof inputPath !== 'undefined' && inputPath !== null)
        this.input(inputPath);
}

FfmpegCommandBuilder.prototype._ensureInput = function() {
    if (!this._currentInput)
        this.input(null);
    return this._currentInput;
};

FfmpegCommandBuilder.prototype._ensureOutput = function() {
    if (!this._currentOutput) {
        this._currentOutput = createOutput();
        this._outputs.push(this._currentOutput);
    }

    return this._currentOutput;
};

FfmpegCommandBuilder.prototype.input = function(path) {
    let input = {
        path: path,
        inputOptions: []
    };

    this._inputs.push(input);
    this._currentInput = input;
    return this;
};

FfmpegCommandBuilder.prototype.inputOptions = function() {
    let input = this._ensureInput();
    flattenArgs(input.inputOptions, arguments);
    return this;
};

FfmpegCommandBuilder.prototype.seekInput = function(value) {
    return this.inputOptions('-ss', String(value));
};

FfmpegCommandBuilder.prototype.duration = function(value) {
    return this.inputOptions('-t', String(value));
};

FfmpegCommandBuilder.prototype.renice = function(value) {
    this._renice = value;
    return this;
};

FfmpegCommandBuilder.prototype.videoCodec = function(value) {
    this._ensureOutput().videoCodec = value;
    return this;
};

FfmpegCommandBuilder.prototype.audioCodec = function(value) {
    this._ensureOutput().audioCodec = value;
    return this;
};

FfmpegCommandBuilder.prototype.videoFilters = function(value) {
    if (typeof value === 'undefined' || value === null)
        return this;

    let output = this._ensureOutput();
    flattenArgs(output.videoFilters, [value]);
    return this;
};

FfmpegCommandBuilder.prototype.audioFilters = function(value) {
    if (typeof value === 'undefined' || value === null)
        return this;

    let output = this._ensureOutput();
    flattenArgs(output.audioFilters, [value]);
    return this;
};

FfmpegCommandBuilder.prototype.audioChannels = function(value) {
    this._ensureOutput().audioChannels = value;
    return this;
};

FfmpegCommandBuilder.prototype.noAudio = function() {
    this._ensureOutput().noAudio = true;
    return this;
};

FfmpegCommandBuilder.prototype.format = function(value) {
    this._ensureOutput().format = value;
    return this;
};

FfmpegCommandBuilder.prototype.outputOptions = function() {
    let output = this._ensureOutput();
    flattenArgs(output.outputOptions, arguments);
    return this;
};

FfmpegCommandBuilder.prototype.output = function(target) {
    let output = this._ensureOutput();

    if (output.target === null || typeof output.target === 'undefined') {
        output.target = target;
    } else {
        output = createOutput();
        output.target = target;
        this._outputs.push(output);
        this._currentOutput = output;
    }

    return this;
};

FfmpegCommandBuilder.prototype._getArguments = function() {
    let args = [];

    for (let i = 0; i < this._inputs.length; i++) {
        let input = this._inputs[i];
        flattenArgs(args, input.inputOptions);
        if (input.path !== null && typeof input.path !== 'undefined')
            flattenArgs(args, ['-i', input.path]);
    }

    for (let i = 0; i < this._outputs.length; i++) {
        let output = this._outputs[i];

        flattenArgs(args, output.outputOptions);

        if (output.videoCodec !== null)
            flattenArgs(args, ['-c:v', output.videoCodec]);

        if (output.audioCodec !== null)
            flattenArgs(args, ['-c:a', output.audioCodec]);

        if (output.noAudio)
            flattenArgs(args, ['-an']);

        if (output.audioChannels !== null)
            flattenArgs(args, ['-ac', String(output.audioChannels)]);

        if (output.videoFilters.length)
            flattenArgs(args, ['-vf', output.videoFilters.join(',')]);

        if (output.audioFilters.length)
            flattenArgs(args, ['-af', output.audioFilters.join(',')]);

        if (output.format !== null)
            flattenArgs(args, ['-f', output.format]);

        if (output.target !== null && typeof output.target !== 'undefined')
            args.push(output.target);
    }

    return args;
};

FfmpegCommandBuilder.prototype._getFfmpegPath = function(callback) {
    callback(null, 'ffmpeg');
};

FfmpegCommandBuilder.prototype.kill = function(signal) {
    if (this.ffmpegProc && typeof this.ffmpegProc.kill === 'function')
        this.ffmpegProc.kill(signal);
    return this;
};

module.exports = FfmpegCommandBuilder;
