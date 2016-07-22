var log = require('loglevel-message-prefix')(window.log.getLogger('session.js'), {
    prefixes: ['level'],
    staticPrefixes: ['session.js'],
    separator: '/'
});
import _ from 'lodash';
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
    transformStart() {
        if (this.state.transform) return;
        this.state.transform = true;
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
            var files = this.input[0].files;
            _.each(files, (file) => {
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
        });
    }
    load(image, imageInfo) {
        if (imageInfo.size.mb > 0.5) log.warn('The image could slow the app down.');
        new Layer({
            image: image,
            parent: this.mercuryCanvas,
            name: imageInfo.name
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

        mc.overlay.canvas.toBlob((blob) => {
            var url = window.URL.createObjectURL(blob);
            this.a[0].href = url;
            this.a[0].click();
            setTimeout(() => window.URL.revokeObjectURL(url));
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
            if (!_.isObject(operation.tool) || !_.isFunction(operation.tool.operationRemove)) return;
            operation.tool.operationRemove(operation);
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