import _ from 'lodash';
import classnames from 'classnames';

class Tool {
    constructor(options, parent) {
        _.merge(this, {
            end: false,
            disabled: false,
            action: false,
            selected: false,
            select: () => { },
            deselect: () => { },
            mouseDown: () => { },
            mouseMove: () => { },
            mouseUp: () => { },
            mouseLeave: () => { },
            load: () => { },
            name: '',
            icon: ''
        }, options);
        this.parent = parent;
        this.icon = this.icon.length > 0 ? this.icon : (options.icon ? options.icon : 'fa-' + options.name);

        this.mercuryCanvas = this.parent.mercuryCanvas;
        this.element = $('<div>', {
            class: classnames('tool', this.name, {
                end: this.end,
                disabled: this.disabled,
                first: this.first
            }),
            html: $('<i>', {
                class: classnames('fa', 'fa-fw', this.icon)
            })
        }).appendTo(this.parent.element);

        this.element.on('click', this.onClick.bind(this));

        setTimeout((function () {
            this.load();
            if (this.selected) this.onClick(true);
        }).bind(this));
    }
    onClick(e) {
        if (this.disabled) return;

        if (_.isObject(e) || e === true) this.select.bind(this)();

        if (this.action) return;

        if (this.parent.lastTool) {
            this.parent.lastTool.deselect();
        }
        this.parent.element.children('div').removeClass('selected');
        this.element.addClass('selected');
        this.parent.selectTool(this);
    }
    remove() {
        this.element.remove();
    }
    toggle(e) {
        if (e) this.element.removeClass('disabled');
        else this.element.addClass('disabled');
        this.disabled = !e;
    }
}

class Menu {
    constructor(options) {
        _.merge(this, {
            classes: '',
            fixed: false,
            orientation: {
                horizontal: false,
                vertical: false
            }
        }, options);

        if (this.fixed.length > 0 && !this.orientation.horizontal && !this.orientation.vertical) {
            this.orientation.horizontal = this.fixed == 'top' || this.fixed == 'bottom';
            this.orientation.vertical = this.fixed == 'left' || this.fixed == 'right';
        }

        var menu = $('<div>', {
            class: classnames('menu', {
                'horizontal': this.orientation.horizontal,
                'vertical': this.orientation.vertical
            }, this.classes, this.fixed)
        }).appendTo(this.parent.element);

        this.mercuryCanvas = this.parent;
        this.element = menu;
    }
    resize(options) {
        if (this.fixed.length > 0) {
            if (this.orientation.horizontal) {
                this.element.css({
                    width: options.width
                });
            }
            else {
                this.element.css({
                    top: options.topHeight,
                    height: options.height - options.menuHeight
                });
            }
        }
        else {
            // dragable menu, make sure it stays on screen
        }
    }
}

class Toolbar extends Menu {
    constructor(options) {
        super(options);
        this.element.addClass('toolbar');
        this.tools = [];

        if (options.tools && options.tools.length > 0) {
            this.addTools(options.tools);
        }
    }
    addTools(tools) {
        if (typeof tools != 'object' || tools.length === undefined) {
            tools = [tools];
        }
        var firstEnd = false;
        _.forIn(tools, (tool) => {
            if (tool.end && !firstEnd) {
                tool.first = true;
                firstEnd = true;
            }
            this.tools.push(new Tool(tool, this));
        });
    }
    removeTools(tools) {
        if (typeof tools == 'boolean') {
            tools = this.tools;
        }
        else if (typeof tools != 'object' || tools.length === undefined) {
            tools = [tools];
        }

        _.forIn(tools, (tool) => {
            var removedTools = _.remove(this.tools, {
                name: typeof tool == 'object' ? tool.name : tool
            });
            _.forIn(removedTools, (removedTool) => {
                removedTool.remove();
            });
        });
    }
    selectTool(e) {
        var activeTools = this.parent.state.activeTools;
        if (this.lastTool) {
            activeTools.splice(activeTools.indexOf(this.lastTool), 1);
        }
        this.lastTool = e;
        activeTools.push(e);
    }
    toggleTool(e) {
        if (!_.isObject(e) || !_.has(e, 'name' || !_.has(e, 'state'))) return;

        _.forIn(this.tools, (tool) => {
            if (tool.name != e.name) return;
            tool.toggle(e.state);
        });
    }
}

class LayerThumbnail {
    constructor(options) {
        this.layer = options.layer;
        this.wrapper = $('<div>', {
            class: 'layer'
        });

        this.visibleIcon = $('<i>', {
            class: classnames('fa', 'fa-fw', {
                'fa-eye': this.layer.visible,
                'fa-eye-slash': !this.layer.visible
            })
        });
        this.visibleIconWrapper = $('<div>', {
            class: 'visible',
            html: this.visibleIcon
        }).appendTo(this.wrapper);

        this.thumbnail = $('<div>', {
            class: 'thumbnail'
        }).append($('<div>', {
            class: 'transparent'
        })).append($('<div>', {
            class: 'image',
            style: `background-image: url("${this.layer.canvas.toDataURL()}")`
        })).appendTo(this.wrapper);
        this.thumbnail = this.thumbnail.children('.image');

        this.name = $('<div>', {
            class: 'name',
            html: this.layer.name
        }).appendTo(this.wrapper);

        this.visibleIconWrapper.on('click', this.layer.toggleVisibility);

        this.wrapper.prependTo(options.parent);
    }
    update() {
        this.visibleIcon.attr('class', classnames('fa', 'fa-fw', {
            'fa-eye': this.layer.visible,
            'fa-eye-slash': !this.layer.visible
        }));

        this.thumbnail.css('background-image', `url("${this.layer.canvas.toDataURL()}")`);
        this.name.html(this.layer.name);
    }
    remove() {
        this.wrapper.remove();
    }
}

class LayersPanel extends Menu {
    constructor(options) {
        super(options);
        var self = this;
        this.element.addClass('layersPanel');

        this.layersList = $('<div>', {
            class: 'layersList'
        }).appendTo(this.element);
        this.thumbnails = [];
        var mc = this.mercuryCanvas;

        _.forIn(mc.layers.list, (layer) => {
            this.thumbnails.push(new LayerThumbnail({
                layer: layer,
                parent: this.layersList
            }));
        });

        mc.on('layer.new', (layer) => {
            self.thumbnails.push(new LayerThumbnail({
                layer: layer,
                parent: self.layersList
            }));
        });
        mc.on('layer.remove', (layer) => {
            _.remove(self.thumbnails, (thumbnail) => {
                if (thumbnail.layer != layer) return false;

                thumbnail.remove();
                return true;
            });
        });
        mc.on('layer.update', (layer) => {
            _.forIn(self.thumbnails, (thumbnail) => {
                if (thumbnail.layer != layer) return;

                thumbnail.update();
            });
        });
    }
}

export {Toolbar, LayersPanel};