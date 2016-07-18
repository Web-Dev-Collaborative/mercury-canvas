var log = require('loglevel-message-prefix')(window.log.getLogger('tools.js'), {
    prefixes: ['level'],
    staticPrefixes: ['tools.js'],
    separator: '/'
});
import _ from 'lodash';
import {Matrix} from 'transformation-matrix-js';
import {coords} from './helpers.js';
import Layer from './layer.js';

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
                mc.overlay.dirty = true;
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
            mc.overlay.dirty = true;
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

            mouse.points.push(pos);
        },
        mouseUp: function () {
            var mc = this.mercuryCanvas;
            var mouse = mc.session.mouse;
            if (!mouse.points.length) return;

            var newLayer = new Layer({
                parent: mc
            });
            mc.overlay.copyTo(newLayer);
            mc.session.addOperation({
                tool: this,
                layer: _.clone(newLayer),
                mouse: _.clone(mouse)
            });
            mc.overlay.clear();
            mouse.points = [];
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
        name: 'select',
        icon: 'fa-mouse-pointer',
        selected: true,
        key: 'v',
        load: function () {
            var mc = this.mercuryCanvas;
            var cursor = $('<div>', {
                class: 'selectCursor'
            }).hide();
            cursor.appendTo(mc.layersContainer);
            this.cursor = cursor;
            this.canShow = false;
            this.zIndex = 0;
            this.shown = false;
            this.oldCoords = [];
            this.matrix = new Matrix();
            var selectedLayers = mc.session.selectedLayers;
            mc.on('layer.remove', () => {
                selectedLayers.rect = this.makeBox(selectedLayers.list);
                requestAnimationFrame(this.draw.bind(this, mc.session.mouse.last));
            });

            mc.on('key.up', () => this.mouseMove(mc.session.mouse.last));
            mc.on('key.down', () => this.mouseMove(mc.session.mouse.last));

            mc.on('undo.layer.move', (operation) => {
                _.each(operation.layers, (layer, index) => {
                    layer.coords.update(operation.old[index]);
                });
                selectedLayers.rect = this.makeBox(selectedLayers.list);
                this.mouseMove(mc.session.mouse.last);
            });
            mc.on('redo.layer.move', (operation) => {
                _.each(operation.layers, (layer, index) => {
                    layer.coords.update(operation.new[index]);
                });
                selectedLayers.rect = this.makeBox(selectedLayers.list);
                this.mouseMove(mc.session.mouse.last);
            });
        },
        select: function () {
            var mc = this.mercuryCanvas;

            mc.overlay.clear();
            this.canShow = true;
        },
        deselect: function () {
            this.cursor.hide();
            this.shown = false;
            this.canShow = false;
        },
        chooseCursor: function (e) {
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
            return 'rotate';
        },
        draw: function (e) {
            var mc = this.mercuryCanvas;
            var point = new coords(e).toCanvasSpace(mc);

            var layer;
            if (mc.session.keys.ctrl || !mc.session.selectedLayers.list.length) layer = point.toLayer(mc);
            else layer = mc.session.selectedLayers.rect;

            mc.overlay.clear();
            if (!layer) return;

            var context = mc.overlay.context;
            context.lineWidth = 1;
            context.strokeStyle = '#000';
            context.lineCap = mc.overlay.context.lineJoin = 'square';
            context.fillStyle = 'rgba(255, 255, 255, 0.1)';

            var rect = _.clone(_.has(layer, 'coords') ? layer.coords : layer);
            var handlerSize = mc.state.handlerSize;
            rect.x = Math.floor(rect.x) - 0.5;
            rect.y = Math.floor(rect.y) - 0.5;
            rect.width = Math.ceil(rect.width) + 1;
            rect.height = Math.ceil(rect.height) + 1;
            if (!mc.session.selectedLayers.list.length || mc.session.keys.ctrl) {
                context.beginPath();
                context.moveTo(rect.x, rect.y);
                context.lineTo(rect.x + rect.width, rect.y);
                context.lineTo(rect.x + rect.width, rect.y + rect.height);
                context.lineTo(rect.x, rect.y + rect.height);
                context.lineTo(rect.x, rect.y);
                context.stroke();
            }
            else {
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
            }
            mc.overlay.dirty = true;
        },
        makeBox: function (e) {
            var rect = new coords({
                x: Infinity,
                y: Infinity
            });
            rect.x2 = 0;
            rect.y2 = 0;
            _.each(e, (layer) => {
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
            return rect;
        },
        mouseDown: function (e) {
            var mc = this.mercuryCanvas;
            var pos = new coords(e).toCanvasSpace(mc);
            var layer = pos.toLayer(mc);
            var selectedLayers = mc.session.selectedLayers;

            if (layer && selectedLayers.list.indexOf(layer) == -1 && (mc.session.keys.ctrl || !selectedLayers.list.length)) {
                selectedLayers.list.push(layer);
                selectedLayers.rect = this.makeBox(selectedLayers.list);
            }
            _.each(selectedLayers.list, (layer, index) => {
                this.oldCoords[index] = _.clone(layer.coords);
            });
            mc.session.mouse.initial = {
                dist: [],
                mouse: _.clone(pos),
                selectedLayers: selectedLayers.list.map(layer => _.clone(layer.coords))
            };
            requestAnimationFrame(this.draw.bind(this, e));
        },
        mouseMove: function (e) {
            var mc = this.mercuryCanvas;
            var mouse = mc.session.mouse;
            var pos = new coords(e).toCanvasSpace(mc);
            mouse.last = e;

            if (!mouse.down) {
                mouse.action = this.chooseCursor(e);
                if (mouse.action == 'rotate') {
                    this.matrix.reset();
                    this.matrix.translate(pos.x, pos.y);

                    var base = mc.session.selectedLayers.rect;
                    var center = {
                        x: base.x + base.width / 2,
                        y: base.y + base.height / 2
                    };

                    var res = {
                        x: pos.x - center.x,
                        y: pos.y - center.y
                    };
                    var rotation = Math.atan2(res.y, res.x) - Math.PI * 5 / 4;
                    this.matrix.rotate(rotation);

                    // $('.removeMe').remove();
                    // $('<div>', {
                    //     class: 'removeMe',
                    //     css: {
                    //         position: 'absolute',
                    //         top: center.y,
                    //         left: center.x,
                    //         background: 'red',
                    //         width: 10,
                    //         height: 10
                    //     }
                    // }).appendTo($(document.body));

                    if (!this.shown) {
                        this.shown = true;
                        this.cursor.show();
                    }
                    this.cursor.css({
                        transform: this.matrix.toCSS()
                    });
                    mc.layersContainer.css({
                        cursor: 'none'
                    });
                }
                else {
                    if (this.shown) {
                        this.shown = false;
                        this.cursor.hide();
                    }
                    mc.layersContainer.css({
                        cursor: mouse.action
                    });
                }
                return;
            }
            // switch (action) {
            //     case 'nw':
            //         newWidth = selectedLayer.width + (selectedLayer.x - pos.x);
            //         newHeight = selectedLayer.height + (selectedLayer.y - pos.y);
            //         newX = pos.x;
            //         newY = pos.y;
            //         if (keys.shift) {
            //             wProp = newWidth / original.width;
            //             hProp = newHeight / original.height;
            //             newHeight = original.height * (wProp + hProp) / 2;
            //             newWidth = original.width * (wProp + hProp) / 2;

            //             newX = Math.min(selectedLayer.x + selectedLayer.width - newWidth, selectedLayer.x + selectedLayer.width);
            //             newY = Math.min(selectedLayer.y + selectedLayer.height - newHeight, selectedLayer.y + selectedLayer.height);
            //         }
            //         if (keys.alt) {
            //             newX = Math.min(newX, selectedLayer.x + selectedLayer.width);
            //             newY = Math.min(newY, selectedLayer.y + selectedLayer.height);
            //             newWidth = newWidth - Math.sign(newX - selectedLayer.x) * Math.abs(selectedLayer.width - newWidth);
            //             newHeight = newHeight - Math.sign(newY - selectedLayer.y) * Math.abs(selectedLayer.height - newHeight);
            //         }
            //         newX = Math.min(newX, selectedLayer.x + selectedLayer.width);
            //         newY = Math.min(newY, selectedLayer.y + selectedLayer.height);
            //         break;
            //     case 'ne':
            //         newWidth = selectedLayer.width + (pos.x - (selectedLayer.x + selectedLayer.width));
            //         newHeight = selectedLayer.height - (pos.y - selectedLayer.y);
            //         if (keys.shift) {
            //             wProp = newWidth / original.width;
            //             hProp = newHeight / original.height;
            //             newHeight = original.height * (wProp + hProp) / 2;
            //             newWidth = original.width * (wProp + hProp) / 2;

            //             newY = Math.min(selectedLayer.y + selectedLayer.height - newHeight, selectedLayer.y + selectedLayer.height);
            //         }
            //         else {
            //             newY = Math.min(pos.y, selectedLayer.y + selectedLayer.height);
            //         }
            //         newX = selectedLayer.x;
            //         break;
            //     case 'se':
            //         newWidth = selectedLayer.width + (pos.x - selectedLayer.x - selectedLayer.width);
            //         newHeight = selectedLayer.height + (pos.y - selectedLayer.y - selectedLayer.height);
            //         if (keys.shift) {
            //             wProp = newWidth / original.width;
            //             hProp = newHeight / original.height;
            //             newHeight = original.height * (wProp + hProp) / 2;
            //             newWidth = original.width * (wProp + hProp) / 2;
            //         }
            //         newX = selectedLayer.x;
            //         newY = selectedLayer.y;
            //         break;
            //     case 'sw':
            //         newWidth = selectedLayer.width + (selectedLayer.x - pos.x);
            //         newHeight = selectedLayer.height + (pos.y - selectedLayer.y - selectedLayer.height);
            //         if (keys.shift) {
            //             wProp = newWidth / original.width;
            //             hProp = newHeight / original.height;
            //             newHeight = original.height * (wProp + hProp) / 2;
            //             newWidth = original.width * (wProp + hProp) / 2;

            //             newX = Math.min(selectedLayer.x + selectedLayer.width - newWidth, selectedLayer.x + selectedLayer.width);
            //         }
            //         else {
            //             newX = Math.min(pos.x, selectedLayer.x + selectedLayer.width);
            //         }
            //         newY = selectedLayer.y;
            //         break;
            //     case 'n':
            //         newWidth = selectedLayer.width;
            //         newHeight = selectedLayer.height + (selectedLayer.y - pos.y);
            //         newX = selectedLayer.x;
            //         newY = Math.min(pos.y, selectedLayer.y + selectedLayer.height);
            //         break;
            //     case 'w':
            //         newWidth = selectedLayer.width + (selectedLayer.x - pos.x);
            //         newHeight = selectedLayer.height;
            //         newX = Math.min(pos.x, selectedLayer.x + selectedLayer.width);
            //         newY = selectedLayer.y;
            //         break;
            //     case 's':
            //         newWidth = selectedLayer.width;
            //         newHeight = selectedLayer.height + (pos.y - selectedLayer.y - selectedLayer.height);
            //         newX = selectedLayer.x;
            //         newY = selectedLayer.y;
            //         break;
            //     case 'e':
            //         newWidth = selectedLayer.width + (pos.x - (selectedLayer.x + selectedLayer.width));
            //         newHeight = selectedLayer.height;
            //         newX = selectedLayer.x;
            //         newY = selectedLayer.y;
            //         break;
            //     default:
            //         console.log(action + " for select");
            //         break;
            // }
            this.actioned = true;
            switch (mouse.action) {
                case 'move':
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

                            if (delta.x > mc.state.snapDistance || delta.y > mc.state.snapDistance) {
                                if (delta.x > delta.y) {
                                    coords.y = original.y;
                                }
                                else {
                                    coords.x = original.x;
                                }
                            }
                            else {
                                coords.x = original.x;
                                coords.y = original.y;
                            }
                        }
                        newCoords[index] = _.clone(coords);
                        layer.coords.update(coords);
                    });

                    selectedLayers.rect = this.makeBox(selectedLayers.list);
                    requestAnimationFrame(this.draw.bind(this, e));
                    break;
            }
        },
        mouseUp: function (e) {
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
            this.mouseMove(e);
            requestAnimationFrame(this.draw.bind(this, e));
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
        select: function () {
            // var mc = this.mercuryCanvas;
            // console.log(mc);
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