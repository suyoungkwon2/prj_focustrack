// tests/digital_routine/test_hourly_blocks.js

// 필요한 함수 및 Firebase 설정 import
// 주의: 이 테스트 스크립트를 실행하려면 백그라운드 스크립트 환경이나
// 유사한 환경(chrome API 및 모듈 import 가능)에서 실행해야 할 수 있습니다.
import { db, collection, query, where, getDocs, orderBy } from '../../firebase-config.js'; // 경로 수정됨
import { calculateMajorCategoryForBlock, get10MinBlockIndex, get10MinBlockTimeRange, BLOCKS_PER_DAY } from '../features/digital_routine/routineCalculator.js'; // 경로 수정됨
import { getFocusSessionsByPeriod } from '../../background.js'; // 경로 수정됨

// 백그라운드 스크립트 또는 개발자 도구 콘솔에서 이 함수를 호출하여 테스트합니다.
// 예: import('./src/tests/digital_routine/test_hourly_blocks.js').then(module => module.runHourlyBlockTest()); // import 경로 예시 업데이트
export async function runHourlyBlockTest() {
  console.log("[TEST HourlyBlocks] Starting test (checking last 6 blocks)...");

  // calculateMajorCategoryForBlock 등이 제대로 import 되었는지 확인
  if (typeof calculateMajorCategoryForBlock !== 'function' || typeof get10MinBlockIndex !== 'function') {
    console.error("[TEST HourlyBlocks] ❌ calculateMajorCategoryForBlock or get10MinBlockIndex is not defined. Import failed.");
    return;
  }
  // getFocusSessionsByPeriod 함수가 제대로 import 되었는지 확인
  if (typeof getFocusSessionsByPeriod !== 'function') {
    console.error("[TEST HourlyBlocks] ❌ getFocusSessionsByPeriod is not defined. Import from background.js failed.");
    return;
  }

  try {
    // 사용자 UUID 가져오기 (chrome.storage API 필요)
    const { userUUID } = await chrome.storage.local.get(['userUUID']);
    if (!userUUID) {
      console.error("[TEST HourlyBlocks] Failed to get User UUID from chrome.storage.local.");
      return;
    }
    console.log("[TEST HourlyBlocks] User UUID:", userUUID);

    // 세션 데이터 가져오기 (지난 3시간)
    const now = new Date();
    const endPeriod = new Date(now);
    const startPeriod = new Date(now.getTime() - 3 * 60 * 60 * 1000);
    console.log("[TEST HourlyBlocks] Fetching sessions for period:", startPeriod.toISOString(), "to", endPeriod.toISOString());

    console.log("[TEST HourlyBlocks] Calling getFocusSessionsByPeriod...");
    // background.js에서 가져온 함수 사용
    const sessions = await getFocusSessionsByPeriod(userUUID, startPeriod, endPeriod);

    if (sessions === null) {
      console.error("[TEST HourlyBlocks] ❌ getFocusSessionsByPeriod returned null.");
    } else {
      console.log(`[TEST HourlyBlocks] ✅ Fetched ${sessions.length} sessions for testing.`);

      // 최근 1시간(6개 블록)의 Major Category 계산 및 출력
      console.log("[TEST HourlyBlocks] Calculating major categories for the last 6 blocks:");
      const currentBlockIndex = get10MinBlockIndex(Date.now());

      for (let i = 0; i < 6; i++) {
        let blockIndexToCheck = (currentBlockIndex - i + BLOCKS_PER_DAY) % BLOCKS_PER_DAY;
        const blockTimeRange = get10MinBlockTimeRange(blockIndexToCheck, now);

        console.log(`[TEST HourlyBlocks] --- Checking Block Index: ${blockIndexToCheck} (${blockTimeRange.blockStartTime.toLocaleTimeString()} - ${blockTimeRange.blockEndTime.toLocaleTimeString()}) ---`);
        const majorCategory = calculateMajorCategoryForBlock(blockIndexToCheck, sessions, now);
        console.log(`[TEST HourlyBlocks] ✅ Major category for block ${blockIndexToCheck}: ${majorCategory}`);
      }
    }
  } catch (error) {
    // chrome.storage 접근 오류 등 발생 가능
    console.error("[TEST HourlyBlocks] ❌ Error during test execution:", error);
    if (error.message.includes('chrome.storage is not available')) {
        console.warn("[TEST HourlyBlocks] This test likely needs to be run within the extension's background context or service worker.");
    }
  } finally {
    console.log("[TEST HourlyBlocks] Test execution finished.");
  }
} 