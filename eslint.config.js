import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    settings: { react: { version: '18.3' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/jsx-no-target-blank': 'off',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Projeto usa JS vanilla (sem PropTypes nem TypeScript). Validacao
      // de props fica a cargo de convencoes de codigo e testes, nao da lint.
      'react/prop-types': 'off',
      // React 17+ JSX transform nao precisa do import de React.
      'no-unused-vars': ['error', { varsIgnorePattern: '^React$' }],
      // Atributos HTML reais pra compatibilidade com players mobile (iOS, X5/QQ).
      'react/no-unknown-property': [
        'error',
        { ignore: ['webkit-playsinline', 'x5-playsinline'] },
      ],
    },
  },
  // Backend Node (server.js, db/*, server/**) — acesso a process.env, etc.
  {
    files: ['server.js', 'db/**/*.js', 'server/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
]
