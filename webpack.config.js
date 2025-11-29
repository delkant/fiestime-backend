const path = require('path');

module.exports = {
  target: 'node',
  mode: 'production',
  entry: './dist/handlers/graphql.js',
  output: {
    path: path.resolve(__dirname, 'lambda-dist'),
    filename: 'index.js',
    libraryTarget: 'commonjs2',
  },
  externals: {
    // AWS SDK is provided by Lambda runtime - exclude completely
    'aws-sdk': 'aws-sdk',
    '@aws-sdk/client-s3': '@aws-sdk/client-s3',
    '@aws-sdk/s3-request-presigner': '@aws-sdk/s3-request-presigner',
    // Keep only essential dependencies bundled
  },
  resolve: {
    extensions: ['.js', '.json'],
  },
  optimization: {
    minimize: true,
    nodeEnv: 'production',
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', {
                targets: {
                  node: '20'
                }
              }]
            ]
          }
        }
      }
    ]
  },
  stats: 'minimal'
};