var onmessage = function (e) {
    if (!e) {
        var init = {
            id: 'init',
            event: 'data',
            data: 'Worker init'
        };

        postMessage(init);
        init.event = 'finish';
        //return postMessage(init);
    }
    //postMessage(e.data);
};

onmessage();
