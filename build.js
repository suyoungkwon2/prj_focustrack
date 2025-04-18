// build.js
const fs = require('fs-extra'); // 파일/폴더 작업용 라이브러리
const zipper = require('zip-local'); // 폴더 압축 라이브러리
const path = require('path'); // 경로 관련 작업용 내장 모듈
const manifest = require('./manifest.json'); // manifest 파일 로드 (버전 정보 등 활용 가능)

const DIST_DIR = path.join(__dirname, 'dist'); // 빌드 결과물이 저장될 폴더 경로
const ZIP_FILENAME = `focustrack-${manifest.version}.zip`; // 압축 파일 이름 (버전 포함)
const ZIP_PATH = path.join(__dirname, ZIP_FILENAME); // 최종 압축 파일 경로

// 빌드에 포함할 파일 및 폴더 목록 (사용자님의 프로젝트 구조에 맞게 조정 필요)
const FILES_TO_INCLUDE = [
    'manifest.json',
    'background.js',
    'content.js',
    'viewer.html',
    'firebase-config.js',
    // 아이콘, 이미지, 스타일시트 등 필요한 다른 리소스 파일/폴더 경로 추가
    // 예: 'icons/', 'images/', 'styles/'
];

async function buildExtension() {
    try {
        // 1. 기존 dist 폴더 삭제 및 재생성
        console.log(`[BUILD] Clearing existing dist directory: ${DIST_DIR}`); // [빌드] 기존 dist 디렉토리 정리 중
        await fs.remove(DIST_DIR);
        await fs.ensureDir(DIST_DIR);
        console.log(`[BUILD] Created dist directory: ${DIST_DIR}`); // [빌드] dist 디렉토리 생성 완료

        // 2. 필요한 파일들을 dist 폴더로 복사
        console.log(`[BUILD] Copying files to dist directory...`); // [빌드] dist 디렉토리로 파일 복사 중...
        for (const fileOrDir of FILES_TO_INCLUDE) {
            const sourcePath = path.join(__dirname, fileOrDir);
            const destPath = path.join(DIST_DIR, fileOrDir);
            if (await fs.pathExists(sourcePath)) {
                await fs.copy(sourcePath, destPath);
                console.log(`  - Copied: ${fileOrDir}`); //   - 복사됨: {파일/디렉토리명}
            } else {
                console.warn(`  - Warning: Source not found, skipping: ${fileOrDir}`); //   - 경고: 소스를 찾을 수 없어 건너뜀: {파일/디렉토리명}
            }
        }

        // --- ★★★ 중요: API 키 보안 경고 ★★★ ---
        // 현재 방식으로는 firebase-config.js 와 background.js 에 포함된 API 키들이
        // 빌드 결과물(.zip 파일)에 그대로 포함됩니다. 이는 매우 심각한 보안 문제입니다.
        // 이 키들이 유출되면 악의적인 사용으로 이어질 수 있습니다.
        // CI/CD 적용 전에 반드시 이 문제를 해결해야 합니다. (예: 백엔드 프록시 사용)
        console.warn(`[BUILD] ★★★ SECURITY WARNING ★★★: API keys are likely included in the build output!`);
        console.warn(`[BUILD] Review and implement secure API key handling (e.g., using a backend proxy) before deploying.`);
        // [빌드] ★★★ 보안 경고 ★★★: API 키가 빌드 결과물에 포함될 가능성이 높습니다!
        // [빌드] 배포 전에 안전한 API 키 처리 방식(예: 백엔드 프록시 사용)을 검토하고 구현하십시오.

        // 3. dist 폴더를 .zip 파일로 압축
        console.log(`[BUILD] Zipping dist directory to ${ZIP_PATH}...`); // [빌드] dist 디렉토리를 {압축 파일 경로}로 압축 중...
        await zipper.sync.zip(DIST_DIR).compress().save(ZIP_PATH);
        console.log(`[BUILD] Successfully created zip file: ${ZIP_FILENAME}`); // [빌드] zip 파일 생성 성공: {압축 파일 이름}

    } catch (error) {
        console.error('[BUILD] Build failed:', error); // [빌드] 빌드 실패:
        process.exit(1); // 오류 발생 시 프로세스 종료 (CI 환경에서 실패를 알림)
    }
}

buildExtension();