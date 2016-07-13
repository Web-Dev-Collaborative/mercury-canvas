import _ from 'lodash';
import classnames from 'classnames';
import {Matrix} from 'transformation-matrix-js';

class layerCoords {
    constructor(options = {}, layer) {
        _.merge(this, {
            x: 0,
            y: 0,
            z: layer.mercuryCanvas.session.zIndex,
            width: 0,
            height: 0
        }, options);
        this.matrix = new Matrix();
        this.matrix.translate(this.x, this.y);
        this.layer = layer;
    }
    update(options) {
        if (_.isObject(options)) {
            if (options.x) {
                this.matrix.translateX(options.x - this.x);
            }
            if (options.y) {
                this.matrix.translateY(options.y - this.y);
            }
            _.merge(this, options);
        }
        this.layer.element.css({
            transform: this.matrix.toCSS(),
            zIndex: this.z
        });
    }
}

class Layer {
    constructor(options) {
        _.merge(this, {
            options: {
                background: 'rgba(0, 0, 0, 0)'
            },
            removable: true,
            visible: true,
            name: 'Layer ' + options.parent.session.zIndex
        }, options);

        this.mercuryCanvas = this.parent;
        this.parent = this.parent.layersContainer;

        this.element = $('<canvas>', {
            class: classnames('layer', this.name),
            css: {
                zIndex: this.name == 'base' ? 0 : this.mercuryCanvas.session.zIndex
            }
        }).appendTo(this.parent);

        this.coords = new layerCoords(options, this);
        this.canvas = this.element[0];
        this.context = this.canvas.getContext('2d');

        if (this.name == 'base' || this.name == 'overlay') return;

        if (this.image) {
            this.resize({
                width: this.image.width,
                height: this.image.height
            });
            this.context.drawImage(this.image, 0, 0);
            this.dirty = true;

            this.coords.update({
                x: (this.mercuryCanvas.layersContainer.coords.width - this.image.width) / 2,
                y: (this.mercuryCanvas.layersContainer.coords.height - this.image.height) / 2
            });
            delete this.image;
        }

        this.toggleVisibility = this.toggleVisibility.bind(this);

        this.mercuryCanvas.emit('layer.new', this);
    }
    toggleVisibility() {
        if (this.visible) this.hide();
        else this.show();
    }
    hide() {
        this.visible = false;
        this.element.hide();
        this.mercuryCanvas.emit('layer.update', this);
    }
    show() {
        this.visible = true;
        this.element.show();
        this.mercuryCanvas.emit('layer.update', this);
    }
    move(options) {
        this.coords.update({
            x: options.x,
            y: options.y
        });
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
    trim() {
        var pixels = this.context.getImageData(0, 0, this.coords.width, this.coords.height);
        var bound = {};
        var x, y;

        for (var i = 0, l = pixels.data.length; i < l; i += 4) {
            if (pixels.data[i + 3] === 0) continue;

            x = (i / 4) % this.coords.width;
            y = ~~((i / 4) / this.coords.width);

            bound.top = bound.top === undefined ? y : (y < bound.top ? y : bound.top);
            bound.bottom = bound.bottom === undefined ? y : (y > bound.bottom ? y : bound.bottom);
            bound.left = bound.left === undefined ? x : (x < bound.left ? x : bound.left);
            bound.right = bound.right === undefined ? x : (x > bound.right ? x : bound.right);
        }
        bound.left--;
        bound.top--;
        bound.right += 2;
        bound.bottom += 2;

        this.coords.update({
            x: this.coords.x + bound.left,
            y: this.coords.y + bound.top,
            width: bound.right - bound.left,
            height: bound.bottom - bound.top
        });

        var trimmed = this.context.getImageData(bound.left, bound.top, this.coords.width, this.coords.height);

        this.element.attr({
            width: this.coords.width,
            height: this.coords.height
        });
        this.context.putImageData(trimmed, 0, 0);
        this.mercuryCanvas.emit('layer.update', this);
    }
    clear() {
        if (!this.dirty) return;

        this.dirty = false;
        this.context.clearRect(0, 0, this.element.attr('width'), this.element.attr('height'));
        this.mercuryCanvas.emit('layer.update', this);
    }
    copyTo(targetLayer) {
        targetLayer.resize(this.coords);
        targetLayer.context.drawImage(this.element[0], 0, 0);
        targetLayer.dirty = true;
        if (this.name == 'overlay') targetLayer.trim();
        this.mercuryCanvas.emit('layer.update', targetLayer);
    }
    remove() {
        if (this.removable === false) return;

        this.element.remove();
        this.mercuryCanvas.emit('layer.remove', this);
    }
}

export default Layer;