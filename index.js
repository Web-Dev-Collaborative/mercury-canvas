import $ from './js/jQuery';
window.$ = window.jQuery = window.jquery = $;
import 'normalize.css';
import './scss/common.scss';
import 'font-awesome/css/font-awesome.min.css';
import _ from 'lodash';

import {topbarTools} from './js/tools.js';
var MWorker = window.MWorker = require('worker!./js/worker.js');
import {coords} from './js/helpers.js';
import Layer from './js/layer.js';
import Toolbar from './js/toolbar.js';

class MercuryWorker {
    constructor() {
        this.worker = new MWorker();

        this.worker.onmessage = this.receive.bind(this);
        this.worker.onerror = (a) => console.log('Worker Error:', a);
        this.queue = {
            init: {
                cb: (a) => console.log(a)
            }
        };

        this.receive = this.receive.bind(this);
    }
    send(data) {
        var msg = {
            which: data.which,
            id: data.id,
            data: data.data
        };

        this.worker.postMessage(msg);
    }
    receive(e) {
        if (!e || !e.data) return false;

        var data = e.data;
        if (!_.isObject(data)) return false;
        if (_.isString(data.event) && _.isString(data.id)) {
            if (data.event == 'finish') return delete this.queue[data.id];
            if (data.event == 'progress') return this.queue[data.id].progress(data.progress);
            if (data.event == 'data') return this.queue[data.id].cb(data.data);
        }
    }
    action(data) {
        data = _.merge({
            which: 'active',
            data: { test: true },
            progress: (p) => console.log('Worker progress:', p),
            cb: (data) => console.log(data)
        }, data);

        data.id = _.uniqueId('act_');
        this.queue[data.id] = data;
        this.send(data);
    }
}

class Session {
    constructor(e) {
        _.extend(this, {
            width: 0,
            height: 0,
            mouse: {
                points: []
            },
            selectedLayers: {
                list: []
            },
            mercuryCanvas: null,
            operations: [],
            operationIndex: 0,
            zIndex: 1
        }, e);
    }
    undo() {
        this.operationIndex--;

        if (!this.updateToolbars()) return false;

        var operation = this.operations[this.operationIndex];
        if (_.isFunction(operation.tool.undo)) {
            operation.tool.undo(operation);
        }
    }
    redo() {
        this.operationIndex++;

        if (!this.updateToolbars()) return false;

        var operation = this.operations[this.operationIndex - 1];
        if (_.isFunction(operation.tool.redo)) {
            operation.tool.redo(operation);
        }
    }
    updateToolbars() {
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
        this.updateToolbars();
    }
    clearOrphanOperations() {
        var removed = this.operations.splice(this.operationIndex);
        _.forIn(removed, (operation) => {
            if (!_.isFunction(operation.tool.operationRemove)) return;
            operation.tool.operationRemove(operation);
        });
    }
    toggleButton(e) {
        var mc = this.mercuryCanvas;
        _.forIn(mc.state.toolbars, (toolbar) => {
            toolbar.toggleTool(e);
        });
    }
}

class MercuryCanvas {
    constructor(element) {
        this.element = element;
        this.layers = {
            fitToWindow: [],
            list: []
        };
        this.state = {
            background: '#fff',
            strokeColor: '#000',
            lineWidth: 20,
            handlerSize: 18,
            toolbars: [],
            activeTools: []
        };
        this.session = new Session({
            mercuryCanvas: this
        });

        this.workers = [];
        if (typeof window.Worker == 'function') {
            let numberOfWorkers = navigator.hardwareConcurrency > 0 ? navigator.hardwareConcurrency : 1;
            for (let i = 0; i < numberOfWorkers; i++) {
                let worker = new MercuryWorker();
                this.workers.push(worker);
            }
        }

        this.state.toolbars.push(new Toolbar({
            parent: this,
            classes: '',
            fixed: 'left',
            tools: topbarTools
        }));

        this.layersContainer = $('<div>', {
            class: 'layersContainer'
        }).appendTo(this.element);
        $(document.body).on('mousedown', this.mouseDown.bind(this));
        $(document.body).on('mousemove', this.mouseMove.bind(this));
        $(document.body).on('mouseup', this.mouseUp.bind(this));
        $(document.body).on('mouseout', this.mouseLeave.bind(this));

        this.base = new Layer({
            name: 'base',
            removable: false,
            parent: this,
            options: {
                background: this.state.background
            }
        });
        this.overlay = new Layer({
            name: 'overlay',
            parent: this,
            removable: false
        });
        this.layers.fitToWindow.push(this.base, this.overlay);

        // new Layer({
        //     parent: this,
        //     imageData: {
        //         'data': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJIAAAApCAYAAADednA4AAADV0lEQVR4nO2cL0wbURzHP6KiAoFAICaa0CUkQ0wgEAjERMUEYgJRgWDJlkwsC4IsE00mJhCICcRExZKxBIFAIBDNFAKBQCAmTrCkyRAVFYiKTXzvwtFQ2l7vz7ve75t8DLR37959+37v/e73DkwmkylGlYB14DvgAV0fz//buv8Zk2mgFoEz4N8QzvzPmkz3VAK2gVuGmyjg1v+OyQRAGdhldAP1Y2YquMrAe6BNdBMFI5OFuQIqLgOFucAm4IVREgYKU0/vUkxZaB5oADckY6CAg5Sux5SyVtDNHWclNgneKI1aBb6iWOj5XABNLEHlkp6gVdQl6ZgnTPexhlWBwxEO0kbxtzxRN5iiaA7YAlqkb54wvUEN3PH/Oc7BzFDpqAxsAEekF7oihbZXEx7UDBW/ZtHK6ACFkayN089xf4MXY2xoG/jkd4JpfC2iOc8p40eHtLmX4S4BVwmcpAvsocmgabBmgJfAPgoVWZtjVHpAJXwhtRROeIBWehb21Pkb3K2IszZEVJr9F/YtxZN30YpwG6UXZob3e65VApbR3PGQ5DLMadOmbzQCOM+wQT00nLeQwxvAJholn6MMbR40j34YdeAzKgY7w53VVdwmevCBredA44bh+TfmCM0lGshwmyhMrPksoV9KhegJ0+D71dBxa6HzvUNzvyOUBJxGs4xtIsiHkYzsafJAOAsri9S6kR+u0Yg8VPsONNZwjw5aFI280n7hQKMNd+igOWikhPKJAxdg5NhAgZZwPx1vJMMNMRgorEl2FRj5wyPBh+xbFCsvUkROUe4t8cLEZSy3NG1co4x7hZQ1i+JmZ8wGG+5wg56jruGAzFD54pa7lz44WWnxFPhIvsseppW/wE/gNbAw6Aa6pgXgA/CL7DuwyPwBfgBvgWeP3jHHFbxPZ5TXoRjx0EEFgnWmtI5rBZVUWEIzfs7RamuVAu0jDPZa5aFo3UV6yDh7KM+Tl6K+RBWY6gRb8Q2ig0byHbREn8pwFbeqaN/cLjLXb7K/kWmPNpcor7OJvVsoVpVQh9ZQ+eouyoG0kNFc3BA4bIS5QEX+X4A3qESnElN/mSbQDHe103VUaNVA84imzzEyXwvtz/N8os7TvBCtEM0QDbQJdAMtNuYSuXqTqUj6D3etR2USRDYRAAAAAElFTkSuQmCC',
        //         'width': 146,
        //         'height': 41
        //     }
        // });

        this.resize = this.resize.bind(this);
        $(window).on('resize', _.throttle(this.resize, 33));
        this.resize();
    }
    mouseDown(e) {
        var mouseCoords = new coords({
            x: e.clientX,
            y: e.clientY
        });
        if (!mouseCoords.inside(this.layersContainer.coords)) return;
        this.session.mouse.down = true;
        _.forIn(this.state.activeTools, (tool) => {
            tool.mouseDown(e);
        });
    }
    mouseMove(e) {
        _.forIn(this.state.activeTools, (tool) => {
            if (typeof tool.mouseMove == 'function') tool.mouseMove(e);
            if (typeof tool.draw == 'function') requestAnimationFrame(tool.draw.bind(tool, e));
        });
    }
    mouseUp(e) {
        this.session.mouse.down = false;
        _.forIn(this.state.activeTools, (tool) => {
            tool.mouseUp(e);
        });
    }
    mouseLeave(e) {
        _.forIn(this.state.activeTools, (tool) => {
            tool.mouseLeave(e);
        });
    }
    resize() {
        let width = document.body.clientWidth;
        let height = document.body.clientHeight;

        if (width == this.session.width && height == this.session.height) return;

        var layersOrigin = new coords({
            x: 0,
            y: 0,
            width: width,
            height: height
        });
        _.forIn(this.state.toolbars, (toolbar) => {
            if (!toolbar.fixed) return;

            if (toolbar.fixed == 'top') layersOrigin.y += toolbar.element.outerHeight();
            if (toolbar.fixed == 'bottom') layersOrigin.height -= toolbar.element.outerHeight();
            if (toolbar.fixed == 'left') layersOrigin.x += toolbar.element.outerWidth();
            if (toolbar.fixed == 'right') layersOrigin.width -= toolbar.element.outerWidth();
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
        _.forIn(this.state.toolbars, (toolbar) => toolbar.resize({
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
