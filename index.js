import $ from './js/jQuery';
window.$ = window.jQuery = window.jquery = $;
import 'normalize.css';
import './scss/common.scss';
import 'font-awesome/css/font-awesome.min.css';
import _ from 'lodash';
import classnames from 'classnames';

import {topbarTools} from './js/tools.js';
import './js/worker';
import {coords} from './js/helpers.js';
import Layer from './js/layer.js';

class Tool {
    constructor(options, parent) {
        _.merge(this, {
            end: false,
            disabled: false,
            action: false,
            selected: false,
            select: () => { },
            mouseDown: () => { },
            mouseMove: () => { },
            mouseUp: () => { },
            mouseLeave: () => { },
            load: () => { },
            name: '',
            icon: ''
        }, options);
        this.parent = parent;
        this.icon = this.icon.length > 0 ? this.icon : (options.icon ? options.icon : 'fa-' + options.name);

        this.mercuryCanvas = this.parent.mercuryCanvas;
        this.element = $('<div>', {
            class: classnames('tool', this.name, {
                end: this.end,
                disabled: this.disabled
            }),
            html: $('<i>', {
                class: classnames('fa', 'fa-fw', this.icon)
            })
        }).appendTo(this.parent.element);

        this.element.on('click', this.onClick.bind(this));

        this.load();
        if (this.selected) this.onClick();
    }
    onClick(e) {
        if (this.disabled) return;

        if (_.isObject(e)) this.select.bind(this)();

        if (this.action) return;
        this.parent.element.children('div').removeClass('selected');
        this.element.addClass('selected');
        this.parent.selectTool(this);
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
        }).appendTo(this.parent.element);

        this.mercuryCanvas = this.parent;
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
            this.tools.push(new Tool(tool, this));
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
    selectTool(e) {
        if (this.lastToolIndex >= 0) {
            this.parent.state.activeTools.splice(this.lastToolIndex, 1);
        }
        this.lastToolIndex = this.parent.state.activeTools.push(e) - 1;
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

class MercuryCanvas {
    constructor(element) {
        this.element = element;
        this.toolbars = [];
        this.layers = {
            fitToWindow: [],
            list: []
        };
        this.state = {
            width: 0,
            height: 0,
            background: '#fff',
            strokeColor: '#000',
            lineWidth: 20,
            mouse: {
                points: []
            },
            activeTools: []
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
        this.state.mouse.down = true;
        _.forIn(this.state.activeTools, (tool) => {
            tool.mouseDown(e);
        });
    }
    mouseMove(e) {
        _.forIn(this.state.activeTools, (tool) => {
            tool.mouseMove(e);
        });
    }
    mouseUp(e) {
        this.state.mouse.down = false;
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
