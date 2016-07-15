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
        select: function () {
            var mc = this.mercuryCanvas;

            mc.session.undo();
        }
    },
    {
        name: 'redo',
        icon: 'fa-repeat',
        action: true,
        select: function () {
            var mc = this.mercuryCanvas;

            mc.session.redo();
        }
    },
    {
        name: 'brush',
        icon: 'fa-paint-brush',
        selected: true,
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
        select: function () {
            var mc = this.mercuryCanvas;

            mc.overlay.clear();
        },
        cursor: function (e) {
            var mc = this.mercuryCanvas;
            var pos = new coords(e).toCanvasSpace(mc);
            var layerCoords = mc.session.selectedLayers.rect;

            if (!layerCoords) return;

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
            // return 'rotate';
        },
        draw: function (e) {
            var mc = this.mercuryCanvas;
            var point = new coords(e).toCanvasSpace(mc);

            var layer = mc.session.selectedLayers.list.length ? mc.session.selectedLayers.rect : point.toLayer(mc);

            mc.overlay.clear();
            if (!layer) return;

            var context = mc.overlay.context;
            context.lineWidth = 1;
            context.strokeStyle = '#000';
            context.lineCap = mc.overlay.context.lineJoin = 'square';
            context.fillStyle = 'rgba(255, 255, 255, 0.1)';

            var rect = _.clone(layer.coords ? layer.coords : layer);
            var handlerSize = mc.state.handlerSize;
            rect.x = Math.floor(rect.x) - 0.5;
            rect.y = Math.floor(rect.y) - 0.5;
            rect.width = Math.ceil(rect.width) + 1;
            rect.height = Math.ceil(rect.height) + 1;

            if (!mc.session.selectedLayers.list.length) {
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
            var rect = new coords();
            _.forIn(e, (layer) => {
                rect.update(rect.max(layer.coords));
            });
            return rect;
        },
        mouseDown: function (e) {
            var mc = this.mercuryCanvas;
            var pos = new coords(e).toCanvasSpace(mc);
            var layer = pos.toLayer(mc);

            if (!layer) return;

            var selectedLayers = mc.session.selectedLayers;
            selectedLayers.list.push(layer);
            selectedLayers.rect = this.makeBox(selectedLayers.list);

            requestAnimationFrame(this.draw.bind(this, e));
        },
        mouseMove: function (e) {
            var mc = this.mercuryCanvas;
            if (mc.session.mouse.down) return;

            var mouse = mc.session.mouse;
            mouse.action = this.cursor(e);
            mouse.action = mouse.action ? mouse.action : 'move';
            $(mc.layersContainer).css({
                cursor: mouse.action
            });
        },
        mouseUp: function (e) {
            this.mercuryCanvas.session.mouse.action = undefined;
            this.mouseMove(e);
            requestAnimationFrame(this.draw.bind(this, e));
        }
    },
    {
        name: 'clear',
        icon: 'fa-trash',
        action: true,
        end: true,
        select: function () {
            var mc = this.mercuryCanvas;
            mc.overlay.clear();
            mc.session.operationIndex = 0;
            mc.session.clearOrphanOperations();
            mc.session.updateToolbars();

            _.forIn(_.clone(mc.layers.list), (layer) => {
                layer.remove();
            });
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