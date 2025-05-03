// build.js
import fs from 'fs-extra'; // 파일/폴더 작업용 라이브러리
import archiver from 'archiver'; // 압축 라이브러리
import path from 'path'; // 경로 관련 작업용 내장 모듈
import { execSync } from 'child_process'; // To run shell commands like npm

// import manifest from './manifest.json' assert { type: 'json' }; // Use fs.readFileSync instead

const __dirname = path.dirname(new URL(import.meta.url).pathname); // ES 모듈에서 __dirname 정의

// Read manifest.json using fs
const manifestPath = path.join(__dirname, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

const ROOT_DIST_DIR = path.join(__dirname, 'dist'); // Root build output directory
const FRONTEND_DIR = path.join(__dirname, 'frontend');
const FRONTEND_DIST_DIR = path.join(FRONTEND_DIR, 'dist'); // Frontend build output directory

const ZIP_FILENAME = `focustrack-${manifest.version}.zip`; // 압축 파일 이름 (버전 포함)
const ZIP_PATH = path.join(__dirname, ZIP_FILENAME); // 최종 압축 파일 경로

// Root files/dirs to copy directly to dist
const FILES_TO_INCLUDE = [
    'manifest.json',
    'background.js',
    'content.js',
    'viewer.html',
    'firebase-config.js',
    'youtubedataextraction/', // Include the whole directory needed by background.js
    'icon.png', // Add icon.png back
    // Removed frontend/index.html as it will come from frontend/dist
];

async function buildExtension() {
    try {
        // 0. Build the frontend first
        console.log(`[BUILD] Building frontend in ${FRONTEND_DIR}...`);
        try {
            console.log(`[BUILD] Running npm install in ${FRONTEND_DIR}...`);
            execSync('npm install', { cwd: FRONTEND_DIR, stdio: 'inherit' }); // Show output
            console.log(`[BUILD] Running npm run build in ${FRONTEND_DIR}...`);
            execSync('npm run build', { cwd: FRONTEND_DIR, stdio: 'inherit' }); // Show output
            console.log(`[BUILD] Frontend build completed successfully.`);
        } catch (frontendError) {
            console.error('[BUILD] Frontend build failed:', frontendError);
            process.exit(1);
        }

        // 1. 기존 root dist 폴더 삭제 및 재생성
        console.log(`[BUILD] Clearing existing root dist directory: ${ROOT_DIST_DIR}`);
        await fs.remove(ROOT_DIST_DIR);
        await fs.ensureDir(ROOT_DIST_DIR);
        console.log(`[BUILD] Created root dist directory: ${ROOT_DIST_DIR}`);

        // 2. 필요한 Root 파일들을 dist 폴더로 복사
        console.log(`[BUILD] Copying root files to dist directory...`);
        for (const fileOrDir of FILES_TO_INCLUDE) {
            const sourcePath = path.join(__dirname, fileOrDir);
            const destPath = path.join(ROOT_DIST_DIR, fileOrDir);
            if (await fs.pathExists(sourcePath)) {
                await fs.copy(sourcePath, destPath);
                console.log(`  - Copied root item: ${fileOrDir}`);
            } else {
                // Allow missing files like icon.png if they were optional
                console.warn(`  - Warning: Root source not found, skipping: ${fileOrDir}`);
            }
        }

        // 3. Copy built frontend assets from frontend/dist to root dist
        console.log(`[BUILD] Copying built frontend assets from ${FRONTEND_DIST_DIR} to ${ROOT_DIST_DIR}...`);
        if (await fs.pathExists(FRONTEND_DIST_DIR)) {
             await fs.copy(FRONTEND_DIST_DIR, ROOT_DIST_DIR); // Copy contents into root dist
             console.log(`  - Copied frontend build output.`);
        } else {
             console.error(`  - Error: Frontend build output directory not found: ${FRONTEND_DIST_DIR}`);
             process.exit(1); // Fail build if frontend output is missing
        }

        // 4. dist 폴더를 .zip 파일로 압축
        console.log(`[BUILD] Zipping dist directory to ${ZIP_PATH}...`);
        const output = fs.createWriteStream(ZIP_PATH);
        const archive = archiver('zip', {
            zlib: { level: 9 }
        });

        output.on('close', () => {
            console.log(`[BUILD] Successfully created zip file: ${ZIP_FILENAME}`);
        });

        archive.on('error', (err) => {
            throw err;
        });

        archive.pipe(output);
        archive.directory(ROOT_DIST_DIR, false); // Add files from root dist directly
        await archive.finalize();

    } catch (error) {
        console.error('[BUILD] Build failed:', error);
        process.exit(1);
    }
}

buildExtension();