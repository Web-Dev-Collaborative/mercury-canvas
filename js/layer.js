import _ from 'lodash';
import classnames from 'classnames';
import {coords} from './helpers.js';

class Layer {
    constructor(options) {
        _.merge(this, {
            options: {
                background: 'rgba(0, 0, 0, 0)'
            },
            removable: true,
            name: ''
        }, options);

        this.element = $('<canvas>', {
            class: classnames('layer', this.name)
        }).appendTo(this.parent.layersContainer);

        this.coords = new coords(options);
        this.mercuryCanvas = this.parent;
        this.parent = this.parent.layersContainer;
        this.canvas = this.element[0];
        this.context = this.canvas.getContext('2d');

        this.mercuryCanvas.layers.list.push(this);
    }
    resize(options) {
        if (!options || typeof options.width != 'number' || typeof options.height != 'number') return;
        var ctx = this.context;
        this.element.attr({
            width: options.width,
            height: options.height
        });
        this.coords.update({
            width: options.width,
            height: options.height
        });

        if (this.options.background) ctx.fillStyle = this.options.background;
        ctx.rect(0, 0, options.width, options.height);
        ctx.fill();
        ctx.restore();
    }
    clear() {
        if (!this.dirty) return;

        this.context.clearRect(0, 0, this.element.attr('width'), this.element.attr('height'));
    }
    copyTo(targetLayer) {
        targetLayer.resize(this.coords);
        targetLayer.context.drawImage(this.element[0], 0, 0);
        targetLayer.dirty = true;
    }
    remove () {
        if (this.removable === false) return;

        _.remove(this.mercuryCanvas.layers.list, this);
        this.element.remove();
    }
}

export default Layer;