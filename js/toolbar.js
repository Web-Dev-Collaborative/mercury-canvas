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

        if (this.parent.lastTool) {
            this.parent.lastTool.deselect();
        }
        if (_.isObject(e) || e === true) this.select.bind(this)();

        if (this.action) return;
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

class Toolbar {
    constructor(options) {
        _.merge(this, {
            classes: '',
            fixed: false,
            orientation: {
                horizontal: false,
                vertical: false
            },
            tools: []
        }, options);

        if (this.fixed.length > 0 && !this.orientation.horizontal && !this.orientation.vertical) {
            this.orientation.horizontal = this.fixed == 'top' || this.fixed == 'bottom';
            this.orientation.vertical = this.fixed == 'left' || this.fixed == 'right';
        }

        var toolbar = $('<div>', {
            class: classnames('toolbar', {
                'horizontal': this.orientation.horizontal,
                'vertical': this.orientation.vertical
            }, this.classes, this.fixed)
        }).appendTo(this.parent.element);

        this.mercuryCanvas = this.parent;
        this.element = toolbar;
        this.tools = [];

        if (options.tools && options.tools.length > 0) {
            this.addTools(options.tools);
        }
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
export default Toolbar;