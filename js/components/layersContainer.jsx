'use strict';
import React from 'react';
import store from '../store.js';
import Layer from './layer.jsx';

class LayersContainer extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            list: []
        };

        store.subscribe(() => {
            var state = store.getState();
            this.setState({
                list: state.layers.list
            });
        });
    }
    render() {
        console.log('Layers container re-render');
        return (
            <div className="layersContainer">
                {
                    this.state.list.map((layer, index) => <Layer layerObject={layer} key={index} />)
                }
            </div>
        );
    }
}
LayersContainer.propTypes = {
    layers: React.PropTypes.object
};

export default LayersContainer;