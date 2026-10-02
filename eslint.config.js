import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import react from 'eslint-plugin-react';
import importPlugin from 'eslint-plugin-import';
import security from 'eslint-plugin-security';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'server/dist', 'node_modules', 'data', 'uploads', 'server/src/services/stageSkills/vendor'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      react,
      import: importPlugin,
      security,
    },
    settings: {
      react: { version: 'detect' },
      'import/resolver': {
        typescript: true,
        node: true,
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...security.configs.recommended.rules,
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true }],
      '@typescript-eslint/no-explicit-any': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      // 导入检查（关闭 resolver 相关误报，保留顺序检查）
      'import/no-unresolved': 'off',
      'import/no-duplicates': 'off',
      'import/order': 'off',
      // 安全检查（本地桌面应用，动态文件路径是业务必需，关闭误报规则）
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-regexp': 'warn',
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-eval-with-expression': 'error',
      'security/detect-child-process': 'warn',
      'security/detect-no-csrf-before-method-override': 'off',
      'security/detect-unsafe-regex': 'warn',
      // React 最佳实践
      'react/no-unescaped-entities': ['error', { forbid: ['>', '"', '}'] }],
    },
  },
  // Context 文件按 React 惯例同时导出 Provider 组件与 useXxx Hook，属预期模式
  {
    files: ['src/contexts/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  // Node 脚本（.mjs/.cjs，如 VoiceStudio 安装脚本）声明 Node 全局，避免 no-undef 误报
  {
    files: ['**/*.{mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.node },
    },
  }
);
