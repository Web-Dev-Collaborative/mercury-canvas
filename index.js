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
import visible from './js/jquery.visible.js';
visible($);
import 'normalize.css';
import './scss/common.scss';
import 'font-awesome/css/font-awesome.min.css';
import _ from 'lodash';
import EventEmitter from 'eventemitter3';
import Mousetrap from 'mousetrap';

import {topbarTools} from './js/tools.js';
import {coords} from './js/helpers.js';
import Layer from './js/layer.js';
import {Toolbar, LayersPanel, Settings} from './js/toolbar.js';
import WorkerMaster from './js/workerMaster.js';
import State from './js/state.js';
import Session from './js/session.js';

class MercuryCanvas {
    constructor(element) {
        _.merge(this, new EventEmitter());
        this.element = element;
        this.layers = {
            fitToWindow: [],
            list: []
        };
        this.state = new State();
        this.session = new Session({
            mercuryCanvas: this
        });

        this.workerMaster = new WorkerMaster(this);

        this.state.menus.push(new Toolbar({
            parent: this,
            classes: '',
            fixed: 'top',
            tools: topbarTools
        }));
        this.state.menus.push(new LayersPanel({
            parent: this,
            unfixable: true,
            classes: '',
            fixed: 'right'
        }));
        this.state.menus.push(new Settings({
            parent: this,
            classes: '',
            fixed: 'left'
        }));

        $('<div>', {
            class: 'dropText',
            html: 'Drop to load'
        }).appendTo(this.element);

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
                this.session.mouse.lastEvent = e;
                _.forIn(this.state.activeTools, (tool) => {
                    if (typeof tool.mouseMove == 'function') tool.mouseMove(e);
                    if (typeof tool.draw == 'function') requestAnimationFrame(tool.draw.bind(tool, e));
                });
                this.emit('mousemove', e);
            },
            'mouseup': e => {
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
        log.debug('Init complete');
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
