import $ from './js/jQuery';
window.$ = window.jQuery = window.jquery = $;
import 'normalize.css';
import './scss/common.scss';
import 'font-awesome/css/font-awesome.min.css';
// import async from 'async';
import _ from 'lodash';
import classnames from 'classnames';

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
    constructor(options, toolbar) {
        _.merge(this, {
            end: false,
            disabled: false,
            name: '',
            icon: ''
        }, options);
        this.toolbar = toolbar;
        this.icon = this.icon.length > 0 ? this.icon : (options.icon ? options.icon : 'fa-' + options.name);

        this.element = $('<div>', {
            class: classnames('tool', this.name, {
                end: this.end,
                disabled: this.disabled
            }),
            html: $('<div>', {
                class: classnames('fa', 'fa-fw', this.icon)
            })
        }).appendTo(this.toolbar);

        this.onClick = this.onClick.bind(this);
        this.element.on('click', this.onClick);
    }
    onClick(e) {
        if (this.disabled) return;

        console.log(e, this);
    }
    remove() {
        this.element.remove();
    }
}

class Toolbar {
    constructor(options) {
        _.merge(this, {
            classes: '',
            fixed: false,
            orientation: {
                horizontal: false,
                vertical: false
            },
            tools: []
        }, options);

        if (this.fixed.length > 0 && !this.orientation.horizontal && !this.orientation.vertical) {
            this.orientation.horizontal = this.fixed == 'top' || this.fixed == 'bottom';
            this.orientation.vertical = this.fixed == 'left' || this.fixed == 'right';
        }

        var toolbar = $('<div>', {
            class: classnames('toolbar', {
                'horizontal': this.orientation.horizontal,
                'vertical': this.orientation.vertical
            }, this.classes, this.fixed)
        }).appendTo(this.parent);

        this.element = toolbar;
        this.tools = [];

        if (options.tools && options.tools.length > 0) {
            this.addTools(options.tools);
        }
    }
    resize(options) {
        if (this.fixed.length > 0) {
            if (this.orientation.horizontal) {
                this.element.css({
                    width: options.width
                });
            }
            else {
                this.element.css({
                    top: options.topHeight,
                    height: options.height - options.menuHeight
                });
            }
        }
        else {
            // dragable menu, make sure it stays on screen
        }
    }
    addTools(tools) {
        if (typeof tools != 'object' || tools.length === undefined) {
            tools = [tools];
        }
        _.forIn(tools, (tool) => {
            this.tools.push(new Tool(tool, this.element));
        });
    }
    removeTools(tools) {
        if (typeof tools == 'boolean') {
            tools = this.tools;
        }
        else if (typeof tools != 'object' || tools.length === undefined) {
            tools = [tools];
        }

        _.forIn(tools, (tool) => {
            var removedTools = _.remove(this.tools, {
                name: typeof tool == 'object' ? tool.name : tool
            });
            _.forIn(removedTools, (removedTool) => {
                removedTool.remove();
            });
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
        if (!e.data) return;
        if (e.data.ready == true) return console.log('worker ready');
        console.log('worker message', e.data);
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
            class: classnames('layer', this.name)
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
            classes: '',
            fixed: 'top',
            tools: topbarTools
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
            width: layersOrigin.width,
            height: layersOrigin.height
        }));
        _.forIn(this.toolbars, (toolbar) => toolbar.resize({
            width: width,
            height: height,
            topHeight: layersOrigin.y,
            menuHeight: height - layersOrigin.height
        }));

        this.state.width = width;
        this.state.height = height;
    }
}

window.mercuryCanvas = window.MercuryCanvas = window.mc = new MercuryCanvas($('#wrapper'));