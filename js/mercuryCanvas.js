// TODO: select tool without mouse drag is broken (resolved, needs a test)
// TODO: after resizing the layer, layerToColor can be very wrong (resolved, needs a test)
// TODO: problems with opacity on undo
// TODO: eye dropper doesn't care about blending modes

(function($) {
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
    var altHiddenLayers = [];
        
    var undoStep = 0;
    var undo = [];
    var undoLayers = [];
    var undoData = {};

    var points = [];
    var minMousePos = { 'x': 999999, 'y': 999999 }, maxMousePos = { 'x': -1, 'y': -1 };

    window.undo = undo;
    window.undoStep = undoStep;
    window.undoLayers = undoLayers;
    window.undoData = undoData;
    window.layers = layers;
    
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
            undoLength: 20,
            brushSizeIncrement: 3,
            handlerSize: 20
        };
        
        settings = $.extend({}, defaults, options);
        
        layersWrapper = $(this);
        layersWrapper.html('').css({
            width: 'calc(100% - 280px)',
            height: '100%'
        }).append('<div id="cursor"></div><canvas class="canvasLayer canvasBottom" id="canvasBackground" height="0" width="0" border="0">Update your browser</canvas><canvas class="canvasLayer canvasTop" id="canvasTemp" height="0" width="0" border="0">Update your browser</canvas>');
        
        $background = $('#canvasBackground');
        $temp = $('#canvasTemp');
        background = $background[0];
        temp = $temp[0];
        
        backgroundCtx = background.getContext('2d');
        tempCtx = temp.getContext('2d');
        var newSize = ResizeCanvasBackground();
        
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
        ResizeCanvasBackground();
    }
    
    var requestAnimationFrame;
    var layersOrderInterval;
    var max = 0;
    
    function init(){
        var stats = new Stats();
        stats.setMode(1); // 0: fps, 1: ms, 2: mb

        stats.domElement.style.position = 'absolute';
        stats.domElement.style.right = '0px';
        stats.domElement.style.top = '0px';

        document.body.appendChild( stats.domElement );
        
        requestAnimationFrame = window.requestAnimationFrame || window.mozRequestAnimationFrame || window.webkitRequestAnimationFrame || window.msRequestAnimationFrame || setTimeout;
        requestAnimationFrame(function loop(){stats.update();requestAnimationFrame(loop)});
        
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
                        layer: selectedLayer,
                        layerName: selectedLayer.name
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

        $(document).on('click', '.chooseFiles', function(){
            $('#oldInput').click();
        });
        $(document).on('change', '#oldInput', function(e){
            HandleFiles(e);
            $(this).empty();
        });
        $(document).on('click', '#saveoffline', function(){
            var dt = temp.toDataURL('image/png');
            this.href = dt.replace(/^data:image\/[^;]/, 'data:application/octet-stream');
        })
        $(document).on('click', '.deleteLayer', function(){
            if(!$(this).hasClass('disabled')){
                Tool('delete'); 
            }
        });
        $(document).on('dragstart', ':not(#layers, #layers *)', function(){
            if($(this).parents('#layers').length){
                return false;
            }
        });
        $(window).on('dragenter', function (e) {
            stopDefaultEvent(e);
            $('.dragndrop').show();
        });
        $('.dragndrop').on('dragover', function (e) {
            stopDefaultEvent(e);
            $('.dragndrop').addClass('over');
        });
        $('.dragndrop').on('dragexit', function (e) {
            stopDefaultEvent(e);
            $('.dragndrop').removeClass('over');
        });
        $(window).on('dragexit', function (e) {
            stopDefaultEvent(e);
            $('.dragndrop').removeClass('over').hide();
        });

        $('.dragndrop').on('drop', function (e) {
            stopDefaultEvent(e);
            $('.dragndrop').removeClass('over').hide();

            var files = e.originalEvent.dataTransfer.files;
            HandleFiles(files, true);
        });
        $('#layers').sortable({
            animation: 100,
            onMove: reorderLayers,
            onEnd: reorderLayers
        });
        $(document).on('click', '.layer-visible', function(e){
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
            e.stopPropagation();
        });
        $(document).on('click', '.item', function(){
            if(keys.ctrl){
                $('.lastSelected').removeClass('lastSelected');
                if($(this).hasClass('selected')){
                    $(this).removeClass('selected');
                }
                else{
                    $(this).addClass('selected').addClass('lastSelected');
                }
            }
            else if(keys.shift){
                var last = $('.lastSelected');
                var lastID = last.index() - $(this).index();
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
                $(this).addClass('selected').addClass('lastSelected');
            }
            if($('#layers .selected').length){
                EnableLayerButtons();
            }
            else{
                DisableLayerButtons();
            }
        });
        $('#layer-buttons .deleteLayers').on('click', function(){
            var layersForAction = [];
            $('#layers').children('.selected').each(function(){
                layersForAction.push($(this).attr('data-layer'));
            });
            for(var i = 0, l = layersForAction.length; i < l;i++){
                $('#' + layersForAction[i]).hide();
                $('#layers [data-layer="'+ layersForAction[i] +'"]').hide();
            }
            AddToUndo({
                action: 'delete',
                layer: layersForAction
            });
        });
        
        ClearLayer('canvasTemp');
        ready = true;
        CheckUndoButtons();
        refreshSettings();
        Tool('brush');
//        AddLayer({});
//        console.log(settings);
    }

    function reorderLayers(){
        setTimeout(function(){
            var length = $('#layers .item').length;
            var t = performance.now();
            $('#layers .item').each(function(index){
                $('#'+ $(this).attr('data-layer')).css('z-index', length - index);
            });
            var t1 = performance.now() - t;
            if(t1 > max){
                max = t1;
                console.log('New record for reordering: ' + Math.round(t1) + ' millis');
            }
        }, 1);
    }
    function OpenImage(img){
        DeselectLayer();
        var width, height;
        original.width = width = img.width;
        original.height = height = img.height;
        var newLayer = AddLayer({
            x: settings.width / 2 - width / 2,
            y: settings.height / 2 - height / 2,
            width: width,
            height: height
        }, true);

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
        ScaleCanvas(newLayer, newLayer, original);
        layers[newLayer.name].image = true;
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
            layer: newLayer[0].getAttribute('id'),
            layerName: newLayer[0].getAttribute('id'),
            transform: {
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

    function HandleFiles(e, files) {
        if(files){
            $.each(e, function(index, value){
                var reader = new FileReader();
                reader.readAsDataURL(value);
                reader.onload = function(event){
                    var img = new Image();
                    img.src = event.target.result;
                    img.onload = function(){
                        ClosePopovers(null);
                        OpenImage(img);
                    }
                }
            })
        }
        else{
            $.each(e.target.files, function(index, value){
                var reader = new FileReader();
                reader.readAsDataURL(value);
                reader.onload = function(event){
                    var img = new Image();
                    img.src = event.target.result;
                    img.onload = function(){
                        ClosePopovers(null);
                        OpenImage(img);
                    }
                }
            })
        }
    }
    var mousemoved = false;
    var virtualCanvas = $('<canvas>');
    var cleared = false;
    var firstClick = false;
    
    function DrawSelectedLayerOutline(_layer){
        if(!_layer) return;
        tempCtx.save();
        tempCtx.lineWidth = 1;
        tempCtx.lineJoin = 'square';
        tempCtx.lineCap = 'square';
        tempCtx.strokeStyle="#000";
        tempCtx.fillStyle = 'rgba(255, 255, 255, 0.1)';

        var _x, _y, _width, _height;
        _x = Math.round(_layer.x);// - 0.5;
        _y = Math.round(_layer.y);// - 0.5;
        _width = Math.round(_layer.width + 1);
        _height = Math.round(_layer.height + 1);

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
        tempCtx.restore();
    }
    
    $(document).on({
        'keydown': function(e){
            if(!e.key) e.key = window.keypress._keycode_dictionary[e.keyCode];
            e.key = e.key.toLowerCase();
            if(mousemoved && (e.ctrlKey != keys.ctrl || e.altKey != keys.alt || e.shiftKey != keys.shift)){
                var mm = true;
            }
            keys[e.key] = true;
            keys.ctrl = e.ctrlKey;
            keys.alt = e.altKey;
            keys.shift = e.shiftKey;
            if(mm){
                $(document).trigger('mousemove', {custom: true});
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
            if(mousemoved){
                $(document).trigger('mousemove', {custom: true});
            }
        },
        'mousedown': function(event){
            mouse.document = true;
            mousemoved = false;
            dir = '';
            if(!$('.mercuryModal').length){
                cleared = false;
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

                                    DrawBrushOnLayer(pos, settings.tool, tempCtx);
                                }
                                break;
                            case 'select':
                                if(event.which == 1){
                                    actioned = true;
                                    if(!selectedLayer){
                                        firstClick = true;
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
                                    else{
                                        if(PositionToLayer(pos) == selectedLayer){
                                            firstClick = true;
                                        }
                                    }
                                }
                        }
                    }
                }
            }
        },
        'mousemove': function(event, custom){
            if(requestAnimationFrame) requestAnimationFrame(function(){
                if(!$('.mercuryModal').length){
                    if(!custom && !isOnCanvas(event) && !selectedLayer && !mouse.document && ready){
                        if(!cleared){
                            ClearLayer('canvasTemp');
                        }
                        cleared = true;
                        return;
                    }
                    var pos;
                    if(custom){
                        pos = mousePos;
                    }
                    else{
                        pos = CalculateCoords(event.pageX, event.pageY);
                        mousePos = pos;
                    }

                    switch(settings.tool){
                        case 'brush':
                        case 'eraser':
                            if(!custom){
                                MoveVirtualCursor(pos);
                            }
                            var _pos = pos;
                            if(mouse.canvas.length && mouse.canvas.indexOf(1) != -1){
                                if(keys.shift && !dir){
                                    var deltaX, deltaY;
                                    deltaX = Math.abs(_pos.x - startPos.x);
                                    deltaY = Math.abs(_pos.y - startPos.y);
                                    if(deltaX > deltaY){
                                        dir = 'horizontal';
                                    }
                                    else{
                                        dir = 'vertical';
                                    }
                                }
                                if(keys.shift && dir){
                                    if(dir == 'horizontal'){
                                        _pos.y = startPos.y;
                                    }
                                    else if (dir == 'vertical'){
                                        _pos.x = startPos.x;
                                    }
                                }
                                dragged = true;
                                points[points.length] = _pos;
                                setLimitPoints(event);

                                DrawBrushOnLayer(_pos, settings.tool, tempCtx);
                            }
                            break;
                        case 'select':
                            if(!selectedLayer){
                                OutLineLayer(pos, true);
                            }
                            else{
                                if(mouse.canvas.indexOf(1) == -1){
                                    CheckCursorCanvas(pos, true);
                                }
                                else if(actioned) {
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
            }, event);
        },
        'mouseup': function(event){
            if(!$('.mercuryModal').length){
                cleared = false;
                dir = '';
                var pos = CalculateCoords(event.pageX, event.pageY);
                settings.strokeColor = '#'+Math.floor(Math.random()*16777215).toString(16);

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
                                    selectedLayer.css({
                                        'transform': matrix.toCSS(),
                                        '-webkit-transform': matrix.toCSS(),
                                        width: selectedLayer.width,
                                        height: selectedLayer.height
                                    });

                                    ScaleCanvas(selectedLayer, selectedLayer, (selectStart ? selectStart : original), $('#scaling-mode').prop('checked'));
                                    
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
                                        layer: selectedLayer,
                                        layerName: selectedLayer.name
                                    });
                                    selectStart = {
                                        x: selectedLayer.x,
                                        y: selectedLayer.y,
                                        width: selectedLayer.width,
                                        height: selectedLayer.height
                                    }
                                }
                                else if(!firstClick){
                                    action = '';
                                    $temp.css('cursor', 'default');
                                    DeselectLayer();
                                    OutLineLayer(pos, true);
                                }
                            }
                            else{
                                action = '';
                                $temp.css('cursor', 'default');
                                DeselectLayer();
                                OutLineLayer(pos, true);
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
                firstClick = false;
            }
        }
    });

    function ScaleCanvas(layer, end, start, pixelPerfect){
        var selectedContext = layer[0].getContext('2d');
        var imageData = selectedContext.getImageData(0, 0, start.width, start.height);

        virtualCanvas.attr({
            width: start.width,
            height: start.height
        });
        virtualCanvas[0].getContext('2d').drawImage(layer[0], 0, 0);
        layer.attr({
            width: end.width,
            height: end.height
        });

        selectedContext.save();
        if(pixelPerfect == undefined){
            pixelPerfect = $('#scaling-mode').prop('checked');
        }
        if(pixelPerfect){
            selectedContext.imageSmoothingEnabled = false;
            selectedContext.webkitImageSmoothingEnabled = false;
            selectedContext.mozImageSmoothingEnabled = false;
        }
        selectedContext.scale(end.width / start.width, end.height / start.height);
        selectedContext.drawImage(virtualCanvas[0], 0, 0);
        
        selectedContext.restore();
    }
    
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
        matrix.translate(Math.floor(_pos.x - settings.lineWidth / 2), Math.floor(_pos.y - settings.lineWidth / 2));
        cursor.css({
            'transform': matrix.toCSS(),
            '-webkit-transform': matrix.toCSS()
        });
    }

    function OutLineLayer(_pos, clear){
        if(_pos){
            if(clear) ClearLayer('canvasTemp');
            var _layer = PositionToLayer(_pos);
            if(!clear && _layer == selectedLayer) return;
            if(_layer){
                tempCtx.save();
                tempCtx.strokeStyle="#000000";
                tempCtx.lineWidth = 1;
                tempCtx.strokeRect(Math.floor(_layer.x), Math.floor(_layer.y), Math.ceil(_layer.width + 1), Math.ceil(_layer.height + 1));
                tempCtx.restore();
            }
        }
    }
    
    function EnableLayerButtons(){
        $('#layer-buttons').children('.btn').removeClass('disabled');
    }
    function DisableLayerButtons(){
        $('#layer-buttons').children('.btn').addClass('disabled');
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
            
            $('#layers [data-layer="'+ _layer[0].getAttribute('id') +'"]').addClass('selected').addClass('lastSelected');
            EnableLayerButtons();

            selectedLayer = _layer;
            ClearLayer('canvasTemp');
            
            DrawSelectedLayerOutline(_layer);
            
            if(settings.transition){
                $(_layer[0]).css('transition', 'none 0s');
            }
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
        'ctrl n': 'newDoc', // chrome overrides this
        'ctrl o': 'none',//'keyup event on body',
        'ctrl z': 'undo',
        'ctrl y': 'redo',
        'ctrl shift z': 'redo',
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
                    Tool(shortcutAction);
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
        DisableLayerButtons();
        if(selectedLayer){
            $('#layers [data-layer="'+ selectedLayer[0].getAttribute('id') +'"]').removeClass('selected').removeClass('lastSelected');
        }
        
        selectedLayer = null;
        action = undefined;
        dist.x = dist.y = 0;
        original.width = original.height = original.x = original.y = 0;

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

        $.each(layers, function(index, layer){
            if(undoLayers.indexOf(layer.name) == -1){
                toBeDeleted.push(layer.name);
            }
        });

        $.each(toBeDeleted, function(index, value){
            $('#' + value).remove();
            $('#layers [data-layer="'+ value +'"]').remove();
            delete layers[value];
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
                if(tool == 'select'){
                    DeselectLayer(selectedLayer);
                    OutLineLayer(mousePos, true);
                }
                if(tool == settings.tool) return;

                if(tool != 'brush' && tool != 'eraser'){
                    cursor.hide();
                    $temp.css('cursor', 'default');
                }
                ClosePopovers(null);
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
                            action: 'delete',
                            layer: selectedLayer[0].getAttribute('id'),
                            layerName: selectedLayer[0].getAttribute('id')
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
                    OutLineLayer(mousePos, true);
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
                                    window.undoStep = undoStep = 0;
                                    undo = [];
                                    undoLayers = [];
                                    undoData = {};
                                    zIndex = 0;
                                    checkForOrphanLayers();
                                    CheckUndoButtons();
                                },
                                text: 'Yes, I want a new document',
                                class: 'btn-danger btn-lg'
                            },
                            {
                                text: 'Cancel',
                                class: 'btn-default btn-lg',
                                dismiss: true
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
                    $(document).trigger('mousemove', {custom: true});
                    break;
                case 'brushSize+':
                    settings.lineWidth += settings.brushSizeIncrement;
                    if(settings.lineWidth > 100){
                        settings.lineWidth = 100;
                    }
                    brushSizeSlider.update({
                        from: settings.lineWidth
                    });
                    $(document).trigger('mousemove', {custom: true});
                    break;
                case 'deselect':
                    if(settings.tool == 'select') {
                        DeselectLayer();
                    }
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
    
    function DrawBrushOnLayer(mouse, type, ctx){
        ctx.lineWidth = settings.lineWidth;
        if(type == 'brush'){
            ctx.strokeStyle = settings.strokeColor;
            ctx.fillStyle = settings.strokeColor;
        }
        else{
            ctx.strokeStyle = settings.backgroundColor;
            ctx.fillStyle = settings.backgroundColor;
        }
        ctx.lineCap = tempCtx.lineJoin = 'round';
        
        if (points.length < 3) {
            var b = points[0];
            ctx.beginPath();
            ctx.arc(b.x, b.y, ctx.lineWidth / 2, 0, Math.PI * 2, false);
            ctx.fill();
            ctx.closePath();
            
            return;
        }
        
        ctx.clearRect(minMousePos.x, minMousePos.y, maxMousePos.x - minMousePos.x, maxMousePos.y - minMousePos.y);
        
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);

        for (var i = 0; i < points.length - 2; i++) {
            var c = (points[i].x + points[i + 1].x) / 2;
            var d = (points[i].y + points[i + 1].y) / 2;
            
            ctx.quadraticCurveTo(points[i].x, points[i].y, c, d);
        }
        
        // For the last 2 points
        ctx.quadraticCurveTo(
            points[i].x,
            points[i].y,
            points[i + 1].x,
            points[i + 1].y
        );
        ctx.stroke();
    }
    
    function AddToUndo(options){
        if(undo.length >= settings.undoLength){
            var amount = 1 + undo.length - settings.undoLength;
            var u = undo.splice(0, amount);
            window.undoStep = undoStep -= amount;
            
            if(u.action == 'pixelManipulation'){
                undoData[u.layerName].splice(0, amount);
            }
        }
        var removedLayers = undo.splice(undoStep, undo.length);
        $.each(removedLayers, function(index, removedLayer){
            if(removedLayer.layerName && undoLayers.indexOf(removedLayer.layerName) != -1){
                undoLayers.splice(undoLayers.indexOf(removedLayer.layerName), 1);
            }
        })
        if(options.layerName && undoLayers.indexOf(options.layerName) == -1){
            undoLayers.push(options.layerName);
        }
        window.undoStep = undoStep += 1;
        if(options.action == 'pixelManipulation'){
            addToUndoData(options.layer.name, options.layer);
            
            undo.push({
                action: 'pixelManipulation',
                layerName: options.layer.name
            });
        }
        else{
            undo.push(options);
        }
        if(undoStep > 0){
            $('.tool[data-action="undo"]', boardWrapper).removeClass('disabled');
        }
        if(undoStep == undo.length) {
            $('.tool[data-action="redo"]', boardWrapper).addClass('disabled');
        }
        if(options.action == 'delete'){
            if(typeof options.layer == 'string'){
                $('#layers [data-layer="'+ options.layer +'"]').hide();
                DisableLayerButtons();
            }
            else if (typeof options.layer == 'object'){
                if(options.layer.length){
                    for(var i = 0, l = options.layer.length; i < l; i++){
                        undoLayers.push(options.layer[i]);
                        $('#layers [data-layer="'+ options.layer[i] +'"]').hide();
                    }
                    DisableLayerButtons();
                }
            }
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

            var matrix = new Matrix();
            matrix.translate(_transform.x, _transform.y).scale(1,1);
            if(!_transform.width || !_transform.height){
                console.log('Transform received 0 or undefined width/height');
            }
            else{
                _transform.width = Math.max(0, _transform.width);
                _transform.height = Math.max(0, _transform.height);
                _layer.width = _transform.width;
                _layer.height = _transform.height;
                matrix.scale(_transform.width / original.width, _transform.height / original.height);
            }
            $(_layer[0]).css({
                'transform': matrix.toCSS(),
                '-webkit-transform': matrix.toCSS()
            });
            _layer.x = _transform.x;
            _layer.y = _transform.y;

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
                    var options = undo[undoStep - 1];
                    switch (options.action) {
                        case 'draw':
                            var layer = options.layer;
                            $('#'+ layer).hide();
                            $('#layers [data-layer="'+ layer +'"]').hide().removeClass('selected').removeClass('lastSelected');
                            break;
                        case 'delete':
                            var layer = options.layer;
                            $('#layers .selected').removeClass('selected');
                            if(typeof layer == 'string'){
                                $('#'+ layer).show();
                                $('#layers [data-layer="'+ layer +'"]').show().addClass('selected').addClass('lastSelected');
                            }
                            else if (typeof layer == 'object'){
                                if(layer.length){
                                    for(var i = 0, l = layer.length; i < l; i++){
                                        $('#'+ layer[i]).show();
                                        $('#layers [data-layer="'+ layer[i] +'"]').show().addClass('selected').addClass('lastSelected');
                                    }
                                }
                            }
                            EnableLayerButtons();
                            break;
                        case 'transform':
                            TransformLayer(options.layer, options.before);
                            ScaleCanvas(options.layer, options.before, options.after);
                            break;
                        case 'opacity':
                            selectedLayer = options.layer;
                            opacitySlider.update({
                                from: options.before * 100
                            });
                            selectedLayer = null;
                            $(options.layer[0]).css('opacity', options.before);
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
                    var options = undo[undoStep];
                    switch (options.action) {
                        case 'draw':
                            var layer = options.layer;
                            $('#'+ layer).show();
                            $('#layers [data-layer="'+ layer +'"]').show();
                            break;
                        case 'delete':
                            var layer = options.layer;
                            $('#layers .selected').removeClass('selected');
                            
                            if(typeof layer == 'string'){
                                $('#'+ layer).hide();
                                $('#layers [data-layer="'+ layer +'"]').hide().removeClass('selected').removeClass('lastSelected');
                            }
                            else if (typeof layer == 'object'){
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
                            TransformLayer(options.layer, options.after);
                            ScaleCanvas(options.layer, options.after , options.before);
                            break;
                        case 'opacity':
                            selectedLayer = options.layer;
                            opacitySlider.update({
                                from: options.after * 100
                            });
                            selectedLayer = null;
                            $(options.layer[0]).css('opacity', options.after);
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
        }

        CheckUndoButtons();
    }
    
    function addToUndoData(name, layer){
        if(layer && name){
            if(undoData[name] == undefined){
                undoData[name] = [];
            }
            if(layer[0] == undefined){
                undoData[name].push(layer);
            }
            else{
                var temp = {};
                temp.image = layer[0].toDataURL('image/png');
                temp.transform = {
                    x: layer.x,
                    y: layer.y,
                    width: layer.width,
                    height: layer.height
                }
                undoData[name].push(temp);
            }
        }
        else{
            console.warn('SaveToUndoData received an undefined param:', name, layer)
        }
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
    
    // modified from @remy version
    function trim(layer) {
        var ctx = layer[0].getContext('2d');
        var pixels = ctx.getImageData(0, 0, layer.width, layer.height);
        var bound = {
            top: null,
            left: null,
            right: null,
            bottom: null
        };
        var x, y;

        for (var i = 0, l = pixels.data.length; i < l; i += 4) {
            if (pixels.data[i+3] !== 0) {
                x = (i / 4) % layer.width;
                y = ~~((i / 4) / layer.width);

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
        
        var trimmed = ctx.getImageData(bound.left, bound.top, layer.width, layer.height);

        layer.x += bound.left;
        layer.y += bound.top;

        TransformLayer(layer, {
            x: layer.x,
            y: layer.y,
            width: layer.width,
            height: layer.height
        });
        layer.height = bound.bottom - bound.top;
        layer.width = bound.right - bound.left;

        layer.css({
            width: layer.width,
            height: layer.height
        }).attr({
            width: layer.width,
            height: layer.height
        });

        ctx.putImageData(trimmed, 0, 0);

        layer.css('transition', transitionContent);
    }


    function BrushMouseUp() {
        minMousePos.x = minMousePos.x - tempCtx.lineWidth / 2 - 1;
        minMousePos.y = minMousePos.y - tempCtx.lineWidth / 2 - 1;
        maxMousePos.x = maxMousePos.x + tempCtx.lineWidth / 2 + 1;
        maxMousePos.y = maxMousePos.y + tempCtx.lineWidth / 2 + 2;

        checkMinMaxMouse();
        
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
                ClearLayer('canvasTemp', {
                    x: minMousePos.x,
                    y: minMousePos.y,
                    width: maxMousePos.x - minMousePos.x,
                    height: maxMousePos.y - minMousePos.y
                });
                
                AddToUndo({
                    action: 'draw',
                    layer: newLayer.name,
                    layerName: newLayer.name,
                    transform: {
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
                if (dragged) {
                    tempCtx.closePath();
                }
                var tempLayers = [];
                var tWidth = p.x1 - p.x0;
                var tHeight = p.y1 - p.y0;
                
                $.each(layers, function(index, layer){
                    if(LayerBetweenPoints(layer, p)){
                        AddToUndo({
                            action: 'pixelManipulation',
                            layer: layer,
                            layerName: layer.name
                        });
                        var context = layer[0].getContext('2d');
                        context.save();
                        context.globalCompositeOperation = 'destination-out';
                        context.drawImage(temp, -1 * layer.x, -1 * layer.y);
                        context.restore();
                        layer.css('transition', 'none 0s');

//                        setTimeout(trim(layer), 1);
                    }
                });
                ClearLayer('canvasTemp');
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
                if(mousePos) MoveVirtualCursor(mousePos);
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
    
    function AddLayer(options, hasDimensions){
        var layerDefaults = {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
            zIndex: zIndex
        };
        var layerSettings = $.extend({}, layerDefaults, options);
        zIndex++;
        if(zIndex > 999){
            $temp.css('z-index', 1000 + zIndex - 999);
            cursor.css('z-index', 1001 + zIndex - 999);
            $('#tools, #currentTool, #layers', boardWrapper).css('z-index', 1004 + zIndex - 999);
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
            width: layerSettings.width,
            height: layerSettings.height,
            'z-index': zIndex
        }).appendTo(layersWrapper);
        var layerBlock = $('#layer-template').clone();
        layerBlock.find('.layer-name').html('Layer ' + zIndex);
        layerBlock.attr('data-layer', 'canvas-' + zIndex).removeAttr('id');
        layerBlock.prependTo($('#layers'));
        
        if(hasDimensions){
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
        newLayer['zIndex'] = layerSettings.zIndex;
        newLayer['matrix'] = matrix;
        newLayer['alpha'] = 1;
        newLayer['blendingMode'] = 'normal';
        
        layers[layerID] = newLayer;
        return newLayer;
    }
    function checkMinMaxMouse(){
        minMousePos.x = Math.floor(Math.max(0, Math.floor(minMousePos.x)));
        minMousePos.y = Math.floor(Math.max(0, Math.floor(minMousePos.y)));
        maxMousePos.x = Math.ceil(Math.min($temp.width(), maxMousePos.x));
        maxMousePos.y = Math.ceil(Math.min($temp.height(), maxMousePos.y));
    }
    
    function DrawTempCanvas(layer){
        checkMinMaxMouse();
        
        layer.width = maxMousePos.x - minMousePos.x;
        layer.height = maxMousePos.y - minMousePos.y;
        
        var ctx = layer[0].getContext('2d');
        
        var matrix = new Matrix();
        matrix.translate(minMousePos.x, minMousePos.y);
        layer.css({
            'transform': matrix.toCSS(),
            '-webkit-transform': matrix.toCSS(),
            width: layer.width,
            height: layer.height
        }).attr({
            'width': layer.width,
            'height': layer.height
        });
        layer.x = minMousePos.x;
        layer.y = minMousePos.y;
        
        ctx.drawImage(temp, minMousePos.x, minMousePos.y, layer.width, layer.height, 0, 0, layer.width, layer.height);
        
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
    
    function ClearLayer(layer, portion){
        if(!$temp[0]) setTimeout(function(){
            ClearLayer(layer, portion);
            // console.log('Plugin not ready, clear layer postponed by 10ms');
        }, 10);
        // console.log('Cleared layer '+ layer + ' called by: '+ (arguments.callee.caller.name ? (arguments.callee.caller.caller.name ? arguments.callee.caller.caller.name : arguments.callee.caller.name) : 'anonymous'));
        if (typeof layer == "number") {
            layer = 'canvas-' + layer;
        }
        if(portion){
            $('#' + layer)[0].getContext('2d').clearRect(portion.x, portion.y, portion.width, portion.height);
        }
        else{
            $('#' + layer)[0].getContext('2d').clearRect(0, 0, $('#' + layer).width(), $('#' + layer).height());
        }
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
            backgroundCtx.save();
            tempCtx.save();
            $background.attr({
                width: width,
                height: height
            }).css({
                width: width,
                height: height
            });
            $temp.attr({
                width: width,
                height: height
            }).css({
                width: width,
                height: height
            });

            settings.width = width;
            settings.height = height;

            backgroundCtx.fillStyle = settings.backgroundColor;
            backgroundCtx.rect(0, 0, width, height);
            backgroundCtx.fill();
            backgroundCtx.restore();
            tempCtx.restore();
            tempCtx.translate(-0.5, -0.5);
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
