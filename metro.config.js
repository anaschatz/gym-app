const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Keep Metro away from noisy/generated paths without blocking Expo internals.
config.resolver.blockList = [
  /node_modules\/(?!expo\/node_modules(?:\/|$)).*\/node_modules/,
  /HorizontalRule/,
  /\.git\/.*/
];

module.exports = config;
