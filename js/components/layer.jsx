'use strict';
import React from 'react';
import classnames from 'classnames';
import {Matrix} from 'transformation-matrix-js';
import _ from 'lodash';

class Layer extends React.Component {
    constructor(props) {
        super(props);
        this.matrix = new Matrix();
        this.parseLayerProp = this.parseLayerProp.bind(this);
        this.state = {
            name: '',
            classNames: '',
            dirty: false,
            removable: true,
            visible: true,
            zIndex: 0
        };
        this.state = this.parseLayerProp(props.layerObject);
    }
    parseLayerProp(layer) {
        return _.merge({}, this.state, layer);
    }
    componentDidMount() {
        this.context = this.refs.canvas.getContext('2d');
    }
    componentWillReceiveProps(nextProps) {
        this.setState(this.parseLayerProp(nextProps.layerObject));
    }
    shouldComponentUpdate(nextProps, nextState) {
        return !_.isUndefined(nextState);
    }
    render() {
        var canvasClasses = classnames('layer', this.state.classNames);
        var style = {
            zIndex: this.state.zIndex,
            transform: this.matrix.toCSS()
        };
        return (
            <canvas className={canvasClasses} width={this.state.width} height={this.state.height} style={style} ref="canvas"></canvas>
        );
    }
}
Layer.propTypes = {
    layerObject: React.PropTypes.object
};

export default Layer;