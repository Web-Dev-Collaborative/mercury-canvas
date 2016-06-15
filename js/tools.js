import _ from 'lodash';
import {coords} from './helpers.js';
import Layer from './layer.js';

var topbarTools = [
    {
        name: 'undo',
        action: true,
        disabled: true
    },
    {
        name: 'redo',
        icon: 'fa-repeat',
        disabled: true,
        action: true
    },
    {
        name: 'brush',
        icon: 'fa-paint-brush',
        selected: true,
        select: function () {
            console.log('clear the temp layer or something');

            var mc = this.mercuryCanvas;

            mc.overlay.clear();
        },
        draw: function () {
            var mc = this.mercuryCanvas;
            var points = mc.state.session.mouse.points;
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
        },
        mouseDown: function (e) {
            var mc = this.mercuryCanvas;

            mc.state.session.mouse.points = [];

            mc.overlay.context.lineWidth = mc.state.lineWidth;
            mc.overlay.context.strokeStyle = mc.state.strokeColor;
            mc.overlay.context.fillStyle = mc.state.strokeColor;
            mc.overlay.context.lineCap = mc.overlay.context.lineJoin = 'round';

            this.mouseMove(e);
            requestAnimationFrame(this.draw.bind(this, e));
        },
        mouseMove: function (e) {
            var mc = this.mercuryCanvas;
            var mouse = mc.state.session.mouse;
            if (!mouse.down) return;

            mouse.points.push(new coords(e).toCanvasSpace(mc));
        },
        mouseUp: function () {
            var mc = this.mercuryCanvas;
            var mouse = mc.state.session.mouse;
            if (!mouse.points.length) return;

            mouse.down = false;
            var newLayer = new Layer({
                parent: mc
            });
            mc.overlay.copyTo(newLayer);
            mc.overlay.clear();
            mouse.points = [];
        }
    },
    {
        name: 'select',
        icon: 'fa-mouse-pointer',
        select: function () {
            var mc = this.mercuryCanvas;

            mc.overlay.clear();
        },
        draw: function (e) {
            var mc = this.mercuryCanvas;
            var point = new coords(e).toCanvasSpace(mc);
            var layer = point.toLayer(mc);

            mc.overlay.clear();
            if (!layer) return;

            mc.overlay.context.lineWidth = 1;
            mc.overlay.context.strokeStyle = '#000';
            mc.overlay.context.lineCap = mc.overlay.context.lineJoin = 'square';

            mc.overlay.context.beginPath();
            mc.overlay.context.moveTo(layer.coords.x - 0.5, layer.coords.y - 0.5);
            mc.overlay.context.lineTo(layer.coords.x + layer.coords.width + 0.5, layer.coords.y - 0.5);
            mc.overlay.context.lineTo(layer.coords.x + layer.coords.width + 0.5, layer.coords.y + layer.coords.height + 0.5);
            mc.overlay.context.lineTo(layer.coords.x - 0.5, layer.coords.y + layer.coords.height + 0.5);
            mc.overlay.context.lineTo(layer.coords.x - 0.5, layer.coords.y - 0.5);
            mc.overlay.context.stroke();

            mc.overlay.dirty = true;
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
                var fullscreen = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
                if (fullscreen) {
                    this.element.children('i').removeClass('fa-expand').addClass('fa-compress');
                }
                else {
                    this.element.children('i').removeClass('fa-compress').addClass('fa-expand');
                }
            });
        },
        select: function () {
            if (!document.fullscreenElement && !document.webkitFullscreenElement && !document.msFullscreenElement) {
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