var log = require('loglevel-message-prefix')(window.log.getLogger('helpers.js'), {
    prefixes: ['level'],
    staticPrefixes: ['helpers.js'],
    separator: '/'
});
import _ from 'lodash';

class coords {
    constructor(options = {}) {
        if (options.hasOwnProperty('clientX')) {
            options = {
                x: options.clientX,
                y: options.clientY
            };
        }
        _.merge(this, {
            x: 0,
            y: 0,
            z: 0,
            width: 0,
            height: 0
        }, options);
    }
    add(options, fields = ['x', 'y', 'width', 'height']) {
        if (!_.isObject(options) || !_.isArray(fields)) return;

        if (_.has(options, 'x') && fields.indexOf('x') != -1) this.x += options.x;
        if (_.has(options, 'y') && fields.indexOf('y') != -1) this.y += options.y;
        if (_.has(options, 'width') && fields.indexOf('width') != -1) this.width += options.width;
        if (_.has(options, 'height') && fields.indexOf('height') != -1) this.height += options.height;
    }
    divide(n, fields = ['x', 'y']) {
        if (!_.isNumber(n) || !_.isArray(fields)) return;

        if (fields.indexOf('x') != -1) this.x /= n;
        if (fields.indexOf('y') != -1) this.y /= n;
        if (fields.indexOf('width') != -1) this.width /= n;
        if (fields.indexOf('height') != -1) this.height /= n;
    }
    update(options) {
        _.merge(this, options);
    }
    inside(coord) {
        return this.x >= coord.x && this.x <= coord.x + coord.width && this.y >= coord.y && this.y <= coord.y + coord.height;
    }
    toCanvasSpace(mc) {
        var base = mc.layersContainer.coords;
        return new coords({
            x: this.x - base.x,
            y: this.y - base.y,
            width: this.width - base.x,
            height: this.height - base.y
        });
    }
    toLayer(mc) {
        var chosenLayer;
        _.forIn(mc.layers.list, (layer) => {
            if (!layer.removed && layer.visible && this.inside(layer.coords) && (chosenLayer === undefined || layer.coords.z > chosenLayer.coords.z)) {
                chosenLayer = layer;
            }
        });
        return chosenLayer;
    }
}

export {coords};