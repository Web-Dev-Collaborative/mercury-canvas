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
    var clickPressed, startPos, dragged;
    var zIndex = 0;
    var selectedLayer;
    var dist = keys = {};
        
    var undoStep = 0;
    var undo = [];
    
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
            lineWidth: 5,
            strokeColor: 'red',
            tool: 'brush',
            handlerSize: 20
        };
        
        settings = $.extend({}, defaults, options);
        
        this.each(function() {
            layersWrapper = $(this);
            layersWrapper.html('').css({
                width: '100%',
                height: '100%'
            });
            layersWrapper.append('<div id="cursor"></div>');
            layersWrapper.append('<canvas class="canvasLayer canvasBottom" id="canvasBackground" height="0" width="0" border="0">Update your browser</canvas>');
            layersWrapper.append('<canvas class="canvasLayer canvasTop" id="canvasTemp" height="0" width="0" border="0">Update your browser</canvas>');
            
            background = $('#canvasBackground')[0];
            temp = $('#canvasTemp')[0];
            var newSize = ResizeCanvasBackground();
            
            backgroundCtx = background.getContext('2d');
            backgroundCtx.fillStyle = settings.backgroundColor;
            backgroundCtx.rect(0, 0, newSize.width, newSize.height);
            backgroundCtx.fill();
            
            tempCtx = temp.getContext('2d');
            tempCtx.globalAlpha = 1;
            // tempCtx.translate(0.5, 0.5); // remove anti-alias

            tempCtx.fillStyle = '#fff';
            tempCtx.strokeStyle = '#fff';
            tempCtx.rect(0, 0, newSize.width, newSize.height);
            tempCtx.fill();
            tempCtx.lineWidth = settings.lineWidth;
            tempCtx.lineJoin = 'round';
            tempCtx.lineCap = 'round';

            ClearLayer('canvasTemp');
            
            layersWrapper.on('contextmenu', function(e){
                e.preventDefault();
                return false;
            });
            
            $('.navbar').remove();
        });
    }

    $(function(){
        $('#tools').children('li').tooltip({
            placement: 'right',
            container: 'body'
        });
        $('#currentTool').children('li').tooltip({
            placement: 'bottom',
            container: 'body'
        });

        $('.tool').on('click', function(){
            if (!$(this).hasClass('disabled')) {
                if($(this).attr('data-action')){
                    Tool($(this).attr('data-action'));
                }
            }
        });
    });

    $.cUndo = function(){
        console.log(undo);
    }

    $(document).on({
        'keydown': function(e){
            keys[e.key] = true;
            keys.ctrl = e.ctrlKey;
            keys.atl = e.altKey;
            keys.shift = e.shiftKey;
        },
        'keyup': function(e){
            keys[e.key] = false;
            keys.ctrl = e.ctrlKey;
            keys.atl = e.altKey;
            keys.shift = e.shiftKey;
        },
        'mousedown': function(event){
            mouse.document = true;
            if(!selectedLayer){
                ClearLayer('canvasTemp');
            }

            var calc = {};
            calc.start = $('#canvasBackground').offset();
            calc.width = $('#canvasBackground').width();
            calc.height = $('#canvasBackground').height();

            if(calc.start){
                if(event.pageY > calc.start.top && event.pageY < calc.start.top + calc.height &&
                   event.pageX > calc.start.left && event.pageX < calc.start.left + calc.width){
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
                    }
                }
            }
        },
        'mousemove': function(event){
            //$('.hoveredBySelect').removeClass('hoveredBySelect');
            
            var calc = {};
            calc.start = $(background).offset();
            calc.width = $(background).width();
            calc.height = $(background).height();

            var pos = CalculateCoords(event.pageX, event.pageY);
            
            switch(settings.tool){
                case 'brush':
                    if (mouse.canvas.length) {
                        if (mouse.canvas.indexOf(1) != -1 && (Math.abs(pos.x - startPos.x) > settings.dragDetectSensibility || Math.abs(pos.y - startPos.y) > settings.dragDetectSensibility)) {
                            // drag left click
                            dragged = true;
                            points[points.length] = pos;
                            setLimitPoints(event);

                            switch(settings.tool){
                                case 'brush':
                                    DrawTemp(pos);
                                    break;
                                default:
                                    console.log('strange tool');
                                    break;
                            }
                        }
                    }
                    break;
                case 'select':
                    /* TODO: add handlers for resize */
                    if(!selectedLayer){
                        ClearLayer('canvasTemp');
                        var _layer = PositionToLayer(pos);
                        if(_layer){
                            tempCtx.strokeStyle="#000000";
                            tempCtx.lineWidth = 1;
                            tempCtx.strokeRect(_layer.x - 1, _layer.y - 1, _layer.width, _layer.height);
                            $.mercuryCanvas.refreshSettings();
                        }
                    }
                    else{
                        var direction = ($(canvasTemp).css('cursor') == 'nwse-resize' ? true : false);
                        var fromBottom = $(canvasTemp).hasClass('fromBottom');

                        if (mouse.canvas.indexOf(1) != -1){
                            var newWidth, newHeight, newX, newY;
                            newWidth = selectedLayer.width;
                            newHeight = selectedLayer.height;
                            newX = selectedLayer.x;
                            newY = selectedLayer.y;
                            
                            if(!dist.x || !dist.y){
                                dist.x = pos.x - selectedLayer.x;
                                dist.y = pos.y - selectedLayer.y;
                            }
                            if($(canvasTemp).css('cursor') == 'default'){
                                newX = pos.x - dist.x;
                                newY = pos.y - dist.y;
                            }
                            else{
                                if(keys.shift){
                                    newWidth = selectedLayer.width + (selectedLayer.x - pos.x);
                                    newHeight = selectedLayer.height + (selectedLayer.y - pos.y);
                                    // TODO: wtf I did here?
                                    var temp = Math.max(newWidth * selectedLayer.height / selectedLayer.width, newHeight);
                                    newWidth = temp * selectedLayer.width / selectedLayer.height;
                                    newHeight = temp;
                                    newX = pos.x;
                                    newY = pos.y;
                                }
                                else{
                                    if(direction && !fromBottom){
                                        // top left
                                        newWidth = selectedLayer.width + (selectedLayer.x - pos.x);
                                        newHeight = selectedLayer.height + (selectedLayer.y - pos.y);
                                        newX = Math.min(pos.x, selectedLayer.x + selectedLayer.width);
                                        newY = Math.min(pos.y, selectedLayer.y + selectedLayer.height);
                                    }
                                    else if(!direction && !fromBottom){
                                        // top right
                                        newWidth = selectedLayer.width + (pos.x - (selectedLayer.x + selectedLayer.width));
                                        newHeight = selectedLayer.height - (pos.y - selectedLayer.y);
                                        newX = selectedLayer.x;
                                        newY = Math.min(pos.y, selectedLayer.y + selectedLayer.height);
                                    }
                                    else if(direction && fromBottom){
                                        // bottom left
                                        newWidth = selectedLayer.width + (pos.x - selectedLayer.x - selectedLayer.width);
                                        newHeight = selectedLayer.height + (pos.y - selectedLayer.y - selectedLayer.height);
                                        newX = selectedLayer.x;
                                        newY = selectedLayer.y;
                                    }
                                    else if(!direction && fromBottom){
                                        newWidth = selectedLayer.width + (selectedLayer.x - pos.x);
                                        newHeight = selectedLayer.height + (pos.y - selectedLayer.y - selectedLayer.height);
                                        newX = Math.min(pos.x, selectedLayer.x + selectedLayer.width);
                                        newY = selectedLayer.y;
                                    }
                                }
                            }
                            if(newWidth != selectedLayer.width || newHeight != selectedLayer.height || newX != selectedLayer.x || newY != selectedLayer.y){
                                $(selectedLayer[0]).css({
                                    top: newY,
                                    left: newX,
                                    width: newWidth,
                                    height: newHeight
                                });
                                selectedLayer.x = parseInt($(selectedLayer[0]).css('left'));
                                selectedLayer.y = parseInt($(selectedLayer[0]).css('top'));
                                selectedLayer.width = $(selectedLayer[0]).width();
                                selectedLayer.height = $(selectedLayer[0]).height();

                                SelectLayer(selectedLayer);
                            }
                        }
                        else{
                            if (pos.x > selectedLayer.x - settings.handlerSize / 2 && pos.x < selectedLayer.x + settings.handlerSize / 2 &&
                                pos.y > selectedLayer.y - settings.handlerSize / 2 && pos.y < selectedLayer.y + settings.handlerSize / 2){
                                $('#canvasTemp').css('cursor', 'nwse-resize').removeClass('fromBottom');
                            }
                            else if (
                                pos.x > selectedLayer.x + selectedLayer.width - settings.handlerSize / 2 && pos.x < selectedLayer.x + selectedLayer.width + settings.handlerSize / 2 &&
                                pos.y > selectedLayer.y - settings.handlerSize / 2 && pos.y < selectedLayer.y + settings.handlerSize / 2){
                                $('#canvasTemp').css('cursor', 'nesw-resize').removeClass('fromBottom');
                            }
                            else if (
                                pos.x > selectedLayer.x + selectedLayer.width - settings.handlerSize / 2 && pos.x < selectedLayer.x + selectedLayer.width + settings.handlerSize / 2 &&
                                pos.y > selectedLayer.y + selectedLayer.height - settings.handlerSize / 2 && pos.y < selectedLayer.y + selectedLayer.height + settings.handlerSize / 2){
                                $('#canvasTemp').css('cursor', 'nwse-resize').addClass('fromBottom');
                            }
                            else if (
                                pos.x > selectedLayer.x - settings.handlerSize / 2 && pos.x < selectedLayer.x + settings.handlerSize / 2 &&
                                pos.y > selectedLayer.y + selectedLayer.height - settings.handlerSize / 2 && pos.y < selectedLayer.y + selectedLayer.height + settings.handlerSize / 2){
                                $('#canvasTemp').css('cursor', 'nesw-resize').addClass('fromBottom');
                            }
                            else{
                                $('#canvasTemp').css('cursor', 'default').removeClass('fromBottom');
                            }
                        }
                    }
                    break;
            }
        },
        'mouseup': function(event){
            var pos = CalculateCoords(event.pageX, event.pageY);
            switch(settings.tool){
                case 'brush':
                    var calc = {};
                    calc.start = $(background).offset();
                    calc.width = $(background).width();
                    calc.height = $(background).height();

                    if(calc.start){
                        if(event.pageY > calc.start.top && event.pageY < calc.start.top + calc.height &&
                           event.pageX > calc.start.left && event.pageX < calc.start.left + calc.width){

                            switch (event.which) {
                                case 1:
                                    MouseUp(minMousePos);
                                    break;
                                case 2:
                                    console.log('Middle Mouse button is not pressed anymore.');
                                    break;
                                case 3:
                                    var _layer = PositionToLayer(pos);
                                    $(_layer[0]).hide();
                                    AddToUndo({
                                        action: 'hide',
                                        layer: _layer
                                    });
                                    break;
                                default:
                                    console.log('You have a strange Mouse!');
                            }
                        }
                        else{
                            MouseUp(minMousePos);  
                        }
                    }
                    dragged = false;
                    break;
                case 'select':
                    if(selectedLayer){
                        selectedLayer.x = parseInt($(selectedLayer[0]).css('left'));
                        selectedLayer.y = parseInt($(selectedLayer[0]).css('top'));
                        selectedLayer.width = $(selectedLayer[0]).width();
                        selectedLayer.height = $(selectedLayer[0]).height();

                        SelectLayer(selectedLayer);
                        dist.x = dist.y = 0;
                    }
                    else{
                        ClearLayer('canvasTemp');
                        var _layer = PositionToLayer(pos);
                        if(_layer){
                            SelectLayer(_layer);
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
        }
    });

    function SelectLayer(_layer){
        selectedLayer = _layer;
        ClearLayer('canvasTemp');

        tempCtx.lineWidth = 1;
        tempCtx.lineJoin = 'square';
        tempCtx.lineCap = 'square';
        tempCtx.strokeStyle="#000";
        tempCtx.fillStyle="#FFF";
        
        // TODO: make this code prettier
        // handlers
        tempCtx.fillRect(_layer.x + _layer.width - settings.handlerSize / 2, _layer.y - settings.handlerSize / 2, settings.handlerSize, settings.handlerSize);
        tempCtx.strokeRect(_layer.x + _layer.width - settings.handlerSize / 2, _layer.y - settings.handlerSize / 2, settings.handlerSize, settings.handlerSize);
        tempCtx.fillRect(_layer.x - settings.handlerSize / 2, _layer.y - settings.handlerSize / 2, settings.handlerSize, settings.handlerSize);
        tempCtx.strokeRect(_layer.x - settings.handlerSize / 2, _layer.y - settings.handlerSize / 2, settings.handlerSize, settings.handlerSize);
        tempCtx.fillRect(_layer.x + _layer.width - settings.handlerSize / 2, _layer.y + _layer.height - settings.handlerSize / 2, settings.handlerSize, settings.handlerSize);
        tempCtx.strokeRect(_layer.x + _layer.width - settings.handlerSize / 2, _layer.y + _layer.height - settings.handlerSize / 2, settings.handlerSize, settings.handlerSize);
        tempCtx.fillRect(_layer.x - settings.handlerSize / 2, _layer.y + _layer.height - settings.handlerSize / 2, settings.handlerSize, settings.handlerSize);
        tempCtx.strokeRect(_layer.x - settings.handlerSize / 2, _layer.y + _layer.height - settings.handlerSize / 2, settings.handlerSize, settings.handlerSize);

        if(_layer.width > settings.handlerSize + 1 || _layer.height > settings.handlerSize + 1){
            tempCtx.beginPath();
            if(_layer.width > settings.handlerSize + 1){
                // top left -> top right
                tempCtx.moveTo(_layer.x + 1 + settings.handlerSize / 2, _layer.y);
                tempCtx.lineTo(_layer.x - 1 - settings.handlerSize / 2 + _layer.width, _layer.y);
                // bottom right -> bottom left
                tempCtx.moveTo(_layer.x - 1 - settings.handlerSize / 2 + _layer.width, _layer.y + _layer.height);
                tempCtx.lineTo(_layer.x + 1 + settings.handlerSize / 2, _layer.y + _layer.height);
            }
            if(_layer.height > settings.handlerSize + 1){
                // top right -> bottom right
                tempCtx.moveTo(_layer.x + _layer.width, _layer.y + 1 + settings.handlerSize / 2);
                tempCtx.lineTo(_layer.x + _layer.width, _layer.y - 1 - settings.handlerSize / 2 + _layer.height);
                // bottom left -> top left
                tempCtx.moveTo(_layer.x, _layer.y - 1 - settings.handlerSize / 2 + _layer.height);
                tempCtx.lineTo(_layer.x, _layer.y + 1 + settings.handlerSize / 2);
            }
            tempCtx.stroke();
            tempCtx.closePath();
        }
        
        $.mercuryCanvas.refreshSettings();
    }
        
    /* TODO: remove orphan layers */
    function checkForOrphanLayers(){
        return;
    }
    
    function Tool(tool){
        if(!mouse.canvas.length){
            switch (tool){
                case 'undo':
                    Undo(1);
                    break;
                case 'redo':
                    Undo(-1);
                    break;
                default:
                    settings.tool = tool;
                    break;
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
                    }
                    undoStep ++;
                }
                else{
                    console.log('Too many redo steps');
                }
            }
        }

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

    function MouseUp(startPos) {
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

    $.mercuryCanvas.refreshSettings = function(){
        if(!$('[data-customsubmenu="brush"]').hasClass('disabled')) {
            settings.lineWidth = $('#brushSizeSlider').val();
        }
        tempCtx.lineWidth = settings.lineWidth;
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
                value.y <= pos.y && value.y + value.height >= pos.y) {
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
            'left': minMousePos.x - 0.5,
            'top': minMousePos.y - 0.5
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
            $('#canvasBackground').height(height).width(width).attr('height', height).attr('width', width);
            $('#canvasTemp').height(height).width(width).attr('height', height).attr('width', width);
        }
        
        return {
            height: height,
            width: width
        };
    }
    var points = [];
    var minMousePos = { 'x': 999999, 'y': 999999 }, maxMousePos = { 'x': -1, 'y': -1 };
    
    $(window).resize($.debounce(settings.resizeDelay, ResizeCanvasBackground));
    
    
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