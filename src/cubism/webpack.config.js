const path = require('path');

module.exports = {
    mode: 'production',
    entry: './src/cubism/cubism.js',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
    },
    output: {
        filename: 'cubism.js',
        path: path.resolve(__dirname, '../../public/resources/cubism'),
    },
};