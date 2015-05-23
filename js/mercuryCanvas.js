// TODO: after resizing the layer, layerToColor can be very wrong

(function($) {
    // Define local aliases to frequently used properties
    var PI = Math.PI,
        round = Math.round,
        abs = Math.abs,
        sin = Math.sin,
        cos = Math.cos,
        atan2 = Math.atan2,

        // Base transformations
        baseTransforms = {
            rotate: 0,
            scaleX: 1,
            scaleY: 1,
            translateX: 0,
            translateY: 0,
            // Store all previous masks
            masks: []
        };
    settings = {};
    var layers = {};
    var layersWrapper, background, temp, backgroundCtx, tempCtx;
    var clickPressed, startPos, dragged, actioned, selectStart;
    var zIndex = 0;
    var selectedLayer;
    var dist = keys = {};
    var transitionContent = 'all 0.5s ease';
    var transitionDuration = 500;
    var mousePos = {
        x: 0,
        y: 0
    };
    var action, dir;
    var original = {};
    var ready = false;
        
    var undoStep = 0;
    var undo = [];

    var points = [];
    var minMousePos = { 'x': 999999, 'y': 999999 }, maxMousePos = { 'x': -1, 'y': -1 };
    
    $(window).resize($.debounce(settings.resizeDelay, ResizeCanvasBackground));
    
    $.MercuryModal.defaults.zIndex = 1080;
    $.MercuryModal.defaults.ready = function(){
        if(shortcutListener) {
            shortcutListener.stop_listening();
        }
    }
    $.MercuryModal.defaults.hide = function(){
        if(shortcutListener) {
            shortcutListener.listen();
        }
    }

    var startOpacity, changedOpacity, opacitySliderFinished;
    var opacitySlider, brushSizeSlider;
    var blendingModes = ['normal', 'dissolve', 'darken', 'multiply', 'color-burn', 'linear-burn', 'darker-color', 'lighten', 'screen', 'color-dodge', 'add', 'lighter-color', 'overlay', 'soft-light', 'hard-light', 'vivid-light', 'linear-light', 'pin-light', 'hard-mix', 'difference', 'exclusion', 'substract', 'divide', 'hue', 'saturation', 'color', 'luminosity'];
    var connectedTools = {
        brush: ['color', 'eyeDropper']
    }

    var mouse = {
        'document': false,
        'canvas': [],
    }

    var loader = {};
    loader.hide = function(){
        $('#loader').hide();
    }
    loader.show = function(){
        $('#loader').hide();
    }

    var helper = {};
    helper.stopDefaultEvent = stopDefaultEvent = function(e){
        e.stopPropagation();
        e.preventDefault();
    }
    helper.remap = helper.Remap = Math.remap = Math.Remap = Remap = function (value, low1, high1, low2, high2) {
        return low2 + (high2 - low2) * (value - low1) / (high1 - low1);
    }
    helper.getViewportWidth = getViewportWidth = function(){
        var e = window, a = 'inner';
        if ( !( 'innerWidth' in window ) ){
            a = 'client';
            e = document.documentElement || document.body;
        }
        return e[ a+'Width' ];
    }

    String.prototype.trimToPx = function(length){
        var tmp = this;
        var trimmed = this;
        if (tmp.visualLength() > length)    {
            trimmed += "...";
            while (trimmed.visualLength() > length){
                tmp = tmp.substring(0, tmp.length-1);
                trimmed = tmp + "...";
            }
        }
        
        return trimmed;
    }
    String.prototype.visualLength = function(){
        var ruler = document.getElementById('ruler');
        ruler.innerHTML = this;
        var x = ruler.offsetWidth;
        ruler.innerHTML = '';
        return x;
    }
    $.mercuryCanvas = {};
    
    $.fn.mercuryCanvas = function(options){
        var defaults = {
            backgroundColor: '#fff',
            resizeDelay: 250,
            dragDetectSensibility: 1, // higher -> more distance before dragged becomes true
            width: 600, // overwritten at the moment
            height: 500, // overwritten at the moment
            lineWidth: $.cookie('brushSize'),
            strokeColor: 'red',
            tool: '',
            transition: true,
            brushSizeIncrement: 3,
            handlerSize: 20
        };
        
        settings = $.extend({}, defaults, options);
        
        this.each(function() {
            layersWrapper = $(this);
            layersWrapper.html('').css({
                width: '100%',
                height: '100%'
            });
            layersWrapper.append('<div id="cursor"></div><div id="eyeDropperDisplay"></div>');
            layersWrapper.append('<canvas class="canvasLayer canvasBottom" id="canvasBackground" height="0" width="0" border="0">Update your browser</canvas>');
            layersWrapper.append('<canvas class="canvasLayer canvasTop" id="canvasTemp" height="0" width="0" border="0">Update your browser</canvas>');
            
            background = $('#canvasBackground')[0];
            temp = $('#canvasTemp')[0];
            
            backgroundCtx = background.getContext('2d');
            var newSize = ResizeCanvasBackground();
            
            tempCtx = temp.getContext('2d');
            tempCtx.globalAlpha = 1;

            tempCtx.fillStyle = '#fff';
            tempCtx.strokeStyle = '#fff';
            tempCtx.rect(0, 0, newSize.width, newSize.height);
            tempCtx.fill();
            tempCtx.lineWidth = settings.lineWidth;
            tempCtx.lineJoin = 'round';
            tempCtx.lineCap = 'round';
            
            layersWrapper.on('contextmenu', function(e){
                e.preventDefault();
                return false;
            });
            
            $('.navbar').remove();
            
            init();
        });
    }

    function init(){
        $('#tools > li').tooltip({
            placement: 'right',
            container: 'body',
        });
        $('#currentTool > li').tooltip({
            placement: 'bottom',
            container: 'body'
        });

        $(document).on('show.bs.tooltip', function(){
            if(zIndex > 999){
                $(this).css('z-index', 1070 + zIndex - 999);
            }
        });

        $('.tool').on('click', function(){
            if (!$(this).hasClass('disabled')) {
                if($(this).attr('data-action')){
                    Tool($(this).attr('data-action'));
                }
            }
        });

        CheckUndoButtons();
        Tool('brush');

        $('#blendingModes').select2({
            dropdownParent: $('#blendingModes').parent(),
        }).on('change', function(){
            if(selectedLayer){
                $(selectedLayer[0]).css('mix-blend-mode', $('#blendingModes option:checked').val());
            }
        });

        $('#brushSizeSlider').val($.cookie('brushSize'));
        $("#brushSizeSlider").ionRangeSlider({
            force_edges: true,
            min: 1,
            max: 100,
            from: parseInt($.cookie('brushSize')),
            onChange: function(e){
                if(settings.tool == 'brush'){
                    $.cookie('brushSize', e.from);
                    settings.lineWidth = e.from;
                    refreshSettings();
                }
            },
            onUpdate: function(e){
                if(settings.tool == 'brush'){
                    $.cookie('brushSize', e.from);
                    settings.lineWidth = e.from;
                    refreshSettings();
                }
            }
        });
        brushSizeSlider = $('#brushSizeSlider').data('ionRangeSlider');

        $('#opacitySlider').val(100);
        $("#opacitySlider").ionRangeSlider({
            force_edges: true,
            min: 0,
            max: 100,
            from: parseInt(100),
            onChange: function(e){
                if(opacitySliderFinished){
                    opacitySliderFinished = false;
                    return;
                }
                if(!changedOpacity){
                    changedOpacity = true;
                    startOpacity = parseFloat($(selectedLayer[0]).css('opacity'));
                }
                if(selectedLayer) {
                    $(selectedLayer[0]).css('opacity', e.from / 100);
                    // SelectLayer(selectedLayer);
                }
            },
            onFinish: function(e){
                if(selectedLayer){
                    // SelectLayer(selectedLayer);
                    AddToUndo({
                        action: 'opacity',
                        before: startOpacity,
                        after: e.from / 100,
                        layer: selectedLayer
                    });
                    opacitySliderFinished = true;
                }
                else{
                    console.log('Fuck... I\'ve lost the selected layer');
                }
            },
            onUpdate: function(e){
                // TODO: test this function (from undo/redo)
                if(selectedLayer) {
                    $(selectedLayer[0]).css('opacity', e.from / 100);
                }
            }
        });
        opacitySlider = $('#opacitySlider').data("ionRangeSlider");

        $('#pickerbtn').colpick({
            layout:'full',
            color: (settings.strokeColor.substring(1) ? settings.strokeColor.substring(1) : settings.backgroundColor),
            onHide: function(){
                //SelectLastTool();
            },
            onChange:function(hsb,hex,rgb,el,bySetColor){
                settings.strokeColor = '#' + hex;
                settings.fillColor = '#' + hex;
                refreshSettings();
            },
            onSubmit:function(hsb,hex,rgb,el,bySetColor){
                settings.strokeColor = '#' + hex;
                settings.fillColor = '#' + hex;
                refreshSettings();
                $('#pickerbtn').colpickHide();
            }
        });

        ClearLayer('canvasTemp');
        refreshSettings();
        ready = true;
        console.log(settings);
    }

    $.cUndo = function(){
        console.log(undoStep, undo);
    }

    $(document).on({
        'keydown': function(e){
            e.key = e.key.toLowerCase();
            keys[e.key] = true;
            keys.ctrl = e.ctrlKey;
            keys.atl = e.altKey;
            keys.shift = e.shiftKey;
        },
        'keyup': function(e){
            e.key = e.key.toLowerCase();
            keys[e.key] = false;
            keys.ctrl = e.ctrlKey;
            keys.atl = e.altKey;
            keys.shift = e.shiftKey;
        },
        'mousedown': function(event){
            mouse.document = true;
            if(!$('.mercuryModal').length){
                if(!selectedLayer){
                    // TODO: I think this could be deleted
                    // ClearLayer('canvasTemp');
                }

                if($(background).offset()){
                    if(isOnCanvas(event)){
                        var pos = CalculateCoords(event.pageX, event.pageY);
                        mouse.canvas.push(event.which);

                        switch(settings.tool){
                            case 'brush':
                                switch (event.which) {
                                    case 1:
                                        startPos = pos;

                                        points = [];
                                        points[0] = pos;
                                        setLimitPoints(event);
                                        
                                        DrawTemp(pos);
                                        break;
                                    case 2:
                                        console.log('Middle Mouse button pressed.');
                                        break;
                                    case 3:
                                        /*if(mouse.canvas.indexOf(1) == -1){
                                            RemoveLayer(PositionToLayer(pos));
                                        }*/
                                        break;
                                    default:
                                        console.log('You have a strange Mouse!');
                                }
                                break;
                            case 'select':
                                switch (event.which) {
                                    case 1:
                                        if(!selectedLayer){
                                            actioned = true;
                                            ClearLayer('canvasTemp');
                                            var _layer = PositionToLayer(pos);
                                            if(_layer){
                                                SelectLayer(_layer);
                                                selectStart = {
                                                    x: selectedLayer.x,
                                                    y: selectedLayer.y,
                                                    width: selectedLayer.width,
                                                    height: selectedLayer.height
                                                }
                                            }
                                        }
                                        break;
                                }
                        }
                    }
                }
            }
        },
        'mousemove': function(event){
            if(!$('.mercuryModal').length){
                if(!isOnCanvas(event) && !selectedLayer && !mouse.document && ready){
                    ClearLayer('canvasTemp');
                    return;
                }

                var pos = CalculateCoords(event.pageX, event.pageY);
                mousePos = pos;
                
                switch(settings.tool){
                    case 'brush':
                        MoveVirtualCursor(pos);
                        if (mouse.canvas.length) {
                            if (mouse.canvas.indexOf(1) != -1 && (Math.abs(pos.x - startPos.x) > settings.dragDetectSensibility || Math.abs(pos.y - startPos.y) > settings.dragDetectSensibility)) {
                                // drag left click
                                dragged = true;
                                points[points.length] = pos;
                                setLimitPoints(event);

                                DrawTemp(pos);
                            }
                        }
                        break;
                    case 'select':
                        if(!selectedLayer){
                            OutLineLayer(pos);
                        }
                        else{
                            if(mouse.canvas.indexOf(1) == -1){
                                CheckCursorCanvas(pos, true);
                            }
                            else {
                                var newWidth, newHeight, newX, newY;
                                newWidth = selectedLayer.width;
                                newHeight = selectedLayer.height;
                                newX = selectedLayer.x;
                                newY = selectedLayer.y;

                                if($(canvasTemp).css('cursor') == 'default'){
                                    CheckCursorCanvas(pos, false);
                                }
                                if(!action){
                                    $(canvasTemp).css('cursor', 'move');
                                    action = 'move';
                                }

                                if(!dist.x || !dist.y){
                                    dist.x = pos.x - selectedLayer.x;
                                    dist.y = pos.y - selectedLayer.y;
                                }
                                if(!original.width || !original.height){
                                    original.width = selectedLayer.width;
                                    original.height = selectedLayer.height;
                                    original.x = selectedLayer.x;
                                    original.y = selectedLayer.y;
                                }
                                if(action && action.length){
                                    switch (action){
                                        case 'move':
                                            newX = pos.x - dist.x;
                                            newY = pos.y - dist.y;

                                            if(keys.shift){
                                                var deltaX, deltaY;
                                                deltaX = Math.abs(pos.x - dist.x - original.x);
                                                deltaY = Math.abs(pos.y - dist.y - original.y);

                                                console.log(deltaX, deltaY);
                                                if(deltaX > 20 || deltaY > 20){
                                                    if(deltaX > deltaY){
                                                        newY = original.y;
                                                    }
                                                    else{
                                                        newX = original.x;
                                                    }
                                                }
                                                else{
                                                    newX = original.x;
                                                    newY = original.y;
                                                }
                                            }
                                            break;
                                        case 'nw':
                                            newWidth = selectedLayer.width + (selectedLayer.x - pos.x);
                                            newHeight = selectedLayer.height + (selectedLayer.y - pos.y);
                                            if(keys.shift){
                                                wProp = newWidth / original.width;
                                                hProp = newHeight / original.height;
                                                newHeight = original.height * (wProp + hProp) / 2;
                                                newWidth = original.width * (wProp + hProp) / 2;

                                                newX = Math.min(selectedLayer.x + selectedLayer.width - newWidth, selectedLayer.x + selectedLayer.width);
                                                newY = Math.min(selectedLayer.y + selectedLayer.height - newHeight, selectedLayer.y + selectedLayer.height);
                                            }
                                            else{
                                                newX = pos.x;
                                                newY = pos.y;
                                            }
                                            break;
                                        case 'ne':
                                            newWidth = selectedLayer.width + (pos.x - (selectedLayer.x + selectedLayer.width));
                                            newHeight = selectedLayer.height - (pos.y - selectedLayer.y);
                                            if(keys.shift){
                                                wProp = newWidth / original.width;
                                                hProp = newHeight / original.height;
                                                newHeight = original.height * (wProp + hProp) / 2;
                                                newWidth = original.width * (wProp + hProp) / 2;

                                                newY = Math.min(selectedLayer.y + selectedLayer.height - newHeight, selectedLayer.y + selectedLayer.height);
                                            }
                                            else{
                                                newY = Math.min(pos.y, selectedLayer.y + selectedLayer.height); 
                                            }
                                            newX = selectedLayer.x;
                                            break;
                                        case 'se':
                                            newWidth = selectedLayer.width + (pos.x - selectedLayer.x - selectedLayer.width);
                                            newHeight = selectedLayer.height + (pos.y - selectedLayer.y - selectedLayer.height);
                                            if(keys.shift){
                                                wProp = newWidth / original.width;
                                                hProp = newHeight / original.height;
                                                newHeight = original.height * (wProp + hProp) / 2;
                                                newWidth = original.width * (wProp + hProp) / 2;
                                            }
                                            newX = selectedLayer.x;
                                            newY = selectedLayer.y;
                                            break;
                                        case 'sw':
                                            newWidth = selectedLayer.width + (selectedLayer.x - pos.x);
                                            newHeight = selectedLayer.height + (pos.y - selectedLayer.y - selectedLayer.height);
                                            if(keys.shift){
                                                wProp = newWidth / original.width;
                                                hProp = newHeight / original.height;
                                                newHeight = original.height * (wProp + hProp) / 2;
                                                newWidth = original.width * (wProp + hProp) / 2;

                                                newX = Math.min(selectedLayer.x + selectedLayer.width - newWidth, selectedLayer.x + selectedLayer.width);
                                            }
                                            else {
                                                newX = Math.min(pos.x, selectedLayer.x + selectedLayer.width);
                                            }
                                            newY = selectedLayer.y;
                                            break;
                                        case 'n':
                                            newWidth = selectedLayer.width;
                                            newHeight = selectedLayer.height + (selectedLayer.y - pos.y);
                                            newX = selectedLayer.x;
                                            newY = Math.min(pos.y, selectedLayer.y + selectedLayer.height);
                                            break;
                                        case 'w':
                                            newWidth = selectedLayer.width + (selectedLayer.x - pos.x);
                                            newHeight = selectedLayer.height;
                                            newX = Math.min(pos.x, selectedLayer.x + selectedLayer.width);
                                            newY = selectedLayer.y;
                                            break;
                                        case 's':
                                            newWidth = selectedLayer.width;
                                            newHeight = selectedLayer.height + (pos.y - selectedLayer.y - selectedLayer.height);
                                            newX = selectedLayer.x;
                                            newY = selectedLayer.y;
                                            break;
                                        case 'e':
                                            newWidth = selectedLayer.width + (pos.x - (selectedLayer.x + selectedLayer.width));
                                            newHeight = selectedLayer.height;
                                            newX = selectedLayer.x;
                                            newY = selectedLayer.y;
                                            break;
                                        default:
                                            console.log(action + " for select");
                                            break;
                                    }
                                    actioned = true;
                                }

                                if(newWidth != selectedLayer.width || newHeight != selectedLayer.height || newX != selectedLayer.x || newY != selectedLayer.y){
                                    TranformLayer(selectedLayer, {
                                        x: newX,
                                        y: newY,
                                        width: newWidth,
                                        height: newHeight
                                    });
                                    SelectLayer(selectedLayer);
                                }
                            }
                        }
                        break;
                    case 'eyeDropper':
                        var colors = PositionToColor(pos);
                        var color;
                        for (var i = 0; i < colors.length; i++) {
                            if (colors[i].a > 0) {
                                if(color){
                                    if(colors[i].css('z-index') > color.css('z-index')){
                                        color = colors[i];
                                    }
                                }
                                else{
                                    color = colors[i];
                                }
                            }
                        }
                        if(!color){
                            color = {
                                r: 0,
                                g: 0,
                                b: 0,
                                a: 0,
                            }
                        }
                        ClearLayer('canvasTemp');

                        tempCtx.save();
                        tempCtx.fillStyle = (color.a > 0 ? 'rgba('+ color.r + ', ' + color.g + ', ' + color.b + ', ' + color.a +')' : settings.backgroundColor);
                        tempCtx.strokeStyle = '#000';
                        tempCtx.lineWidth = '1';
                        tempCtx.strokeRect(pos.x + 3, pos.y - 53, 100, 50);
                        tempCtx.fillRect(pos.x + 3, pos.y - 53, 100, 50);
                        tempCtx.restore();
                        break;
                }
            }
        },
        'mouseup': function(event){
            if(!$('.mercuryModal').length){
                var pos = CalculateCoords(event.pageX, event.pageY);

                switch(settings.tool){
                    case 'brush':
                        if($(background).offset()){
                            if(isOnCanvas(event)){
                                switch (event.which) {
                                    case 1:
                                        BrushMouseUp(minMousePos);
                                        break;
                                    case 2:
                                        console.log('Middle Mouse button is not pressed anymore.');
                                        break;
                                    case 3:
                                        var _layer = PositionToLayer(pos);
                                        if(_layer){
                                            $(_layer[0]).hide();
                                            AddToUndo({
                                                action: 'hide',
                                                layer: _layer
                                            });
                                        }
                                        break;
                                    default:
                                        console.log('You have a strange Mouse!');
                                }
                            }
                            else{
                                BrushMouseUp(minMousePos);  
                            }
                        }
                        dragged = false;
                        break;
                    case 'select':
                        if(mouse.canvas.indexOf(1) != -1){
                            switch (event.which) {
                                case 1:
                                    if(actioned){
                                        CheckCursorCanvas(pos, true);

                                        if(selectedLayer){
                                            selectedLayer.x = parseInt($(selectedLayer[0]).css('left'));
                                            selectedLayer.y = parseInt($(selectedLayer[0]).css('top'));
                                            selectedLayer.width = $(selectedLayer[0]).width();
                                            selectedLayer.height = $(selectedLayer[0]).height();

                                            SelectLayer(selectedLayer);
                                            dist.x = dist.y = 0;
                                            original.width = original.height = original.x = original.y = 0;

                                            AddToUndo({
                                                action: 'transform',
                                                before: selectStart,
                                                after: {
                                                    x: selectedLayer.x,
                                                    y: selectedLayer.y,
                                                    width: selectedLayer.width,
                                                    height: selectedLayer.height
                                                },
                                                layer: selectedLayer
                                            });
                                            selectStart = {
                                                x: selectedLayer.x,
                                                y: selectedLayer.y,
                                                width: selectedLayer.width,
                                                height: selectedLayer.height
                                            }
                                        }
                                    }
                                    else{
                                        action = '';
                                        $(canvasTemp).css('cursor', 'default');
                                        DeselectLayer();
                                        OutLineLayer(pos);
                                    }
                                    break;
                            }
                        }
                        break;
                }
                if(event.which == 1) {
                    mouse.document = false;
                }
                if(mouse.canvas.indexOf(event.which) != -1) {
                    mouse.canvas.splice(mouse.canvas.indexOf(event.which), 1);
                }
                actioned = false;
            }
        }
    });

    function isOnCanvas(event){
        if(!background) return false;
        var calc = {};
        calc.start = $(background).offset();
        calc.width = $(background).width();
        calc.height = $(background).height();
        return (event.pageY > calc.start.top && event.pageY < calc.start.top + calc.height && event.pageX > calc.start.left && event.pageX < calc.start.left + calc.width);
    }

    function MoveVirtualCursor(_pos){
        $('#cursor').css({
            top: _pos.y,
            left: _pos.x
        });
    }

    function OutLineLayer(_pos){
        if(_pos){
            ClearLayer('canvasTemp');
            var _layer = PositionToLayer(_pos);
            if(_layer){
                tempCtx.save();
                tempCtx.strokeStyle="#000000";
                tempCtx.lineWidth = 1;
                tempCtx.strokeRect(_layer.x - 0.5, _layer.y - 0.5, _layer.width + 1, _layer.height + 1);
                tempCtx.restore();
            }
        }
    }

    function SelectLayer(_layer){
        if(_layer){
            selectedLayer = _layer;
            ClearLayer('canvasTemp');

            tempCtx.save();
            tempCtx.lineWidth = 1;
            tempCtx.lineJoin = 'square';
            tempCtx.lineCap = 'square';
            tempCtx.strokeStyle="#000";
            tempCtx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            
            var _x, _y, _width, _height;
            _x = _layer.x - 0.5;
            _y = _layer.y - 0.5;
            _width = _layer.width + 1;
            _height = _layer.height + 1;

            // handlers
            tempCtx.fillRect(_x + _width - settings.handlerSize / 2, _y - settings.handlerSize / 2, settings.handlerSize, settings.handlerSize);
            tempCtx.fillRect(_x - settings.handlerSize / 2, _y - settings.handlerSize / 2, settings.handlerSize, settings.handlerSize);
            tempCtx.fillRect(_x + _width - settings.handlerSize / 2, _y + _height - settings.handlerSize / 2, settings.handlerSize, settings.handlerSize);
            tempCtx.fillRect(_x - settings.handlerSize / 2, _y + _height - settings.handlerSize / 2, settings.handlerSize, settings.handlerSize);
            tempCtx.strokeRect(_x + _width - settings.handlerSize / 2, _y - settings.handlerSize / 2, settings.handlerSize, settings.handlerSize);
            tempCtx.strokeRect(_x - settings.handlerSize / 2, _y - settings.handlerSize / 2, settings.handlerSize, settings.handlerSize);
            tempCtx.strokeRect(_x + _width - settings.handlerSize / 2, _y + _height - settings.handlerSize / 2, settings.handlerSize, settings.handlerSize);
            tempCtx.strokeRect(_x - settings.handlerSize / 2, _y + _height - settings.handlerSize / 2, settings.handlerSize, settings.handlerSize);

            // lines
            if(_width > settings.handlerSize + 1 || _height > settings.handlerSize + 1){
                tempCtx.beginPath();
                if(_width > settings.handlerSize + 1){
                    // top left -> top right
                    tempCtx.moveTo(_x + 1 + settings.handlerSize / 2, _y);
                    tempCtx.lineTo(_x - 1 - settings.handlerSize / 2 + _width, _y);
                    // bottom right -> bottom left
                    tempCtx.moveTo(_x - 1 - settings.handlerSize / 2 + _width, _y + _height);
                    tempCtx.lineTo(_x + 1 + settings.handlerSize / 2, _y + _height);
                }
                if(_height > settings.handlerSize + 1){
                    // top right -> bottom right
                    tempCtx.moveTo(_x + _width, _y + 1 + settings.handlerSize / 2);
                    tempCtx.lineTo(_x + _width, _y - 1 - settings.handlerSize / 2 + _height);
                    // bottom left -> top left
                    tempCtx.moveTo(_x, _y - 1 - settings.handlerSize / 2 + _height);
                    tempCtx.lineTo(_x, _y + 1 + settings.handlerSize / 2);
                }
                tempCtx.stroke();
                tempCtx.closePath();
            }
            if(settings.transition){
                $(_layer[0]).css('transition', 'none 0s');
            }
            tempCtx.restore();
        }
        else{
            console.warn('SelectLayer received no layer');
        }
    }

    var shortcuts = {
        'v': 'select',
        'b': 'brush',
        'e': 'eyeDropper',
        'ctrl n': 'newDoc',
        'ctrl z': 'undo',
        'ctrl y': 'redo',
        'ctrl shift z': 'redo',
        'delete': 'delete',
        'ctrl enter': 'deselect'
    }

    var ListenerDefaults = {
        is_exclusive    : true,
        prevent_repeat  : true,
        on_keyup: function(e){
            e.preventDefault();
            Tool(shortcuts[(e.ctrlKey ? 'ctrl ' : '') + (e.altKey ? 'alt ' : '') + (e.shiftKey ? 'shift ' : '') + e.key.toLowerCase()]);
        },
        on_keydown: function(e){
            e.preventDefault();
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
            Tool('brushSize-');
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
            Tool('brushSize+');
        },
        on_keyup: function(e){
            e.preventDefault();
        }
    });
    shortcutListener.register_many(listenerKeys);

    function DeselectLayer(){
        ClearLayer('canvasTemp');
        if(settings.transition && selectedLayer) {
            $(selectedLayer[0]).css('transition', transitionContent);
        }
        selectedLayer = null;
        action = dist.x = dist.y = undefined;
        // refreshSettings();
    }

    function CheckCursorCanvas(pos, ow){
        if(selectedLayer && settings.tool == 'select'){
            if(typeof ow != 'boolean') ow = true;
            $(canvasTemp).css('cursor', 'default');
            if(ow) action = '';

            if(pos.x > selectedLayer.x && pos.x < selectedLayer.x + selectedLayer.width && pos.y > selectedLayer.y && pos.y < selectedLayer.y + selectedLayer.height){
                $(canvasTemp).css('cursor', 'move');
                if(ow) action = 'move';
            }
            if (pos.x > selectedLayer.x - settings.handlerSize / 2 && pos.x < selectedLayer.x + settings.handlerSize / 2 &&
                pos.y > selectedLayer.y - settings.handlerSize / 2 && pos.y < selectedLayer.y + settings.handlerSize / 2){
                $(canvasTemp).css('cursor', 'nw-resize');
                if(ow) action = 'nw';
            }
            if (
                pos.x > selectedLayer.x + selectedLayer.width - settings.handlerSize / 2 && pos.x < selectedLayer.x + selectedLayer.width + settings.handlerSize / 2 &&
                pos.y > selectedLayer.y - settings.handlerSize / 2 && pos.y < selectedLayer.y + settings.handlerSize / 2){
                $(canvasTemp).css('cursor', 'ne-resize');
                if(ow) action = 'ne';
            }
            if (
                pos.x > selectedLayer.x + selectedLayer.width - settings.handlerSize / 2 && pos.x < selectedLayer.x + selectedLayer.width + settings.handlerSize / 2 &&
                pos.y > selectedLayer.y + selectedLayer.height - settings.handlerSize / 2 && pos.y < selectedLayer.y + selectedLayer.height + settings.handlerSize / 2){
                $(canvasTemp).css('cursor', 'se-resize');
                if(ow) action = 'se';
            }
            if (
                pos.x > selectedLayer.x - settings.handlerSize / 2 && pos.x < selectedLayer.x + settings.handlerSize / 2 &&
                pos.y > selectedLayer.y + selectedLayer.height - settings.handlerSize / 2 && pos.y < selectedLayer.y + selectedLayer.height + settings.handlerSize / 2){
                $(canvasTemp).css('cursor', 'sw-resize');
                if(ow) action = 'sw';
            }
            if(
                pos.x >= selectedLayer.x + settings.handlerSize / 2 && pos.x <= selectedLayer.x + selectedLayer.width - settings.handlerSize / 2 &&
                pos.y > selectedLayer.y - settings.handlerSize / 3 && pos.y < selectedLayer.y + settings.handlerSize / 3){
                $(canvasTemp).css('cursor', 'n-resize');
                if(ow) action = 'n';
            }
            if(
                pos.x > selectedLayer.x + selectedLayer.width - settings.handlerSize / 3 && pos.x < selectedLayer.x + selectedLayer.width + settings.handlerSize / 3 &&
                pos.y >= selectedLayer.y + settings.handlerSize / 2 && pos.y <= selectedLayer.y + selectedLayer.height - settings.handlerSize / 2){
                $(canvasTemp).css('cursor', 'e-resize');
                if(ow) action = 'e';
            }
            if(
                pos.x >= selectedLayer.x + settings.handlerSize / 2 && pos.x <= selectedLayer.x + selectedLayer.width - settings.handlerSize / 2 &&
                pos.y > selectedLayer.y + selectedLayer.height - settings.handlerSize / 3 && pos.y < selectedLayer.y + selectedLayer.height + settings.handlerSize / 3){
                $(canvasTemp).css('cursor', 's-resize');
                if(ow) action = 's';
            }
            if(
                pos.x > selectedLayer.x - settings.handlerSize / 3 && pos.x < selectedLayer.x + settings.handlerSize / 3 &&
                pos.y >= selectedLayer.y + settings.handlerSize / 2 && pos.y <= selectedLayer.y + selectedLayer.height - settings.handlerSize / 2){
                $(canvasTemp).css('cursor', 'w-resize');
                if(ow) action = 'w';
            }
        }
    }
        
    function checkForOrphanLayers(){
        var toBeDeleted = [];

        $.each(layers, function(index, value){
            var ok = false;
            $.each(undo, function(key, val){
                val.after = (val.after ? val.after : {
                    x: val.layer.x,
                    y: val.layer.y,
                    width: val.layer.width,
                    height: val.layer.height
                });
                if(val.after.x == value.x && val.after.y == value.y && val.after.width == value.width && val.after.height == value.height){
                    ok = true;
                }
            });
            if(!ok){
                toBeDeleted.push(value);
            }
        });

        $.each(toBeDeleted, function(index, value){
            $('#' + value.name).remove();
            delete layers[value.name];
        });
    }

    function CustomSubmenu(tool){
        $('.customSubmenu').hide();
        $('[data-customSubmenu="'+ tool +'"]').css('display', 'inline-block');
    }
    
    function DefaultToolChange(tool){
        $('.outlined').removeAttr('style').removeClass('outlined');
        $('[data-action='+ tool +']').css('border', '1px solid red').addClass('outlined');
        settings.tool = tool;
        DeselectLayer();
    }
    
    var actions = ['newDoc', 'fullScreen', 'undo', 'redo', 'brushSize-', 'brushSize+', 'deselect'];

    function Tool(tool){
        if(!$('.mercuryModal').length && !mouse.canvas.length){
            if(actions.indexOf(tool) == -1){
                if(tool == settings.tool) return;

                if(tool != 'brush'){
                    $('#cursor').hide();
                    $(canvasTemp).css('cursor', 'default');
                }

                CustomSubmenu(tool);
            }
            else{

            }
            switch (tool){
                case 'undo':
                    Undo(1);
                    break;
                case 'redo':
                    Undo(-1);
                    break;
                case 'brush':
                    DefaultToolChange(tool);
                    MoveVirtualCursor(mousePos);
                    $('#cursor').show();
                    $(canvasTemp).css('cursor', 'none');
                    break;
                case 'select':
                    DefaultToolChange(tool);
                    OutLineLayer(mousePos);
                    break;
                case 'newDoc':
                    MercuryModal({
                        text: '<h2>Are you sure?</h2>This action cannot be undone',
                        show: {
                            header: false
                        },
                        textAlign: {
                            middle: 'center',
                            footer: 'center'
                        },
                        buttons:[
                            {
                                click: function(){
                                    DeselectLayer();
                                    undoStep = 0;
                                    undo = [];
                                    zIndex = 0;
                                    checkForOrphanLayers();
                                    CheckUndoButtons();
                                },
                                text: 'Yes, I want a new document',
                                class: 'btn-danger btn-lg'
                            },
                            {
                                text: 'Cancel',
                                class: 'btn-default btn-lg'
                            }
                        ]
                    });
                    break;
                case 'brushSize-':
                    settings.lineWidth -= settings.brushSizeIncrement;
                    if(settings.lineWidth <= 0){
                        settings.lineWidth = 1;
                    }
                    brushSizeSlider.update({
                        from: settings.lineWidth
                    });
                    break;
                case 'brushSize+':
                    settings.lineWidth += settings.brushSizeIncrement;
                    if(settings.lineWidth > 100){
                        settings.lineWidth = 100;
                    }
                    brushSizeSlider.update({
                        from: settings.lineWidth
                    });
                    break;
                case 'deselect':
                    DeselectLayer();
                    break;
                default:
                    if(actions.indexOf(tool) == -1){
                        DefaultToolChange(tool);
                    }
                    break;
            }
            if(actions.indexOf(tool) != -1){
                if(tool == 'undo' || tool == 'redo') {
                    DeselectLayer();
                    if(settings.transition && selectedLayer){
                        $(selectedLayer[0]).css('transition', transitionContent);
                        // TODO: make a option for the user to keep the layer selected between undos
                        /*$('[data-action="undo"], [data-action="redo"]').addClass('disabled');
                        setTimeout(function(selectedLayer){
                            if($(selectedLayer[0]).css('display') != 'none') {
                                SelectLayer(selectedLayer);
                            }
                            CheckUndoButtons();
                        }, transitionDuration, selectedLayer);*/
                    }
                }
            }
        }
    }

    function DrawTemp(mouse){
        tempCtx.lineWidth = settings.lineWidth;
        tempCtx.strokeStyle = settings.strokeColor;
        tempCtx.lineCap = tempCtx.lineJoin = 'round';
        
        if (points.length < 3) {
            tempCtx.fillStyle = settings.strokeColor;
            var b = points[0];
            tempCtx.beginPath();
            tempCtx.arc(b.x, b.y, tempCtx.lineWidth / 2, 0, Math.PI * 2, !0);
            tempCtx.fill();
            tempCtx.closePath();
            
            return;
        }
        
        tempCtx.clearRect(0, 0, tempCtx.width, tempCtx.height);
        
        tempCtx.beginPath();
        tempCtx.moveTo(points[0].x, points[0].y);

        for (var i = 0; i < points.length - 2; i++) {
            var c = (points[i].x + points[i + 1].x) / 2;
            var d = (points[i].y + points[i + 1].y) / 2;
            
            tempCtx.quadraticCurveTo(points[i].x, points[i].y, c, d);
        }
        
        // For the last 2 points
        tempCtx.quadraticCurveTo(
            points[i].x,
            points[i].y,
            points[i + 1].x,
            points[i + 1].y
        );
        tempCtx.stroke();
    }

    function AddToUndo(options){
        undo.splice(undoStep, undo.length, $.extend(true, {
            action: 'draw',
            layer:{
                0: null,
                x: 0,
                y: 0,
                width: 0,
                height: 0
            }
        }, options));
        undoStep ++;
        if(undoStep > 0){
            $('.tool[data-action="undo"]').removeClass('disabled');
        }
        if(undoStep == undo.length) {
            $('.tool[data-action="redo"]').addClass('disabled');
        }

        if(undoStep != undo.length) {
            console.warn('Undo step and undo.length not synced; undo:', undo, ', undo.length:', undo.length);
        }

        checkForOrphanLayers();
    }

    function TranformLayer(_layer, _transform){
        _transform.width = Math.max(0, _transform.width);
        _transform.height = Math.max(0, _transform.height);
        $(_layer[0]).css({
            top: _transform.y,
            left: _transform.x,
            width: _transform.width,
            height: _transform.height
        });
        _layer.x = _transform.x;
        _layer.y = _transform.y;
        _layer.width = _transform.width;
        _layer.height = _transform.height;
    }

    function Undo(steps){

        if (steps > 0) {
            for (var i = 0; i < steps; i++) {
                if (undoStep > 0) {
                    switch (undo[undoStep - 1].action) {
                        case 'draw':
                            $(undo[undoStep - 1].layer[0]).hide();
                            break;
                        case 'hide':
                            $(undo[undoStep - 1].layer[0]).show();
                            break;
                        case 'transform':
                            TranformLayer(undo[undoStep - 1].layer, undo[undoStep - 1].before);
                            break;
                        case 'opacity':
                            selectedLayer = undo[undoStep - 1].layer;
                            opacitySlider.update({
                                from: undo[undoStep - 1].before * 100
                            });
                            selectedLayer = null;
                            $(undo[undoStep - 1].layer[0]).css('opacity', undo[undoStep - 1].before);
                            break;
                        default:
                            console.warn('Undo doesn\'t have this action ('+ undo[undoStep - 1].action +')');
                            break;
                    }
                    undoStep --;
                }
                else{
                    console.log('Too many undo steps');
                }
            }
        }
        else{
            for (var i = 0; i < -1 * steps; i++) {
                if (undoStep < undo.length) {
                    switch (undo[undoStep].action) {
                        case 'draw':
                            $(undo[undoStep].layer[0]).show();
                            break;
                        case 'hide':
                            $(undo[undoStep].layer[0]).hide();
                            break;
                        case 'transform':
                            TranformLayer(undo[undoStep].layer, undo[undoStep].after);
                            break;
                        case 'opacity':
                            selectedLayer = undo[undoStep].layer;
                            opacitySlider.update({
                                from: undo[undoStep].after * 100
                            });
                            selectedLayer = null;
                            $(undo[undoStep].layer[0]).css('opacity', undo[undoStep].after);
                            break;
                        default:
                            console.warn('Redo doesn\'t have this action ('+ undo[undoStep - 1].action +')');
                            break;
                    }
                    undoStep ++;
                }
                else{
                    console.log('Too many redo steps');
                }
            }
        }

        CheckUndoButtons();
    }

    function CheckUndoButtons(){
        if(undoStep > 0) {
            $('.tool[data-action="undo"]').removeClass('disabled');
        }
        else{
            $('.tool[data-action="undo"]').addClass('disabled');
        }
        if(undoStep < undo.length){
            $('.tool[data-action="redo"]').removeClass('disabled');
        }
        else{
            $('.tool[data-action="redo"]').addClass('disabled');
        }
    }

    function BrushMouseUp(startPos) {
        if (mouse.canvas.indexOf(1) != -1) {
            var newLayer = AddLayer({
                x: Math.max(0, startPos.x),
                y: Math.max(0, startPos.y),
                width: $('#canvasTemp').width(),
                height: $('#canvasTemp').height()
            });
            if (dragged) {
                tempCtx.closePath();
            }
            
            DrawTempCanvas(newLayer);
            ClearLayer('canvasTemp');

            AddToUndo({
                action: 'draw',
                layer: {
                    0: newLayer[0],
                    x: newLayer.x,
                    y: newLayer.y,
                    width: newLayer.width,
                    height: newLayer.height
                }
            })
        }

        mouse.canvas = [];
        mouse.document = false;
    }

    function setLimitPoints(event){
        if (points[points.length - 1].x < minMousePos.x) {
            minMousePos.x = points[points.length - 1].x;
        }
        if (points[points.length - 1].y < minMousePos.y) {
            minMousePos.y = points[points.length - 1].y;
        }
        if (points[points.length - 1].x > maxMousePos.x) {
            maxMousePos.x = points[points.length - 1].x;
        }
        if (points[points.length - 1].y > maxMousePos.y) {
            maxMousePos.y = points[points.length - 1].y;
        }
    }

    function CustomMenuActive(tool){
        return !$('[data-customsubmenu="'+ tool +'"]').hasClass('disabled');
    }

    $.mercuryCanvas.refreshSettings = refreshSettings = function(){
        /*if(CustomMenuActive(settings.tool)) {
            settings.lineWidth = $('#brushSizeSlider').val();
        }*/
        if(settings && settings.lineWidth){
            if($('#cursor').css('display') != 'none'){
                $('#cursor').css({
                    width: settings.lineWidth,
                    height: settings.lineWidth
                });
            }
            tempCtx.lineWidth = settings.lineWidth;
        }
        else{
            console.log('Plugin not ready, refreshSettings postponed by 10ms');
            setTimeout(refreshSettings, 10);
        }
    }
    
    function PositionToColor(pos){
        var returned = [];
        $.each(layers, function(index, value){
            if (value.x <= pos.x && value.x + value.width >= pos.x &&
                value.y <= pos.y && value.y + value.height >= pos.y) {
                    var imageData = value[0].getContext('2d').getImageData(pos.x - value.x, pos.y - value.y, 1, 1);
                    value.r = imageData.data[0];
                    value.g = imageData.data[1];
                    value.b = imageData.data[2];
                    value.a = imageData.data[3];
                    returned.push(value);
            }
        });
        return returned;
    }
    
    function PositionToLayer(pos){
        var returned = [];
        $.each(layers, function(index, value){
            if (value.x <= pos.x && value.x + value.width >= pos.x &&
                value.y <= pos.y && value.y + value.height >= pos.y &&
                $(value[0]).css('display') != 'none') {
                    returned.push(value);
            }
        });
        if(returned.length > 1) {
            var currentReturn = null;
            var colors = PositionToColor(pos);
            for (var i = 0; i < colors.length; i++) {
                if (colors[i].a > 0) {
                    if(currentReturn){
                        if(colors[i].css('z-index') > currentReturn.css('z-index')){
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
    
    function AddLayer(options){
        var layerDefaults = {
            x: 0,
            y: 0
        };
        var layerSettings = $.extend({}, layerDefaults, options);
        zIndex++;
        if(zIndex > 999){
            $(canvasTemp).css('z-index', 1000 + zIndex - 999);
            $('#cursor').css('z-index', 1001 + zIndex - 999);
            $('#tools, #currentTool').css('z-index', 1004 + zIndex - 999);
            $('.select2').css('z-index', 1069 + zIndex - 999);
            $.MercuryModal.defaults.zIndex = 1080 + zIndex - 999;
        }
        var layerID = 'canvas-' + zIndex;
        var newLayer = $('<canvas />').addClass('canvasLayer').attr({
            border: '0',
            width: 0,
            height: 0,
            id: layerID
        }).css({
            'top': layerSettings.y,
            'left': layerSettings.x,
            'z-index': zIndex
        }).appendTo(layersWrapper);
        
        newLayer['name'] = layerID;
        newLayer['x'] = layerSettings.x;
        newLayer['y'] = layerSettings.y;
        newLayer['width'] = layerSettings.width;
        newLayer['height'] = layerSettings.height;
        newLayer['alpha'] = 255;
        
        layers[layerID] = newLayer;
        return newLayer;
    }
    
    function DrawTempCanvas(layer){
        imageData = tempCtx.getImageData(0, 0, settings.width, settings.height);
        
        minMousePos.x = Math.max(0, minMousePos.x - tempCtx.lineWidth / 2 - 1);
        minMousePos.y = Math.max(0, minMousePos.y - tempCtx.lineWidth / 2 - 1);
        maxMousePos.x = maxMousePos.x + tempCtx.lineWidth / 2 + 1;
        maxMousePos.y = maxMousePos.y + tempCtx.lineWidth / 2 + 2;
        
        relevantData = tempCtx.getImageData(minMousePos.x, minMousePos.y, maxMousePos.x - minMousePos.x, maxMousePos.y - minMousePos.y);

        var canvas = {};
        canvas.width = maxMousePos.x - minMousePos.x;
        canvas.height = maxMousePos.y - minMousePos.y;
        
        var ctx = layer[0].getContext('2d');
        
        layer.css({
            'left': minMousePos.x,
            'top': minMousePos.y
        }).attr({
            'width': canvas.width,
            'height': canvas.height
        });
        layer.x = minMousePos.x;
        layer.y = minMousePos.y;
        layer.width = canvas.width;
        layer.height = canvas.height;
        
        ctx.putImageData(relevantData, 0, 0);
        
        minMousePos = { 'x': 999999, 'y': 999999 }; maxMousePos = { 'x': -1, 'y': -1 };
        
        points = [];
        if(settings.transition){
            setTimeout(function(layer){
                $(layer[0]).css('transition', transitionContent);
            }, 10, layer);
        }
    }
    
    function RemoveLayer(layer){
        if (typeof layer == "number") {
            layer = 'canvas-' + layer;
        }
        else if (typeof layer == 'object') {
            layer = $(layer).attr('id');
        }
        
        $('#' + layer).remove();
        delete layers[layer];
    }
    
    function ClearLayer(layer){
        if(!$('#canvasTemp')[0]) setTimeout(function(){
            ClearLayer(layer);
            // console.log('Plugin not ready, clear layer postponed by 10ms');
        }, 10);
        // console.log('Cleared layer '+ layer + ' called by: '+ (arguments.callee.caller.name ? (arguments.callee.caller.caller.name ? arguments.callee.caller.caller.name : arguments.callee.caller.name) : 'anonymous'));
        if (typeof layer == "number") {
            layer = 'canvas-' + layer;
        }
        $('#' + layer)[0].getContext('2d').clearRect(0, 0, $('#' + layer).width(), $('#' + layer).height());
    }
    
    function CalculateCoords(pageX, pageY) {
        if(layersWrapper){
            var x0 = parseFloat(layersWrapper.offset()['left']);
            var y0 = parseFloat(layersWrapper.offset()['top']);
            
            return {
                x: pageX - x0,
                y: pageY - y0
            };
        }
        return{x: 0, y: 0}
    }
    
    function ResizeCanvasBackground(){
        var height = layersWrapper.height();
        var width = layersWrapper.width();
        if(height != $('#canvasTemp').height() || width != $('#canvasTemp').width()){
            $('#canvasBackground').attr('height', height).attr('width', width).attr('style', 'width: '+ width +'px; height: '+ height +'px');
            $('#canvasTemp').attr('height', height).attr('width', width).attr('style', 'width: '+ width +'px; height: '+ height +'px');

            backgroundCtx.fillStyle = settings.backgroundColor;
            backgroundCtx.rect(0, 0, width, height);
            backgroundCtx.fill();
        }
        if(selectedLayer){
            SelectLayer(selectedLayer);
        }
        return {
            height: height,
            width: width
        };
    }

    /*jCanvasDefaults.baseDefaults = {
        align: 'center',
        arrowAngle: 90,
        arrowRadius: 0,
        autosave: TRUE,
        baseline: 'middle',
        bringToFront: FALSE,
        ccw: FALSE,
        closed: FALSE,
        compositing: 'source-over',
        concavity: 0,
        cornerRadius: 0,
        count: 1,
        cropFromCenter: TRUE,
        crossOrigin: NULL,
        cursors: NULL,
        disableEvents: FALSE,
        draggable: FALSE,
        dragGroups: NULL,
        groups: NULL,
        data: NULL,
        dx: NULL,
        dy: NULL,
        end: 360,
        eventX: NULL,
        eventY: NULL,
        fillStyle: 'transparent',
        fontStyle: 'normal',
        fontSize: '12pt',
        fontFamily: 'sans-serif',
        fromCenter: TRUE,
        height: NULL,
        imageSmoothing: TRUE,
        inDegrees: TRUE,
        intangible: FALSE,
        index: NULL,
        letterSpacing: NULL,
        lineHeight: 1,
        layer: FALSE,
        mask: FALSE,
        maxWidth: NULL,
        miterLimit: 10,
        name: NULL,
        opacity: 1,
        r1: NULL,
        r2: NULL,
        radius: 0,
        repeat: 'repeat',
        respectAlign: FALSE,
        rotate: 0,
        rounded: FALSE,
        scale: 1,
        scaleX: 1,
        scaleY: 1,
        shadowBlur: 0,
        shadowColor: 'transparent',
        shadowStroke: FALSE,
        shadowX: 0,
        shadowY: 0,
        sHeight: NULL,
        sides: 0,
        source: '',
        spread: 0,
        start: 0,
        strokeCap: 'butt',
        strokeDash: NULL,
        strokeDashOffset: 0,
        strokeJoin: 'miter',
        strokeStyle: 'transparent',
        strokeWidth: 1,
        sWidth: NULL,
        sx: NULL,
        sy: NULL,
        text: '',
        translate: 0,
        translateX: 0,
        translateY: 0,
        type: NULL,
        visible: TRUE,
        width: NULL,
        x: 0,
        y: 0
    };*/
    
}(jQuery));