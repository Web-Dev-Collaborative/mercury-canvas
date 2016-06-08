import _ from 'lodash';

class coords {
    constructor(options) {
        if (options.hasOwnProperty('clientX')) {
            options = {
                x: options.clientX,
                y: options.clientY
            };
        }
        _.merge(this, {
            x: 0,
            y: 0,
            z: coords.z,
            width: 0,
            height: 0
        }, options);
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
            if (this.inside(layer.coords) && (chosenLayer === undefined || layer.coords.z > chosenLayer.coords.z)) {
                chosenLayer = layer;
            }
        });
        return chosenLayer;
    }
}
coords.z = 1;

export {coords};