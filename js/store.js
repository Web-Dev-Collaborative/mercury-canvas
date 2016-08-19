function layersReducer(state = { list: [] }, action) {
    console.log('layerReducer was called with state', state, 'and action', action);

    switch (action.type) {
        case 'new':
            state.list.push({
                name: 'test'
            });
            break;
        case 'modify':
            state.list[action.id] = {
                name: 'test2'
            };
            break;
    }
    return state;
}

import { createStore, combineReducers } from 'redux';

var reducer = combineReducers({
    layers: layersReducer
});
var store = createStore(reducer);

export default store;