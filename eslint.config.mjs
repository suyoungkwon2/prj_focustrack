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
                chrome: 'readonly'
            }
        },
        rules: {
            'no-console': 'warn',
            'no-unused-vars': 'warn',
            'no-undef': 'error',
            'semi': ['error', 'always'],
            'quotes': ['error', 'single']
        }
    },

    // 3. Node.js 스크립트를 위한 설정
    {
        files: ["build.js"],
        languageOptions: {
            globals: {
                ...globals.node
            }
        }
    }
];