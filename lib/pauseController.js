function createPauseController() {
    return {
        paused: false,
        waiters: []
    };
}

function pause(controller) {
    controller.paused = true;
}

function unpause(controller) {
    controller.paused = false;

    if (!controller.waiters.length)
        return;

    controller.waiters.splice(0).forEach(function(resolve) {
        resolve();
    });
}

function waitFor(controller) {
    if (!controller.paused)
        return global.Promise.resolve();

    return new global.Promise(function(resolve) {
        controller.waiters.push(resolve);
    });
}

module.exports = {
    createPauseController: createPauseController,
    pause: pause,
    unpause: unpause,
    waitFor: waitFor
};
