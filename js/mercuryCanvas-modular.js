//(function($){
    var settings = {}, keys = {}, buffer = {}, altHiddenLayers = [];
    var root;
    var startOpacity = 1;
    var opacitySliderFinished = false, userOpacityChange = false;
    requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || window.msRequestAnimationFrame || setTimeout;

    var shortcuts = {
        'v': 'select',
        'b': 'brush',
        'e': 'eraser',
        'x': 'eyeDropper',
        'o': 'open',
        'ctrl s': 'save',
        'ctrl n': 'newDoc', // chrome overrides this
        'ctrl o': 'none',//'keyup event on body',
//        'ctrl z': 'undo',
//        'ctrl y': 'redo',
//        'ctrl shift z': 'redo',
        'delete': 'delete',
        'ctrl enter': 'deselect',
        'esc': 'deselect',
        'escape': 'deselect'
    }

    var ListenerDefaults = {
        is_exclusive    : true,
        prevent_repeat  : true,
        on_keyup: function(e){
            if(!e.key) e.key = window.keypress._keycode_dictionary[e.keyCode];
            var keyCombination = (e.ctrlKey ? 'ctrl ' : '') + (e.altKey ? 'alt ' : '') + (e.shiftKey ? 'shift ' : '') + e.key.toLowerCase();
            var shortcutAction = shortcuts[keyCombination];

            if(shortcutAction){
                e.preventDefault();

                if(typeof shortcutAction == 'function'){
                    shortcutAction();
                }
                else if(shortcutAction != 'none'){
                    settings.tools.changeTo(shortcutAction);
                }
            }
        },
        on_keydown: function(e){
            if(!e.key) e.key = window.keypress._keycode_dictionary[e.keyCode];
            var shortcutAction = shortcuts[(e.ctrlKey ? 'ctrl ' : '') + (e.altKey ? 'alt ' : '') + (e.shiftKey ? 'shift ' : '') + e.key.toLowerCase()];
            if(shortcutAction){
                e.preventDefault();
            }
        }
    };

    var shortcutListener = new window.keypress.Listener(document, ListenerDefaults);

    var listenerKeys = [];
    $.each(shortcuts, function(index, value){
        listenerKeys.push({
            keys: index
        });
    });
    listenerKeys.push({
        keys: '[',
        prevent_repeat: false,
        on_keydown: function(e){
            e.preventDefault();
            if(settings.tools.current == 'brush' || settings.tools.current == 'eraser'){
                settings.tools.changeTo('brushSize-');
            }
        },
        on_keyup: function(e){
            e.preventDefault();
        }
    });
    listenerKeys.push({
        keys: ']',
        prevent_repeat: false,
        on_keydown: function(e){
            e.preventDefault();
            if(settings.tools.current == 'brush' || settings.tools.current == 'eraser'){
                settings.tools.changeTo('brushSize+');
            }
        },
        on_keyup: function(e){
            e.preventDefault();
        }
    });
    shortcutListener.register_many(listenerKeys);

    function panel(options){
        this.id = options.id;
        this.name = options.name;
        var rendered = Mustache.render(settings.templates.layerPanel, {
            canvasID: options.id,
            layerName: options.name
        });
        rendered = rendered.trim().replace(/\n/g, '');
        this.$ = $(rendered).prependTo($('#layers'));
    }
    panel.prototype.hide = function(){
        $('#layers [data-layer="'+ this.id +'"]').hide();
    }
    panel.prototype.show = function(){
        
    }
    panel.prototype.remove = function(){
        $('#layers .item[data-layer="'+ this.id +'"]').remove();
        return null;
    }
    panel.prototype.refreshPreview = function(layer){
        if(!layer.$) return;
        this.$.children('.layer-picture').css('background-image', 'url(' + layer.$[0].toDataURL() + ')');
    }
    panel.prototype.select = function(){
        this.$.addClass('selected lastSelected');
    }
    panel.prototype.deselect = function(){
        this.$.removeClass('selected lastSelected');
    }
    
    function Layer(options){
        if(options == undefined){
            options = {};
        }
        $.extend(this, $.mercuryCanvas.defaults.layer, options);
        var self = this;
        
        self.zIndex = options.zIndex ? options.zIndex : settings.zIndex;
        if(self.zIndex == settings.zIndex){
            settings.zIndex ++;
            if(settings.zIndex > 999){
                temp.$.css('z-index', 1 + settings.zIndex);
                $('#cursor', root).css('z-index', 2 + settings.zIndex);
                $('#tools, #currentTool, #layers', root).css('z-index', 5 + settings.zIndex);
                $('.select2', root).css('z-index', 70 + settings.zIndex);
                $.MercuryModal.defaults.zIndex = 81 + settings.zIndex;
            }
        }
        
        var matrix = new Matrix();
        matrix.translate(options.x, options.y);
        self.matrix = matrix;
        self.id = 'canvas-' + self.zIndex;
        self.name = 'Layer ' + self.zIndex;
        self.$ = $('<canvas>').attr({
            border: 0,
            width: self.width,
            height: self.height,
            id: self.id,
            class: 'canvasLayer'
        }).css({
            'transform': matrix.toCSS(),
            '-webkit-transform': matrix.toCSS(),
            'z-index': self.zIndex,
            width: self.width, 
            height: self.height
        }).appendTo(settings.layers.parent);
        self.$.on('delete', function(){
            self.delete();
        });
        
        self.ctx = self.$[0].getContext('2d');
        self.panel = new panel(self);
        self.temp = {
            original: {}
        };
        settings.layers.order.push(self);
        return this;
    }
    Layer.prototype.clear = function(options){
        console.log(this);
        return this;
    }
    Layer.prototype.remove = function(){
        $('#' + this.id).remove();
        this.panel.remove();
        delete settings.layers.order[settings.layers.order.indexOf(this)];
        return null;
    }
    Layer.prototype.select = function(){
        opacitySlider.update({
            from: this.alpha * 100,
            disable: false
        });
        
        if(this.blendingMode != $blendingModes.val()){
            $blendingModes.val(this.blendingMode).trigger("change");
        }
        $blendingModes.prop('disabled', false);
        
        $('#layers .item', root).removeClass('selected lastSelected');
        this.panel.select();

        settings.layers.selected = this;
        this.DrawSelectedOutline();

        if(settings.transition){
            this.$.css('transition', 'none 0s');
        }
        return this;
    }
    Layer.prototype.delete = function(){
        $('#' + this.id).hide();
        this.panel.hide();
        return this;
    }
    Layer.prototype.scale = function(options){
        if(!options.end || !options.start){
            console.log("layer.scale didn't received enough data:", options);
        }
        var imageData = this.ctx.getImageData(0, 0, options.start.width, options.start.height);

        buffer.$.attr({
            width: options.start.width,
            height: options.start.height
        });
        buffer.ctx.drawImage(this.$[0], 0, 0);
        this.$.attr({
            width: options.end.width,
            height: options.end.height
        }).css({
            width: options.end.width,
            height: options.end.height
        });

        this.ctx.save(); // TODO: do I need this?
        if(options.pixelPerfect == undefined){
            options.pixelPerfect = $('#scaling-mode').prop('checked');
        }
        if(options.pixelPerfect){
            this.ctx.imageSmoothingEnabled = false;
            this.ctx.webkitImageSmoothingEnabled = false;
            this.ctx.mozImageSmoothingEnabled = false;
        }
        this.ctx.scale(options.end.width / options.start.width, options.end.height / options.start.height);
        this.ctx.drawImage(buffer.$[0], 0, 0);

        this.ctx.restore();
        return this;
    }
    Layer.prototype.transform = function(options){
        this.matrix.reset().translate(options.x, options.y);
        if(!options.width || !options.height){
            console.log('Transform received 0 or undefined width/height');
        }
        else{
            options.width = Math.max(0, options.width);
            options.height = Math.max(0, options.height);
            this.width = options.width;
            this.height = options.height;
            this.matrix.scale(options.width / this.temp.original.width, options.height / this.temp.original.height);
        }
        this.$.css({
            'transform': this.matrix.toCSS(),
            '-webkit-transform': this.matrix.toCSS()
        });
        this.x = options.x;
        this.y = options.y;
        return this;
    }
    Layer.prototype.copy = function(options){
        return this;
    }
    Layer.prototype.BetweenPoints = function(options){
        if(this.alpha > 0 && Math.max(this.x, options.x0) < Math.min(this.x + this.width, options.x1) && Math.max(this.y, options.y0) < Math.min(this.y + this.height, options.y1)){
            return true;
        }
        return false;
    }
    Layer.prototype.DrawSelectedOutline = function(){
        temp.Clear();
        temp.ctx.save();
        temp.ctx.translate(-0.5, -0.5);
        temp.ctx.lineWidth = 1;
        temp.ctx.lineJoin = 'square';
        temp.ctx.lineCap = 'square';
        temp.ctx.strokeStyle="#000";
        temp.ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';

        var _x, _y, _width, _height;
        _x = Math.round(this.x);// - 0.5;
        _y = Math.round(this.y);// - 0.5;
        _width = Math.round(this.width + 1);
        _height = Math.round(this.height + 1);

        // handlers
        temp.ctx.fillRect(_x + _width - settings.handlerSize / 2, _y - settings.handlerSize / 2, settings.handlerSize, settings.handlerSize);
        temp.ctx.fillRect(_x - settings.handlerSize / 2, _y - settings.handlerSize / 2, settings.handlerSize, settings.handlerSize);
        temp.ctx.fillRect(_x + _width - settings.handlerSize / 2, _y + _height - settings.handlerSize / 2, settings.handlerSize, settings.handlerSize);
        temp.ctx.fillRect(_x - settings.handlerSize / 2, _y + _height - settings.handlerSize / 2, settings.handlerSize, settings.handlerSize);
        temp.ctx.strokeRect(_x + _width - settings.handlerSize / 2, _y - settings.handlerSize / 2, settings.handlerSize, settings.handlerSize);
        temp.ctx.strokeRect(_x - settings.handlerSize / 2, _y - settings.handlerSize / 2, settings.handlerSize, settings.handlerSize);
        temp.ctx.strokeRect(_x + _width - settings.handlerSize / 2, _y + _height - settings.handlerSize / 2, settings.handlerSize, settings.handlerSize);
        temp.ctx.strokeRect(_x - settings.handlerSize / 2, _y + _height - settings.handlerSize / 2, settings.handlerSize, settings.handlerSize);

        // lines
        if(_width > settings.handlerSize + 1 || _height > settings.handlerSize + 1){
            temp.ctx.beginPath();
            if(_width > settings.handlerSize + 1){
                // top left -> top right
                temp.ctx.moveTo(_x + 1 + settings.handlerSize / 2, _y);
                temp.ctx.lineTo(_x - 1 - settings.handlerSize / 2 + _width, _y);
                // bottom right -> bottom left
                temp.ctx.moveTo(_x - 1 - settings.handlerSize / 2 + _width, _y + _height);
                temp.ctx.lineTo(_x + 1 + settings.handlerSize / 2, _y + _height);
            }
            if(_height > settings.handlerSize + 1){
                // top right -> bottom right
                temp.ctx.moveTo(_x + _width, _y + 1 + settings.handlerSize / 2);
                temp.ctx.lineTo(_x + _width, _y - 1 - settings.handlerSize / 2 + _height);
                // bottom left -> top left
                temp.ctx.moveTo(_x, _y - 1 - settings.handlerSize / 2 + _height);
                temp.ctx.lineTo(_x, _y + 1 + settings.handlerSize / 2);
            }
            temp.ctx.stroke();
            temp.ctx.closePath();
        }
        temp.ctx.restore();
        return this;
    }
    
    var cursor = function(){
        var self = this;
        self.matrix = new Matrix();
        self.width = 10;
        self.$ = $('#cursor', root);
        self.shown = false;
        
        this.sizeChange = function(){
            self.matrix.translate((self.width - self.$.width()) / 2, (self.width - self.$.width()) / 2);
            self.width = self.$.width();
            self.$.css({
                transform: self.matrix.toCSS(),
                '-webkit-transform': self.matrix.toCSS()
            });
            return this;
        }
        this.moveTo = function(options){
            if(options.x < 0 || options.y < 0) {
                if(this.shown){
                    this.shown = false;
                    this.$.hide();
                }
            }
            else if(!this.shown){
                this.$.show();
            }
            self.matrix.reset().translate(Math.floor(options.x - self.width / 2), Math.floor(options.y - self.width / 2));
            cursor.$.css({
                'transform': self.matrix.toCSS(),
                '-webkit-transform': self.matrix.toCSS()
            });
            return this;
        }
    }
    var temp = function(){
        this.width = this.height = 0;
        this.cleared = false;
        this.x = this.y = 0;
        this.$ = $('<canvas id="temp" class="canvasLayer canvasTop" border="0"></canvas>').appendTo(settings.layers.parent);
        this.$.css({
            width: 0,
            height: 0,
            top: 0,
            left: 0
        }).attr({
            width: 0,
            height:0
        });
        this.ctx = this.$[0].getContext('2d');
        
        this.resize = function(){
            var w, h;
            w = root.width() - 280 - 49;
            h = root.height();
            if(w != this.width || h != this.height){
                this.ctx.save();
                this.$.css({
                    width: w,
                    height: h
                }).attr({
                    width: w,
                    height: h
                });
                this.width = w;
                this.height = h;
                this.x = this.y = 0;
                this.ctx.restore();
                if(settings.layers.selected){
                    settings.layers.selected.DrawSelectedOutline();
                }
            }
            return this;
        }
        this.Clear = function(options){
            if(options){
                this.ctx.clearRect(options.x, options.y, options.width, options.height);
            }
            else{
                this.ctx.clearRect(0, 0, this.width, this.height);
            }
            return this;
        }
        this.MergeAllLayers = function(){
            temp.Clear();
            temp.ctx.save();
            temp.ctx.fillStyle = settings.backgroundColor;
            temp.ctx.rect(0, 0, this.width, this.height);
            temp.ctx.fill();
            if(settings.layers.order.indexOf(undefined) != -1){
                console.log('layerOrder had a undefined value, reorder');
                settings.layers.Reorder(true);
            }
            $.each(settings.layers.order, function(index, layer){
                if(layer.$.css('display') != 'none'){
                    temp.ctx.save();
                    temp.ctx.globalAlpha = layer.alpha;
                    temp.ctx.globalCompositeOperation = layer.blendingMode;
                    temp.ctx.drawImage(layer.$[0], layer.x, layer.y, layer.width, layer.height);
                    temp.ctx.restore();
                }
            });
        }
        this.DrawBrush = function(){
            this.ctx.lineWidth = settings.lineWidth;
            if(settings.tools.current == 'brush'){
                this.ctx.strokeStyle = settings.strokeColor;
                this.ctx.fillStyle = settings.strokeColor;
            }
            else if(settings.tools.current == 'eraser'){
                this.ctx.strokeStyle = settings.backgroundColor;
                this.ctx.fillStyle = settings.backgroundColor;
            }
            this.ctx.lineCap = this.ctx.lineJoin = 'round';

            if (mouse.points.length < 3) {
                var b = mouse.points[0];
                this.ctx.beginPath();
                this.ctx.arc(b.x, b.y, this.ctx.lineWidth / 2, 0, Math.PI * 2, false);
                this.ctx.fill();
                this.ctx.closePath();
                return;
            }

            this.Clear({
                x: mouse.min.x, 
                y: mouse.min.y,
                width: mouse.max.x - mouse.min.x,
                height: mouse.max.y - mouse.min.y
            });

            this.ctx.beginPath();
            this.ctx.moveTo(mouse.points[0].x, mouse.points[0].y);

            for (var i = 0; i < mouse.points.length - 2; i++) {
                var c = (mouse.points[i].x + mouse.points[i + 1].x) / 2;
                var d = (mouse.points[i].y + mouse.points[i + 1].y) / 2;

                this.ctx.quadraticCurveTo(mouse.points[i].x, mouse.points[i].y, c, d);
            }

            // For the last 2 points
            this.ctx.quadraticCurveTo(
                mouse.points[i].x,
                mouse.points[i].y,
                mouse.points[i + 1].x,
                mouse.points[i + 1].y
            );
            this.ctx.stroke();
            return this;
        }
        this.CheckCursor = function(pos, ow){
            this.$.css('cursor', 'default');
            if(settings.layers.selected && settings.tools.current == 'select'){
                if(typeof ow != 'boolean') ow = true;
                if(ow) settings.tools.select.action = '';
                
                if(pos.x > settings.layers.selected.x && pos.x < settings.layers.selected.x + settings.layers.selected.width && pos.y > settings.layers.selected.y && pos.y < settings.layers.selected.y + settings.layers.selected.height){
                    temp.$.css('cursor', 'move');
                    if(ow) settings.tools.select.action = 'move';
                }
                if (pos.x > settings.layers.selected.x - settings.handlerSize / 2 && pos.x < settings.layers.selected.x + settings.handlerSize / 2 &&
                    pos.y > settings.layers.selected.y - settings.handlerSize / 2 && pos.y < settings.layers.selected.y + settings.handlerSize / 2){
                    temp.$.css('cursor', 'nw-resize');
                    if(ow) settings.tools.select.action = 'nw';
                }
                if (
                    pos.x > settings.layers.selected.x + settings.layers.selected.width - settings.handlerSize / 2 && pos.x < settings.layers.selected.x + settings.layers.selected.width + settings.handlerSize / 2 &&
                    pos.y > settings.layers.selected.y - settings.handlerSize / 2 && pos.y < settings.layers.selected.y + settings.handlerSize / 2){
                    temp.$.css('cursor', 'ne-resize');
                    if(ow) settings.tools.select.action = 'ne';
                }
                if (pos.x > settings.layers.selected.x + settings.layers.selected.width - settings.handlerSize / 2 && pos.x < settings.layers.selected.x + settings.layers.selected.width + settings.handlerSize / 2 &&
                    pos.y > settings.layers.selected.y + settings.layers.selected.height - settings.handlerSize / 2 && pos.y < settings.layers.selected.y + settings.layers.selected.height + settings.handlerSize / 2){
                    temp.$.css('cursor', 'se-resize');
                    if(ow) settings.tools.select.action = 'se';
                }
                if (pos.x > settings.layers.selected.x - settings.handlerSize / 2 && pos.x < settings.layers.selected.x + settings.handlerSize / 2 &&
                    pos.y > settings.layers.selected.y + settings.layers.selected.height - settings.handlerSize / 2 && pos.y < settings.layers.selected.y + settings.layers.selected.height + settings.handlerSize / 2){
                    temp.$.css('cursor', 'sw-resize');
                    if(ow) settings.tools.select.action = 'sw';
                }
                if (pos.x >= settings.layers.selected.x + settings.handlerSize / 2 && pos.x <= settings.layers.selected.x + settings.layers.selected.width - settings.handlerSize / 2 &&
                    pos.y > settings.layers.selected.y - settings.handlerSize / 3 && pos.y < settings.layers.selected.y + settings.handlerSize / 3){
                    temp.$.css('cursor', 'n-resize');
                    if(ow) settings.tools.select.action = 'n';
                }
                if (pos.x > settings.layers.selected.x + settings.layers.selected.width - settings.handlerSize / 3 && pos.x < settings.layers.selected.x + settings.layers.selected.width + settings.handlerSize / 3 &&
                    pos.y >= settings.layers.selected.y + settings.handlerSize / 2 && pos.y <= settings.layers.selected.y + settings.layers.selected.height - settings.handlerSize / 2){
                    temp.$.css('cursor', 'e-resize');
                    if(ow) settings.tools.select.action = 'e';
                }
                if (pos.x >= settings.layers.selected.x + settings.handlerSize / 2 && pos.x <= settings.layers.selected.x + settings.layers.selected.width - settings.handlerSize / 2 &&
                    pos.y > settings.layers.selected.y + settings.layers.selected.height - settings.handlerSize / 3 && pos.y < settings.layers.selected.y + settings.layers.selected.height + settings.handlerSize / 3){
                    temp.$.css('cursor', 's-resize');
                    if(ow) settings.tools.select.action = 's';
                }
                if (pos.x > settings.layers.selected.x - settings.handlerSize / 3 && pos.x < settings.layers.selected.x + settings.handlerSize / 3 &&
                    pos.y >= settings.layers.selected.y + settings.handlerSize / 2 && pos.y <= settings.layers.selected.y + settings.layers.selected.height - settings.handlerSize / 2){
                    temp.$.css('cursor', 'w-resize');
                    if(ow) settings.tools.select.action = 'w';
                }
            }
        }
        return this;
    }
    
    Layer.prototype.trim = temp.prototype.trim = function(options){
        var ctx = this.ctx;
        var pixels = ctx.getImageData(0, 0, this.width, this.height);
        var bound = {
            top: null,
            left: null,
            right: null,
            bottom: null
        };
        var x, y;

        for (var i = 0, l = pixels.data.length; i < l; i += 4) {
            if (pixels.data[i+3] !== 0) {
                x = (i / 4) % this.width;
                y = ~~((i / 4) / this.width);

                if (bound.top === null) {
                    bound.top = y;
                }

                if (bound.left === null) {
                    bound.left = x; 
                } 
                else if (x < bound.left) {
                    bound.left = x;
                }

                if (bound.right === null) {
                    bound.right = x; 
                }
                else if (bound.right < x) {
                    bound.right = x;
                }

                if (bound.bottom === null) {
                    bound.bottom = y;
                } 
                else if (bound.bottom < y) {
                    bound.bottom = y;
                }
            }
        }
        bound.right ++;
        bound.bottom ++;

        var trimmed = ctx.getImageData(bound.left, bound.top, this.width, this.height);

        this.x += bound.left;
        this.y += bound.top;
        
        this.height = bound.bottom - bound.top;
        this.width = bound.right - bound.left;
        
        var layer = this;
        if(!this.id){
            ctx = options.target.ctx;
            layer = options.target;
            
            options.target.width = this.width;
            options.target.height = this.height;
            options.target.x = this.x;
            options.target.y = this.y;
            options.target.matrix.reset().translate(this.x, this.y);
        }
        layer.$.css({
            width: layer.width,
            height: layer.height,
            transform: layer.matrix.toCSS(),
            '-webkit-transform': layer.matrix.toCSS()
        }).attr({
            width: layer.width,
            height: layer.height
        });
        ctx.putImageData(trimmed, 0, 0);
        
        if(!this.id){
            temp.resize().Clear();
        }
        
        return this;
    }
    
    var layersPanel = {
        EnableLayerButtons: function (){
            $('#layer-buttons').children('.btn').removeClass('disabled');
        },
        DisableLayerButtons: function (){
            $('#layer-buttons').children('.btn').addClass('disabled');
        }
    }
    
    settings.tools = function(){
        function openMenu(tool){
            $('.customSubmenu', root).hide();
            $('[data-customSubmenu~="'+ tool +'"]', root).css('display', 'inline-block');
        }
        this.eyedropper = {
            gridSize: 9,
            gridSpace: 20,
            color: '#fff'
        }
        this.select = {
            action: ''
        }
        this.actions = ['colorPicker', 'newDoc', 'fullScreen', 'undo', 'redo', 'brushSize-', 'brushSize+', 'deselect', 'delete'];
        this.current = 'brush';
        this.changeTo = function(tool){
            if(this.actions.indexOf(tool) == -1){
                if(mouse.canvas['1']) return;
                settings.layers.Deselect();
                temp.$.css('cursor', 'default');
                temp.Clear();
                cursor.$.hide();
                openMenu(tool);
                $('.tool.selected', root).removeClass('selected');
                $('.tool[data-action='+ tool +']', root).addClass('selected');
                this.current = tool;
                
                switch(tool){
                    case 'eraser':
                    case 'brush':
                        temp.$.css('cursor', 'none');
                        cursor.moveTo(mouse.lastPos).$.show();
                        break;
                }
            }
            else{
                switch(tool){
                    case 'newDoc':
                        MercuryModal({
                            title: 'Sunteți sigur?',
                            content: 'Această acțiune este iremediabila',
                            textAlign: {
                                header: 'center',
                                middle: 'center',
                                footer: 'center'
                            },
                            buttons:[
                                {
                                    click: function(){
                                        settings.layers.Deselect();
                                        settings.undo.step = 0;
                                        settings.undo.history = [];
                                        settings.undo.layers = [];
                                        settings.undo.data.storage = {};
                                        settings.zIndex = 0;
                                        settings.undo.CheckForOrphans();
                                        settings.undo.CheckButtons();
                                        settings.tools.changeTo('brush');
                                    },
                                    text: 'Da, vreau un document nou',
                                    class: 'btn-danger'
                                },
                                {
                                    text: 'Anulează',
                                    class: 'btn-default',
                                    dismiss: true
                                }
                            ]
                        });
                        break;
                    case 'brushSize-':
                        if(mouse.canvas['1']) return;
                        settings.lineWidth -= settings.brushSizeIncrement;
                        if(settings.lineWidth <= 0){
                            settings.lineWidth = 1;
                        }
                        brushSizeSlider.update({
                            from: settings.lineWidth
                        });
                        settings.refresh();
                        $(document.body).trigger('mousemove', {custom: true});
                        break;
                    case 'brushSize+':
                        if(mouse.canvas['1']) return;
                        settings.lineWidth += settings.brushSizeIncrement;
                        if(settings.lineWidth > 100){
                            settings.lineWidth = 100;
                        }
                        brushSizeSlider.update({
                            from: settings.lineWidth
                        });
                        settings.refresh();
                        $(document.body).trigger('mousemove', {custom: true});
                        break;
                    case 'delete':
                        if(settings.layers.selected){
                            settings.layers.selected.delete();
                            settings.layers.Deselect();
                        }
                        break;
                    case 'deselect':
                        settings.layers.Deselect();
                        break;
                    case 'undo':
                        return;
                        if (settings.undo.step > 0) {
                            var options = settings.undo.history[settings.undo.step - 1];
                            $('#layers .selected').removeClass('selected lastSelected');
                            
                            if(options.layer){
                                var layer = options.layer;
                                $.each(settings.layers.order, function(index, value){
                                    if(value.id == layer.id){
                                        layer = value;
                                    }
                                });
                            }
                            switch (options.action) {
                                case 'add':
                                    layer.delete();
                                    break;
                                case 'blendingModes':
                                    layer.blendingMode = options.before;
                                    layer.$.css('mix-blend-mode', layer.blendingMode);
                                    break;
                                case 'layerOrder':
                                    var length = $('#layers .item').length;
                                    settings.layers.order = new Array(length);
                                    var elements = [];
                                    for(var i = 0; i < length; i++){
                                        elements.push($('[data-layer="'+ options.before[length - i - 1] +'"]', '#layers'));
                                        $('#'+ options.before[length - i - 1]).css('z-index', i + 1);
                                        $.each(settings.layers.order, function(index, value){
                                            if(options.before[length - i - 1] == value.id){
                                                settings.layers.order[i] = value;
                                            }
                                        });
                                    }
                                    $('#layers').append(elements);
                                    break;
                                case 'delete':
                                    console.log('Delete undo',options);
                                    return;
                                    if(options.layerName){
                                        var layer = options.layerName;
                                        $('#'+ layer).show();
                                        $('#layers [data-layer="'+ layer +'"]').show().addClass('selected lastSelected');
                                    }
                                    else if (options.layer){
                                        var layer = options.layer;
                                        if(layer.length){
                                            for(var i = 0, l = layer.length; i < l; i++){
                                                $('#'+ layer[i]).show();
                                                $('#layers [data-layer="'+ layer[i] +'"]').show().addClass('selected lastSelected');
                                            }
                                        }
                                    }
                                    EnableLayerButtons();
                                    break;
                                case 'transform':
                                    options = options.layer.transform;
                                    layer.$.css('transition', settings.transition);
                                    setTimeout(function(){
                                        layer.temp.original = options.before;
                                        layer.transform(options.before);
                                        if(options.before.width != options.after.width || options.before.height != options.after.height){
                                            layer.scale({
                                                start: options.before,
                                                end: options.after
                                            });
                                        }
                                    })
                                    break;
                                case 'opacity':
                                    opacitySlider.update({
                                        from: options.before * 100
                                    });
                                    layers[options.layerName].alpha = options.before;
                                    $('#' + options.layerName).css('opacity', options.before);
                                    break;
                                case 'pixelManipulation':
                                    var layer = layers[options.layerName];
                                    var storage = undoData[options.layerName];
                                    var oldLayer = storage.pop();

                                    if(oldLayer == undefined){
                                        console.warn('Undo has no layer obj');
                                    }
                                    addToUndoData(options.layerName + '-redo', layer);
                                    undoData[options.layerName] = storage;

                                    var img = new Image();
                                    img.src = oldLayer.image;
                                    img.onload = function(){
                                        layer[0].getContext('2d').drawImage(img, 0, 0);
                                    }
                                    break;
                                default:
                                    console.warn('Undo doesn\'t have this action ('+ options.action +')');
                                    break;
                            }
                            settings.undo.step --;
                        }
                        else{
                            console.log('Too many undo steps');
                        }
                        break;
                    case 'redo':
                        return
                        for (var i = 0; i < -1 * steps; i++) {
                            if (undoStep < undo.length) {
                                var options = undo[undoStep];
                                switch (options.action) {
                                    case 'draw':
                                        var layer = options.layerName;
                                        $('#'+ layer).show();
                                        $('#layers [data-layer="'+ layer +'"]').show();
                                        break;
                                    case 'blendingModes':
                                        var layer = layers[options.layerName];
                                        layer.blendingMode = options.after;
                                        $(layer[0]).css('mix-blend-mode', layer.blendingMode);
                                        break;
                                    case 'layerOrder':
                                        var length = $('#layers .item').length;
                                        settings.layers.order = new Array(length - 1);
                                        var elements = [];
                                        for(var i = 0; i < length; i++){
                                            elements.push($('[data-layer="'+ options.after[length - i - 1] +'"]', '#layers'));
                                            $('#'+ options.after[length - i - 1]).css('z-index', i + 1);
                                            settings.layers.order[i] = $(this).attr('data-layer');
                                        }

                                        $('#layers').append(elements);
                                        break;
                                    case 'delete':
                                        $('#layers .selected').removeClass('selected');

                                        if(options.layerName){
                                            var layer = options.layerName;
                                            $('#'+ layer).hide();
                                            $('#layers [data-layer="'+ layer +'"]').hide().removeClass('selected').removeClass('lastSelected');
                                        }
                                        else if (options.layer){
                                            var layer = options.layer;
                                            if(layer.length){
                                                for(var i = 0, l = layer.length; i < l; i++){
                                                    $('#'+ layer[i]).hide();
                                                    $('#layers [data-layer="'+ layer[i] +'"]').hide().removeClass('selected').removeClass('lastSelected');
                                                }
                                            }
                                        }
                                        DisableLayerButtons();
                                        break;
                                    case 'transform':
                                        var layer = layers[options.layerName];
                                        TransformLayer(layer, options.after);
                                        ScaleCanvas(layer, options.after , options.before);
                                        break;
                                    case 'opacity':
                                        opacitySlider.update({
                                            from: options.after * 100
                                        });
                                        layers[options.layerName].alpha = options.after;
                                        $('#' + options.layerName).css('opacity', options.after);
                                        break;
                                    case 'pixelManipulation':
                                        var layer = layers[options.layerName];

                                        var oldLayer = undoData[options.layerName + '-redo'].pop();

                                        if(oldLayer == undefined){
                                            console.warn('Redo has no layer obj');
                                        }
                                        addToUndoData(options.layerName, layer);

                                        var img = new Image();
                                        img.src = oldLayer.image;
                                        img.onload = function(){
                                            ClearLayer(options.layerName);
                                            layer[0].getContext('2d').drawImage(img, 0, 0);
                                        }
                                        break;
                                    default:
                                        console.warn('Redo doesn\'t have this action ('+ options.action +')');
                                        break;
                                }
                                window.undoStep = undoStep += 1;
                            }
                            else{
                                console.log('Too many redo steps');
                            }
                        }
                        break;
                }
            }
        }
    }
    settings.undo = function(){
        this.history = [];
        this.step = 0;
        this.layers = [];
        
        this.add = function(options){
            var self = this;
            var layer = options.layer;
            
            if(this.history.length >= settings.historyMax){
                var amount = 1 + this.history.length - settings.historyMax;
                var deletedHistory = this.history.splice(0, amount);
                this.step -= amount;
                
                if(deletedHistory.action){
                    if(deletedHistory.action == 'pixelManipulation'){
                        this.data.storage[deletedHistory.layer.id].splice(0, 1);
                    }
                }
                else{
                    $.each(deletedHistory, function(index, value){
                        if(deletedHistory.action && deletedHistory.action == 'pixelManipulation'){
                            self.data.storage[deletedHistory.layer.id].splice(0, 1);
                        }
                    });
                }
            }
            var removedLayers = this.history.splice(this.step, this.history.length);
            $.each(removedLayers, function(index, removedLayer){
                if(removedLayer.layer.id && self.layers.indexOf(removedLayer.layer.id) != -1){
                    self.layers.splice(self.layers.indexOf(removedLayer.layer.id), 1);
                }
            });
            if(layer && this.layers.indexOf(layer.id) == -1){
                this.layers.push(layer.id);
            }
            
            switch(options.action){
                case 'add':
                    self.history.push({
                        action: 'add',
                        layer: {
                            x: layer.x,
                            y: layer.y,
                            width: layer.width,
                            height: layer.height,
                            id: layer.id
                        }
                    });
                    break;
                case 'alpha':
                    self.history.push({
                        action: 'alpha',
                        layer: {
                            alpha: {
                                before: options.before,
                                after: options.after
                            },
                            id: layer.id
                        }
                    });
                    break;
                case 'blendingModes':
                    self.history.push({
                        action: 'blendingModes',
                        layer: {
                            id: layer.id,
                            blendingMode: {
                                before: layer.blendingMode,
                                after: options.blendingMode
                            }
                        }
                    });
                    layer.$.css('mix-blend-mode', options.after);
                    layer.blendingMode = options.after;
                    break;
                case 'delete':
                    if(typeof layer == 'string'){
                        layer.delete();
                        layersPanel.DisableLayerButtons();
                        
                        self.history.push({
                            action: 'delete',
                            layer: {
                                id: layer.id
                            }
                        });
                    }
                    else if (typeof layer == 'object'){
                        if(layer.length){
                            for(var i = 0, l = layer.length; i < l; i++){
                                $.each(settings.layers.order, function(index, value){
                                    if(value.id == layer[i]){
                                        value.delete();
                                    }
                                });
                            }
                            self.history.push({
                                action: 'delete',
                                layers: layer
                            });
                            layersPanel.DisableLayerButtons();
                        }
                    }
                    break;
                case 'layerOrder':
                    self.history.push({
                        action: 'layerOrder',
                        before: options.order,
                        after: settings.layers.order
                    });
                    break;
                case 'pixelManipulation':
                    settings.undo.data.add(options.layer);

                    this.history.push({
                        action: 'pixelManipulation',
                        layer: {
                            x: layer.x,
                            y: layer.y,
                            width: layer.width,
                            height: layer.height,
                            id: layer.id
                        }
                    });
                    break;
                case 'transform':
                    self.history.push({
                        action: 'transform',
                        layer: {
                            transform: {
                                before: {
                                    x: layer.x,
                                    y: layer.y,
                                    width: layer.width,
                                    height: layer.height
                                },
                                after: options.after
                            },
                            id: layer.id
                        }
                    });
                    break;
            }
            self.step += 1;
            
            self.CheckButtons();
            if(self.step != this.history.length) {
                console.warn('Undo step and undo.length not synced; undo:', this.history, ', undo.length:', this.history.length);
            }

            if(options.action == 'add' || options.action == 'pixelManipulation' || (options.action == 'transform' && (options.after.width != layer.width || options.after.height != layer.height))){
                $.each(settings.layers.order, function(index, value){
                    if(value.id == layer.id){
                        value.panel.refreshPreview(value);
                    }
                });
            }
            this.CheckForOrphans();
        }
        this.CheckButtons = function(){
            if(settings.undo.step > 0) {
                $('.tool[data-action="undo"]', root).removeClass('disabled');
            }
            else{
                $('.tool[data-action="undo"]', root).addClass('disabled');
            }
            if(settings.undo.step < settings.undo.history.length){
                $('.tool[data-action="redo"]', root).removeClass('disabled');
            }
            else{
                $('.tool[data-action="redo"]', root).addClass('disabled');
            }
            $('.tool[data-action="undo"], .tool[data-action="redo"]', root).addClass('disabled');
        }
        this.CheckForOrphans = function(){
            var self = this;
            $.each(settings.layers.order, function(index, layer){
                if(!layer){
                    settings.layer.order.splice(index, 1);
                }
                if(self.layers.indexOf(layer.id) == -1){
                    layer.remove();
                }
            });
        }
        this.data = {
            storage: {},
            add: function(layer){
                var name = layer.id;
                if(this.storage[name] == undefined){
                    this.storage[name] = [];
                }
                var temp = {};
                temp.image = layer.$[0].toDataURL('image/png');
                temp.transform = {
                    x: layer.x,
                    y: layer.y,
                    width: layer.width,
                    height: layer.height
                }
                this.storage[name].push(temp);
            }
        };
    }
    settings.layers = function(){
        this.order = [];
        this.selected = undefined;
        
        this.Reorder = function(writeToSettings){
            setTimeout(function(){
                var length = $('#layers .item').length;
                if(writeToSettings){
                    var oldLayerOrder = settings.layers.order;
                    settings.layers.order = new Array(length);
                }
                $('#layers .item').each(function(index){
                    $('#'+ $(this).attr('data-layer')).css('z-index', length - index);
                    if(writeToSettings){
                        currentID = $(this).attr('data-layer');
                        $.each(oldLayerOrder, function(i, layer){
                            if(layer.id == currentID){
                                settings.layers.order[length - index - 1] = layer;
                                return;
                            }
                        });
                    }
                });
                if(writeToSettings){
                    settings.undo.add({
                        action: 'layerOrder',
                        order: oldLayerOrder
                    })
                }
            });
        }
        this.Deselect = function(){
            var layer = settings.layers.selected;
            if(!layer) return false;
            temp.Clear();
            
            if(settings.transition && layer) {
                layer.$.css('transition', settings.transition);
            }
            
            layersPanel.DisableLayerButtons();
            if(layer){
                layer.panel.$.removeClass('selected lastSelected');
            }

            layer.temp.original = {};
            settings.layers.selected = undefined;
            mouse.dist.reset();

            opacitySlider.update({
                from: 100,
                disable: true
            });
            $blendingModes.val('normal').trigger("change").prop("disabled", true);
            temp.CheckCursor(mouse.lastPos);
        }
    }
    settings.openFiles = function(e, files){
        var obj = files ? e : e.target.files;
        
        $.each(obj, function(index, value){
            var reader = new FileReader();
            reader.readAsDataURL(value);
            reader.onload = function(event){
                var img = new Image();
                img.src = event.target.result;
                img.onload = function(){
                    root.trigger('closePopovers', null);
                    var width = img.width, height = img.height;
                    var newLayer = new Layer({
                        x: (temp.width - img.width) / 2,
                        y: (temp.height - img.height) / 2,
                        width: img.width,
                        height: img.height
                    });
                    
                    newLayer.ctx.drawImage(img, 0, 0, width, height);
                    //newLayer.trim(); // broken
                    
                    if(temp.width < img.width){
                        var prop = temp.width / img.width;
                        width = temp.width;
                        height = img.height * prop;
                    }
                    if(temp.height < img.height){
                        var prop = temp.height / img.height;
                        height = temp.height;
                        width = img.width * prop;
                    }
                    newLayer.scale({
                        start: {
                            width: img.width,
                            height: img.height
                        },
                        end: {
                            width: width,
                            height: height
                        }
                    });
                    if(width != img.width || height != img.height){
                        newLayer.transform({
                            x: (temp.width - img.width) / 2,
                            y: (temp.height - img.height) / 2
                        });
                    }
                    newLayer.width = width;
                    newLayer.height = height;
                    
                    settings.undo.add({
                        action: 'add',
                        layer: newLayer
                    });
                    
                    settings.tools.changeTo('select');
                    new canvasPosition({x: mouse.lastPos.x, y: mouse.lastPos.y}).Outline();
                }
            }
        })
    }
    
    $.mercuryCanvas = {};
    $.mercuryCanvas.defaults = {};
    $.mercuryCanvas.defaults.settings = {
        backgroundColor: '#fff',
        resizeDelay: 250,
        dragDetectSensibility: 1, // higher -> more distance before dragged becomes true
        width: 600, // overwritten at the moment
        height: 500, // overwritten at the moment
        lineWidth: ($.cookie('brushSize') ? $.cookie('brushSize') : 5),
        strokeColor: '#000',
        tool: '',
        transition: 'all 0.5s ease',
        historyMax: 20,
        brushSizeIncrement: 3,
        handlerSize: 20,
        zIndex: 1,
        tools: settings.tools,
        undo: settings.undo,
        refresh: function(){
            cursor.$.css({
                width: settings.lineWidth,
                height: settings.lineWidth
            });
            cursor.sizeChange();
            temp.ctx.lineWidth = settings.lineWidth;
        },
        openFiles: settings.openFiles,
        layers: settings.layers
    };
    $.mercuryCanvas.defaults.layer = {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        alpha: 1,
        id: '',
        matrix: null,
        blendingMode: 'normal',
        text: null
    };
    $.fn.mercuryCanvas = function(options){
        settings = $.extend({}, $.mercuryCanvas.defaults.settings, options);
        settings.tools = new settings.tools();
        settings.layers = new settings.layers();
        settings.undo = new settings.undo();
        settings.templates = [];
        settings.undo.CheckButtons();

        root = $(this);
        root.find('#canvasWrapper').html('').css({
            width: 'calc(100% - 280px)',
            height: '100%'
        }).append('<div id="cursor"></div><canvas id="buffer" width="0" height="0" border="0"></canvas><canvas class="canvasLayer canvasBottom" id="canvasBackground" height="0" width="0" border="0">Update your browser</canvas>');
        
        settings.layers.parent = $('#canvasWrapper');
        
        $background = $('#canvasBackground');
        buffer.$ = $('#buffer');
        buffer.ctx = buffer.$[0].getContext('2d');
        background = $background[0];

        backgroundCtx = background.getContext('2d');

        root.on('contextmenu', function(e){
            e.preventDefault();
            return false;
        });
        temp = new temp().resize();
        cursor = new cursor();

        $('.menu-open', root).popover({
            html : true,
            container: 'body',
            placement: 'right',
            template: '<div class="popover" role="tooltip"><div class="arrow"></div><div class="popover-content"></div></div>',
            content: function(){
                return $('#'+ $(this).attr('data-menu'))[0].innerHTML;
            }
        });
        $('#tools', root).children('li').tooltip({
            placement: 'right',
            container: 'body',
        });
        $('#currentTool', root).children('li').tooltip({
            placement: 'bottom',
            container: 'body'
        });

        root.on({
            'show.bs.tooltip': function(){
                if(settings.zIndex > 999){
                    $(this).css('z-index', 71 + settings.zIndex);
                }
            },
            'closePopovers': function(c, e){
                $('.menu-open').each(function () {
                    if (e == null || (!$(this).is(e.target) && !$(this).has(e.target).length && !$('.popover').has(e.target).length)) {
                        $(this).popover('hide');
                    }
                });
                if(e == null || (e != null && $('.colpick').css('display') != 'none') && !$('.colpick').has(e.target).length && !$('.colpick').is(e.target)){
                    setTimeout(function(){
                        $('.colorPicker').colpickHide();
                    });
                }
            },
            'show.bs.popover': function(){
                if(settings.zIndex > 999){
                    $(this).css('z-index', 31 + settings.zIndex);
                }
            },
            'mouseup': function(e){
                root.trigger('closePopovers', e);
            }
        });

        $('.tool', root).on('click', function(){
            var $this = $(this);
            if (!$this.hasClass('disabled')) {
                if($this.attr('data-action')){
                    settings.tools.changeTo($this.attr('data-action'));
                }
            }
        });
        
        $(window).on('resize', function(){
            temp.resize();
        });

        $('#blendingModes', root).select2({
            dropdownParent: $('#blendingModes', root).parent(),
        }).on('change', function(e, custom){
            // TODO: prevent undo.add when this is triggered by code
            if(!custom && settings.layers.selected){
                var newBlendingMode = $blendingModes.find('option:checked').val();
                settings.undo.add({
                    action: 'blendingModes',
                    layer: settings.layers.selected,
                    after: newBlendingMode
                });
            }
        });
        $(document.body).on('click', '#dbload', function(){
            var newElem = '<table id="allcanvases" class="table table-striped table-bordered table-hover"><tr><th>Nume</th><th></th></tr></table>';
            MercuryModal({
                title: 'Încarcă imagini din baza de date',
                buttons: [
                    {
                        text: 'Anulează',
                        class: 'btn-default',
                        dismiss: true
                    }
                ],
                textAlign:{
                    footer: 'center'
                },
                content: newElem,
                ready: function(){
                    $.MercuryModal.defaults.ready();

                    $.ajax({
                        url: 'functions/getimages.php',
                        dataType: 'json',
                        success: function(e){
                            // TODO: make a table with choose buttons
                            console.log(e);
                        }
                    })
                }
            });
        });

        $('#brushSizeSlider', root).val($.cookie('brushSize')).ionRangeSlider({
            force_edges: true,
            min: 1,
            max: 100,
            from: parseInt($.cookie('brushSize')),
            onChange: function(e){
                $.cookie('brushSize', e.from);
                settings.lineWidth = e.from;
                settings.refresh();
            },
            onUpdate: function(e){
                $.cookie('brushSize', e.from);
                settings.lineWidth = e.from;
                settings.refresh();
            }
        });
        brushSizeSlider = $('#brushSizeSlider', root).data('ionRangeSlider');

        $('#opacitySlider', root).val(100).ionRangeSlider({
            force_edges: true,
            min: 0,
            max: 100,
            from: parseInt(100),
            onChange: function(e){
                if(opacitySliderFinished){
                    opacitySliderFinished = false;
                    return;
                }
                if(settings.layers.selected) {
                    if(!userOpacityChange){
                        userOpacityChange = true;
                        startOpacity = parseFloat(settings.layers.selected.$.css('opacity'));
                    }
                    settings.layers.selected.$.css('opacity', e.from / 100);
                    settings.layers.selected.alpha = e.from / 100;
                }
            },
            onFinish: function(e){
                if(!userOpacityChange){
                    startOpacity = settings.layers.selected.alpha;
                }
                if(settings.layers.selected){
                    settings.undo.add({
                        action: 'alpha',
                        layer: settings.layers.selected,
                        before: startOpacity,
                        after: e.from / 100
                    });
                    settings.layers.selected.$.css('opacity', e.from / 100);
                    settings.layers.selected.alpha = e.from / 100;
                    opacitySliderFinished = true;
                    userOpacityChange = false;
                }
            }
        });
        opacitySlider = $('#opacitySlider', root).data("ionRangeSlider");

        $('.colorPicker', root).colpick({
            layout:'full',
            color: '#000',//(settings.strokeColor.substring(1) ? settings.strokeColor.substring(1) : '000000'),
            onHide: function(){
                console.log(settings.tools.current);
            },
            onChange:function(hsb,hex,rgb,el,bySetColor){
                settings.strokeColor = '#' + hex;
                settings.fillColor = '#' + hex;
                settings.refresh();
            },
            onSubmit:function(hsb,hex,rgb,el,bySetColor){
                settings.strokeColor = '#' + hex;
                settings.fillColor = '#' + hex;
                settings.refresh();
                $('.colorPicker').colpickHide();
            }
        });

        $blendingModes = $('#blendingModes');

        $(document.body).on('click', '.chooseFiles', function(){
            $('#oldInput').click();
        }).on('change', '#oldInput', function(e){
            settings.openFiles(e);
            $(this).empty();
        }).on('click', '#saveoffline', function(){
            temp.MergeAllLayers();
            var dt = temp.$[0].toDataURL('image/png');
            this.href = dt.replace(/^data:image\/[^;]/, 'data:application/octet-stream');
        });
        $(window).on('dragstart', ':not(#layers, #layers *)', function(){
            if($(this).parents('#layers').length){
                return false;
            }
        }).on({
            'dragenter': function (e) {
                e.preventDefault();
                $('.dragndrop').show();
            },
            'dragexit': function (e) {
                e.preventDefault();
                $('.dragndrop').removeClass('over').hide();
            }
        });
        $('.dragndrop').on({
            'dragover': function (e) {
                e.preventDefault();
                $('.dragndrop').addClass('over');
            },
            'dragexit': function (e) {
                e.preventDefault();
                $('.dragndrop').removeClass('over');
            },
            'drop': function (e) {
                e.preventDefault();
                $('.dragndrop').removeClass('over').hide();
                var files = e.originalEvent.dataTransfer.files;
                settings.openFiles(files, true);
            }
        });
        $('#layers').sortable({
            animation: 100,
            onMove: function(){
                settings.layers.Reorder(false);
            },
            onEnd: function(){
                settings.layers.Reorder(true);
            }
        });
        $(root).on('click', '.layer-visible', function(e){
            var layerName = $(this).parents('.item').attr('data-layer');

            if(keys.alt && !keys.ctrl && !keys.shift){
                if($('#layers .fa-eye').length <= 1){
                    if($(this).children('.fa').hasClass('fa-eye')){
                        $('#layers .layer-visible .fa').removeClass('fa-eye').addClass('fa-square-o');
                        $.each(altHiddenLayers, function(index, value){
                            $('#' + value).show();
                            $('#layers [data-layer="'+ value +'"]').find('.fa').addClass('fa-eye').removeClass('fa-square-o');
                        });
                        altHiddenLayers = [];
                    }
                    else{
                        $('#layers .layer-visible .fa').removeClass('fa-eye').addClass('fa-square-o');
                        $('.canvasLayer:not(.canvasTop, .canvasBottom)').hide();
                        $(this).children('.fa').addClass('fa-eye').removeClass('fa-square-o');
                        $('#' + layerName).show();
                    }
                }
                else{
                    $('#layers .item').each(function(){
                        if($(this).find('.fa').hasClass('fa-eye')){
                            altHiddenLayers.push($(this).attr('data-layer'));
                            $('#' + $(this).attr('data-layer')).hide();
                        }
                    });
                    $('#layers .layer-visible .fa').removeClass('fa-eye').addClass('fa-square-o');
                    $('#' + layerName).show();
                    $(this).children('.fa').addClass('fa-eye').removeClass('fa-square-o');
                }
            }
            else{
                if($(this).children('.fa').hasClass('fa-eye')){
                    $(this).children('.fa').removeClass('fa-eye').addClass('fa-square-o');
                    $('#' + layerName).hide();
                }
                else{
                    $(this).children('.fa').removeClass('fa-square-o').addClass('fa-eye');
                    $('#' + layerName).show();
                }
            }
            if(settings.tools.current == 'eyeDropper'){
                temp.MergeAllLayers();
            }
            e.stopPropagation();
        });
        $(root).on('click', '#layers', function(e){
            if(!$(e.target).hasClass('item') && !$(e.target).parents('.item').length){
                $('.item', root).removeClass('selected lastSelected');
                layersPanel.DisableLayerButtons();
                return;
            }
            elem = $(e.target).hasClass('item') ? $(e.target) : $(e.target).parents('.item');
            if(keys.ctrl){
                $('.lastSelected').removeClass('lastSelected');
                if(elem.hasClass('selected')){
                    elem.removeClass('selected');
                }
                else{
                    elem.addClass('selected').addClass('lastSelected');
                }
            }
            else if(keys.shift){
                var last = $('.lastSelected');
                var lastID = last.index() - elem.index();
                $('#layers .item').removeClass('selected');
                last.addClass('selected');
                if(lastID < 0){
                    lastID *= -1;
                    for(var i = 0; i < lastID; i++){
                        last = last.next();
                        last.addClass('selected');
                    }
                }
                else{
                    for(var i = 0; i < lastID; i++){
                        last = last.prev();
                        last.addClass('selected');
                    }
                }
            }
            else{
                $('.lastSelected').removeClass('lastSelected');
                $('.item.selected').removeClass('selected');
                elem.addClass('selected').addClass('lastSelected');
            }
            if($('#layers .selected').length){
                layersPanel.EnableLayerButtons();
            }
            else{
                layersPanel.DisableLayerButtons();
            }
        });
        $('#layer-buttons .deleteLayers').on('click', function(){
            var layersForAction = [];
            $('#layers').children('.selected').each(function(){
                layersForAction.push($(this).attr('data-layer'));
                $('#' + $(this).attr('data-layer')).trigger('delete');
            });
            settings.undo.add({
                action: 'delete',
                layer: layersForAction
            });
        });
        
        $('.mustache').each(function(index, value){
            settings.templates[$(this).attr('id')] = $(this).html();
            Mustache.parse(settings.templates[$(this).attr('id')]);
        });
        
        temp.Clear();
        layersPanel.DisableLayerButtons();
        settings.tools.changeTo('brush');
        settings.refresh();
    }
    
    var mouse = {
        min: {
            x: null,
            y: null,
            round: function(){
                this.x = Math.floor(this.x);
                this.y = Math.floor(this.y);
            },
            reset: function(){
                this.x = null;
                this.y = null;
            }
        },
        max: {
            x: null,
            y: null,
            round: function(){
                this.x = Math.ceil(this.x);
                this.y = Math.ceil(this.y);
            },
            reset: function(){
                this.x = null;
                this.y = null;
            }
        },
        dist: {
            x: null,
            y: null,
            round: function(){
                this.x = Math.round(this.x);
                this.y = Math.round(this.y);
            },
            reset: function(){
                this.x = null;
                this.y = null;
            }
        },
        document: {},
        canvas: {},
        points: [],
        start: {},
        lastPos: {},
        moved: false,
        dragged: false,
        firstClick: false
    };
    
    $.Event.prototype.IsOnCanvas = function(){
        if(!$('#temp').length) return false;
        if(this.target && $(this.target).attr('id') == 'temp') return true;
        else return false;
    }
    $.Event.prototype.ToCanvasSpace = function(){
        if(!settings.layers.parent) return new canvasPosition({x: 0, y: 0});
        return new canvasPosition({
            x: this.pageX - parseFloat(settings.layers.parent.offset().left),
            y: this.pageY - parseFloat(settings.layers.parent.offset().top)
        });
    }
    $.Event.prototype.CheckBrushLimits = function(){
        if(mouse.points.length < 1) return;
        var lastPoint = mouse.points[mouse.points.length - 1];
        if (lastPoint.x < mouse.min.x) {
            mouse.min.x = lastPoint.x;
        }
        if (lastPoint.y < mouse.min.y) {
            mouse.min.y = lastPoint.y;
        }
        if (lastPoint.x > mouse.max.x) {
            mouse.max.x = lastPoint.x;
        }
        if (lastPoint.y > mouse.max.y) {
            mouse.max.y = lastPoint.y;
        }
    }
    
    canvasPosition = function(x, y){
        if(typeof x == 'object'){
            this.x = x.x;
            this.y = x.y;
        }
        else{
            this.x = x;
            this.y = y;
        }
    };
    canvasPosition.prototype.ToLayer = function(){
        var self = this;
        if(this.x == undefined || this.x < 0 || this.y == undefined || this.y < 0) return;
        var returned = [];
        $.each(settings.layers.order, function(index, value){
            if (value.x <= self.x && value.x + value.width >= self.x &&
                value.y <= self.y && value.y + value.height >= self.y &&
                value.$.css('display') != 'none') {
                returned.push(value);
            }
        });
        if(returned.length > 1) {
            var currentReturn = null;
            var colors = self.ToColor();
            for (var i = 0; i < colors.length; i++) {
                if (colors[i].alpha > 0) {
                    if(currentReturn){
                        if(colors[i].zIndex > currentReturn.zIndex){
                            currentReturn = colors[i];
                        }
                    }
                    else{
                        currentReturn = colors[i];
                    }
                }
            }
            return currentReturn;
        }
        else{
            return returned[0];
        }
    }
    canvasPosition.prototype.ToColor = function(){
        var returned = [];
        var self = this;
        $.each(settings.layers.order, function(index, value){
            if (value.x <= self.x && value.x + value.width >= self.x &&
                value.y <= self.y && value.y + value.height >= self.y) {
                var imageData = value.ctx.getImageData(self.x - value.x, self.y - value.y, 1, 1);
                value.r = imageData.data[0];
                value.g = imageData.data[1];
                value.b = imageData.data[2];
                value.a = imageData.data[3];
                if(value.a > 0){
                    returned.push(value);
                }
            }
        });
        return returned;
    }
    canvasPosition.prototype.Outline = function(){
        var layer = this.ToLayer();
        if(layer == settings.layers.selected) return;
        if(layer){
            temp.ctx.save();
            temp.ctx.translate(-0.5, -0.5);
            temp.ctx.strokeStyle="#000000";
            temp.ctx.lineWidth = 1;
            temp.ctx.strokeRect(Math.floor(layer.x), Math.floor(layer.y), Math.ceil(layer.width + 1), Math.ceil(layer.height + 1));
            temp.ctx.restore();
        }
    }
    
    $(document.body).on({
        'keydown': function(e){
            if(!e.key) e.key = window.keypress._keycode_dictionary[e.keyCode];
            e.key = e.key.toLowerCase();
            if(mouse.dragged && (e.ctrlKey != keys.ctrl || e.altKey != keys.alt || e.shiftKey != keys.shift)){
                var mm = true;
            }
            keys[e.key] = true;
            keys.ctrl = e.ctrlKey;
            keys.alt = e.altKey;
            keys.shift = e.shiftKey;
            if(mm){
                $(document.body).trigger('mousemove', {custom: true});
            }
        },
        'keyup': function(e){
            if(!e.key) e.key = window.keypress._keycode_dictionary[e.keyCode];
            e.key = e.key.toLowerCase();
            keys[e.key] = false;
            keys.ctrl = e.ctrlKey;
            keys.alt = e.altKey;
            keys.shift = e.shiftKey;
            // this must be here because you can't start the file dialog outside an event
            if(keys.ctrl && e.key == 'o' && !keys.shift && !keys.alt){
                $('#oldInput').click();
                console.log('fuck firefox', $('#oldInput'));
            }
            if(mouse.dragged){
                $(document.body).trigger('mousemove', {custom: true});
            }
        },
        'mousedown': function(event){
            mouse.document[event.which] = true;
            mouse.dragged = false;
            dir = '';
            if($('.mercuryModal').length) return;
            
            temp.cleared = false;
            root.trigger('closePopovers', event);
            
            if(event.IsOnCanvas()){
                var pos = event.ToCanvasSpace();
                mouse.canvas[event.which] = true;
                
                if(event.which == 1){
                    switch(settings.tools.current){
                        case 'brush':
                        case 'eraser':
                            mouse.start = pos;
                            mouse.points = [];
                            mouse.points[0] = pos;
                            event.CheckBrushLimits();
                            
                            temp.DrawBrush();
                            break;
                        case 'select':
                            if(!settings.layers.selected){
                                mouse.firstClick = true;
                                temp.Clear();
                                var layer = pos.ToLayer();
                                if(layer){
                                    layer.select();
                                    layer.temp.original = {
                                        x: settings.layers.selected.x,
                                        y: settings.layers.selected.y,
                                        width: settings.layers.selected.width,
                                        height: settings.layers.selected.height
                                    }
                                }
                            }
                            else{
                                if(pos.ToLayer() == settings.layers.selected){
                                    mouse.firstClick = true;
                                }
                            }
                            break;
                    }
                }
            }
        },
        'mousemove': function(event, custom){
            if($('.mercuryModal').length) return;
            requestAnimationFrame(function(){
                var pos;
                if(custom){
                    pos = mousePos;
                }
                else{
                    mousePos = pos = event.ToCanvasSpace();
                }
                mouse.lastPos = pos;

                switch(settings.tools.current){
                    case 'brush':
                    case 'eraser':
                        if(!custom){
                            cursor.moveTo(pos);
                        }
                        
                        if(mouse.canvas['1']){
                            if(keys.shift){
                                if(dir){
                                    if(dir == 'horizontal'){
                                        pos.y = mouse.start.y;
                                    }
                                    else if (dir == 'vertical'){
                                        pos.x = mouse.start.x;
                                    }
                                }
                                else{
                                    var deltaX, deltaY;
                                    deltaX = Math.abs(pos.x - mouse.start.x);
                                    deltaY = Math.abs(pos.y - mouse.start.y);
                                    if(deltaX > deltaY){
                                        dir = 'horizontal';
                                    }
                                    else{
                                        dir = 'vertical';
                                    }
                                }
                            }
                            mouse.points[mouse.points.length] = pos;
                            event.CheckBrushLimits();
                            temp.DrawBrush();
                        }
                        break;
                    case 'select':
                        if(!settings.layers.selected){
                            temp.Clear();
                            pos.Outline();
                        }
                        else{
                            if(!mouse.canvas['1']){
                                temp.CheckCursor(pos, true);
                            }
                            else {
                                var newWidth, newHeight, newX, newY, layer;
                                layer = settings.layers.selected;
                                newWidth = layer.width;
                                newHeight = layer.height;
                                newX = layer.x;
                                newY = layer.y;

                                if(temp.$.css('cursor') == 'default'){
                                    temp.CheckCursor(pos, false);
                                }
                                if(!settings.tools.select.action){
                                    temp.$.css('cursor', 'move');
                                    settings.tools.select.action = 'move';
                                }

                                if(!mouse.dist.x || !mouse.dist.y){
                                    mouse.dist.x = pos.x - layer.x;
                                    mouse.dist.y = pos.y - layer.y;
                                }
                                if(!layer.temp.original.width || !layer.temp.original.height){
                                    layer.temp.original.width = layer.width;
                                    layer.temp.original.height = layer.height;
                                    layer.temp.original.x = layer.x;
                                    layer.temp.original.y = layer.y;
                                }
                                var action = settings.tools.select.action;
                                if(action && action.length){
                                    switch (action){
                                        case 'move':
                                            newX = pos.x - mouse.dist.x;
                                            newY = pos.y - mouse.dist.y;

                                            if(keys.shift){
                                                var deltaX, deltaY;
                                                deltaX = Math.abs(pos.x - mouse.dist.x - layer.temp.original.x);
                                                deltaY = Math.abs(pos.y - mouse.dist.y - layer.temp.original.y);

                                                if(deltaX > 20 || deltaY > 20){
                                                    if(deltaX > deltaY){
                                                        newY = layer.temp.original.y;
                                                    }
                                                    else{
                                                        newX = layer.temp.original.x;
                                                    }
                                                }
                                                else{
                                                    newX = layer.temp.original.x;
                                                    newY = layer.temp.original.y;
                                                }
                                            }
                                            break;
                                        case 'nw':
                                            newWidth = layer.width + (layer.x - pos.x);
                                            newHeight = layer.height + (layer.y - pos.y);
                                            newX = pos.x;
                                            newY = pos.y;
                                            if(keys.shift){
                                                wProp = newWidth / layer.temp.original.width;
                                                hProp = newHeight / layer.temp.original.height;
                                                newHeight = layer.temp.original.height * (wProp + hProp) / 2;
                                                newWidth = layer.temp.original.width * (wProp + hProp) / 2;

                                                newX = Math.min(layer.x + layer.width - newWidth, layer.x + layer.width);
                                                newY = Math.min(layer.y + layer.height - newHeight, layer.y + layer.height);
                                            }
                                            if(keys.alt){
                                                newX = Math.min(newX, layer.x + layer.width);
                                                newY = Math.min(newY, layer.y + layer.height);
                                                newWidth = newWidth - Math.sign(newX - layer.x) * Math.abs(layer.width - newWidth);
                                                newHeight = newHeight - Math.sign(newY - layer.y) * Math.abs(layer.height - newHeight);
                                            }
                                            newX = Math.min(newX, layer.x + layer.width);
                                            newY = Math.min(newY, layer.y + layer.height);
                                            break;
                                        case 'ne':
                                            newWidth = layer.width + (pos.x - (layer.x + layer.width));
                                            newHeight = layer.height - (pos.y - layer.y);
                                            if(keys.shift){
                                                wProp = newWidth / layer.temp.original.width;
                                                hProp = newHeight / layer.temp.original.height;
                                                newHeight = layer.temp.original.height * (wProp + hProp) / 2;
                                                newWidth = layer.temp.original.width * (wProp + hProp) / 2;

                                                newY = Math.min(layer.y + layer.height - newHeight, layer.y + layer.height);
                                            }
                                            else{
                                                newY = Math.min(pos.y, layer.y + layer.height); 
                                            }
                                            newX = layer.x;
                                            break;
                                        case 'se':
                                            newWidth = layer.width + (pos.x - layer.x - layer.width);
                                            newHeight = layer.height + (pos.y - layer.y - layer.height);
                                            if(keys.shift){
                                                wProp = newWidth / layer.temp.original.width;
                                                hProp = newHeight / layer.temp.original.height;
                                                newHeight = layer.temp.original.height * (wProp + hProp) / 2;
                                                newWidth = layer.temp.original.width * (wProp + hProp) / 2;
                                            }
                                            newX = layer.x;
                                            newY = layer.y;
                                            break;
                                        case 'sw':
                                            newWidth = layer.width + (layer.x - pos.x);
                                            newHeight = layer.height + (pos.y - layer.y - layer.height);
                                            if(keys.shift){
                                                wProp = newWidth / layer.temp.original.width;
                                                hProp = newHeight / layer.temp.original.height;
                                                newHeight = layer.temp.original.height * (wProp + hProp) / 2;
                                                newWidth = layer.temp.original.width * (wProp + hProp) / 2;

                                                newX = Math.min(layer.x + layer.width - newWidth, layer.x + layer.width);
                                            }
                                            else {
                                                newX = Math.min(pos.x, layer.x + layer.width);
                                            }
                                            newY = layer.y;
                                            break;
                                        case 'n':
                                            newWidth = layer.width;
                                            newHeight = layer.height + (layer.y - pos.y);
                                            newX = layer.x;
                                            newY = Math.min(pos.y, layer.y + layer.height);
                                            break;
                                        case 'w':
                                            newWidth = layer.width + (layer.x - pos.x);
                                            newHeight = layer.height;
                                            newX = Math.min(pos.x, layer.x + layer.width);
                                            newY = layer.y;
                                            break;
                                        case 's':
                                            newWidth = layer.width;
                                            newHeight = layer.height + (pos.y - layer.y - layer.height);
                                            newX = layer.x;
                                            newY = layer.y;
                                            break;
                                        case 'e':
                                            newWidth = layer.width + (pos.x - (layer.x + layer.width));
                                            newHeight = layer.height;
                                            newX = layer.x;
                                            newY = layer.y;
                                            break;
                                        default:
                                            console.log(action + " for select");
                                            break;
                                    }
                                }

                                if(newWidth != layer.width || newHeight != layer.height || newX != layer.x || newY != layer.y){
                                    layer.transform({
                                        x: newX,
                                        y: newY,
                                        width: newWidth,
                                        height: newHeight
                                    });
                                    layer.select();
                                }
                            }
                        }
                        break;
                    case 'eyeDropper':
                        // TODO: use the buffer and don't merge the layers everytime
                        temp.MergeAllLayers();
                        settings.tools.eyedropper.color = temp.ctx.getImageData(pos.x, pos.y, 1, 1).data;
                        var rectDiameter = settings.tools.eyedropper.gridSize * settings.tools.eyedropper.gridSpace;
                        var squareOrigin = {
                            x: pos.x,
                            y: pos.y
                        }
                        temp.ctx.save();
                        temp.ctx.imageSmoothingEnabled = temp.ctx.mozImageSmoothingEnabled = temp.ctx.webkitImageSmoothingEnabled = false;
                        temp.ctx.beginPath();
                        temp.ctx.arc(squareOrigin.x + rectDiameter / 2, squareOrigin.y + rectDiameter / 2, rectDiameter / 2, 0, 2 * Math.PI);
                        temp.ctx.clip();

                        pos.x = Math.max(4, pos.x);
                        pos.y = Math.max(4, pos.y);
                        temp.ctx.drawImage(temp.$[0], pos.x - 4, pos.y - 4, rectDiameter / settings.tools.eyedropper.gridSpace, rectDiameter / settings.tools.eyedropper.gridSpace, squareOrigin.x, squareOrigin.y, rectDiameter, rectDiameter);

                        temp.ctx.lineWidth = 1;

                        temp.ctx.strokeStyle = 'rgba(224, 224, 224, 0.8)';
                        temp.ctx.beginPath();
                        var x = 0;
                        for (x = 1; x < settings.tools.eyedropper.gridSize; x ++) {
                            temp.ctx.moveTo(squareOrigin.x + x * settings.tools.eyedropper.gridSpace, squareOrigin.y);
                            temp.ctx.lineTo(squareOrigin.x + x * settings.tools.eyedropper.gridSpace, squareOrigin.y + rectDiameter);
                        }
                        for (x = 1; x < settings.tools.eyedropper.gridSize; x ++) {
                            temp.ctx.moveTo(squareOrigin.x, squareOrigin.y + x * settings.tools.eyedropper.gridSpace);
                            temp.ctx.lineTo(squareOrigin.x + rectDiameter, squareOrigin.y + x * settings.tools.eyedropper.gridSpace);
                        }
                        temp.ctx.closePath();
                        temp.ctx.stroke();

                        temp.ctx.strokeStyle = '#000';
                        temp.ctx.beginPath();
                        temp.ctx.arc(squareOrigin.x + rectDiameter / 2, squareOrigin.y + rectDiameter / 2, rectDiameter / 2, 0, 2 * Math.PI);
                        temp.ctx.closePath();
                        temp.ctx.stroke();

                        temp.ctx.strokeStyle = '#000';
                        temp.ctx.strokeRect(squareOrigin.x + rectDiameter / 2 - settings.tools.eyedropper.gridSpace / 2, squareOrigin.y + rectDiameter / 2 - settings.tools.eyedropper.gridSpace / 2, settings.tools.eyedropper.gridSpace, settings.tools.eyedropper.gridSpace);
                        temp.ctx.strokeStyle = '#FFF';
                        temp.ctx.strokeRect(squareOrigin.x + rectDiameter / 2 - settings.tools.eyedropper.gridSpace / 2 + 1, squareOrigin.y + rectDiameter / 2 - settings.tools.eyedropper.gridSpace / 2 + 1, settings.tools.eyedropper.gridSpace - 2, settings.tools.eyedropper.gridSpace - 2);
                        temp.ctx.restore();
                        break;
                }
                if(mouse.canvas['1']){
                    mouse.dragged = true;
                }
            }, event);
        },
        'mouseup': function(event){
            if($('.mercuryModal').length) return;
            temp.cleared = false;
            dir = '';
            var pos = event.ToCanvasSpace();

            if(mouse.canvas['1'] && event.which == 1){
                switch(settings.tools.current){
                    case 'brush':
                    case 'eraser':
                        mouse.min.x = mouse.min.x - settings.lineWidth / 2 - 1;
                        mouse.min.y = mouse.min.y - settings.lineWidth / 2 - 1;
                        mouse.max.x = mouse.max.x + settings.lineWidth / 2 + 1;
                        mouse.max.y = mouse.max.y + settings.lineWidth / 2 + 1;

                        mouse.min.round();
                        mouse.max.round();
                        
                        if(settings.tools.current == 'brush'){
                            var newLayer = new Layer({
                                x: mouse.min.x,
                                y: mouse.min.y,
                                width: temp.width,
                                height: temp.height
                            });
                            if (mouse.dragged) {
                                temp.ctx.closePath();
                            }

                            temp.trim({
                                target: newLayer
                            }).Clear({
                                x: mouse.min.x,
                                y: mouse.min.y,
                                width: mouse.max.x - mouse.min.x,
                                height: mouse.max.y - mouse.min.y
                            });

                            settings.undo.add({
                                action: 'add',
                                layer: newLayer
                            });
                        }
                        else if(settings.tools.current == 'eraser'){
                            var p = {
                                x0: mouse.min.x,
                                y0: mouse.min.y,
                                x1: mouse.max.x,
                                y1: mouse.max.y
                            }
                            if (mouse.dragged) {
                                temp.ctx.closePath();
                            }
                            $.each(settings.layers.order, function(index, layer){
                                if(layer.BetweenPoints(p)){
                                    settings.undo.add({
                                        action: 'pixelManipulation',
                                        layer: layer
                                    });
                                    layer.ctx.save();
                                    layer.ctx.globalCompositeOperation = 'destination-out';
                                    layer.ctx.drawImage(temp.$[0], -1 * layer.x, -1 * layer.y);
                                    layer.ctx.restore();
                                    //layer.trim();
                                }
                            });
                            temp.Clear();
                        }
                        mouse.points = [];
                        mouse.min.reset();
                        mouse.max.reset();
                        break;
                    case 'eyeDropper':
                        if(event.IsOnCanvas()){
                            settings.fillColor = settings.strokeColor = 'rgb('+ settings.tools.eyedropper.color[0] +', '+ settings.tools.eyedropper.color[1] +', '+ settings.tools.eyedropper.color[2] +')';
                            temp.Clear();
                            setTimeout(function(){
                                settings.tools.changeTo('brush');
                            })
                        }
                        break;
                    case 'select':
                        if(mouse.canvas['1'] && event.which == 1){
                            temp.CheckCursor(pos, true);
                            var layer = settings.layers.selected;
                            
                            if(layer && mouse.dragged){
                                var old = {
                                    width: layer.temp.original.width,
                                    height: layer.temp.original.height
                                }
                                layer.x = layer.matrix.e;
                                layer.y = layer.matrix.f;
                                layer.width = Math.round(layer.temp.original.width * layer.matrix.a);
                                layer.height = Math.round(layer.temp.original.height * layer.matrix.d);
                                layer.matrix.reset().translate(layer.x, layer.y);
                                
                                layer.$.css({
                                    'transform': layer.matrix.toCSS(),
                                    '-webkit-transform': layer.matrix.toCSS()
                                });
                                
                                if(layer.width != old.width || layer.height != old.height){
                                    layer.scale({
                                        start: layer.temp.original,
                                        end: {
                                            x: layer.x,
                                            y: layer.y,
                                            width: layer.width,
                                            height: layer.height
                                        }
                                    });
                                }
                                layer.select();
                                
                                mouse.dist.reset();

                                settings.undo.add({
                                    action: 'transform',
                                    layer: {
                                        id: layer.id,
                                        panel: layer.panel,
                                        x: layer.temp.original.x,
                                        y: layer.temp.original.y,
                                        width: layer.temp.original.width,
                                        height: layer.temp.original.height
                                    },
                                    after: {
                                        x: layer.x,
                                        y: layer.y,
                                        width: layer.width,
                                        height: layer.height
                                    }
                                });
                                layer.temp.original = {
                                    x: layer.x,
                                    y: layer.y,
                                    width: layer.width,
                                    height: layer.height
                                }
                            }
                            else if(!mouse.firstClick){
                                settings.tools.select.action = '';
                                temp.$.css('cursor', 'default');
                                settings.layers.Deselect();
                                pos.Outline();
                            }
                        }
                        break;
                }
            }
            delete mouse.canvas[event.which];
            delete mouse.document[event.which];

            mouse.firstClick = mouse.dragged = false;
        }
    });
//}(jQuery));