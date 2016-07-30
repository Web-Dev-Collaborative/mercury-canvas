'use strict';

class Pixel {
    constructor(r, g, b, a) {
        if (a === undefined) {
            a = 255;
        }
        this.r = r;
        this.g = g;
        this.b = b;
        this.a = a;
        return this;
    }
    greyScale() {
        this.r = this.g = this.b = this.r * 0.2126 + this.g * 0.7152 + this.b * 0.0722;
        this.toInt();
        return this;
    }
    invertColors() {
        this.r = 255 - this.r;
        if (global.greyScale) {
            this.g = this.b = this.r;
        }
        else {
            this.g = 255 - this.g;
            this.b = 255 - this.b;
        }
        return this;
    }
    magnitude(p1, p2) {
        this.r = Math.sqrt(p1.r * p1.r + p2.r * p2.r);
        if (global.greyScale) {
            this.g = this.b = this.r;
        }
        else {
            this.g = Math.sqrt(p1.g * p1.g + p2.g * p2.g);
            this.b = Math.sqrt(p1.b * p1.b + p2.b * p2.b);
        }
        this.toInt();
        return this;
    }
    normalize(sum) {
        this.r /= sum;
        if (global.greyScale) {
            this.g = this.b = this.r;
        }
        else {
            this.g /= sum;
            this.b /= sum;
        }
        return this;
    }
    multiply(t) {
        this.r *= t;
        this.g *= t;
        this.b *= t;
        return this;
    }
    add(p1) {
        this.r += p1.r;
        if (global.greyScale) {
            this.g = this.b = this.r;
        }
        else {
            this.g += p1.g;
            this.b += p1.b;
        }
        return this;
    }
    toInt() {
        this.r = parseInt(this.r);
        this.g = parseInt(this.g);
        this.b = parseInt(this.b);
        return this;
    }
    radToColor(rad) {
        var h = Math.Remap(rad, -Math.PI / 2, Math.PI / 2, 0, 1);
        var s = 1;
        var v = 1;
        var r, g, b, i, f, p, q, t;
        i = Math.floor(h * 6);
        f = h * 6 - i;
        p = v * (1 - s);
        q = v * (1 - f * s);
        t = v * (1 - (1 - f) * s);
        switch (i % 6) {
            case 0: r = v; g = t; b = p; break;
            case 1: r = q; g = v; b = p; break;
            case 2: r = p; g = v; b = t; break;
            case 3: r = p; g = q; b = v; break;
            case 4: r = t; g = p; b = v; break;
            case 5: r = v; g = p; b = q; break;
        }
        this.r = r;
        this.g = g;
        this.b = b;
        this.multiply(255).toInt();
    }
    toArray() {
        return [this.r, this.g, this.b, this.a];
    }
}

export default Pixel;