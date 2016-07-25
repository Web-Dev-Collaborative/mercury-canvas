var log = require('loglevel-message-prefix')(window.log.getLogger('layer.js'), {
    prefixes: ['level'],
    staticPrefixes: ['layer.js'],
    separator: '/'
});
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
    update(options, updateCSS = true) {
        if (_.isObject(options)) {
            var oldZ = this.z;
            if (options.scale) {
                this.matrix.reset();

                if (_.has(options, 'width')) {
                    this.matrix.a = 1;
                    this.matrix.scaleX(options.scaleX);
                    this.width = options.width;
                }
                if (_.has(options, 'height')) {
                    this.matrix.d = 1;
                    this.matrix.scaleY(options.scaleY);
                    this.height = options.height;
                }
                if (_.has(options, 'x')) {
                    this.matrix.translateX(options.x / options.scaleX);
                    this.x = options.x;
                }
                if (_.has(options, 'y')) {
                    this.matrix.translateY(options.y / options.scaleY);
                    this.y = options.y;
                }
            }
            else {
                if (_.has(options, 'width')) {
                    this.width = options.width;
                }
                if (_.has(options, 'height')) {
                    this.height = options.height;
                }
                if (_.has(options, 'x')) {
                    this.matrix.translateX(options.x - this.x);
                    this.x = options.x;
                }
                if (_.has(options, 'y')) {
                    this.matrix.translateY(options.y - this.y);
                    this.y = options.y;
                }
            }
            if (_.has(options, 'z')) this.z = options.z;
        }
        if (updateCSS) this.updateCSS();
        if (options.z && options.z != oldZ) {
            this.layer.mercuryCanvas.emit('layer.z.update', {
                z: options.z,
                layer: this.layer,
                session: options.session
            });
        }
    }
    add(options) {
        if (_.isObject(options)) {
            if (_.has(options, 'x')) {
                this.matrix.translateX(options.x);
                this.x += options.x;
            }
            if (_.has(options, 'y')) {
                this.matrix.translateY(options.y);
                this.y += options.y;
            }
            if (_.has(options, 'width')) this.width += options.width;
            if (_.has(options, 'height')) this.height += options.height;
        }
        this.updateCSS();
    }
    updateAttr() {
        this.layer.element.attr('width', this.width);
        this.layer.element.attr('height', this.height);
    }
    updateCSS() {
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
            state: {
                removable: true,
                visible: true,
            },
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

        if (this.name == 'base' || this.name == 'overlay') {
            if (this.name == 'base') this.coords.z = 0;
            return;
        }

        if (this.image) {
            this.draw(this.image, {
                resize: true
            });
            delete this.image;
        }

        this.toggleVisibility = this.toggleVisibility.bind(this);

        this.mercuryCanvas.emit('layer.new', this);
    }
    toggleVisibility() {
        if (this.state.visible) this.hide();
        else this.show();
    }
    hide(e) {
        this.state.visible = false;
        this.element.hide();
        if (!e) this.mercuryCanvas.emit('layer.update', this);
    }
    show(e) {
        this.state.visible = true;
        this.element.show();
        if (!e) this.mercuryCanvas.emit('layer.update', this);
    }
    move(options) {
        this.coords.update({
            x: options.x,
            y: options.y
        });
    }
    scale(newCoords, callback = () => { }) {
        this.coords.update(newCoords, false);
        this.coords.matrix.a = this.coords.matrix.d = 1;

        var image = new Image();
        image.onload = () => {
            this.coords.updateCSS();
            this.coords.updateAttr();
            this.context.drawImage(image, 0, 0, newCoords.width, newCoords.height);
            callback();
        };
        image.src = this.canvas.toDataURL();
    }
    select(type) {
        this.selected = true;
        this.mercuryCanvas.session.selectedLayers.select(this, type);
        this.mercuryCanvas.emit('layer.select', this);
    }
    deselect() {
        this.selected = false;
        this.mercuryCanvas.emit('layer.deselect', this);
    }
    resize(options) {
        if (!_.isObject(options) || !_.isNumber(options.width) || !_.isNumber(options.height)) return;
        var ctx = this.context;
        ctx.save();
        this.element.attr({
            width: options.width,
            height: options.height
        });
        this.coords.update({
            width: options.width,
            height: options.height
        }, options.update);

        if (_.has(this.options, 'background')) {
            ctx.fillStyle = this.options.background;
            ctx.rect(0, 0, options.width, options.height);
            ctx.fill();
        }
        ctx.restore();
    }
    trim(options) {
        if (_.isObject(options) && ['x', 'y', 'x2', 'y2'].every(k => k in options)) {
            this.trimToCoords(options);
        }
        else {
            this.mercuryCanvas.workerMaster.addAction({
                type: 'trim',
                data: this.context.getImageData(0, 0, this.coords.width, this.coords.height),
                finish: this.trimToCoords.bind(this)
            });
        }
    }
    trimToCoords(bound) {
        var t0 = performance.now();

        this.coords.update({
            x: this.coords.x + bound.x,
            y: this.coords.y + bound.y,
            width: bound.x2 - bound.x,
            height: bound.y2 - bound.y
        });
        if (bound.x == Infinity || bound.y == Infinity) {
            this.state.dirty = true;
            this.clear();
            return;
        }
        var trimmed = this.context.getImageData(bound.x, bound.y, this.coords.width, this.coords.height);

        this.element.attr({
            width: this.coords.width,
            height: this.coords.height
        });
        this.context.putImageData(trimmed, 0, 0);
        this.mercuryCanvas.emit('layer.update', this);
        var t1 = performance.now();
        log.debug('I spent ' + (t1 - t0) + 'ms to trim the layer');
    }
    draw(image, options = {}) {
        if (options.resize) {
            if (_.isUndefined(options.update)) options.update = true;
            this.resize({
                width: image.width,
                height: image.height
            }, options.update);
        }
        this.context.drawImage(image, 0, 0);
        this.state.dirty = true;
        this.mercuryCanvas.emit('layer.update', this);
    }
    clear() {
        if (!this.state.dirty) return;

        this.state.dirty = false;
        this.context.clearRect(0, 0, this.element.attr('width'), this.element.attr('height'));
        this.mercuryCanvas.emit('layer.update', this);
    }
    copyTo(targetLayer, trimOptions) {
        targetLayer.resize(this.coords);
        targetLayer.context.drawImage(this.element[0], 0, 0);
        targetLayer.state.dirty = true;
        if (this.name == 'overlay') targetLayer.trim(trimOptions);
        this.mercuryCanvas.emit('layer.update', targetLayer);
    }
    delete() {
        this.element.remove();
        this.mercuryCanvas.emit('layer.delete', this);
    }
    remove(e) {
        if (this.state.removable === false) return;

        if (!e) this.mercuryCanvas.session.addOperation({
            type: 'layer.remove',
            layer: this
        });
        _.remove(this.mercuryCanvas.session.selectedLayers.list, this);
        this.state.removed = true;
        this.hide(true);
        this.mercuryCanvas.emit('layer.remove', this);
    }
    restore() {
        if (!this.state.removed) return;
        this.state.removed = false;
        this.show(true);
        this.mercuryCanvas.emit('layer.restore', this);
    }
}

export default Layer;