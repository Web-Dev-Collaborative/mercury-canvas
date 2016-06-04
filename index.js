import $ from './js/jQuery.js';
window.$ = window.jQuery = window.jquery = $;
import 'normalize.css';
import './scss/common.scss';
import 'font-awesome/css/font-awesome.min.css';
import async from 'async';
import _ from 'lodash';

import {topbarTools} from './js/tools.js';

class coords {
    constructor(options) {
        _.extend(this, {
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
        });

        tool.appendTo(options.toolbar);
        return {
            name: options.name
        };
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
            var tool = new Tool({
                name: options.name,
                toolbar: this.element,
                iconClass: (options.icon ? options.icon : 'fa-' + options.name)
            });
            this.tools.push(tool);
        });
    }
}

class Layer {
    constructor(options) {
        this.name = options.name;
        this.canvas = $('canvas', {
            class: 'layer'
        });
        this.canvas.appendTo(options.parent);
    }
    clear() {

    }
}

class Canvas {
    constructor(element) {
        this.parent = element;
        this.toolbars = [];

        this.toolbars.push(new Toolbar({
            parent: this.parent,
            classes: 'default',
            fixed: 'top'
        }));
        this.layersContainer = $('<div>', {
            class: 'layersContainer'
        }).appendTo(this.parent);

        this.base = new Layer({
            parent: this.layersContainer
        });
        this.resize = this.resize.bind(this);
        $(window).on('resize', _.throttle(this.resize, 33));
        this.resize();
    }
    resize() {
        var layersOrigin = new coords({
            x: 0,
            y: 0,
            width: document.body.clientWidth,
            height: document.body.clientHeight
        });
        _.forIn(this.toolbars, (toolbar) => {
            if (!toolbar.fixed) return;

            if (toolbar.fixed == 'top') layersOrigin.y += toolbar.element.offsetHeight;
            if (toolbar.fixed == 'bottom') layersOrigin.height -= toolbar.element.offsetHeight;
            if (toolbar.fixed == 'left') layersOrigin.x += toolbar.element.offsetwidth;
            if (toolbar.fixed == 'right') layersOrigin.width -= toolbar.element.offsetwidth;
        });
        layersOrigin.width -= layersOrigin.x;
        layersOrigin.height -= layersOrigin.y;

        this.layersContainer.css({
            left: layersOrigin.x,
            top: layersOrigin.y,
            width: layersOrigin.width,
            height: layersOrigin.height
        });
    }
}

window.mercuryCanvas = new Canvas($('#wrapper'));