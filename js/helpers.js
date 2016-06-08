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
            width: 0,
            height: 0
        }, options);
        this.x2 = this.x + this.width;
        this.y2 = this.y + this.height;
    }
    update(options) {
        _.merge(this, options);
    }
    inside(coord) {
        return this.x >= coord.x && this.x <= coord.x2 && this.y >= coord.y && this.y <= coord.y2;
    }
    toCanvasSpace(mercuryCanvas) {
        var base = mercuryCanvas.layersContainer.coords;
        return new coords({
            x: this.x - base.x,
            y: this.y - base.y,
            width: this.width - base.x,
            height: this.height - base.y
        });
    }
}

export {coords};