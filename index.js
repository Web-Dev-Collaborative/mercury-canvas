var loggingLevel = 'info';

import 'script!loglevel';
var log = require('loglevel-message-prefix')(window.log, {
    prefixes: ['level'],
    staticPrefixes: ['index'],
    separator: '/'
});
var loggers = ['toolbar.js', 'tools.js', 'layer.js', 'helpers.js', 'worker.js'];
for (var i = 0; i < loggers.length; i++) {
    window.log.getLogger(loggers[i]).setLevel(loggingLevel);
}
window.log.setLevel(loggingLevel);

import $ from './js/jQuery.js';
window.$ = window.jQuery = window.jquery = $;
import 'normalize.css';
import './scss/common.scss';
import 'font-awesome/css/font-awesome.min.css';
import _ from 'lodash';
import EventEmitter from 'eventemitter3';
import Mousetrap from 'mousetrap';

import {topbarTools} from './js/tools.js';
var MWorker = window.MWorker = require('worker!./js/worker.js');
import {coords} from './js/helpers.js';
import Layer from './js/layer.js';
import {Toolbar, LayersPanel} from './js/toolbar.js';

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

class Mouse {
    constructor() {
        this.reset();
    }
    reset() {
        this.points = [];
        this.extremes = {
            x: Infinity,
            y: Infinity,
            x2: 0,
            y2: 0
        };
    }
}

class Session {
    constructor(e) {
        _.extend(this, {
            width: 0,
            height: 0,
            mouse: new Mouse(),
            selectedLayers: {
                list: []
            },
            mercuryCanvas: null,
            keys: {},
            operations: [],
            operationIndex: 0,
            zIndex: 1
        }, e);
    }
    undo() {
        this.operationIndex--;

        if (!this.updateMenus()) return false;

        var operation = this.operations[this.operationIndex];
        if (_.isObject(operation.tool) && _.isFunction(operation.tool.undo)) {
            operation.tool.undo(operation);
        }
        if (_.isString(operation.type)) {
            this.mercuryCanvas.emit('undo.' + operation.type, operation);
        }
    }
    redo() {
        this.operationIndex++;

        if (!this.updateMenus()) return false;

        var operation = this.operations[this.operationIndex - 1];
        if (_.isObject(operation.tool) && _.isFunction(operation.tool.redo)) {
            operation.tool.redo(operation);
        }
        if (_.isString(operation.type)) {
            this.mercuryCanvas.emit('redo.' + operation.type, operation);
        }
    }
    updateMenus() {
        var mc = this.mercuryCanvas;

        if (this.operationIndex == this.operations.length) {
            this.toggleButton({
                name: 'redo',
                state: false
            });
        }
        else if (this.operationIndex > this.operations.length) {
            this.operationIndex = this.operations.length;
            return mc.error({
                module: 'state',
                number: 1
            });
        }
        else {
            this.toggleButton({
                name: 'redo',
                state: true
            });
        }
        if (this.operationIndex == 0) {
            this.toggleButton({
                name: 'undo',
                state: false
            });
        }
        else if (this.operationIndex < 0) {
            this.operationIndex = 0;
            return mc.error({
                type: 'undo',
                number: 0
            });
        }
        else {
            this.toggleButton({
                name: 'undo',
                state: true
            });
        }
        return true;
    }
    addOperation(e) {
        this.clearOrphanOperations();
        this.operations.push(e);
        this.operationIndex++;
        this.updateMenus();
    }
    clearOrphanOperations() {
        var removed = this.operations.splice(this.operationIndex);
        _.forIn(removed, (operation) => {
            if (!_.isObject(operation.tool) || !_.isFunction(operation.tool.operationRemove)) return;
            operation.tool.operationRemove(operation);
        });
    }
    toggleButton(e) {
        var mc = this.mercuryCanvas;
        _.forIn(mc.state.menus, (menu) => {
            if (_.isFunction(menu.toggleTool)) {
                menu.toggleTool(e);
            }
        });
    }
}

class MercuryCanvas {
    constructor(element) {
        _.merge(this, new EventEmitter());
        this.element = element;
        this.layers = {
            fitToWindow: [],
            list: []
        };
        this.state = {
            background: '#fff',
            strokeColor: '#000',
            workers: 1,
            lineWidth: 20,
            handlerSize: 18,
            menus: [],
            activeTools: [],
            snap: {
                menuDistance: 40,
                distance: 20,
                toStartPosition: true,
                toWindowMargin: true,
                toLayer: false
            }
        };
        this.session = new Session({
            mercuryCanvas: this
        });

        this.workerMaster = new WorkerMaster(this);

        this.state.menus.push(new Toolbar({
            parent: this,
            classes: '',
            fixed: false,
            tools: topbarTools
        }));
        this.state.menus.push(new LayersPanel({
            parent: this,
            classes: '',
            fixed: 'right'
        }));

        this.layersContainer = $('<div>', {
            class: 'layersContainer'
        }).appendTo(this.element);

        this.base = new Layer({
            name: 'base',
            parent: this,
            state: {
                removable: false
            },
            options: {
                background: this.state.background
            }
        });
        this.overlay = new Layer({
            name: 'overlay',
            parent: this,
            state: {
                removable: false
            }
        });
        this.layers.fitToWindow.push(this.base, this.overlay);

        this.resize = this.resize.bind(this);
        $(window).on('resize', _.throttle(this.resize, 33));
        this.resize();

        var keycodes = {
            16: 'shift',
            17: 'ctrl',
            18: 'alt'
        };
        var keys = function (e) {
            return _.isUndefined(keycodes[e]) ? false : keycodes[e];
        };
        $(document.body).on({
            'keydown': e => {
                var key = keys(e.which);
                if (key === false || this.session.keys[key]) return;
                this.session.keys[key] = true;
                this.emit('key.down');
            },
            'keyup': e => {
                var key = keys(e.which);
                if (key === false || !this.session.keys[key]) return;
                this.session.keys[key] = false;
                this.emit('key.up');
            },
            'mouseout': e => {
                _.forIn(this.state.activeTools, (tool) => {
                    tool.mouseLeave(e);
                });
                this.emit('mouseout', e);
            },
            'mousedown': e => {
                this.mouseDown(e);
                this.emit('mousedown', e);
            },
            'mousemove': e => {
                _.forIn(this.state.activeTools, (tool) => {
                    if (typeof tool.mouseMove == 'function') tool.mouseMove(e);
                    if (typeof tool.draw == 'function') requestAnimationFrame(tool.draw.bind(tool, e));
                });
                this.emit('mousemove', e);
            },
            'mouseup': e => {
                e.stopPropagation();
                this.mouseUp(e);
                this.emit('mouseup', e);
            },
            'touchstart': e => {
                this.mouseDown(e.originalEvent.touches[0]);
                this.emit('touchstart', e);
            },
            'touchend': e => {
                this.mouseUp(e);
                this.emit('touchend', e);
            },
            'touchmove': e => {
                _.forIn(this.state.activeTools, (tool) => {
                    if (_.isFunction(tool.touchMove)) tool.touchMove(e);
                    else if (_.isFunction(tool.mouseMove)) tool.mouseMove(e.originalEvent.touches[0]);
                    if (typeof tool.draw == 'function') requestAnimationFrame(tool.draw.bind(tool, e.originalEvent.touches[0]));
                });
                this.emit('touchmove', e);
            },
            'touchcancel': e => {
                this.mouseUp(e);
                this.emit('touchcancel', e);
            }
        });

        var self = this;
        if (localStorage.getItem('layer')) {
            var temp = JSON.parse(localStorage.getItem('layer'));
            var img = $('<img>', {
                src: temp.imageData
            });
            img.on('load', () => {
                for (var i = 0; i < 1; i++) {
                    new Layer({
                        image: img[0],
                        parent: self,
                        name: temp.name + ' ' + i
                    });
                }
            });
        }

        this.on('layer.new', (layer) => {
            this.layers.list.push(layer);

            this.session.zIndex++;
            this.overlay.coords.z = this.session.zIndex;
            this.overlay.element.css('zIndex', this.session.zIndex);
            this.session.zIndex = this.session.zIndex;
        });
    }
    addShortcut(shortcuts, callback) {
        var temp;
        if (_.isArray(shortcuts)) {
            temp = [];
            _.each(shortcuts, (shortcut, index) => {
                temp[index] = shortcut.replace(/ \+ /ig, '+');
            });
        }
        if (_.isString(shortcuts) && shortcuts.length) {
            temp = shortcuts.replace(/ \+ /ig, '+');
        }
        if (!temp) return;
        Mousetrap.bind(temp, callback);
    }
    mouseDown(e) {
        var mouseCoords = new coords({
            x: e.clientX,
            y: e.clientY
        });
        var ok = true;
        _.each(this.state.menus, (menu) => {
            if (mouseCoords.inside(menu.coords)) {
                ok = false;
                return false;
            }
        });
        if (!mouseCoords.inside(this.layersContainer.coords) || !ok) return;
        this.session.mouse.down = true;
        _.forIn(this.state.activeTools, (tool) => {
            tool.mouseDown(e);
        });
    }
    mouseUp(e) {
        this.session.mouse.down = false;
        _.forIn(this.state.activeTools, (tool) => {
            tool.mouseUp(e);
        });
    }
    resize(forced) {
        let width = document.body.clientWidth;
        let height = document.body.clientHeight;

        if (!forced && width == this.session.width && height == this.session.height) return;

        var layersOrigin = new coords({
            x: 0,
            y: 0,
            width: width,
            height: height
        });
        _.forIn(this.state.menus, (menu) => {
            if (!menu.fixed) return;

            if (menu.fixed == 'top') layersOrigin.y += menu.element.outerHeight();
            if (menu.fixed == 'bottom') layersOrigin.height -= menu.element.outerHeight();
            if (menu.fixed == 'left') layersOrigin.x += menu.element.outerWidth();
            if (menu.fixed == 'right') layersOrigin.width -= menu.element.outerWidth();
        });
        layersOrigin.width -= layersOrigin.x;
        layersOrigin.height -= layersOrigin.y;

        this.layersContainer.coords = layersOrigin;
        this.layersContainer.css({
            left: layersOrigin.x,
            top: layersOrigin.y,
            width: layersOrigin.width,
            height: layersOrigin.height
        });

        _.forIn(this.layers.fitToWindow, (layer) => layer.resize({
            width: layersOrigin.width,
            height: layersOrigin.height
        }));
        _.forIn(this.state.menus, (menu) => menu.resize({
            width: width,
            height: height,
            topHeight: layersOrigin.y,
            menuHeight: height - layersOrigin.height
        }));

        this.session.width = width;
        this.session.height = height;
    }
    saveState() {
        var layer = this.layers.list[0];
        localStorage.setItem('layer', layer.context.getImageData(0, 0, layer.width, layer.height));
    }
    error(e) {
        console.error(e);
        return false;
    }
}

window.mercuryCanvas = window.MercuryCanvas = window.mc = new MercuryCanvas($('#wrapper'));
