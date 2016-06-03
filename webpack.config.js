var webpack = require('webpack');
var autoprefixer = require('autoprefixer');
var precss = require('precss');

var exp = {
    devServer: {
        host: '0.0.0.0',
        port: 80,
        historyApiFallback: {
            index: '/'
        }
    },
    entry: [
        './index.js'
    ],
    output: {
        path: './assets/',
        filename: 'bundle.js',
        publicPath: '/assets/'
    },
    amd: {
        jQuery: true
    },
    module: {
        preLoaders: [
            { test: /\.js?$/, exclude: /node_modules/, loader: 'eslint-loader' }
        ],
        loaders: [
            {
                test: /\.js?$/,
                exclude: /node_modules/,
                loader: 'babel-loader',
                query: {
                    presets: ['es2015']
                }
            },
            { test: /\.png$/, loader: 'url-loader?limit=10000&minetype=image/png' },
            { test: /\.jpg$/, loader: 'url-loader?limit=10000&minetype=image/jpg' },
            { test: /\.gif$/, loader: 'url-loader?limit=10000&minetype=image/gif' },
            {
                test: /\.scss$/,
                loaders: ['style', 'css', 'postcss', 'sass']
            },
            { test: /\.css$/, loaders: ['style', 'css', 'postcss'] },
            {
                test: /\.(eot|svg|ttf|woff(2)?)(\?v=\d+\.\d+\.\d+)?/,
                loader: 'file'
            }
        ]
    },
    postcss: function () {
        return [autoprefixer, precss];
    },
    plugins: [
        new webpack.HotModuleReplacementPlugin()
    ],
    externals: {},
    resolve: {
        extensions: ['', '.js']
    }
};

module.exports = exp;