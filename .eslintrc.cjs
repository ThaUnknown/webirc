/** @type { import("eslint").Linter.Config } */
module.exports = {
  globals: {
    launchQueue: 'readonly',
    FileSystemHandle: 'readonly',
    FileSystemFileHandle: 'readonly',
    FileSystemDirectoryHandle: 'readonly',
    FileSystemWritableFileStream: 'readonly',
    ClipboardItem: 'readonly',
    queryLocalFonts: 'readonly'
  },
  root: true,
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:svelte/recommended',
    'standard'
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  parserOptions: {
    sourceType: 'module',
    ecmaVersion: 2020,
    extraFileExtensions: ['.svelte']
  },
  env: {
    browser: true,
    es2017: true,
    node: true,
    es2022: true,
    worker: true,
    serviceworker: true
  },
  overrides: [
    {
      files: ['*.svelte'],
      parser: 'svelte-eslint-parser',
      parserOptions: {
        parser: '@typescript-eslint/parser'
      },
      rules: {
        'svelte/indent': [
          'error',
          {
            indent: 2,
            indentScript: true
          }
        ],
        'no-self-assign': 0,
        'a11y-media-has-caption': 0,
        'no-use-before-define': 0,
        'svelte/html-self-closing': [
          'error',
          'always'
        ],
        'svelte/html-closing-bracket-spacing': [
          'error',
          {
            startTag: 'never',
            endTag: 'never',
            selfClosingTag: 'always'
          }
        ],
        'svelte/html-quotes': [
          'error',
          {
            prefer: 'single',
            dynamic: {
              quoted: false,
              avoidInvalidUnquotedInHTML: false
            }
          }
        ],
        'svelte/shorthand-attribute': [
          'warn',
          {
            prefer: 'always'
          }
        ],
        'svelte/spaced-html-comment': [
          'error',
          'always'
        ]
      }
    }
  ]
}
