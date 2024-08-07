const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const path = require('path')
const webpack = require('webpack')

const mode = process.env.NODE_ENV || 'development'
const prod = mode === 'production'

module.exports = {
  entry: {
    'build/bundle': ['./src/main.js']
  },
  resolve: {
    fallback: {
      // Fallback modules for node internals when building with webpack5
      stream: require.resolve('stream-browserify'),
      buffer: require.resolve('buffer/'),
      util: require.resolve('util/')
    },
    alias: {
      svelte: path.resolve('node_modules', 'svelte/src/runtime')
    },
    extensions: ['.mjs', '.js', '.svelte', '.ts'],
    mainFields: ['svelte', 'browser', 'module', 'main'],
    conditionNames: ['svelte', 'browser']
  },
  output: {
    path: path.join(__dirname, '/out'),
    filename: '[name].js',
    chunkFilename: '[name].[id].js'
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              transpileOnly: true
            }
          }
        ]
      },
      {
        test: /\.svelte$/,
        use: {
          loader: 'svelte-loader',
          options: {
            compilerOptions: {
              dev: !prod
            },
            emitCss: prod,
            hotReload: !prod,
            preprocess: require('svelte-preprocess')({})
          }
        }
      },
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader'
        ]
      }
    ]
  },
  mode,
  plugins: [
    new webpack.ProvidePlugin({
      process: 'process-fast'
    }),
    new webpack.DefinePlugin({
      global: 'globalThis'
    }),
    new MiniCssExtractPlugin({
      filename: '[name].css'
    })
  ],
  devtool: prod ? false : 'source-map',
  devServer: {
    hot: true,
    static: {
      directory: path.join(__dirname, 'public')
    },
    client: {
      overlay: {
        warnings: false,
        errors: false
      }
    }
  }
}
