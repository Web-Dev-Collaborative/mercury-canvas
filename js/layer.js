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

        this.coords = new coords(options);

        this.element = $('<canvas>', {
            class: classnames('layer', this.name),
            css: {
                zIndex: this.name == 'base' ? 0 : this.coords.z
            }
        }).appendTo(this.parent.layersContainer);

        this.mercuryCanvas = this.parent;
        this.parent = this.parent.layersContainer;
        this.canvas = this.element[0];
        this.context = this.canvas.getContext('2d');

        if (this.name == 'base' || this.name == 'overlay') return;

        if (this.imageData) {
            this.resize(this.imageData);
            var image = document.createElement('img');
            image.src = this.imageData.data;
            image.onload = () => {
                this.context.drawImage(image, 0, 0);
                this.dirty = true;
                // this.trim();

                var self = this;
                setTimeout(() => {
                    var x = (self.mercuryCanvas.session.width - self.imageData.width) / 2;
                    var y = (self.mercuryCanvas.session.height - self.imageData.height) / 2;

                    self.element.css({
                        top: y,
                        left: x
                    });
                    self.coords.update({
                        x: x,
                        y: y
                    });
                    delete this.imageData;
                }, 10);
            };
        }

        coords.z++;
        this.updateOverlayZ();
        this.mercuryCanvas.layers.list.push(this);
    }
    move(options) {
        this.coords.update({
            x: options.x,
            y: options.y,
            width: this.coords.width + options.x,
            height: this.coords.height + options.y
        });
        this.element.css({
            top: this.coords.y,
            left: this.coords.x
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
        console.log(this.coords);
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

        this.element.css({
            width: this.coords.width,
            height: this.coords.height,
            top: this.coords.y,
            left: this.coords.x
        }).attr({
            width: this.coords.width,
            height: this.coords.height
        });
        this.context.putImageData(trimmed, 0, 0);
    }
    clear() {
        if (!this.dirty) return;

        this.dirty = false;
        this.context.clearRect(0, 0, this.element.attr('width'), this.element.attr('height'));
    }
    copyTo(targetLayer) {
        targetLayer.resize(this.coords);
        targetLayer.context.drawImage(this.element[0], 0, 0);
        targetLayer.dirty = true;
        if (this.name == 'overlay') targetLayer.trim();
    }
    remove() {
        if (this.removable === false) return;

        var mc = this.mercuryCanvas;

        _.remove(mc.session.selectedLayers.list, this);
        _.remove(mc.layers.list, this);
        this.element.remove();
    }
    updateOverlayZ() {
        var mc = this.mercuryCanvas;
        mc.overlay.coords.z = coords.z;
        mc.overlay.element.css('zIndex', coords.z);
        mc.session.zIndex = coords.z;
    }
}

export default Layer;