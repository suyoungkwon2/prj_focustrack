// build.js
import fs from 'fs-extra'; // 파일/폴더 작업용 라이브러리
import archiver from 'archiver'; // 압축 라이브러리
import path from 'path'; // 경로 관련 작업용 내장 모듈
// import manifest from './manifest.json' assert { type: 'json' }; // Use fs.readFileSync instead

const __dirname = path.dirname(new URL(import.meta.url).pathname); // ES 모듈에서 __dirname 정의

// Read manifest.json using fs
const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

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
    'icon.png',
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

        // 3. dist 폴더를 .zip 파일로 압축
        console.log(`[BUILD] Zipping dist directory to ${ZIP_PATH}...`); // [빌드] dist 디렉토리를 {압축 파일 경로}로 압축 중...
        const output = fs.createWriteStream(ZIP_PATH);
        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        output.on('close', () => {
            console.log(`[BUILD] Successfully created zip file: ${ZIP_FILENAME}`); // [빌드] zip 파일 생성 성공: {압축 파일 이름}
        });

        archive.on('error', (err) => {
            throw err;
        });

        archive.pipe(output);
        archive.directory(DIST_DIR, false);
        await archive.finalize();

    } catch (error) {
        console.error('[BUILD] Build failed:', error); // [빌드] 빌드 실패:
        process.exit(1); // 오류 발생 시 프로세스 종료 (CI 환경에서 실패를 알림)
    }
}

buildExtension();