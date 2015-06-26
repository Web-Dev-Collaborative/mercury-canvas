// TODO: select tool without mouse drag is broken (resolved, needs a test)
// TODO: after resizing the layer, layerToColor can be very wrong
// TODO: problems with opacity on undo
// TODO: eye dropper doesn't care about blending modes

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
    var settings = {};
    var layers = {};
    var layersWrapper, background, temp, backgroundCtx, tempCtx, $temp, $background;
    var clickPressed, startPos, dragged, actioned, selectStart;
    var zIndex = 0;
    var selectedLayer;
    var dist = keys = {};
    var transitionContent = 'all 0.5s ease';
    var transitionDuration = 500;
    var boardWrapper;
    var $blendingModes;
    var mousePos = {
        x: 0,
        y: 0
    };
    var action, dir;
    var original = {};
    var ready = false;
    var cursor;
        
    var undoStep = 0;
    var undo = [];

    var points = [];
    var minMousePos = { 'x': 999999, 'y': 999999 }, maxMousePos = { 'x': -1, 'y': -1 };
    
    if(!$.cookie('brushSize')){
        $.cookie('brushSize', 5);
    }

    $(window).resize($.debounce(settings.resizeDelay, ResizeCanvasBackground));
    
    $.MercuryModal.defaults.zIndex = 1080;
    $.MercuryModal.defaults.ready = function(){
        setTimeout(function(){
            ClosePopovers(null);
        }, 10);
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
    var blendingModes = [
        'normal',
        'darken', 
        'multiply',
        'color-burn', 
        'lighten', 
        'screen', 
        'color-dodge', 
        'overlay', 
        'soft-light', 
        'hard-light', 
        'difference', 
        'exclusion', 
        'hue', 
        'saturation', 
        'color', 
        'luminosity'
    ];
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
            lineWidth: ($.cookie('brushSize') ? $.cookie('brushSize') : 5),
            strokeColor: 'red',
            tool: '',
            transition: true,
            brushSizeIncrement: 3,
            handlerSize: 20
        };
        
        settings = $.extend({}, defaults, options);
        
        layersWrapper = $(this);
        layersWrapper.html('').css({
            width: '100%',
            height: '100%'
        });
        layersWrapper.append('<div id="cursor"></div><canvas class="canvasLayer canvasBottom" id="canvasBackground" height="0" width="0" border="0">Update your browser</canvas><canvas class="canvasLayer canvasTop" id="canvasTemp" height="0" width="0" border="0">Update your browser</canvas>');
        
        $background = $('#canvasBackground');
        $temp = $('#canvasTemp');
        background = $background[0];
        temp = $temp[0];
        
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
        
        init();
    }

    function init(){
        cursor = $('#cursor');
        boardWrapper = $('#boardWrapper');
        boardWrapper.attr('unselectable', 'on').css('user-select', 'none').on('selectstart', false).on('onselectstart', false);

        $('.menu-open', boardWrapper).popover({
            html : true,
            container: 'body',
            placement: 'right',
            template: '<div class="popover" role="tooltip"><div class="arrow"></div><div class="popover-content"></div></div>',
            content: function(){
                return $('#'+ $(this).attr('data-menu'))[0].innerHTML;
            }
        });
        $('#tools', boardWrapper).children('li').tooltip({
            placement: 'right',
            container: 'body',
        });
        $('#currentTool', boardWrapper).children('li').tooltip({
            placement: 'bottom',
            container: 'body'
        });

        $(document).on({
            'show.bs.tooltip': function(){
                if(zIndex > 999){
                    $(this).css('z-index', 1070 + zIndex - 999);
                }
            },
            'show.bs.popover': function(){
                if(zIndex > 999){
                    $(this).css('z-index', 1030 + zIndex - 999);
                }
            }
        });

        $('.tool', boardWrapper).on('click', function(){
            var $this = $(this);
            if (!$this.hasClass('disabled')) {
                if($this.attr('data-action')){
                    Tool($this.attr('data-action'));
                }
            }
        });

        CheckUndoButtons();
        Tool('brush');

        $('#blendingModes', boardWrapper).select2({
            dropdownParent: $('#blendingModes', boardWrapper).parent(),
        }).on('change', function(){
            if(selectedLayer){
                $(selectedLayer[0]).css('mix-blend-mode', $('#blendingModes option:checked').val());
                selectedLayer.blendingMode = $('#blendingModes option:checked').val();
            }
        });
        $(document).on('click', '#dbload', function(){
            var newElem = '<table id="allcanvases" class="table table-striped table-bordered table-hover"><tr><th>Nume</th><th></th></tr></table>';
            MercuryModal({
                title: 'Load images from database',
                buttons: [
                    {
                        text: 'Select',
                        class: 'btn-lg btn-success',
                        onclick: function(){
                            console.log('tset');
                        }
                    },
                    {
                        text: 'Cancel',
                        class: 'btn-lg btn-danger',
                        dismiss: true
                    }
                ],
                textAlign: {
                    footer: 'center'
                },
                content: newElem,
                ready: function(){
                    $.MercuryModal.defaults.ready();

                    $.ajax({
                        url: 'functions/getimages.php',
                        dataType: 'json',
                        success: function(e){
                            console.log(e);
                        }
                    })
                }
            });
        });

        $('#brushSizeSlider', boardWrapper).val($.cookie('brushSize'));
        $("#brushSizeSlider", boardWrapper).ionRangeSlider({
            force_edges: true,
            min: 1,
            max: 100,
            from: parseInt($.cookie('brushSize')),
            onChange: function(e){
                if(settings.tool == 'brush' || settings.tool == 'eraser'){
                    $.cookie('brushSize', e.from);
                    settings.lineWidth = e.from;
                    refreshSettings();
                }
            },
            onUpdate: function(e){
                if(settings.tool == 'brush' || settings.tool == 'eraser'){
                    $.cookie('brushSize', e.from);
                    settings.lineWidth = e.from;
                    refreshSettings();
                }
            }
        });
        brushSizeSlider = $('#brushSizeSlider', boardWrapper).data('ionRangeSlider');

        $('#opacitySlider', boardWrapper).val(100);
        $("#opacitySlider", boardWrapper).ionRangeSlider({
            force_edges: true,
            min: 0,
            max: 100,
            from: parseInt(100),
            onChange: function(e){
                if(opacitySliderFinished){
                    opacitySliderFinished = false;
                    return;
                }
                if(selectedLayer) {
                    if(!changedOpacity){
                        changedOpacity = true;
                        startOpacity = parseFloat($(selectedLayer[0]).css('opacity'));
                    }
                    $(selectedLayer[0]).css('opacity', e.from / 100);
                    selectedLayer.alpha = e.from / 100;
                }
            },
            onFinish: function(e){
                if(selectedLayer){
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
                if(selectedLayer) {
                    $(selectedLayer[0]).css('opacity', e.from / 100);
                    selectedLayer.alpha = e.from / 100;
                }
            }
        });
        opacitySlider = $('#opacitySlider', boardWrapper).data("ionRangeSlider");

        $('.colorPicker', boardWrapper).colpick({
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
                $('.colorPicker').colpickHide();
            }
        });

        $blendingModes = $('#blendingModes');

        $('body').on('click', '.chooseFiles', function(){
            $('#oldInput').click();
        });
        $('body').on('change', '#oldInput', function(e){
            HandleFiles(e);
            $(this).empty();
        });
        $('body').on('click', '.deleteLayer', function(){
            if(!$(this).hasClass('disabled')){
                Tool('delete'); 
            }
        });

        ClearLayer('canvasTemp');
        refreshSettings();
        ready = true;
        console.log(settings);
    }

    function OpenImage(img){
        var width, height;
        original.width = width = img.width;
        original.height = height = img.height;
        var newLayer = AddLayer({
            x: settings.width / 2 - width / 2,
            y: settings.height / 2 - height / 2,
            width: width,
            height: height
        });

        var _ctx = newLayer[0].getContext('2d');
        _ctx.drawImage(img, 0, 0, width, height);

        if(settings.width < img.width){
            var prop = settings.width / img.width;
            width = settings.width;
            height = img.height * prop;
        }
        if(settings.height < img.height){
            var prop = settings.height / img.height;
            height = settings.height;
            width = img.width * prop;
        }
        TransformLayer(newLayer, {
            x: settings.width / 2 - width / 2,
            y: settings.height / 2 - height / 2,
            width: width,
            height: height
        });
        var transform = $(newLayer[0]).css('transform');
        transform = transform.slice(7, -1).split(', ');
        newLayer.x = parseFloat(transform[4]);
        newLayer.y = parseFloat(transform[5]);
        newLayer.width = original.width * parseFloat(transform[0]);
        newLayer.height = original.height * parseFloat(transform[3]);
        var matrix = new Matrix();
        matrix.translate(newLayer.x, newLayer.y);
        $(newLayer[0]).css({
            'transform': matrix.toCSS(),
            '-webkit-transform': matrix.toCSS(),
            width: newLayer.width,
            height: newLayer.height
        });

        AddToUndo({
            action: 'draw',
            layer: {
                0: newLayer[0],
                x: newLayer.x,
                y: newLayer.y,
                width: newLayer.width,
                height: newLayer.height
            }
        });

        original.width = original.height = 0;
        Tool('select');
        SelectLayer(newLayer);
    }

    function HandleFiles(e) {
        var reader = new FileReader();
        reader.readAsDataURL(e.target.files[0]);
        reader.onload = function(event){
            var img = new Image();
            img.src = event.target.result;
            img.onload = function(){
                ClosePopovers(null);
                OpenImage(img);
            }
        }
    }

    $.undo = function(){
        // console.log(undoStep, undo);
        return undo;
    }
    $.layers = function(){
        // console.log(layers);
        return layers;
    }
    var mousemoved = false;
    
    $(document).on({
        'keydown': function(e){
            if(!e.key) e.key = window.keypress._keycode_dictionary[e.keyCode];
            e.key = e.key.toLowerCase();
            keys[e.key] = true;
            keys.ctrl = e.ctrlKey;
            keys.atl = e.altKey;
            keys.shift = e.shiftKey;
        },
        'keyup': function(e){
            if(!e.key) e.key = window.keypress._keycode_dictionary[e.keyCode];
            e.key = e.key.toLowerCase();
            keys[e.key] = false;
            keys.ctrl = e.ctrlKey;
            keys.atl = e.altKey;
            keys.shift = e.shiftKey;
            // this must be here because you can't start the file dialog outside an event
            if(keys.ctrl && e.key == 'o' && !keys.shift && !keys.alt){
                $('#oldInput').click();
                console.log('fuck firefox', $('#oldInput'));
            }
        },
        'mousedown': function(event){
            mouse.document = true;
            mousemoved = false;
            if(!$('.mercuryModal').length){
                ClosePopovers(event);

                if($(background).offset()){
                    if(isOnCanvas(event)){
                        var pos = CalculateCoords(event.pageX, event.pageY);
                        mouse.canvas.push(event.which);

                        switch(settings.tool){
                            case 'brush':
                            case 'eraser':
                                if(event.which == 1){
                                        startPos = pos;
                                        points = [];
                                        points[0] = pos;
                                        setLimitPoints(event);
                                        
                                        DrawTemp(pos, settings.tool);
                                }
                                break;
                            case 'select':
                                if(event.which == 1){
                                    actioned = true;
                                    if(!selectedLayer){
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
                    case 'eraser':
                        MoveVirtualCursor(pos);
                        if (mouse.canvas.length && mouse.canvas.indexOf(1) != -1) {
                            dragged = true;
                            points[points.length] = pos;
                            setLimitPoints(event);

                            DrawTemp(pos, settings.tool);
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

                                if($temp.css('cursor') == 'default'){
                                    CheckCursorCanvas(pos, false);
                                }
                                if(!action){
                                    $temp.css('cursor', 'move');
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
                                            newX = pos.x;
                                            newY = pos.y;
                                            if(keys.shift){
                                                wProp = newWidth / original.width;
                                                hProp = newHeight / original.height;
                                                newHeight = original.height * (wProp + hProp) / 2;
                                                newWidth = original.width * (wProp + hProp) / 2;

                                                newX = Math.min(selectedLayer.x + selectedLayer.width - newWidth, selectedLayer.x + selectedLayer.width);
                                                newY = Math.min(selectedLayer.y + selectedLayer.height - newHeight, selectedLayer.y + selectedLayer.height);
                                            }
                                            if(keys.alt){
                                                newX = Math.min(newX, selectedLayer.x + selectedLayer.width);
                                                newY = Math.min(newY, selectedLayer.y + selectedLayer.height);
                                                newWidth = newWidth - Math.sign(newX - selectedLayer.x) * Math.abs(selectedLayer.width - newWidth);
                                                newHeight = newHeight - Math.sign(newY - selectedLayer.y) * Math.abs(selectedLayer.height - newHeight);
                                            }
                                            newX = Math.min(newX, selectedLayer.x + selectedLayer.width);
                                            newY = Math.min(newY, selectedLayer.y + selectedLayer.height);
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
                                    TransformLayer(selectedLayer, {
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
                mousemoved = true;
            }
        },
        'mouseup': function(event){
            if(!$('.mercuryModal').length){
                var pos = CalculateCoords(event.pageX, event.pageY);

                switch(settings.tool){
                    case 'brush':
                    case 'eraser':
                        if(isOnCanvas(event)){
                            if(event.which == 1){
                                BrushMouseUp();
                            }
                        }
                        else{
                            BrushMouseUp();  
                        }
                        break;
                    case 'select':
                        if(mouse.canvas.indexOf(1) != -1 && event.which == 1){
                            if(actioned){
                                CheckCursorCanvas(pos, true);

                                if(selectedLayer && mousemoved){
                                    var transform = $(selectedLayer[0]).css('transform');
                                    transform = transform.slice(7, -1).split(', ');
                                    selectedLayer.x = parseFloat(transform[4]);
                                    selectedLayer.y = parseFloat(transform[5]);
                                    selectedLayer.width = original.width * parseFloat(transform[0]);
                                    selectedLayer.height = original.height * parseFloat(transform[3]);
                                    var matrix = new Matrix();
                                    matrix.translate(selectedLayer.x, selectedLayer.y);
                                    $(selectedLayer[0]).css({
                                        'transform': matrix.toCSS(),
                                        '-webkit-transform': matrix.toCSS(),
                                        width: selectedLayer.width,
                                        height: selectedLayer.height
                                    });

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
                                $temp.css('cursor', 'default');
                                DeselectLayer();
                                OutLineLayer(pos);
                            }
                        }
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
        // new way, let the browser decide what was clicked
        if(!background) return false;
        if(event.target && $(event.target).attr('id') == 'canvasTemp') return true;
        else return false;
        // old way, position detection
        /*
        var calc = {};
        calc.start = $(background).offset();
        calc.width = $(background).width();
        calc.height = $(background).height();
        return (event.pageY > calc.start.top && event.pageY < calc.start.top + calc.height && event.pageX > calc.start.left && event.pageX < calc.start.left + calc.width);*/
    }

    function MoveVirtualCursor(_pos){
        var matrix = new Matrix();
        matrix.translate(_pos.x - settings.lineWidth / 2, _pos.y - settings.lineWidth / 2);
        cursor.css({
            'transform': matrix.toCSS(),
            '-webkit-transform': matrix.toCSS()
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
            opacitySlider.update({
                from: _layer.alpha * 100,
                disable: false
            });

            if(_layer.blendingMode != $blendingModes.val()){
                $blendingModes.val(_layer.blendingMode).trigger("change");
            }
            $blendingModes.prop('disabled', false);
            $('.deleteLayer').removeClass('disabled');

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

    function ClosePopovers(e){
        $('.menu-open').each(function () {
            if (e == null || (!$(this).is(e.target) && $(this).has(e.target).length === 0 && $('.popover').has(e.target).length === 0)) {
                $(this).popover('hide');
            }
        });
    }

    var shortcuts = {
        'v': 'select',
        'b': 'brush',
        'e': 'eraser',
        'x': 'eyeDropper',
        'o': 'open',
        'ctrl a': 'selectAll',
        'ctrl s': 'save',
        'ctrl n': 'newDoc',
        'ctrl o': 'none',//'keyup event on body',
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
            if(!e.key) e.key = window.keypress._keycode_dictionary[e.keyCode];
            var shortcutAction = shortcuts[(e.ctrlKey ? 'ctrl ' : '') + (e.altKey ? 'alt ' : '') + (e.shiftKey ? 'shift ' : '') + e.key.toLowerCase()];
            if(typeof shortcutAction == 'function'){
                shortcutAction();
            }
            else{
                Tool(shortcutAction);
            }
            if(shortcutAction == 'none') {
                return true;
            }
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
            if(settings.tool == 'brush' || settings.tool == 'eraser'){
                Tool('brushSize-');
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
            if(settings.tool == 'brush' || settings.tool == 'eraser'){
                Tool('brushSize+');
            }
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
        $('.deleteLayer').addClass('disabled');
        selectedLayer = null;
        action = dist.x = dist.y = undefined;

        if(ready){
            opacitySlider.update({
                from: 100,
                disable: true
            });
            $blendingModes.val('normal').trigger("change").prop("disabled", true);
        }
        // refreshSettings();
    }

    function CheckCursorCanvas(pos, ow){
        $temp.css('cursor', 'default');
        if(selectedLayer && settings.tool == 'select'){
            if(typeof ow != 'boolean') ow = true;
            if(ow) action = '';

            if(pos.x > selectedLayer.x && pos.x < selectedLayer.x + selectedLayer.width && pos.y > selectedLayer.y && pos.y < selectedLayer.y + selectedLayer.height){
                $temp.css('cursor', 'move');
                if(ow) action = 'move';
            }
            if (pos.x > selectedLayer.x - settings.handlerSize / 2 && pos.x < selectedLayer.x + settings.handlerSize / 2 &&
                pos.y > selectedLayer.y - settings.handlerSize / 2 && pos.y < selectedLayer.y + settings.handlerSize / 2){
                $temp.css('cursor', 'nw-resize');
                if(ow) action = 'nw';
            }
            if (
                pos.x > selectedLayer.x + selectedLayer.width - settings.handlerSize / 2 && pos.x < selectedLayer.x + selectedLayer.width + settings.handlerSize / 2 &&
                pos.y > selectedLayer.y - settings.handlerSize / 2 && pos.y < selectedLayer.y + settings.handlerSize / 2){
                $temp.css('cursor', 'ne-resize');
                if(ow) action = 'ne';
            }
            if (
                pos.x > selectedLayer.x + selectedLayer.width - settings.handlerSize / 2 && pos.x < selectedLayer.x + selectedLayer.width + settings.handlerSize / 2 &&
                pos.y > selectedLayer.y + selectedLayer.height - settings.handlerSize / 2 && pos.y < selectedLayer.y + selectedLayer.height + settings.handlerSize / 2){
                $temp.css('cursor', 'se-resize');
                if(ow) action = 'se';
            }
            if (
                pos.x > selectedLayer.x - settings.handlerSize / 2 && pos.x < selectedLayer.x + settings.handlerSize / 2 &&
                pos.y > selectedLayer.y + selectedLayer.height - settings.handlerSize / 2 && pos.y < selectedLayer.y + selectedLayer.height + settings.handlerSize / 2){
                $temp.css('cursor', 'sw-resize');
                if(ow) action = 'sw';
            }
            if(
                pos.x >= selectedLayer.x + settings.handlerSize / 2 && pos.x <= selectedLayer.x + selectedLayer.width - settings.handlerSize / 2 &&
                pos.y > selectedLayer.y - settings.handlerSize / 3 && pos.y < selectedLayer.y + settings.handlerSize / 3){
                $temp.css('cursor', 'n-resize');
                if(ow) action = 'n';
            }
            if(
                pos.x > selectedLayer.x + selectedLayer.width - settings.handlerSize / 3 && pos.x < selectedLayer.x + selectedLayer.width + settings.handlerSize / 3 &&
                pos.y >= selectedLayer.y + settings.handlerSize / 2 && pos.y <= selectedLayer.y + selectedLayer.height - settings.handlerSize / 2){
                $temp.css('cursor', 'e-resize');
                if(ow) action = 'e';
            }
            if(
                pos.x >= selectedLayer.x + settings.handlerSize / 2 && pos.x <= selectedLayer.x + selectedLayer.width - settings.handlerSize / 2 &&
                pos.y > selectedLayer.y + selectedLayer.height - settings.handlerSize / 3 && pos.y < selectedLayer.y + selectedLayer.height + settings.handlerSize / 3){
                $temp.css('cursor', 's-resize');
                if(ow) action = 's';
            }
            if(
                pos.x > selectedLayer.x - settings.handlerSize / 3 && pos.x < selectedLayer.x + settings.handlerSize / 3 &&
                pos.y >= selectedLayer.y + settings.handlerSize / 2 && pos.y <= selectedLayer.y + selectedLayer.height - settings.handlerSize / 2){
                $temp.css('cursor', 'w-resize');
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

    function OpenTopMenu(tool){
        $('.customSubmenu', boardWrapper).hide();
        $('[data-customSubmenu~="'+ tool +'"]', boardWrapper).css('display', 'inline-block');
    }

    function ToggleRightMenu(tool){
        $('[data-menu="'+ tool +'"]', boardWrapper).popover('toggle');
    }
    
    function DefaultToolChange(tool){
        $('.outlined', boardWrapper).removeAttr('style').removeClass('outlined');
        $('[data-action='+ tool +']', boardWrapper).css('border', '1px solid red').addClass('outlined');
        settings.tool = tool;
        DeselectLayer();
    }
    
    var actions = ['newDoc', 'fullScreen', 'undo', 'redo', 'brushSize-', 'brushSize+', 'deselect', 'save', 'open', 'delete'];
    var ignoreAction = ['none', 'colorPicker', 'draw', 'selectAll'];

    function Tool(tool){
        console.log('Tool '+ tool + ' called by: '+ (arguments.callee.caller.name ? (arguments.callee.caller.caller.name ? arguments.callee.caller.caller.name : arguments.callee.caller.name) : 'anonymous'));
        if(!$('.mercuryModal').length && !mouse.canvas.length){
            if(ignoreAction.indexOf(tool) != -1) {
                return;
            }
            if(actions.indexOf(tool) == -1){
                if(tool == settings.tool) return;

                if(tool != 'brush' && tool != 'eraser'){
                    cursor.hide();
                    $temp.css('cursor', 'default');
                }

                OpenTopMenu(tool);
            }
            switch (tool){
                case 'undo':
                    Undo(1);
                    break;
                case 'redo':
                    Undo(-1);
                    break;
                case 'delete':
                    if(selectedLayer){
                        AddToUndo({
                            action: 'hide',
                            layer: selectedLayer
                        });
                        $(selectedLayer[0]).hide();
                        DeselectLayer();
                        CheckCursorCanvas(mousePos, false);
                    }
                    break;
                case 'save':
                    ToggleRightMenu('save');
                    break;
                case 'open':
                    ToggleRightMenu('open');
                    break;
                case 'brush':
                case 'eraser':
                    DefaultToolChange(tool);
                    MoveVirtualCursor(mousePos);
                    cursor.show();
                    $temp.css('cursor', 'none');
                    break;
                case 'select':
                    DefaultToolChange(tool);
                    OutLineLayer(mousePos);
                    break;
                case 'newDoc':
                    MercuryModal({
                        title: 'Are you sure?<br>This action cannot be undone',
                        textAlign: {
                            header: 'center',
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
                    console.warn('Tool doesn\'t have this action ('+ tool +')');
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
    
    // TODO: Try to change this function's name. Now it's too general.
    function DrawTemp(mouse, type){
        if(type == 'brush'){
            tempCtx.lineWidth = settings.lineWidth;
            tempCtx.strokeStyle = settings.strokeColor;
        }
        else{
            tempCtx.lineWidth = settings.backgroundColor;
            tempCtx.strokeStyle = settings.backgroundColor;
        }
        tempCtx.lineCap = tempCtx.lineJoin = 'round';
        
        if (points.length < 3) {
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
            action: 'undefined',
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
            $('.tool[data-action="undo"]', boardWrapper).removeClass('disabled');
        }
        if(undoStep == undo.length) {
            $('.tool[data-action="redo"]', boardWrapper).addClass('disabled');
        }

        if(undoStep != undo.length) {
            console.warn('Undo step and undo.length not synced; undo:', undo, ', undo.length:', undo.length);
        }

        checkForOrphanLayers();
    }

    function TransformLayer(_layer, _transform){
        if(_layer && _transform){
            if(!original.width || !original.height){
                original.width = $(_layer[0]).width();
                original.height = $(_layer[0]).height();
                var wipe = true;
            }
            _transform.width = Math.max(0, _transform.width);
            _transform.height = Math.max(0, _transform.height);

            var matrix = new Matrix();
            matrix.translate(_transform.x, _transform.y)
                  .scale(_transform.width / original.width, _transform.height / original.height);
            $(_layer[0]).css({
                'transform': matrix.toCSS(),
                '-webkit-transform': matrix.toCSS()
            });
            _layer.x = _transform.x;
            _layer.y = _transform.y;
            _layer.width = _transform.width;
            _layer.height = _transform.height;

            if(wipe) {
                original.width = original.height = 0;
            }
        }
    }

    function Undo(steps){
        DeselectLayer();
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
                            TransformLayer(undo[undoStep - 1].layer, undo[undoStep - 1].before);
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
                            TransformLayer(undo[undoStep].layer, undo[undoStep].after);
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
            $('.tool[data-action="undo"]', boardWrapper).removeClass('disabled');
        }
        else{
            $('.tool[data-action="undo"]', boardWrapper).addClass('disabled');
        }
        if(undoStep < undo.length){
            $('.tool[data-action="redo"]', boardWrapper).removeClass('disabled');
        }
        else{
            $('.tool[data-action="redo"]', boardWrapper).addClass('disabled');
        }
    }

    function BrushMouseUp() {
        minMousePos.x = Math.max(0, minMousePos.x - tempCtx.lineWidth / 2 - 1);
        minMousePos.y = Math.max(0, minMousePos.y - tempCtx.lineWidth / 2 - 1);
        maxMousePos.x = maxMousePos.x + tempCtx.lineWidth / 2 + 1;
        maxMousePos.y = maxMousePos.y + tempCtx.lineWidth / 2 + 2;

        if (mouse.canvas.indexOf(1) != -1) {
            if(settings.tool == 'brush'){
                var newLayer = AddLayer({
                    x: minMousePos.x,
                    y: minMousePos.y,
                    width: $temp.width(),
                    height: $temp.height()
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
                });
            }
            else if(settings.tool == 'eraser'){
                var p = {
                    x0: minMousePos.x,
                    y0: minMousePos.y,
                    x1: maxMousePos.x,
                    y1: maxMousePos.y
                }
                var tempLayers = [];
                $.each(layers, function(index, value){
                    if(LayerBetweenPoints(value, p)){
                        tempLayers.push(value);
                    }
                });
                console.log('On this layers we should erase something', tempLayers);
                if (dragged) {
                    tempCtx.closePath();
                }
                ClearLayer('canvasTemp');
                /*
                var newLayer = AddLayer({
                    x: Math.max(0, startPos.x),
                    y: Math.max(0, startPos.y),
                    width: $temp.width(),
                    height: $temp.height()
                });
                
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
                })*/
            }
        }

        mouse.canvas = [];
        mouse.document = false;
        points = [];
        dragged = false;
        
        minMousePos = { 'x': 999999, 'y': 999999 };
        maxMousePos = { 'x': -1, 'y': -1 };
    }

    function LayerBetweenPoints(layer, points){
        if(layer.alpha > 0 && Math.max(layer.x, points.x0) < Math.min(layer.x + layer.width, points.x1) && Math.max(layer.y, points.y0) < Math.min(layer.y + layer.height, points.y1)){
            return true;
        }
        return false;
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
        return !$('[data-customSubmenu~="'+ tool +'"]', boardWrapper).hasClass('disabled');
    }

    $.mercuryCanvas.refreshSettings = refreshSettings = function(){
        /*if(CustomMenuActive(settings.tool)) {
            settings.lineWidth = $('#brushSizeSlider').val();
        }*/
        if(settings && settings.lineWidth){
            if(cursor.css('display') != 'none'){
                cursor.css({
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
            y: 0,
            width: 0,
            height: 0
        };
        var layerSettings = $.extend({}, layerDefaults, options);
        zIndex++;
        if(zIndex > 999){
            $temp.css('z-index', 1000 + zIndex - 999);
            cursor.css('z-index', 1001 + zIndex - 999);
            $('#tools, #currentTool', boardWrapper).css('z-index', 1004 + zIndex - 999);
            $('.select2', boardWrapper).css('z-index', 1069 + zIndex - 999);
            $.MercuryModal.defaults.zIndex = 1080 + zIndex - 999;
        }
        var matrix = new Matrix();
        matrix.translate(layerSettings.x, layerSettings.y);
        var layerID = 'canvas-' + zIndex;
        var newLayer = $('<canvas />').addClass('canvasLayer').attr({
            border: '0',
            width: layerSettings.width,
            height: layerSettings.height,
            id: layerID
        }).css({
            'transform': matrix.toCSS(),
            '-webkit-transform': matrix.toCSS(),
            'z-index': zIndex
        }).appendTo(layersWrapper);
        
        if(arguments.callee.caller.name == 'OpenImage'){
            newLayer.css({
            'width': layerSettings.width,
            'height': layerSettings.height
            });
        }

        newLayer['name'] = layerID;
        newLayer['x'] = layerSettings.x;
        newLayer['y'] = layerSettings.y;
        newLayer['width'] = layerSettings.width;
        newLayer['height'] = layerSettings.height;
        newLayer['alpha'] = 1;
        newLayer['blendingMode'] = 'normal';
        
        layers[layerID] = newLayer;
        return newLayer;
    }
    
    function DrawTempCanvas(layer){
        var relevantData = tempCtx.getImageData(minMousePos.x, minMousePos.y, maxMousePos.x - minMousePos.x, maxMousePos.y - minMousePos.y);

        layer.width = maxMousePos.x - minMousePos.x;
        layer.height = maxMousePos.y - minMousePos.y;
        
        var ctx = layer[0].getContext('2d');
        
        var matrix = new Matrix();
        matrix.translate(minMousePos.x, minMousePos.y);
        layer.css({
            'transform': matrix.toCSS(),
            '-webkit-transform': matrix.toCSS()
        }).attr({
            'width': layer.width,
            'height': layer.height
        });
        layer.x = minMousePos.x;
        layer.y = minMousePos.y;
        
        ctx.putImageData(relevantData, 0, 0);
        
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
        if(!$temp[0]) setTimeout(function(){
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
        if(height != $temp.height() || width != $temp.width()){
            $background.attr('height', height).attr('width', width).attr('style', 'width: '+ width +'px; height: '+ height +'px');
            $temp.attr('height', height).attr('width', width).attr('style', 'width: '+ width +'px; height: '+ height +'px');

            settings.width = width;
            settings.height = height;

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