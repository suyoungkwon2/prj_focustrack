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
    files: ["**/*.{js,mjs,cjs,jsx}"], // 이 설정이 적용될 파일들
    languageOptions: {
      globals: {
        ...globals.browser, // 브라우저 환경의 전역 변수들 (window, document 등)
        chrome: "readonly" // Chrome 확장 프로그램 API (chrome.*) 전역 변수 추가
      }
    },
    // 여기에 프로젝트 전체에 적용할 규칙 오버라이드 등을 추가할 수 있습니다.
    // 예시:
    // rules: {
    //   "no-unused-vars": "warn"
    // }
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