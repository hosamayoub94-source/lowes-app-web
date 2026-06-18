module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'node_modules'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  settings: { react: { version: '18.3' } },
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
    'react/prop-types': 'off',
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
  overrides: [
    {
      // Node-run config/tooling files (use process/require/module).
      files: ['*.config.js', 'vite.config.js', 'tailwind.config.js', 'postcss.config.js'],
      env: { node: true },
    },
    {
      // Service worker runs in the ServiceWorkerGlobalScope (self/clients/caches).
      files: ['src/sw.js'],
      env: { serviceworker: true, browser: true },
    },
  ],
};
