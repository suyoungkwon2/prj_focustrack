// eslint.config.mjs
import js from "@eslint/js";
import globals from "globals";
import pluginReact from "eslint-plugin-react";

// 플랫 설정은 보통 배열을 직접 내보냅니다.
export default [
  // 1. ESLint의 기본 추천 규칙 적용 (@eslint/js)
  js.configs.recommended,

  // 2. React 플러그인의 추천 규칙 적용 (eslint-plugin-react)
  pluginReact.configs.flat.recommended,

  // 3. 프로젝트 전반적인 설정 (언어 옵션, 전역 변수 등)
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

  // 4. 특정 파일(예: Node.js 스크립트)을 위한 별도 설정 (선택 사항)
  {
     files: ["build.js"], // 빌드 스크립트에만 적용될 설정 예시
     languageOptions: {
       globals: {
         ...globals.node, // Node.js 환경의 전역 변수들 (require, process 등)
       }
     }
  }
];