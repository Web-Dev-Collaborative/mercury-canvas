'use strict';
import Kernels from './kernels.js';
import Pixel from './pixel.js';
import _ from 'lodash';

var console = {
    log: (data) => postMessage({
        id: 'log',
        event: 'log',
        data: data
    })
};

global.onmessage = (e) => {
    if (!e) return;

    var data = e.data;
    if (_.isFunction(global[data.type])) global[data.type](data);
};
global.onmessage();

global.active = (data) => {
    postMessage({
        id: data.id,
        event: 'progress',
        data: 'test'
    });
};
global.trim = (task) => {
    var pixels = new Uint8ClampedArray(task.data.pixels);
    var startIndex = task.data.startIndex;
    var width = task.data.width;
    var bound = {
        x: Infinity,
        y: Infinity,
        x2: 0,
        y2: 0,
    };
    var x, y;
    var start = {
        x: Math.floor(startIndex / 4) % width,
        y: Math.floor((startIndex / 4) / width)
    };
    for (var i = 0, l = pixels.length; i < l; i += 4) {
        if (!pixels[i + 3]) continue;

        var w = i + startIndex;
        x = Math.floor(w / 4) % width;
        y = Math.floor((w / 4) / width);

        bound.x = Math.min(x, bound.x);
        bound.y = Math.min(y, bound.y);
        bound.x2 = Math.max(x, bound.x2);
        bound.y2 = Math.max(y, bound.y2);
    }
    var end = {
        x: Math.floor((startIndex + i) / 4) % width,
        y: Math.floor(((startIndex + i) / 4) / width)
    };
    postMessage({
        id: 'log',
        event: 'log',
        data: {
            bound: bound,
            startIndex: startIndex,
            width: width,
            end: end,
            start: start
        }
    });
    bound.x--;
    bound.y--;
    bound.x2 += 2;
    bound.y2 += 2;
    postMessage({
        id: task.id,
        event: 'progress',
        data: {
            bound: bound,
            startIndex: startIndex,
            width: width,
            end: end,
            start: start
        }
    });
};

function applyKernel(e) {
    var data = e.imageData.data;
    var kernelSum = 0;
    var pixels = [];
    var r, c;
    for (r = 0; r < e.kernel.length; r++) {
        pixels[r] = [];
        for (c = 0; c < e.kernel[0].length; c++) {
            var pos = e.pixelIndex + (r - 1) * e.imageData.width * 4 + (c - 1) * 4;
            pixels[r][c] = new Pixel(data[pos], data[pos + 1], data[pos + 2], data[pos + 3]);
        }
    }
    var pixel = new Pixel(0, 0, 0);
    for (r = 0; r < e.kernel.length; r++) {
        for (c = 0; c < e.kernel[0].length; c++) {
            if (pixels[r][c].r === undefined) {
                continue;
            }
            kernelSum += Math.abs(e.kernel[r][c]);
            pixel.add(pixels[r][c].multiply(e.kernel[r][c]));
        }
    }
    return {
        pixel: pixel,
        kernelSum: kernelSum
    };
}
global.kernelConvolution = (task) => {
    var pixels = new Uint8ClampedArray(task.data.pixels);
    var width = task.data.width;

    var imageData = {
        data: pixels,
        width: width
    };
    var newImage = {
        data: new Uint8ClampedArray(pixels.length),
        width: width
    };
    var queue = {
        pixels: []
    };
    var g = 0;

    for (var i = 0, l = pixels.length; i < l; i += 4) {
        var temp;
        var pixel = new Pixel(pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]);
        switch (task.type) {
            case 'blur':
                temp = applyKernel({
                    kernel: task.kernel,
                    pixelIndex: i,
                    imageData: imageData
                });
                pixel = temp.pixel.normalize(temp.kernelSum);
                break;
            case 'sobel':
                var p1 = applyKernel({
                    kernel: Kernels.Edge.Sobel.horizontal(),
                    pixelIndex: i,
                    imageData: imageData
                });
                var p2 = applyKernel({
                    kernel: Kernels.Edge.Sobel.vertical(),
                    pixelIndex: i,
                    imageData: imageData
                });
                pixel.magnitude(p1.pixel, p2.pixel);
                if (global.final != 'sobel') {
                    pixel.radToColor(Math.atan(p1.pixel.r / p2.pixel.r));
                }
                break;
            case 'greyScale':
                global.greyScale = true;
                pixel.greyScale();
                break;
            case 'invert':
                pixel.invertColors();
                break;
        }

        if (i % (imageData.width * 4) === 0) {
            g++;
            if (g >= task.data.progressSpeed) {
                queue.height = g;
                var w = i + task.data.startIndex;
                queue.start = {
                    x: Math.floor(w / 4) % width,
                    y: Math.floor(w / 4 / width)
                };

                queue.pixels = new Uint8ClampedArray(queue.pixels);
                postMessage({
                    id: task.id,
                    event: 'progress',
                    data: queue
                }, [queue.pixels.buffer]);

                queue.pixels = [];
                g = 0;
            }
        }
        queue.pixels.concat(pixel.toArray());

        newImage.data[i] = pixel.r;
        newImage.data[i + 1] = pixel.g;
        newImage.data[i + 2] = pixel.b;
        newImage.data[i + 3] = pixel.a;
    }

    postMessage({
        id: task.id,
        event: 'progress',
        data: {
            data: newImage.data,
            width: newImage.width,
            startIndex: task.data.startIndex
        }
    }, [newImage.data.buffer]);
};
