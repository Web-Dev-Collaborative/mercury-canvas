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

        this.receive = this.receive.bind(this);
        this.processQueue();
    }
    send(data) {
        this.worker.postMessage({
            type: data.type,
            id: data.id,
            data: data.data
        });
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

                delete this.queue[data.id];
                this.processQueue();
            }
            if (data.event == 'log') log.info('Worker log', data.data);
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
    addAction(task) {
        task.type = _.isString(task.type) ? task.type : '';
        task.originalProgress = _.isFunction(task.progress) ? task.progress : () => { };
        task.finish = _.isFunction(task.finish) ? task.finish : () => { };

        task.progress = (data) => {
            console.log('progress');
            var res = this.results[task.id];
            var que = this.queue[task.id];

            res.push(data.data);

            if (_.isFunction(task.originalProgress)) task.originalProgress(data);

            if (res.length == que.parts.length) {
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
                console.log(temp);
                if (_.isFunction(task.finish)) task.finish(temp);
            }
        };

        task.id = _.uniqueId('action_');
        this.queue[task.id] = task;
        this.results[task.id] = [];
        this.splitToWorkers(task);
    }
    splitToWorkers(data) {
        if (data.type == 'trim') {
            data.parts = [];
            var pixels = data.data.data;
            var length = data.data.data.length;

            var last = 0;
            for (var i = 0; i < this.workers.length; i++) {
                var temp = {
                    width: data.data.width,
                    data: pixels.slice(length / this.workers.length * i, length / this.workers.length * (i + 1)),
                };
                temp.startIndex = last;
                last += temp.data.length;
                data.parts.push(temp);
            }
        }
        _.each(data.parts, (part, index) => {
            this.workers[index % this.workers.length].addAction({
                type: 'trim',
                taskID: data.id,
                data: data.parts[index],
                progress: data.progress,
                finish: data.finish
            });
        });
    }
}
export default WorkerMaster;