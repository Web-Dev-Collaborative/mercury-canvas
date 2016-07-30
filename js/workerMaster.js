var log = require('loglevel-message-prefix')(window.log.getLogger('workerMaster.js'), {
    prefixes: ['level'],
    staticPrefixes: ['workerMaster.js'],
    separator: '/'
});
import _ from 'lodash';
var MWorker = window.MWorker = require('worker!./worker.js');

class MercuryWorker {
    constructor() {
        this.worker = new MWorker();

        this.worker.onmessage = this.receive.bind(this);
        this.worker.onerror = e => log.error('Worker Error:', e);
        this.queue = {};
        this.addAction({
            id: 'init',
            type: 'active'
        });
        this.done = true;
        this.id = _.uniqueId('worker_');

        this.receive = this.receive.bind(this);
        this.processQueue();
    }
    send(data, buffer) {
        if (buffer) {
            this.worker.postMessage({
                type: data.type,
                data: data.data,
                id: data.id
            }, [buffer]);
        }
        else {
            this.worker.postMessage({
                type: data.type,
                data: data.data,
                id: data.id
            });
        }
        this.done = false;
    }
    receive(e) {
        if (!e || !e.data || !_.isObject(e.data)) return false;
        var data = e.data;

        if (_.isString(data.event) && _.isString(data.id)) {
            if (data.event == 'progress') {
                this.done = true;

                if (data.id == 'init') {
                    log.info('Worker ready');
                }
                else {
                    this.queue[data.id].progress(data);
                }

                if (data.done) {
                    delete this.queue[data.id];
                    this.processQueue();
                }
            }
            if (data.event == 'log') log.info(this.id + ':', data.data);
        }
    }
    addAction(data) {
        data.type = _.isString(data.type) ? data.type : '';
        data.priority = _.isNumber(data.priority) ? data.priority : 0;
        data.progress = _.isFunction(data.progress) ? data.progress : () => { };
        data.id = _.isString(data.id) ? data.id : _.uniqueId('actionPart_');

        this.queue[data.id] = data;
        this.processQueue();
    }
    processQueue() {
        if (!this.done) return;

        var max = 0, data;
        _.forIn(this.queue, (task) => {
            max = Math.max(task.priority, max);
            if (max == task.priority) data = task;
        });
        if (data) {
            this.send(data);
        }
    }
}
class WorkerMaster {
    constructor(mc) {
        this.mercuryCanvas = mc;
        this.workers = [];
        this.queue = {};
        this.results = {};

        if (typeof window.Worker == 'function') {
            let numberOfWorkers = navigator.hardwareConcurrency > 0 ? navigator.hardwareConcurrency : mc.state.workers;
            for (let i = 0; i < numberOfWorkers; i++) {
                let worker = new MercuryWorker();
                this.workers.push(worker);
            }
        }
    }
    progress(task, data) {
        var res = this.results[task.id];

        res.push(data.data);

        if (_.isFunction(task.originalProgress)) task.originalProgress(data);

        if (res.length == this.queue[task.id].parts.length) {
            var temp = {};
            if (task.type == 'trim') {
                var max = {
                    x: 0,
                    y: 0
                };
                var min = {
                    x: Infinity,
                    y: Infinity
                };
                var mc = this.mercuryCanvas;
                var x = mc.layers.list[0].coords.x;
                var y = mc.layers.list[0].coords.y;
                var colors = ['rgba(255, 0, 0, 0.5)', 'rgba(255, 128, 0, 0.8)', 'rgba(0, 255, 0, 0.5)', 'rgba(0, 255, 255, 0.8)', 'rgba(0, 0, 255, 0.5)', 'rgba(255, 0, 255, 0.8)', 'rgba(0, 0, 0, 0.5)', 'rgba(255, 255, 0, 0.8)'];
                var i = 0;
                _.each(res, (part) => {
                    min.x = Math.min(min.x, part.bound.x);
                    min.y = Math.min(min.y, part.bound.y);
                    max.x = Math.max(max.x, part.bound.x2);
                    max.y = Math.max(max.y, part.bound.y2);
                });
                temp = {
                    x: min.x,
                    y: min.y,
                    x2: max.x,
                    y2: max.y
                };
            }
            if (_.isFunction(task.finish)) task.finish(temp);
        }
    }
    addAction(task) {
        task.type = _.isString(task.type) ? task.type : '';
        task.originalProgress = _.isFunction(task.progress) ? task.progress : () => { };
        task.originalFinish = _.isFunction(task.finish) ? task.finish : () => { };
        task.finish = (e) => {
            task.originalFinish(e);
        };

        task.progress = this.progress.bind(this, task);

        task.id = _.uniqueId('action_');
        this.queue[task.id] = task;
        this.results[task.id] = [];
        this.splitToWorkers(task);
    }
    splitToWorkers(task) {
        var pixels = task.data.data;
        var last = 0;
        var workerPart = Math.round(pixels.length / this.workers.length / this.mercuryCanvas.state.workerMultiplier);

        if (task.type == 'trim') {
            task.parts = [];
            for (let i = 0; i < this.workers.length * this.mercuryCanvas.state.workerMultiplier; i++) {
                let buffer = pixels.slice(workerPart * i, workerPart * (i + 1)).buffer;
                let temp = {
                    width: task.data.width,
                    pixels: buffer,
                    startIndex: last
                };
                console.log(temp);
                last += buffer.byteLength;
                task.parts.push(temp);
            }
        }
        else if (task.type == 'kernelConvolution') {
            task.parts = [];
            for (let i = 0; i < this.workers.length * this.mercuryCanvas.state.workerMultiplier; i++) {
                let buffer = pixels.slice(workerPart * i, workerPart * (i + 1)).buffer;
                let temp = {
                    kernel: task.kernel,
                    width: task.data.width,
                    pixels: buffer,
                    progressSpeed: 5,
                    startIndex: last
                };
                last += buffer.byteLength;
                task.parts.push(temp);
            }
        }

        _.each(task.parts, (part, index) => {
            this.workers[index % this.workers.length].addAction({
                type: task.type,
                taskID: task.id,
                data: task.parts[index],
                progress: task.progress,
                finish: task.finish
            });
        });
    }
}
export default WorkerMaster;