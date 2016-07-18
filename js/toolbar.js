var log = require('loglevel-message-prefix')(window.log.getLogger('toolbar.js'), {
    prefixes: ['level'],
    staticPrefixes: ['toolbar.js'],
    separator: '/'
});
import _ from 'lodash';
import classnames from 'classnames';
import sortable from 'sortablejs';
import {Matrix} from 'transformation-matrix-js';
import {coords} from './helpers';

class Tool {
    constructor(options, parent) {
        _.merge(this, {
            end: false,
            disabled: false,
            action: false,
            selected: false,
            select: () => { },
            deselect: () => { },
            mouseDown: () => { },
            mouseMove: () => { },
            mouseUp: () => { },
            mouseLeave: () => { },
            load: () => { },
            name: '',
            icon: ''
        }, options);
        this.parent = parent;
        this.icon = this.icon.length > 0 ? this.icon : (options.icon ? options.icon : 'fa-' + options.name);

        this.mercuryCanvas = this.parent.mercuryCanvas;
        this.element = $('<div>', {
            class: classnames('tool', this.name, {
                end: this.end,
                disabled: this.disabled,
                first: this.first
            }),
            html: $('<i>', {
                class: classnames('fa', 'fa-fw', this.icon)
            })
        }).appendTo(this.parent.element);

        if (_.isString(this.key) || _.isArray(this.key)) {
            this.mercuryCanvas.addShortcut(this.key, (e) => {
                e.preventDefault();
                this.onClick(true);
            });
        }

        this.element.on('click', this.onClick.bind(this));

        setTimeout((function () {
            this.load();
            if (this.selected) this.onClick(true);
        }).bind(this));
    }
    onClick(e) {
        if (this.disabled) return;

        if (_.isObject(e) || e === true) this.select.bind(this)();

        if (this.action) return;

        if (this.parent.lastTool) {
            this.parent.lastTool.deselect();
        }
        this.parent.element.children('div').removeClass('selected');
        this.element.addClass('selected');
        this.parent.selectTool(this);
    }
    remove() {
        this.element.remove();
    }
    toggle(e) {
        if (e) this.element.removeClass('disabled');
        else this.element.addClass('disabled');
        this.disabled = !e;
    }
}

class Menu {
    constructor(options) {
        _.merge(this, {
            classes: '',
            fixed: false,
            mouseDown: false,
            orientation: {
                horizontal: false,
                vertical: false
            }
        }, options);

        this.determineOrientation();

        var menu = $('<div>', {
            class: classnames('menu', {
                'horizontal': this.orientation.horizontal,
                'vertical': this.orientation.vertical,
                'fixed': this.fixed !== false
            }, this.classes, this.fixed)
        }).appendTo(this.parent.element);

        this.mercuryCanvas = this.parent;
        this.element = menu;

        var mc = this.mercuryCanvas;
        if (this.fixed === false) {
            this.handle = $('<div>', {
                class: 'handle',
                html: $('<i>', {
                    class: 'fa fa-fw fa-bars'
                })
            }).prependTo(menu);

            this.matrix = new Matrix();
            this.coords = new coords();
            this.handle.on('mousedown touchstart', (e) => {
                this.mouseDown = true;
                if (e.pageX && e.pageY) {
                    this.dist = {
                        x: this.coords.x - e.pageX,
                        y: this.coords.y - e.pageY
                    };
                }
            });
            var mouseup = function () {
                this.mouseDown = false;
                this.dist = undefined;
                if (this.clone) {
                    this.removeClone();
                    if (!this.snap) return;

                    this.fixed = this.snap;
                    this.determineOrientation();

                    this.element.removeClass('horizontal vertical left right top bottom').addClass(this.fixed).addClass('fixed').removeAttr('style');
                    this.element.addClass(this.orientation.horizontal ? 'horizontal' : 'vertical');
                }
            };
            mouseup = mouseup.bind(this);
            mc.on('mouseup', mouseup);
            mc.on('touchcancel', mouseup);
            mc.on('touchend', mouseup);

            var mousemove = function (e) {
                if (!this.mouseDown) {
                    return;
                }
                if (!this.dist) {
                    this.dist = {
                        x: this.coords.x - e.pageX,
                        y: this.coords.y - e.pageY
                    };
                }

                this.coords.update({
                    x: this.dist.x + e.pageX,
                    y: this.dist.y + e.pageY
                });

                var mc = this.mercuryCanvas;
                var newSnap = this.calculateSnap({
                    x: e.pageX,
                    y: e.pageY
                });

                if (newSnap) {
                    if (this.clone && this.snap == newSnap) return;
                    if (this.snap != newSnap) this.removeClone();

                    this.clone = this.element.clone().removeAttr('style').addClass('fixed');
                    if (newSnap == 'left') {
                        this.clone.addClass('left vertical').removeClass('horizontal');
                    }
                    if (newSnap == 'right') {
                        this.clone.addClass('right vertical').removeClass('horizontal');
                    }
                    if (newSnap == 'top') {
                        this.clone.addClass('top horizontal').removeClass('vertical');
                    }
                    if (newSnap == 'bottom') {
                        this.clone.addClass('bottom horizontal').removeClass('vertical');
                    }
                    this.clone.css({
                        zIndex: 1001
                    });
                    this.clone.appendTo(mc.element);
                    this.element.hide();
                }
                else if (this.clone) {
                    this.removeClone();
                }
                this.snap = newSnap;
            };
            mousemove = mousemove.bind(this);
            mc.on('mousemove', mousemove);
            mc.on('touchmove', (e) => mousemove(e.originalEvent.touches[0]));

            this.coords.on('update', () => {
                this.matrix.reset();
                this.matrix.translate(this.coords.x, this.coords.y);
                this.element.css({
                    transform: this.matrix.toCSS()
                });
            });
            setTimeout(() => {
                this.coords.update({
                    width: this.element.width(),
                    height: this.element.height()
                });
            });
        }
    }
    determineOrientation() {
        if (this.fixed.length > 0 && !this.orientation.horizontal && !this.orientation.vertical) {
            this.orientation.horizontal = this.fixed == 'top' || this.fixed == 'bottom';
            this.orientation.vertical = this.fixed == 'left' || this.fixed == 'right';
        }
        if (!this.orientation.horizontal && !this.orientation.vertical) {
            this.orientation.vertical = true;
        }
    }
    removeClone() {
        if (!this.clone) return;
        this.clone.remove();
        this.clone = undefined;
        this.element.show();
    }
    calculateSnap(e, distance) {
        var mc = this.mercuryCanvas;
        if (!_.isNumber(distance) || _.isNaN(distance) || distance <= 0) distance = mc.state.snap.menuDistance;
        if (e.x < distance) {
            return 'left';
        }
        if (e.y < distance) {
            return 'top';
        }
        if (e.x > mc.session.width - distance) {
            return 'right';
        }
        if (e.y > mc.session.height - distance) {
            return 'bottom';
        }
        return false;
    }
    resize(options) {
        if (this.fixed.length > 0) {
            if (this.orientation.horizontal) {
                this.element.css({
                    width: options.width
                });
            }
            else {
                this.element.css({
                    top: options.topHeight,
                    height: options.height - options.menuHeight
                });
            }
        }
        else {
            // dragable menu, make sure it stays on screen
        }
    }
}

class Toolbar extends Menu {
    constructor(options) {
        super(options);
        this.element.addClass('toolbar');
        this.tools = [];

        if (options.tools && options.tools.length > 0) {
            this.addTools(options.tools);
        }
    }
    addTools(tools) {
        if (typeof tools != 'object' || tools.length === undefined) {
            tools = [tools];
        }
        var firstEnd = false;
        _.forIn(tools, (tool) => {
            if (tool.end && !firstEnd) {
                tool.first = true;
                firstEnd = true;
            }
            this.tools.push(new Tool(tool, this));
        });
    }
    removeTools(tools) {
        if (typeof tools == 'boolean') {
            tools = this.tools;
        }
        else if (typeof tools != 'object' || tools.length === undefined) {
            tools = [tools];
        }

        _.forIn(tools, (tool) => {
            var removedTools = _.remove(this.tools, {
                name: typeof tool == 'object' ? tool.name : tool
            });
            _.forIn(removedTools, (removedTool) => {
                removedTool.remove();
            });
        });
    }
    selectTool(e) {
        var activeTools = this.parent.state.activeTools;
        if (this.lastTool) {
            activeTools.splice(activeTools.indexOf(this.lastTool), 1);
        }
        this.lastTool = e;
        activeTools.push(e);
    }
    toggleTool(e) {
        if (!_.isObject(e) || !_.has(e, 'name' || !_.has(e, 'state'))) return;

        _.forIn(this.tools, (tool) => {
            if (tool.name != e.name) return;
            tool.toggle(e.state);
        });
    }
}

class LayerThumbnail {
    constructor(options) {
        this.layer = options.layer;
        this.id = options.id;
        this.wrapper = $('<div>', {
            class: 'layerThumbnail',
            'data-id': this.id
        });

        this.visibleIcon = $('<i>');
        this.visibleIconWrapper = $('<div>', {
            class: 'visible',
            html: this.visibleIcon
        }).appendTo(this.wrapper);

        $('<div>', {
            class: 'divider'
        }).appendTo(this.wrapper);

        this.thumbnail = $('<div>', {
            class: 'thumbnail'
        }).append($('<div>', {
            class: 'transparent'
        })).append($('<div>', {
            class: 'image'
        })).appendTo(this.wrapper);
        this.thumbnail = this.thumbnail.children('.image');

        this.name = $('<div>', {
            class: 'name'
        }).appendTo(this.wrapper);

        this.update();

        this.visibleIconWrapper.on('click', this.layer.toggleVisibility);
        this.wrapper.prependTo(options.parent);
    }
    update() {
        this.visibleIcon.attr('class', classnames('fa', 'fa-fw', {
            'fa-eye': this.layer.visible,
            'fa-square': !this.layer.visible
        }));

        this.wrapper.css({
            zIndex: this.layer.coords.z
        });

        this.thumbnail.css('background-image', `url("${this.layer.canvas.toDataURL()}")`);
        this.name.html(this.layer.name);
    }
    delete() {
        this.wrapper.remove();
    }
    remove() {
        this.wrapper.hide();
    }
    restore() {
        this.wrapper.show();
    }
}

class LayersPanel extends Menu {
    constructor(options) {
        super(options);
        var self = this;
        this.element.addClass('layersPanel');

        this.layersList = $('<div>', {
            class: 'layersList'
        }).appendTo(this.element);
        this.buttons = {};
        this.buttons.wrapper = $('<div>', {
            class: 'buttons'
        }).appendTo(this.element);
        this.buttons.trash = $('<div>', {
            class: 'tool trash',
            html: $('<i>', {
                class: 'fa fa-fw fa-trash'
            })
        }).appendTo(this.buttons.wrapper);

        this.last = {};
        this.sortable = new sortable(this.layersList[0], {
            group: {
                name: 'layerThumbnails',
                put: false,
                pull: 'clone'
            },
            dataIdAttr: 'data-id',
            animation: 150,
            filter: '.visible',
            draggable: '.layerThumbnail',
            onEnd: this.onEnd.bind(this),
            onStart: (event) => {
                this.last.oldIndex = event.oldIndex;
            },
            onMove: (event) => {
                var t0 = performance.now();
                var dragged = event.dragged;
                var related = event.related;

                if (dragged == related || !dragged.className.indexOf('layerThumbnail') || !related.className.indexOf('layerThumbnail')) return;

                _.each(this.thumbnails, (thumbnail) => {
                    if (!thumbnail) return;
                    if (thumbnail.wrapper[0] == dragged) {
                        dragged = thumbnail.layer.coords;
                    }
                    if (thumbnail.wrapper[0] == related) {
                        related = thumbnail.layer.coords;
                    }
                });
                var a = dragged.z;
                dragged.update({
                    z: related.z
                });
                related.update({
                    z: a
                });

                var t1 = performance.now();
                log.debug('I spent ' + (t1 - t0) + 'ms to switch the z-indexes between the dragged layers');
            }
        });
        this.trashSortable = new sortable(this.buttons.trash[0], {
            group: {
                name: 'layerThumbnails',
                put: true,
                pull: false
            },
            onAdd: (event) => {
                this.moveThumbnail({
                    newIndex: this.last.oldIndex,
                    element: event.item
                });
                var thumbnail = self.elementToThumbnail({
                    element: event.item
                });
                thumbnail.layer.remove();
                event.item.remove();
            },
        });

        this.thumbnails = [];
        this.lastID = 0;
        var mc = this.mercuryCanvas;

        mc.on('layer.new', (layer) => {
            this.lastID++;
            self.thumbnails.unshift(new LayerThumbnail({
                layer: layer,
                parent: self.layersList,
                id: this.lastID
            }));
        });
        mc.on('layer.update', (layer) => {
            var thumbnail = this.elementToThumbnail({
                layer: layer
            });
            if (!thumbnail) return;
            thumbnail.update();
        });
        mc.on('layer.remove', (layer) => {
            var thumbnail = self.elementToThumbnail({
                layer: layer
            });
            if (!thumbnail) return;

            if (!this.layersList[0].contains(thumbnail.wrapper[0])) {
                thumbnail.wrapper = $('.sortable-chosen', this.layersList).removeClass('sortable-chosen');
            }
            thumbnail.remove();
        });
        mc.on('layer.restore', (layer) => {
            var thumbnail = self.elementToThumbnail({
                layer: layer
            });
            if (!thumbnail) return;
            thumbnail.restore();
        });
        mc.on('layer.detele', (layer) => {
            _.remove(self.thumbnails, (thumbnail) => {
                if (thumbnail.layer != layer) return false;

                thumbnail.delete();
                return true;
            });
        });
        mc.on('layer.z.update', (options) => {
            var thumbnail = this.elementToThumbnail({
                layer: options.layer
            });

            var l = self.thumbnails.length;
            var thumbnailIndex = self.thumbnails.indexOf(thumbnail);
            if (thumbnailIndex == l - options.z) return;

            this.moveThumbnail({
                oldIndex: thumbnailIndex,
                newIndex: l - options.z
            });
            this.onEnd({
                oldIndex: thumbnailIndex,
                newIndex: l - options.z,
                simulated: true,
                session: options.session
            });
        });
        mc.on('undo.layer.zIndex', (operation) => {
            operation.layer.coords.update({
                z: operation.old.z,
                session: true
            });
        });
        mc.on('redo.layer.zIndex', (operation) => {
            operation.layer.coords.update({
                z: operation.new.z,
                session: true
            });
        });
        mc.on('undo.layer.remove', (operation) => {
            operation.layer.restore();
        });
        mc.on('redo.layer.remove', (operation) => {
            operation.layer.remove(true);
        });
    }
    elementToThumbnail(options) {
        if (!_.isObject(options) || (!_.has(options, 'layer') && !_.has(options, 'element'))) return false;
        var a;
        if (options.layer) {
            if (_.isFunction(options.layer.get)) options.layer = options.layer.get(0);
            if (_.has(options.layer, 'name')) options.layer = options.layer.element[0];
        }
        if (options.element) {
            if (_.isFunction(options.element.get)) options.element = [options.element.get(0)];
        }

        _.each(this.thumbnails, (thumbnail) => {
            if (!thumbnail) return;
            if (thumbnail.layer.element[0] == options.layer) {
                a = thumbnail;
                return false;
            }
            if (thumbnail.wrapper[0] == options.element) {
                a = thumbnail;
                return false;
            }
        });
        return a;
    }
    updateZIndexes(layer) {
        var a;
        var l = this.thumbnails.length;
        _.each(this.thumbnails, (thumbnail, index) => {
            if (!thumbnail) return;
            var i = l - index;
            if (thumbnail.layer == layer) a = i;

            thumbnail.layer.coords.update({
                z: i
            });
        });
        return a;
    }
    onEnd(event) {
        if (!_.isNumber(event.oldIndex) || !_.isNumber(event.newIndex) || _.isNaN(event.oldIndex) || _.isNaN(event.newIndex) || event.oldIndex == event.newIndex || !event.explicitOriginalTarget || event.explicitOriginalTarget.className.indexOf('fa-fw') != -1) return;

        var thumbnail = this.thumbnails.splice(event.oldIndex, 1)[0];
        this.thumbnails.splice(event.newIndex, 0, thumbnail);

        if (!event.simulated) {
            event.oldIndex = this.thumbnails.length - event.oldIndex - 1;
            event.newIndex = this.thumbnails.length - event.newIndex - 1;
        }
        this.updateZIndexes();

        if (event.session || thumbnail.layer.removed) return;

        this.mercuryCanvas.session.addOperation({
            type: 'layer.zIndex',
            layer: thumbnail.layer,
            old: {
                z: event.oldIndex + 1
            },
            new: {
                z: event.newIndex + 1
            }
        });
    }
    moveThumbnail(options) {
        if (!options.oldIndex && options.element) {
            options.oldIndex = this.thumbnails.indexOf(options.element.attributes['data-id'].value);
        }
        var order = this.sortable.toArray();
        var thumbnailID = order.splice(options.oldIndex, 1)[0];
        order.splice(options.newIndex, 0, thumbnailID);
        this.sortable.sort(order);
    }
}

export {Toolbar, LayersPanel};