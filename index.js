import 'expose?$!expose?jQuery!jquery';
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
        var tool = document.createElement('div');
        tool.className = 'tool ' + options.name;
        var icon = document.createElement('i');
        icon.className = 'fa fa-fw ' + options.iconClass;
        tool.appendChild(icon);

        options.toolbar.appendChild(tool);
        return {
            name: options.name
        };
    }
}

class Toolbar {
    constructor(options) {
        var toolbar = document.createElement('div');
        toolbar.className = 'toolbar ' + options.classes;
        options.parent.appendChild(toolbar);
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
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'layer';
        options.parent.appendChild(this.canvas);
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
        this.layersContainer = document.createElement('div');
        this.layersContainer.className = 'layersContainer';
        this.parent.appendChild(this.layersContainer);

        this.base = new Layer({
            parent: this.layersContainer
        });
        this.resize = this.resize.bind(this);
        window.addEventListener('resize', _.throttle(this.resize, 33));
        this.resize();
    }
    resize () {
        var layersOrigin = new coords({
            x: 0,
            y: 0,
            width: document.body.clientWidth,
            height: document.body.clientHeight
        });
        _.forIn(this.toolbars, (toolbar) => {
            if (!toolbar.fixed) return;

            if (toolbar.fixed == 'top')  layersOrigin.y += toolbar.element.offsetHeight;
            if (toolbar.fixed == 'bottom') layersOrigin.height -= toolbar.element.offsetHeight;
            if (toolbar.fixed == 'left') layersOrigin.x += toolbar.element.offsetwidth;
            if (toolbar.fixed == 'right') layersOrigin.width -= toolbar.element.offsetwidth;
        });
        layersOrigin.width -= layersOrigin.x;
        layersOrigin.height -= layersOrigin.y;

        this.layersContainer.style.left = layersOrigin.x + 'px';
        this.layersContainer.style.top = layersOrigin.y + 'px';
        this.layersContainer.style.width = layersOrigin.width + 'px';
        this.layersContainer.style.height = layersOrigin.height + 'px';
    }
}

window.mercuryCanvas = new Canvas(document.getElementById('wrapper'));