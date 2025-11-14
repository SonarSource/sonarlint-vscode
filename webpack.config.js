/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
//@ts-check

'use strict';

const path = require('path');

/**@type {import('webpack').Configuration}*/
const config = {
  // vscode extensions run in a Node.js-context -> https://webpack.js.org/configuration/node/
  target: 'node',

  // the entry point of this extension -> https://webpack.js.org/configuration/entry-context/
  entry: './src/extension.ts',
  output: {
    // the bundle is stored in the 'dist' folder (check package.json) -> https://webpack.js.org/configuration/output/
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: '../[resource-path]'
  },
  devtool: 'source-map',
  externals: {
    // the vscode-module is created on-the-fly and must be excluded. Add other modules that cannot be webpack'ed
    // -> https://webpack.js.org/configuration/externals/
    vscode: 'commonjs vscode'
  },
  resolve: {
    mainFields: ['browser', 'module', 'main'],
    // support reading TypeScript and JavaScript files -> https://github.com/TypeStrong/ts-loader
    extensions: ['.ts', '.js']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader'
          }
        ]
      }
    ]
  },
  plugins: []
};

module.exports = (env, argv) => {

  if (
    // Only for production builds (e.g. CI)
    argv.mode === 'production' &&
    // Injected by Vault
    process.env.SENTRY_UPLOAD_TOKEN &&
    // Injected by CI
    process.env.BUILD_NUMBER
  ) {
    console.log('Enabling Sentry upload plugin');
    /**@type {import('webpack').WebpackPluginFunction}*/
    const { sentryWebpackPlugin } = require('@sentry/webpack-plugin');
    const { version } = require('./package.json');

    config.plugins.push(sentryWebpackPlugin({
      org: 'sonar-x0',
      project: 'sonarqube-vscode',
      authToken: process.env.SENTRY_UPLOAD_TOKEN,
      release: {
        name: `${version}+${process.env.BUILD_NUMBER}`,
      }
    }));
  } else {
    console.log('Not enabling Sentry upload plugin');
  }

  return config;
}
