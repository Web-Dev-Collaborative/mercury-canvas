import _ from 'lodash';
import {coords} from './helpers.js';
import Layer from './layer.js';

var topbarTools = [
    {
        name: 'undo',
        action: true
    },
    {
        name: 'redo',
        icon: 'fa-repeat',
        disabled: true,
        action: true
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
    },
    {
        name: 'brush',
        icon: 'fa-paint-brush',
        select: function () {
            console.log('clear the temp layer or something');

            var mc = this.mercuryCanvas;

            mc.overlay.clear();
        },
        mouseDown: function (e) {
            var mc = this.mercuryCanvas;

            mc.state.mouse.points = [];

            mc.overlay.context.lineWidth = mc.state.lineWidth;
            mc.overlay.context.strokeStyle = mc.state.strokeColor;
            mc.overlay.context.fillStyle = mc.state.strokeColor;
            mc.overlay.context.lineCap = mc.overlay.context.lineJoin = 'round';

            this.mouseMove(e);
        },
        mouseMove: function (e) {
            var mc = this.mercuryCanvas;
            if (!mc.state.mouse.down) return;

            mc.overlay.clear();

            mc.state.mouse.points.push(new coords(e).toCanvasSpace(mc));

            mc.overlay.context.beginPath();
            mc.overlay.context.moveTo(mc.state.mouse.points[0].x, mc.state.mouse.points[0].y);

            if (mc.state.mouse.points.length < 3) {
                var b = mc.state.mouse.points[0];
                mc.overlay.context.beginPath();
                mc.overlay.context.arc(b.x, b.y, mc.overlay.context.lineWidth / 2, 0, Math.PI * 2, false);
                mc.overlay.context.fill();
                mc.overlay.context.closePath();
                return;
            }

            for (var i = 0; i < mc.state.mouse.points.length - 2; i++) {
                var point1 = mc.state.mouse.points[i];
                var point2 = mc.state.mouse.points[i + 1];
                var c = (point1.x + point2.x) / 2;
                var d = (point1.y + point2.y) / 2;

                mc.overlay.context.quadraticCurveTo(point1.x, point1.y, c, d);
            }

            mc.overlay.context.quadraticCurveTo(
                mc.state.mouse.points[i].x,
                mc.state.mouse.points[i].y,
                mc.state.mouse.points[i + 1].x,
                mc.state.mouse.points[i + 1].y
            );

            mc.overlay.context.stroke();
            mc.overlay.dirty = true;
        },
        mouseUp: function () {
            var mc = this.mercuryCanvas;
            if (!mc.state.mouse.points.length) return;

            var newLayer = new Layer({
                parent: mc
            });
            mc.overlay.copyTo(newLayer);
            mc.state.mouse.points = [];
            mc.overlay.clear();
        }
    },
    {
        name: 'clear',
        icon: 'fa-trash',
        action: true,
        select: function () {
            var mc = this.mercuryCanvas;
            mc.overlay.clear();

            _.forIn(_.clone(mc.layers.list), (layer) => {
                layer.remove();
            });
        }
    }
];

export {topbarTools};