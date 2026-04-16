function stripAnsi(value) {
    return String(value).replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
}

module.exports = stripAnsi;
