var log = require('loglevel-message-prefix')(window.log.getLogger('tools.js'), {
    prefixes: ['level'],
    staticPrefixes: ['tools.js'],
    separator: '/'
});
import _ from 'lodash';
import {Matrix} from 'transformation-matrix-js';
import {coords} from './helpers.js';
import Layer from './layer.js';

import colorPicker from 'simple-color-picker';
import 'simple-color-picker/simple-color-picker.css';

var topbarTools = [
    {
        name: 'undo',
        action: true,
        key: 'mod + z',
        select: function () {
            this.mercuryCanvas.session.undo();
        }
    },
    {
        name: 'redo',
        icon: 'fa-repeat',
        action: true,
        key: ['mod + y', 'mod + shift + z'],
        select: function () {
            this.mercuryCanvas.session.redo();
        }
    },
    {
        name: 'brush',
        icon: 'fa-paint-brush',
        selected: true,
        key: 'b',
        load: function () {
            var mc = this.mercuryCanvas;
            var cursor = $('<div>', {
                class: 'brushCursor'
            }).hide();
            cursor.appendTo(mc.layersContainer);
            this.cursor = cursor;
            this.canShow = false;
            this.zIndex = 0;
            this.shown = false;
            this.matrix = new Matrix();
        },
        select: function () {
            var mc = this.mercuryCanvas;

            mc.overlay.clear();
            this.canShow = true;
            mc.layersContainer.css({
                cursor: 'none'
            });
        },
        deselect: function () {
            var mc = this.mercuryCanvas;

            this.cursor.hide();
            mc.layersContainer.css({
                cursor: 'default'
            });
            this.shown = false;
            this.canShow = false;
        },
        draw: function () {
            var t0 = performance.now();
            var mc = this.mercuryCanvas;
            var points = mc.session.mouse.points;
            if (!points.length) return;

            mc.overlay.clear();

            mc.overlay.context.beginPath();
            mc.overlay.context.moveTo(points[0].x, points[0].y);

            if (points.length < 3) {
                var b = points[0];
                mc.overlay.context.beginPath();
                mc.overlay.context.arc(b.x, b.y, mc.overlay.context.lineWidth / 2, 0, Math.PI * 2, false);
                mc.overlay.context.fill();
                mc.overlay.context.closePath();
                mc.overlay.state.dirty = true;
                return;
            }

            for (var i = 0; i < points.length - 2; i++) {
                var point1 = points[i];
                var point2 = points[i + 1];
                var c = (point1.x + point2.x) / 2;
                var d = (point1.y + point2.y) / 2;

                mc.overlay.context.quadraticCurveTo(point1.x, point1.y, c, d);
            }

            mc.overlay.context.quadraticCurveTo(
                points[i].x,
                points[i].y,
                points[i + 1].x,
                points[i + 1].y
            );

            mc.overlay.context.stroke();
            mc.overlay.state.dirty = true;
            var t1 = performance.now();
            log.debug('I spent ' + (t1 - t0) + 'ms to draw the overlay');
        },
        mouseDown: function (e) {
            var mc = this.mercuryCanvas;

            mc.session.mouse.points = [];

            mc.overlay.context.lineWidth = mc.state.lineWidth;
            mc.overlay.context.strokeStyle = mc.state.strokeColor;
            mc.overlay.context.fillStyle = mc.state.strokeColor;
            mc.overlay.context.lineCap = mc.overlay.context.lineJoin = 'round';

            this.mouseMove(e);
            requestAnimationFrame(this.draw.bind(this, e));
        },
        mouseMove: function (e) {
            var mc = this.mercuryCanvas;

            var css = {};
            if (this.canShow && !this.shown) {
                this.shown = true;
                this.cursor.show();
            }
            if (this.zIndex - 1 < mc.session.zIndex) {
                css.zIndex = mc.session.zIndex + 1;
                this.zIndex = mc.session.zIndex + 1;
            }
            if (mc.state.lineWidth != this.size) {
                css.width = mc.state.lineWidth;
                css.height = mc.state.lineWidth;
                this.size = mc.state.lineWidth;
            }

            var mouse = mc.session.mouse;
            var pos = new coords(e).toCanvasSpace(mc);

            this.matrix.translate(pos.x - this.matrix.e, pos.y - this.matrix.f);
            this.matrix.translate(-mc.state.lineWidth / 2, -mc.state.lineWidth / 2);
            css.transform = this.matrix.toCSS();

            this.cursor.css(css);
            if (!mouse.down) return;

            if (mc.session.keys.shift && mouse.points.length) {
                var initial = mouse.points[0];
                if (!_.isNumber(mouse.delta.x) || !_.isNumber(mouse.delta.y)) {
                    mouse.delta = {
                        x: Math.abs(pos.x - initial.x),
                        y: Math.abs(pos.y - initial.y)
                    };
                }

                if (mouse.delta.x > mouse.delta.y) {
                    pos.y = initial.y;
                }
                else {
                    pos.x = initial.x;
                }
            }

            mouse.points.push(pos);
            mouse.extremes = {
                x: Math.min(mouse.extremes.x, pos.x),
                y: Math.min(mouse.extremes.y, pos.y),
                x2: Math.max(mouse.extremes.x2, pos.x),
                y2: Math.max(mouse.extremes.y2, pos.y)
            };
        },
        mouseUp: function () {
            var mc = this.mercuryCanvas;
            var mouse = mc.session.mouse;
            if (!mouse.points.length) return;

            var newLayer = new Layer({
                parent: mc
            });

            mouse.extremes.x -= mc.state.lineWidth / 2 + 1;
            mouse.extremes.y -= mc.state.lineWidth / 2 + 1;
            mouse.extremes.x2 += mc.state.lineWidth / 2 + 1;
            mouse.extremes.y2 += mc.state.lineWidth / 2 + 1;

            mc.overlay.copyTo(newLayer, mouse.extremes);
            mc.session.addOperation({
                tool: this,
                layer: _.clone(newLayer),
                mouse: _.clone(mouse)
            });
            mc.overlay.clear();
            mouse.reset();
        },
        operationRemove: function (e) {
            e.layer.element.remove();
        },
        undo: function (e) {
            e.layer.remove(true);
        },
        redo: function (e) {
            e.layer.restore();
        }
    },
    {
        name: 'move',
        icon: 'fa-arrows',
        selected: true,
        key: 'v',
        load: function () {
            this.oldCoords = [];
            var mc = this.mercuryCanvas;
            var selectedLayers = mc.session.selectedLayers;

            mc.on('undo.layer.move', (operation) => {
                _.each(operation.layers, (layer, index) => {
                    layer.coords.update(operation.old[index]);
                });
                selectedLayers.makeBox();
            });
            mc.on('redo.layer.move', (operation) => {
                _.each(operation.layers, (layer, index) => {
                    layer.coords.update(operation.new[index]);
                });
                selectedLayers.makeBox();
            });
        },
        mouseDown: function (e) {
            var mc = this.mercuryCanvas;
            var selectedLayers = mc.session.selectedLayers;
            if (!selectedLayers.list.length) return;

            var pos = new coords(e).toCanvasSpace(mc);

            _.each(selectedLayers.list, (layer, index) => {
                this.oldCoords[index] = _.clone(layer.coords);
            });
            mc.session.mouse.initial = {
                dist: [],
                mouse: _.clone(pos),
                selectedLayers: selectedLayers.list.map(layer => _.clone(layer.coords))
            };
        },
        mouseMove: function (e) {
            var mc = this.mercuryCanvas;
            if (!mc.session.mouse.down || !mc.session.mouse.initial) return;

            var mouse = mc.session.mouse;
            var pos = new coords(e).toCanvasSpace(mc);
            mouse.last = e;
            this.actioned = true;

            var selectedLayers = mc.session.selectedLayers;
            var dist = mouse.initial.dist;
            var oldCoords = [];
            var newCoords = [];
            _.each(selectedLayers.list, (layer, index) => {
                if (!_.isObject(mouse.initial.dist[index])) {
                    dist[index] = {
                        x: mouse.initial.mouse.x - mouse.initial.selectedLayers[index].x,
                        y: mouse.initial.mouse.y - mouse.initial.selectedLayers[index].y
                    };
                }
                oldCoords[index] = _.clone(layer.coords);
                var coords = {
                    x: pos.x - dist[index].x,
                    y: pos.y - dist[index].y
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

            selectedLayers.makeBox();
        },
        mouseUp: function () {
            var mc = this.mercuryCanvas;
            var selectedLayers = mc.session.selectedLayers;
            if (this.actioned) {
                this.actioned = false;
                var newCoords = [];
                _.each(selectedLayers.list, (layer, index) => {
                    newCoords[index] = _.clone(layer.coords);
                });
                mc.session.addOperation({
                    type: 'layer.move',
                    layers: _.clone(selectedLayers.list),
                    old: this.oldCoords,
                    new: newCoords
                });
            }
            this.oldCoords = [];
            mc.session.mouse.reset();
        }
    },
    {
        name: 'clear',
        icon: 'fa-file',
        action: true,
        end: true,
        key: 'mod + n',
        select: function () {
            var mc = this.mercuryCanvas;
            mc.overlay.clear();
            mc.session.operationIndex = 0;
            mc.session.clearOrphanOperations();
            mc.session.updateMenus();

            _.forIn(_.clone(mc.layers.list), (layer) => {
                layer.remove();
            });
        }
    },
    {
        name: 'colorPicker',
        icon: 'fa-tint',
        action: true,
        end: true,
        load: function () {
            this.visible = false;
            this.element.css({
                position: 'relative',
                overflow: 'visible'
            });
            this.colorPickerWrapper = $('<div>', {
                css: {
                    position: 'absolute',
                    top: -60,
                    left: 40,
                    display: 'none'
                }
            }).appendTo(this.element);
            this.colorPicker = new colorPicker({
                color: this.mercuryCanvas.state.strokeColor,
                background: '#454545',
                el: this.colorPickerWrapper[0]
            });
            this.colorPicker.onChange((color) => {
                this.mercuryCanvas.state.strokeColor = color;
            });
            this.colorPickerWrapper.on('mouseup touchend', () => {
                this.mercuryCanvas.state.save();
                setTimeout(() => this.mercuryCanvas.session.undo());
            });
        },
        select: function (e) {
            if (e.target.className.indexOf('colorPicker') == -1 && e.target.className.indexOf('fa') == -1) return;
            this.visible = !this.visible;
            if (this.visible) {
                this.colorPickerWrapper.show();
                var visible = this.colorPickerWrapper.visible();
                visible.top = visible.top != 0 ? visible.top - 5 : 0;
                visible.bottom = visible.bottom != 0 ? visible.bottom + 5 : 0;
                visible.left = visible.left != 0 ? visible.left - 5 : 0;
                visible.right = visible.right != 0 ? visible.right + 5 : 0;

                this.colorPickerWrapper.css('top', '+=' + (visible.top - visible.bottom));
                this.colorPickerWrapper.css('left', '+=' + (visible.left - visible.right));
            }
            else {
                this.colorPickerWrapper.hide();
            }
        }
    },
    {
        name: 'fullscreen',
        icon: 'fa-expand',
        end: true,
        action: true,
        load: function () {
            $(document).on('fullscreenchange mozfullscreenchange webkitfullscreenchange msfullscreenchange', () => {
                var fullscreen = window.fullScreen || document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
                if (fullscreen) {
                    this.element.children('i').removeClass('fa-expand').addClass('fa-compress');
                }
                else {
                    this.element.children('i').removeClass('fa-compress').addClass('fa-expand');
                }
            });
        },
        select: function () {
            var fullscreen = window.fullScreen || document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
            if (!fullscreen) {
                var el = document.documentElement;
                if (el.requestFullscreen) {
                    el.requestFullscreen();
                }
                else if (el.mozRequestFullScreen) {
                    el.mozRequestFullScreen();
                }
                else if (el.webkitRequestFullscreen) {
                    el.webkitRequestFullscreen();
                }
                else if (el.msRequestFullscreen) {
                    el.msRequestFullscreen();
                }
            }
            else if (document.exitFullscreen) {
                document.exitFullscreen();
            }
            else if (document.mozCancelFullScreen) {
                document.mozCancelFullScreen();
            }
            else if (document.webkitCancelFullScreen) {
                document.webkitCancelFullScreen();
            }
            else if (document.msExitFullscreen) {
                document.msExitFullscreen();
            }
        }
    }
];

export {topbarTools};