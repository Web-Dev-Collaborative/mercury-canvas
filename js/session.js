var log = require('loglevel-message-prefix')(window.log.getLogger('session.js'), {
    prefixes: ['level'],
    staticPrefixes: ['session.js'],
    separator: '/'
});
import _ from 'lodash';
import async from 'async';
import {Matrix} from 'transformation-matrix-js';
import {coords} from './helpers.js';
import Layer from './layer.js';

class SelectedLayers {
    constructor(mc) {
        this.mercuryCanvas = mc;
        this.list = [];
        this.rect = {};
        this.state = {
            transform: false
        };

        this.oldCoords = [];
        this.cursor = {
            shown: false,
            canShow: false,
            matrix: new Matrix()
        };

        var cursor = $('<div>', {
            class: 'selectCursor',
            css: {
                zIndex: 1002
            }
        }).hide();
        cursor.appendTo(mc.layersContainer);
        this.cursor.element = cursor;

        mc.on('layer.remove', () => {
            this.makeBox();
            requestAnimationFrame(this.draw.bind(this, mc.session.mouse.last));
        });

        mc.on('undo.layer.move', (operation) => {
            _.each(operation.layers, (layer, index) => {
                layer.coords.update(operation.old[index]);
            });
            this.makeBox();
            this.mouseMove(mc.session.mouse.last);
        });
        mc.on('redo.layer.move', (operation) => {
            _.each(operation.layers, (layer, index) => {
                layer.coords.update(operation.new[index]);
            });
            this.makeBox();
            this.mouseMove(mc.session.mouse.last);
        });
        mc.on('key.up', () => this.mouseMove(mc.session.mouse.last));
        mc.on('key.down', () => this.mouseMove(mc.session.mouse.last));

        mc.on('mousedown', this.mouseDown.bind(this));
        mc.on('mouseup', this.mouseUp.bind(this));
        mc.on('mousemove', (e) => {
            if (!this.state.transform) return;
            this.mouseMove(e);
        });
        mc.addShortcut('mod + alt + t', () => {
            this.enterTransform();
        });

        setTimeout(() => {
            if (!mc.layers.list.length) return;
            mc.layers.list[0].select();
            this.enterTransform();
        }, 1000);
    }
    makeBox() {
        var rect = new coords({
            x: Infinity,
            y: Infinity
        });
        rect.x2 = 0;
        rect.y2 = 0;
        _.each(this.list, (layer) => {
            var end = {
                x: layer.coords.x + layer.coords.width,
                y: layer.coords.y + layer.coords.height
            };
            rect.x = Math.min(rect.x, layer.coords.x);
            rect.y = Math.min(rect.y, layer.coords.y);
            rect.x2 = Math.max(rect.x2, end.x);
            rect.y2 = Math.max(rect.y2, end.y);
        });
        rect.width = rect.x2 - rect.x;
        rect.height = rect.y2 - rect.y;
        this.rect = rect;
    }
    select(layer, type = 'only') {
        if (type == 'append') {
            this.list.push(layer);
        }
        else if (type == 'only') {
            _.each(this.list, (l) => {
                if (l == layer) return;
                l.deselect();
            });
            this.list = [layer];
        }
        this.makeBox();
    }
    deselectAll() {
        _.each(this.list, (layer) => {
            layer.deselect();
        });
        this.list = [];
    }
    enterTransform() {
        if (this.state.transform) return;
        this.state.transform = true;
        this.mouseMove(this.mercuryCanvas.session.mouse.lastEvent);
    }
    exitTransform() {
        if (this.state.transform) return;
        this.state.transform = false;
        this.mouseMove(this.mercuryCanvas.session.mouse.lastEvent);
    }
    chooseCursor(e) {
        var mc = this.mercuryCanvas;
        var layerCoords = mc.session.selectedLayers.rect;

        if (mc.session.keys.ctrl) return 'copy';
        if (!layerCoords) return 'default';

        var pos = new coords(e).toCanvasSpace(mc);
        var selectedRect = _.clone(layerCoords);
        var handlerSize = mc.state.handlerSize;
        var sh = handlerSize / 2;

        if (pos.x > selectedRect.x - sh && pos.x < selectedRect.x + sh &&
            pos.y > selectedRect.y - sh && pos.y < selectedRect.y + sh) {
            return 'nw-resize';
        }
        if (pos.x > selectedRect.x + selectedRect.width - sh && pos.x < selectedRect.x + selectedRect.width + sh &&
            pos.y > selectedRect.y - sh && pos.y < selectedRect.y + sh) {
            return 'ne-resize';
        }
        if (pos.x > selectedRect.x + selectedRect.width - sh && pos.x < selectedRect.x + selectedRect.width + sh &&
            pos.y > selectedRect.y + selectedRect.height - sh && pos.y < selectedRect.y + selectedRect.height + sh) {
            return 'se-resize';
        }
        if (pos.x > selectedRect.x - sh && pos.x < selectedRect.x + sh &&
            pos.y > selectedRect.y + selectedRect.height - sh && pos.y < selectedRect.y + selectedRect.height + sh) {
            return 'sw-resize';
        }
        if (pos.x >= selectedRect.x + sh && pos.x <= selectedRect.x + selectedRect.width - sh &&
            pos.y > selectedRect.y - handlerSize / 3 && pos.y < selectedRect.y + handlerSize / 3) {
            return 'n-resize';
        }
        if (pos.x > selectedRect.x + selectedRect.width - handlerSize / 3 && pos.x < selectedRect.x + selectedRect.width + handlerSize / 3 &&
            pos.y >= selectedRect.y + sh && pos.y <= selectedRect.y + selectedRect.height - sh) {
            return 'e-resize';
        }
        if (pos.x >= selectedRect.x + sh && pos.x <= selectedRect.x + selectedRect.width - sh &&
            pos.y > selectedRect.y + selectedRect.height - handlerSize / 3 && pos.y < selectedRect.y + selectedRect.height + handlerSize / 3) {
            return 's-resize';
        }
        if (pos.x > selectedRect.x - handlerSize / 3 && pos.x < selectedRect.x + handlerSize / 3 &&
            pos.y >= selectedRect.y + sh && pos.y <= selectedRect.y + selectedRect.height - sh) {
            return 'w-resize';
        }
        if (pos.x > selectedRect.x && pos.x < selectedRect.x + selectedRect.width && pos.y > selectedRect.y && pos.y < selectedRect.y + selectedRect.height) {
            return 'move';
        }

        var angle;
        if (pos.x < selectedRect.x + selectedRect.width / 4) {
            if (pos.y < selectedRect.y + selectedRect.height / 4) {
                angle = 0;
            }
            else if (pos.y > selectedRect.y + selectedRect.height * 3 / 4) {
                angle = -90;
            }
            else {
                angle = -45;
            }
        }
        else if (pos.x < selectedRect.x + selectedRect.width * 3 / 4) {
            if (pos.y < selectedRect.y + selectedRect.height / 4) {
                angle = 45;
            }
            else if (pos.y > selectedRect.y + selectedRect.height * 3 / 4) {
                angle = -135;
            }
        }
        else if (pos.y < selectedRect.y + selectedRect.height / 4) {
            angle = 90;
        }
        else if (pos.y > selectedRect.y + selectedRect.height * 3 / 4) {
            angle = -180;
        }
        else {
            angle = 135;
        }
        if (_.isNumber(angle)) {
            return {
                cursor: 'rotate',
                angle: angle
            };
        }
        else {
            return undefined;
        }
    }
    draw() {
        var mc = this.mercuryCanvas;
        this.makeBox();
        mc.overlay.clear();

        var context = mc.overlay.context;
        context.lineWidth = 1;
        context.strokeStyle = '#000';
        context.lineCap = mc.overlay.context.lineJoin = 'square';
        context.fillStyle = 'rgba(255, 255, 255, 0.1)';

        var rect = _.clone(this.rect);
        var handlerSize = mc.state.handlerSize;
        rect.x = Math.floor(rect.x) - 0.5;
        rect.y = Math.floor(rect.y) - 0.5;
        rect.width = Math.ceil(rect.width) + 1;
        rect.height = Math.ceil(rect.height) + 1;

        // handlers
        rect.topLeft = new coords({
            x: rect.x,
            y: rect.y
        });
        rect.topRight = new coords({
            x: rect.x + rect.width,
            y: rect.y
        });
        rect.bottomRight = new coords({
            x: rect.x + rect.width,
            y: rect.y + rect.height
        });
        rect.bottomLeft = new coords({
            x: rect.x,
            y: rect.y + rect.height
        });
        rect.sh = handlerSize / 2;

        // handlers
        context.fillRect(rect.topLeft.x - rect.sh, rect.topLeft.y - rect.sh, handlerSize, handlerSize);
        context.fillRect(rect.topRight.x - rect.sh, rect.topRight.y - rect.sh, handlerSize, handlerSize);
        context.fillRect(rect.bottomRight.x - rect.sh, rect.bottomRight.y - rect.sh, handlerSize, handlerSize);
        context.fillRect(rect.bottomLeft.x - rect.sh, rect.bottomLeft.y - rect.sh, handlerSize, handlerSize);

        context.strokeRect(rect.topLeft.x - rect.sh, rect.topLeft.y - rect.sh, handlerSize, handlerSize);
        context.strokeRect(rect.topRight.x - rect.sh, rect.topRight.y - rect.sh, handlerSize, handlerSize);
        context.strokeRect(rect.bottomRight.x - rect.sh, rect.bottomRight.y - rect.sh, handlerSize, handlerSize);
        context.strokeRect(rect.bottomLeft.x - rect.sh, rect.bottomLeft.y - rect.sh, handlerSize, handlerSize);

        // lines
        if (rect.width > handlerSize + 1 || rect.height > handlerSize + 1) {
            context.beginPath();

            // compensate for handlers lines
            rect.width++;
            rect.height++;
            rect.x--;
            rect.y--;

            if (rect.width > handlerSize + 1) {
                context.moveTo(rect.topLeft.x + rect.sh, rect.topLeft.y);
                context.lineTo(rect.topRight.x - rect.sh, rect.topRight.y);

                context.moveTo(rect.bottomLeft.x + rect.sh, rect.bottomLeft.y);
                context.lineTo(rect.bottomRight.x - rect.sh, rect.bottomRight.y);
            }
            if (rect.height > handlerSize + 1) {
                context.moveTo(rect.topRight.x, rect.topRight.y + rect.sh);
                context.lineTo(rect.bottomRight.x, rect.bottomRight.y - rect.sh);

                context.moveTo(rect.topLeft.x, rect.topLeft.y + rect.sh);
                context.lineTo(rect.bottomLeft.x, rect.bottomLeft.y - rect.sh);
            }
            context.stroke();
            context.closePath();
        }

        mc.overlay.state.dirty = true;
    }
    mouseDown(e) {
        if (!this.state.transform) return;
        var mc = this.mercuryCanvas;
        var mouse = mc.session.mouse;
        var pos = new coords(e).toCanvasSpace(mc);

        if (_.isUndefined(mouse.action)) return;

        _.each(this.list, (layer, index) => {
            this.oldCoords[index] = _.clone(layer.coords);
            if (layer.original) {
                var image = new Image();
                image.onload = () => {
                    var coords = _.clone(layer.coords);
                    layer.draw(image, {
                        resize: true,
                        update: false
                    });
                    coords.scale = true;
                    coords.scaleX = coords.width / image.width;
                    coords.scaleY = coords.height / image.height;
                    layer.coords.update(coords);
                };
                image.src = layer.original;
            }
        });
        mc.session.mouse.initial = {
            dist: [],
            mouse: _.clone(pos),
            selectedLayers: this.list.map(layer => _.clone(layer.coords))
        };
        requestAnimationFrame(this.draw.bind(this, e));
    }
    mouseMove(e) {
        if (!this.state.transform) return;
        var mc = this.mercuryCanvas;
        var mouse = mc.session.mouse;
        var pos = new coords(e).toCanvasSpace(mc);
        mouse.last = e;

        if (!mouse.down) {
            mouse.action = this.chooseCursor(e);
            if (_.isObject(mouse.action) && mouse.action.cursor == 'rotate') {
                this.cursor.matrix.reset();
                this.cursor.matrix.translate(pos.x, pos.y);
                this.cursor.matrix.rotateDeg(mouse.action.angle);

                if (!this.cursor.shown) {
                    this.cursor.shown = true;
                    this.cursor.element.show();
                }
                this.cursor.element.css({
                    transform: this.cursor.matrix.toCSS()
                });
                mc.layersContainer.css({
                    cursor: 'none'
                });
            }
            else {
                if (this.cursor.shown) {
                    this.cursor.shown = false;
                    this.cursor.element.hide();
                }
                mc.layersContainer.css({
                    cursor: mouse.action
                });
            }
        }
        else if (mouse.action) {
            this.actioned = true;

            var newCoords = [];

            if (mouse.action == 'move') {
                _.each(this.list, (layer, index) => {
                    var dist = mouse.initial.dist[index];
                    if (!_.isObject(dist)) {
                        dist = {
                            x: mouse.initial.mouse.x - mouse.initial.selectedLayers[index].x,
                            y: mouse.initial.mouse.y - mouse.initial.selectedLayers[index].y
                        };
                    }
                    var coords = {
                        x: pos.x - dist.x,
                        y: pos.y - dist.y
                    };
                    if (mc.session.keys.shift) {
                        var original = mouse.initial.selectedLayers[index];
                        var delta = {
                            x: Math.abs(pos.x - mouse.initial.mouse.x),
                            y: Math.abs(pos.y - mouse.initial.mouse.y)
                        };

                        if (delta.x > mc.state.snap.distance || delta.y > mc.state.snap.distance || !mc.state.snap.toStartPosition) {
                            if (delta.x > delta.y) {
                                coords.y = original.y;
                            }
                            else {
                                coords.x = original.x;
                            }
                        }
                        else if (mc.state.snap.toStartPosition) {
                            coords.x = original.x;
                            coords.y = original.y;
                        }
                    }
                    newCoords[index] = _.clone(coords);
                    layer.coords.update(coords);
                });
            }
            else {
                _.each(this.list, (layer, index) => {
                    var original = this.oldCoords[index];
                    var dist = mouse.initial.dist[index];
                    if (!_.isObject(dist)) {
                        dist = {
                            x: mouse.initial.mouse.x - original.x,
                            y: mouse.initial.mouse.y - original.y
                        };
                        if (layer.original) {
                            console.log(original.matrix, layer.coords.matrix);
                            original.width = layer.coords.width * layer.coords.matrix.a;
                            original.height = layer.coords.height * layer.coords.matrix.d;
                        }
                    }
                    var coords = {
                        x: pos.x - dist.x,
                        y: pos.y - dist.y
                    };
                    var delta = {
                        x: pos.x - mouse.initial.mouse.x,
                        y: pos.y - mouse.initial.mouse.y
                    };

                    switch (mouse.action) {
                        case 'nw-resize':
                            coords.width = original.width + delta.x * -1;
                            coords.height = original.height + delta.y * -1;
                            coords.x = pos.x;
                            coords.y = pos.y;

                            if (mc.session.keys.shift) {
                                var wProp = coords.width / original.width;
                                var hProp = coords.height / original.height;
                                coords.height = original.height * (wProp + hProp) / 2;
                                coords.width = original.width * (wProp + hProp) / 2;

                                coords.x = Math.min(original.x + original.width - coords.width, original.x + original.width);
                                coords.y = Math.min(original.y + original.height - coords.height, original.y + original.height);
                            }
                            if (mc.session.keys.alt) {
                                coords.x = Math.min(coords.x, original.x + original.width / 2);
                                coords.y = Math.min(coords.y, original.y + original.height / 2);
                                coords.width = coords.width - Math.sign(coords.x - original.x) * Math.abs(original.width - coords.width);
                                coords.height = coords.height - Math.sign(coords.y - original.y) * Math.abs(original.height - coords.height);
                            }
                            coords.x = Math.min(coords.x, original.x + original.width);
                            coords.y = Math.min(coords.y, original.y + original.height);
                            break;
                        case 'ne-resize':
                            coords.width = original.width + pos.x - original.x - original.width;
                            coords.height = original.height - pos.y + original.y;
                            if (mc.session.keys.shift) {
                                wProp = coords.width / original.width;
                                hProp = coords.height / original.height;
                                coords.height = original.height * (wProp + hProp) / 2;
                                coords.width = original.width * (wProp + hProp) / 2;

                                coords.y = Math.min(original.y + original.height - coords.height, original.y + original.height);
                            }
                            else {
                                coords.y = Math.min(pos.y, original.y + original.height);
                            }
                            coords.x = original.x;
                            break;
                        case 'se-resize':
                            coords.width = original.width + (pos.x - original.x - original.width);
                            coords.height = original.height + (pos.y - original.y - original.height);
                            if (mc.session.keys.shift) {
                                wProp = coords.width / original.width;
                                hProp = coords.height / original.height;
                                coords.height = original.height * (wProp + hProp) / 2;
                                coords.width = original.width * (wProp + hProp) / 2;
                            }
                            coords.x = original.x;
                            coords.y = original.y;
                            break;
                        case 'sw-resize':
                            coords.width = original.width + (original.x - pos.x);
                            coords.height = original.height + (pos.y - original.y - original.height);
                            if (mc.session.keys.shift) {
                                wProp = coords.width / original.width;
                                hProp = coords.height / original.height;
                                coords.height = original.height * (wProp + hProp) / 2;
                                coords.width = original.width * (wProp + hProp) / 2;

                                coords.x = Math.min(original.x + original.width - coords.width, original.x + original.width);
                            }
                            else {
                                coords.x = Math.min(pos.x, original.x + original.width);
                            }
                            coords.y = original.y;
                            break;
                        case 'n-resize':
                            coords.width = original.width;
                            coords.height = original.height + (original.y - pos.y);
                            coords.x = original.x;
                            coords.y = Math.min(pos.y, original.y + original.height);
                            break;
                        case 'w-resize':
                            coords.width = original.width + (original.x - pos.x);
                            coords.height = original.height;
                            coords.x = Math.min(pos.x, original.x + original.width);
                            coords.y = original.y;
                            break;
                        case 's-resize':
                            coords.width = original.width;
                            coords.height = original.height + (pos.y - original.y - original.height);
                            coords.x = original.x;
                            coords.y = original.y;
                            break;
                        case 'e-resize':
                            coords.width = original.width + (pos.x - (original.x + original.width));
                            coords.height = original.height;
                            coords.x = original.x;
                            coords.y = original.y;
                            break;
                    }
                    coords.width = Math.max(0, coords.width);
                    coords.height = Math.max(0, coords.height);

                    newCoords[index] = _.clone(coords);
                    coords.scale = true;
                    coords.scaleX = coords.width / original.width;
                    coords.scaleY = coords.height / original.height;
                    layer.coords.update(coords, true);
                });
            }
        }
        requestAnimationFrame(this.draw.bind(this));
    }
    mouseUp(e) {
        if (!this.state.transform) return;
        var mc = this.mercuryCanvas;
        var selectedLayers = mc.session.selectedLayers;
        var newCoords = [];
        if (this.actioned == 'move') {
            _.each(selectedLayers.list, (layer, index) => {
                newCoords[index] = _.clone(layer.coords);
            });
            mc.session.addOperation({
                type: 'layer.move',
                layers: _.clone(selectedLayers.list),
                old: this.oldCoords,
                new: newCoords
            });
            this.actioned = false;
            this.oldCoords = [];
            mc.session.mouse.reset();
            requestAnimationFrame(this.draw.bind(this, e));
        }
        else {
            var oldImages = [];
            var newImages = [];
            async.each(this.list, (layer, callback) => {
                newCoords[this.list.indexOf(layer)] = _.clone(layer.coords);
                async.waterfall([
                    (cb) => {
                        layer.canvas.toBlob((blob) => {
                            var url = URL.createObjectURL(blob);
                            if (!layer.original) layer.original = url;
                            oldImages.push({
                                element: layer.element,
                                image: url
                            });
                            cb();
                        });
                    },
                    (cb) => layer.scale(layer.coords, cb),
                    (cb) => {
                        layer.canvas.toBlob((blob) => {
                            newImages.push({
                                element: layer.element,
                                image: URL.createObjectURL(blob)
                            });
                            cb();
                        });
                    },
                ], callback);
            }, () => {
                mc.session.addOperation({
                    type: 'transform',
                    layers: _.clone(selectedLayers.list),
                    coords: {
                        old: this.oldCoords,
                        new: newCoords
                    },
                    images: {
                        old: oldImages,
                        new: newImages
                    }
                });
                this.actioned = false;
                this.oldCoords = [];
                mc.session.mouse.reset();
                requestAnimationFrame(this.draw.bind(this, e));
            });
        }
    }
}
class File {
    constructor(mc) {
        this.mercuryCanvas = mc;
        this.input = $('<input>', {
            type: 'file',
            name: 'picture',
            accept: 'image/*',
            multiple: true
        }).hide().appendTo(mc.element);

        this.a = $('<a>', {
            style: 'display: none',
            download: mc.state.downloadName
        }).appendTo(mc.element);

        window.URL = window.URL || window.webkitURL;
        this.useBlob = window.URL;

        this.input.on('change', () => {
            this.readFiles(this.input[0].files);
        });
    }
    readFiles(files) {
        _.each(files, (file) => {
            if (!file) return;
            var reader = new FileReader();

            reader.onload = () => {
                var image = new Image();
                image.addEventListener('load', () => {
                    if (this.useBlob) {
                        window.URL.revokeObjectURL(file);
                    }
                    this.load(image, {
                        name: file.name,
                        width: image.width,
                        height: image.height,
                        type: file.type,
                        size: {
                            mb: Math.round(file.size / 1024 / 1024),
                            kb: Math.round(file.size / 1024),
                            b: file.size
                        }
                    });
                });

                image.src = this.useBlob ? window.URL.createObjectURL(file) : reader.result;
            };

            reader.readAsDataURL(file);
        });
    }
    load(image, imageInfo) {
        if (imageInfo.size.mb > 0.5) log.warn('The image could slow the app down.');
        var layer = new Layer({
            image: image,
            parent: this.mercuryCanvas,
            name: imageInfo.name
        });
        this.mercuryCanvas.session.addOperation({
            type: 'layer.add',
            layer: layer
        });
    }
    openUploadDialog() {
        this.input.click();
    }
    download() {
        var mc = this.mercuryCanvas;
        var zSorted = [];
        _.each(mc.layers.list, (layer) => {
            zSorted[layer.coords.z] = layer;
        });

        mc.overlay.context.drawImage(mc.base.canvas, 0, 0);
        _.each(zSorted, (layer) => {
            if (!layer) return;
            mc.overlay.context.drawImage(layer.canvas, layer.coords.x, layer.coords.y);
        });
        mc.overlay.state.dirty = true;

        mc.overlay.canvas.toBlob((blob) => {
            var url = window.URL.createObjectURL(blob);
            this.a[0].href = url;
            this.a[0].click();
            setTimeout(() => {
                window.URL.revokeObjectURL(url);
            });
            mc.overlay.clear();
        });
    }
}
class Mouse {
    constructor() {
        this.reset();
    }
    reset() {
        this.points = [];
        this.delta = {};
        this.extremes = {
            x: Infinity,
            y: Infinity,
            x2: 0,
            y2: 0
        };
    }
}
class Session {
    constructor(e) {
        _.extend(this, {
            width: 0,
            height: 0,
            mouse: new Mouse(),
            selectedLayers: null,
            mercuryCanvas: null,
            file: null,
            keys: {},
            operations: [],
            operationIndex: 0,
            zIndex: 1
        }, e);
        this.file = new File(this.mercuryCanvas);
        this.selectedLayers = new SelectedLayers(this.mercuryCanvas);
    }
    undo() {
        this.operationIndex--;

        if (!this.updateMenus()) return false;

        var operation = this.operations[this.operationIndex];
        if (_.isObject(operation.tool) && _.isFunction(operation.tool.undo)) {
            operation.tool.undo(operation);
        }
        if (_.isString(operation.type)) {
            this.mercuryCanvas.emit('undo.' + operation.type, operation);
        }
    }
    redo() {
        this.operationIndex++;

        if (!this.updateMenus()) return false;

        var operation = this.operations[this.operationIndex - 1];
        if (_.isObject(operation.tool) && _.isFunction(operation.tool.redo)) {
            operation.tool.redo(operation);
        }
        if (_.isString(operation.type)) {
            this.mercuryCanvas.emit('redo.' + operation.type, operation);
        }
    }
    updateMenus() {
        if (this.operationIndex == this.operations.length) {
            this.toggleButton({
                name: 'redo',
                state: false
            });
        }
        else if (this.operationIndex > this.operations.length) {
            this.operationIndex = this.operations.length;
            return log.warn('Operation index is bigger than the list of operations.');
        }
        else {
            this.toggleButton({
                name: 'redo',
                state: true
            });
        }
        if (this.operationIndex == 0) {
            this.toggleButton({
                name: 'undo',
                state: false
            });
        }
        else if (this.operationIndex < 0) {
            this.operationIndex = 0;
            return log.warn('Operation index is smaller than 0.');
        }
        else {
            this.toggleButton({
                name: 'undo',
                state: true
            });
        }
        return true;
    }
    addOperation(e) {
        this.clearOrphanOperations();
        this.operations.push(e);
        this.operationIndex++;
        this.updateMenus();
    }
    clearOrphanOperations() {
        var removed = this.operations.splice(this.operationIndex);
        _.forIn(removed, (operation) => {
            if (_.isObject(operation.tool) && _.isFunction(operation.tool.operationRemove)) {
                operation.tool.operationRemove(operation);
            }
            if (_.isString(operation.type)) {
                this.mercuryCanvas.emit('operationRemove.' + operation.type, operation);
            }
        });
    }
    toggleButton(e) {
        var mc = this.mercuryCanvas;
        _.forIn(mc.state.menus, (menu) => {
            if (_.isFunction(menu.toggleTool)) {
                menu.toggleTool(e);
            }
        });
    }
}
export default Session;