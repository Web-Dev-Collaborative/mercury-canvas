import $ from './js/jQuery';
window.$ = window.jQuery = window.jquery = $;
import 'normalize.css';
import './scss/common.scss';
import 'font-awesome/css/font-awesome.min.css';
// import async from 'async';
import _ from 'lodash';

import {topbarTools} from './js/tools.js';
import './js/worker';

class coords {
    constructor(options) {
        _.merge(this, {
            x: 0,
            y: 0,
            width: 0,
            height: 0
        }, options);
    }
}

class Tool {
    constructor(options) {
        var tool = $('<div>', {
            class: 'tool ' + options.name,
            html: $('<div>', {
                class: 'fa fa-fw ' + options.iconClass
            })
        }).appendTo(options.toolbar);

        return _.merge(options, {
            element: tool
        });
    }
}

class Toolbar {
    constructor(options) {
        var toolbar = $('<div>', {
            class: 'toolbar ' + options.classes
        }).appendTo(options.parent);
        this.parent = options.parent;
        this.element = toolbar;
        this.tools = [];
        this.fixed = options.fixed;
        if (options.classes.indexOf('default') != -1) {
            this.appendTools(topbarTools);
        }
    }
    appendTools(tools) {
        if (tools.length === undefined) {
            tools = [tools];
        }
        _.forIn(tools, (options) => {
            let tool = new Tool({
                name: options.name,
                toolbar: this.element,
                iconClass: (options.icon ? options.icon : 'fa-' + options.name)
            });
            this.tools.push(tool);
        });
    }
}

class MercuryWorker {
    constructor() {
        this.worker = new Worker('./js/worker.js');

        this.send({
            start: true
        });
        this.worker.onmessage = this.receive;
    }
    send(message) {
        this.worker.postMessage(message);
    }
    receive(e) {
        console.log('worker message', e);
    }
}

class Layer {
    constructor(options) {
        _.merge(this, {
            options: {
                background: 'rgba(0, 0, 0, 0)'
            },
            name: ''
        }, options);
        this.element = $('<canvas>', {
            class: 'layer ' + (this.name.length > 0 ? this.name : '')
        }).appendTo(options.parent);
        this.canvas = this.element[0];
        this.context = this.canvas.getContext('2d');
        this.MercuryCanvas.layers.list.push(this);
    }
    resize(options) {
        if (!options || typeof options.width != 'number' || typeof options.height != 'number') return;
        var ctx = this.context;
        this.element.attr({
            width: options.width,
            height: options.height
        });

        if (this.options.background) ctx.fillStyle = this.options.background;
        ctx.rect(0, 0, options.width, options.height);
        ctx.fill();
        ctx.restore();
    }
    clear() {

    }
}

class MercuryCanvas {
    constructor(element) {
        this.parent = element;
        this.toolbars = [];
        this.layers = {
            fitToWindow: [],
            list: []
        };
        this.state = {
            width: 0,
            height: 0,
            background: '#fff'
        };

        this.workers = [];
        if (typeof window.Worker == 'function') {
            let numberOfWorkers = navigator.hardwareConcurrency > 0 ? navigator.hardwareConcurrency : 1;
            for (let i = 0; i < numberOfWorkers; i++) {
                let worker = new MercuryWorker(this);
                this.workers.push(worker);
            }
        }
        this.toolbars.push(new Toolbar({
            parent: this.parent,
            classes: 'default',
            fixed: 'top'
        }));
        this.layersContainer = $('<div>', {
            class: 'layersContainer'
        }).appendTo(this.parent);

        this.base = new Layer({
            name: 'base',
            parent: this.layersContainer,
            MercuryCanvas: this,
            options: {
                background: this.state.background
            }
        });
        this.overlay = new Layer({
            name: 'overlay',
            parent: this.layersContainer,
            MercuryCanvas: this
        });
        this.layers.fitToWindow.push(this.base, this.overlay);

        this.resize = this.resize.bind(this);
        $(window).on('resize', _.throttle(this.resize, 33));
        this.resize();
    }
    resize() {
        let width = document.body.clientWidth;
        let height = document.body.clientHeight;

        if (width == this.state.width && height == this.state.height) return;

        var layersOrigin = new coords({
            x: 0,
            y: 0,
            width: width,
            height: height
        });
        _.forIn(this.toolbars, (toolbar) => {
            if (!toolbar.fixed) return;

            if (toolbar.fixed == 'top') layersOrigin.y += toolbar.element.outerHeight();
            if (toolbar.fixed == 'bottom') layersOrigin.height -= toolbar.element.outerHeight();
            if (toolbar.fixed == 'left') layersOrigin.x += toolbar.element.outerWidth();
            if (toolbar.fixed == 'right') layersOrigin.width -= toolbar.element.outerWidth();
        });
        layersOrigin.width -= layersOrigin.x;
        layersOrigin.height -= layersOrigin.y;

        this.layersContainer.css({
            left: layersOrigin.x,
            top: layersOrigin.y,
            width: layersOrigin.width,
            height: layersOrigin.height
        });

        _.forIn(this.layers.fitToWindow, (layer) => layer.resize({
            width: width,
            height: height
        }))

        this.state.width = width;
        this.state.height = height;
    }
}

window.mercuryCanvas = window.MercuryCanvas = window.mc = new MercuryCanvas($('#wrapper'));