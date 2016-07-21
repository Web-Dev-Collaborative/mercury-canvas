var log = require('loglevel-message-prefix')(window.log.getLogger('session.js'), {
    prefixes: ['level'],
    staticPrefixes: ['session.js'],
    separator: '/'
});
import _ from 'lodash';
import {coords} from './helpers.js';

class SelectedLayer {
    constructor() {
        this.list = [];
        this.rect = {};
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
    select(layer) {
        this.list.push(layer);
        this.makeBox();
    }
}

class Mouse {
    constructor() {
        this.reset();
    }
    reset() {
        this.points = [];
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
            selectedLayers: new SelectedLayer(),
            mercuryCanvas: null,
            keys: {},
            operations: [],
            operationIndex: 0,
            zIndex: 1
        }, e);
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