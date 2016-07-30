'use strict';

var Kernels = {};
Kernels.Blur = {
    mean: function (e) {
        var arr = [];
        for (var i = 0; i < e; i++) {
            arr[i] = [];
            for (var ii = 0; ii < e; ii++) {
                arr[i][ii] = 1;
            }
        }
        return arr;
    },
    gaussian: function (e) {
        var arr = [];
        for (var i = 0; i < e; i++) {
            arr[i] = [];
            for (var ii = 0; ii < e; ii++) {
                if (ii === 0) {
                    arr[i][ii] = ((i === 0 || i === e - 1) ? 1 : 2 * i);
                }
                else if (ii < Math.ceil(e / 2)) {
                    arr[i][ii] = arr[i][ii - 1] * 2;
                }
                else {
                    arr[i][ii] = arr[i][ii - 1] / 2;
                }
            }
        }
        return arr;
    }
};
Kernels.Edge = {
    Sobel: {
        horizontal: function () {
            return [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];
        },
        vertical: function () {
            return [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
        }
    }
};
export default Kernels;