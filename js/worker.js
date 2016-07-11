/* eslint no-unused-vars: 0 */
import _ from 'lodash';

global.onmessage = (e) => {
    if (!e) {
        var init = {
            id: 'init',
            event: 'data',
            data: 'Worker init'
        };

        global.postMessage(init);
        init.event = 'finish';
        return postMessage(init);
    }
    
    var data = e.data;
    if (_.isFunction(global[data.which])) global[data.which](data);
};
global.onmessage();

global.active = (data) => {
    postMessage({
        id: data.id,
        event: 'progress',
        progress: 0.99 + 0.01
    });
    postMessage({
        id: data.id,
        event: 'data',
        data: 'Success'
    });
    postMessage({
        id: data.id,
        event: 'finish'
    });
};