// eslint.config.mjs
import js from "@eslint/js";
import globals from "globals";

export default [
    // 1. ESLint의 기본 추천 규칙 적용
    js.configs.recommended,

    // 2. 프로젝트 전반적인 설정
    {
        files: ["**/*.js"],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.es2021,
                ...globals.node,
                chrome: 'readonly',
                process: 'readonly'
            }
        },
        rules: {
            'no-console': 'off',
            'no-unused-vars': 'warn',
            'no-undef': 'error',
            'semi': ['error', 'always'],
            'quotes': ['error', 'single', { 'avoidEscape': true }],
            'no-useless-escape': 'off'
        }
    }
];