const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const projectNodeModules = path.resolve(projectRoot, 'node_modules');
const workspaceNodeModules = path.resolve(workspaceRoot, 'node_modules');
const reactNativeNodeModules = path.resolve(workspaceNodeModules, 'react-native', 'node_modules');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [...new Set([...(config.watchFolders ?? []), workspaceRoot])];
config.resolver = {
  ...config.resolver,
  disableHierarchicalLookup: true,
  nodeModulesPaths: [projectNodeModules, workspaceNodeModules, reactNativeNodeModules],
  extraNodeModules: {
    ...(config.resolver.extraNodeModules ?? {}),
    react: path.resolve(workspaceNodeModules, 'react'),
    'react/jsx-runtime': path.resolve(workspaceNodeModules, 'react/jsx-runtime'),
    'react/jsx-dev-runtime': path.resolve(workspaceNodeModules, 'react/jsx-dev-runtime'),
    'react-native': path.resolve(workspaceNodeModules, 'react-native'),
    '@react-native/virtualized-lists': path.resolve(reactNativeNodeModules, '@react-native/virtualized-lists')
  },
  unstable_enablePackageExports: false
};

module.exports = config;
