const admin = require("firebase-admin");
// V2 스케줄러 import 추가
const {onSchedule} = require("firebase-functions/v2/scheduler");
// luxon import 추가
const { DateTime } = require('luxon');

// Firestore 인스턴스 가져오기 (admin SDK가 index.js 등에서 초기화되었다고 가정)
const db = admin.firestore();

const MINUTES_PER_BLOCK = 10;
// const DAY_START_HOUR = 5; // 일과 시작 시간 (오전 5시) - 현재 집계 함수에서 사용하지 않음 - 주석 처리 또는 삭제
const TARGET_TIMEZONE = 'America/New_York'; // 피츠버그 시간대 (ET)

// 카테고리 매핑 정의 (소문자, 공백 제거 키 -> 정식 키)
const categoryMap = {
  growth: 'Growth',
  dailylife: 'DailyLife',
  entertainment: 'Entertainment',
  quickswitch: 'QuickSwitch' // QuickSwitch 매핑 추가
  // 필요 시 추가 변형 매핑 가능 (예: 'daily': 'DailyLife')
};

/**
 * Pub/Sub 스케줄러에 의해 10분마다 트리거되어
 * 직전 10분 동안의 사용자 세션 데이터를 집계하여 Firestore에 저장합니다.
 * 문서 ID는 UTC 기준, 필드에 ET 정보 추가 (luxon 사용).
 * 카테고리 이름 정규화 (소문자, 공백제거) 후 집계.
 */
exports.processTenMinuteBlocks = onSchedule({
  region: "us-central1",
  schedule: "*/10 * * * *", // 매 10분마다 실행 (cron 표현식)
  timeZone: "America/New_York", // 스케줄러 실행 시간대 (계산은 UTC/ET 기준)
  // 추가 옵션 (필요 시): memory, timeoutSeconds 등
}, async (event) => { // context 대신 event 사용
    console.log("--- processTenMinuteBlocks handler entered ---");
    console.log("Starting processTenMinuteBlocks function execution (v2, using luxon)."); // 로그 수정

    const now = new Date(event.scheduleTime || Date.now()); // event.scheduleTime 사용 권장
    const nowET = DateTime.fromJSDate(now).setZone(TARGET_TIMEZONE); // 현재 시점 ET

    // 처리할 10분 블록의 *시작* 시간 계산 (UTC 기준)
    const executionTimeMinutes = now.getMinutes();
    const minutesToSubtract = executionTimeMinutes % MINUTES_PER_BLOCK;
    const blockStartTimeUTC = new Date(now.getTime() - (minutesToSubtract * 60 * 1000) - (now.getSeconds() * 1000) - now.getMilliseconds());
    blockStartTimeUTC.setMinutes(blockStartTimeUTC.getMinutes() - MINUTES_PER_BLOCK); // 직전 블록 시작 시간 (UTC)

    const blockEndTimeUTC = new Date(blockStartTimeUTC.getTime() + MINUTES_PER_BLOCK * 60 * 1000); // 직전 블록 종료 시간 (UTC)

    // Firestore 문서 ID 생성 (UTC 기준 YYYY-MM-DD_HHMM 형식)
    const utcYear = blockStartTimeUTC.getFullYear();
    const utcMonth = String(blockStartTimeUTC.getMonth() + 1).padStart(2, '0');
    const utcDay = String(blockStartTimeUTC.getDate()).padStart(2, '0');
    const utcHours = String(blockStartTimeUTC.getHours()).padStart(2, '0');
    const utcMinutes = String(blockStartTimeUTC.getMinutes()).padStart(2, '0');
    const docId = `${utcYear}-${utcMonth}-${utcDay}_${utcHours}${utcMinutes}`; // UTC 기준 ID

    // ET 정보 계산 (luxon 사용)
    const blockStartTimeET = DateTime.fromJSDate(blockStartTimeUTC).setZone(TARGET_TIMEZONE);
    const etDateString = blockStartTimeET.toFormat('yyyy-MM-dd');
    const etTimeString = blockStartTimeET.toFormat('HH:mm');

    // '오늘' 날짜 계산 (ET, 오전 5시 기준)
    let todayDateET;
    if (nowET.hour >= 5) {
        // 오전 5시 이후면 오늘 날짜
        todayDateET = nowET.toFormat('yyyy-MM-dd');
    } else {
        // 오전 5시 이전이면 어제 날짜가 '오늘' 기준
        todayDateET = nowET.minus({ days: 1 }).toFormat('yyyy-MM-dd');
    }
    console.log(`Determined 'today' (ET, 5AM based) as: ${todayDateET}`);


    console.log(`Processing block UTC: ${docId} (${blockStartTimeUTC.toISOString()} to ${blockEndTimeUTC.toISOString()}), ET: ${etDateString} ${etTimeString}`);

    try {
      // 1. 모든 사용자 ID 가져오기 (수정: users_list 컬렉션 사용)
      let usersSnapshot;
      const usersListRef = db.collection("users_list"); // 수정: users_list 참조
      console.log(`[DEBUG] Attempting to query path: ${usersListRef.path}`); // 경로 로깅 수정

      try {
        console.log("[DEBUG] Executing usersListRef.get() ...");
        usersSnapshot = await usersListRef.get(); // 수정: users_list에서 가져오기
        console.log(`[DEBUG] usersListRef.get() executed. Snapshot exists: ${usersSnapshot && usersSnapshot.exists !== undefined}, isEmpty: ${usersSnapshot ? usersSnapshot.empty : 'N/A'}, size: ${usersSnapshot ? usersSnapshot.size : 'N/A'}`); // 스냅샷 상태 로깅 (null 체크 추가)

        if (usersSnapshot && !usersSnapshot.empty) {
           console.log("[DEBUG] First few user doc IDs found in users_list:", usersSnapshot.docs.slice(0, 5).map(d => d.id)); // 로그 메시지 수정
        }

      } catch (userFetchError) {
        console.error("!!! CRITICAL ERROR fetching users_list collection:", userFetchError); // 로그 메시지 수정
        console.error("Error Code:", userFetchError.code);
        console.error("Error Message:", userFetchError.message);
        console.error("Error Stack:", userFetchError.stack);
        return null; // 오류 발생 시 함수 종료
      }

      if (!usersSnapshot || usersSnapshot.empty) {
          console.warn("[DEBUG] users_list snapshot appears empty or null after get() call."); // 로그 메시지 수정
          // 특정 사용자 테스트 부분은 users_list에 대한 테스트가 의미 있을 수 있으나, 일단은 유지
          const KNOWN_USER_ID = "9de8ed54-c516-4c45-861d-e219b033bc7c"; // 실제 ID로 교체
          if (KNOWN_USER_ID) {
            try {
              console.log(`[DEBUG] Attempting to get specific user doc from users_list: ${KNOWN_USER_ID}`); // 로그 메시지 수정
              const testDoc = await db.collection("users_list").doc(KNOWN_USER_ID).get(); // 수정: users_list에서 확인
              console.log(`[DEBUG] Test get specific user doc from users_list (${KNOWN_USER_ID}): exists=${testDoc.exists}`); // 로그 메시지 수정
              if(testDoc.exists) console.log(`[DEBUG] Specific user_list doc data snippet:`, JSON.stringify(testDoc.data()).substring(0, 200) + "..."); // 로그 메시지 수정
            } catch (specificUserError) {
              console.error(`[DEBUG] Error fetching specific user doc from users_list ${KNOWN_USER_ID}:`, specificUserError); // 로그 메시지 수정
            }
          } else {
            console.log("[DEBUG] Skipping specific user_list test: KNOWN_USER_ID is empty."); // 로그 메시지 수정
          }
          console.log("Processing 0 users due to empty users_list."); // 명확한 로그 추가
          return null; // 사용자가 없으면 함수 종료
      } else {
          console.log(`[DEBUG] Successfully obtained non-empty users_list snapshot with size ${usersSnapshot.size}. Proceeding...`); // 로그 메시지 수정
      }

      // userIds 추출: users_list에서는 문서 ID가 바로 사용자 ID임
      const userIds = usersSnapshot.docs.map((doc) => doc.id);
      console.log(`Processing ${userIds.length} users from users_list.`); // 로그 메시지 수정

      const promises = userIds.map(async (userId) => {
        // 2. 각 사용자별로 해당 10분간의 세션 가져오기 (쿼리는 UTC 기준 시간 사용)
        const sessionsSnapshot = await db.collection(`users/${userId}/focusSessions`)
          .where("startTime", ">=", blockStartTimeUTC.getTime()) // blockStartTimeUTC 이후 시작 (타임스탬프 비교)
          .where("startTime", "<", blockEndTimeUTC.getTime())   // blockEndTimeUTC 이전 시작 (타임스탬프 비교)
          .get();

        let blockData; // blockData 선언 위치 이동
        if (sessionsSnapshot.empty) {
           blockData = {
              tenMinutesDurationGrowth: 0,
              tenMinutesDurationDailyLife: 0,
              tenMinutesDurationEntertainment: 0,
              tenMinutesDurationQuickSwitch: 0, // QuickSwitch 필드 추가 (기본값 0)
              calculationTimestamp: admin.firestore.FieldValue.serverTimestamp(), // UTC 서버 시간
              blockStartTimeUTC: admin.firestore.Timestamp.fromDate(blockStartTimeUTC), // 정확한 UTC 시작 시간 저장
              blockTimezone: TARGET_TIMEZONE, // 사용된 시간대 명시
              blockDateET: etDateString, // 예: "2025-04-28"
              blockTimeET: etTimeString, // 예: "04:20"
              sessionCount: 0, // 세션 수 추가
           };
        } else {
          // 3. 활성 세션 필터링 및 카테고리별 duration 합산
          const categoryDurations = { Growth: 0, DailyLife: 0, Entertainment: 0, QuickSwitch: 0 }; // 집계용 객체 (QuickSwitch 추가)
          let activeSessionCount = 0;

          sessionsSnapshot.forEach((doc) => {
            const session = doc.data();
            const originalCategory = session?.summaryCategory;
            // 1. 소문자 변환, 2. 공백 제거
            const normalizedCategory = originalCategory ? originalCategory.toLowerCase().replace(/\s+/g, '') : null;

            // --- 상세 디버그 로그 추가 (normalizedCategory 포함) --- 
            console.log(`[DEBUG] User ${userId}, Block ${docId}, Session ${doc.id}: Checking session data... Type=${session?.sessionType}, Duration=${session?.duration}, OrigCategory='${originalCategory}', NormCategory='${normalizedCategory}'`);
            // --- 상세 디버그 로그 끝 --- 

            // 세션 데이터 유효성 검사 강화 (normalizedCategory 및 categoryMap 사용)
            let targetCategoryKey = null;
            if (normalizedCategory && Object.prototype.hasOwnProperty.call(categoryMap, normalizedCategory)) {
                targetCategoryKey = categoryMap[normalizedCategory]; // 매핑된 정식 키 가져오기
            }

            if (session && session.sessionType === "active" &&
                typeof session.duration === "number" && session.duration > 0 &&
                targetCategoryKey) { // targetCategoryKey가 성공적으로 매핑되었는지 확인

              // --- 상세 디버그 로그 추가 --- 
              console.log(`[DEBUG] User ${userId}, Block ${docId}, Session ${doc.id}: Conditions PASSED. Adding duration ${session.duration} to category ${targetCategoryKey} (normalized from '${normalizedCategory}').`);
              // --- 상세 디버그 로그 끝 --- 
              activeSessionCount++;
              categoryDurations[targetCategoryKey] += session.duration; // 정식 키 사용
            } else if (session && session.sessionType === "active") {
              // 유효하지 않은 카테고리 또는 duration 문제 로깅
              console.warn(`User ${userId}, Block ${docId}: Found active session with invalid data or unknown category. ID: ${doc.id}, Category: ${originalCategory}, Duration: ${session.duration}`); // 원본 카테고리 로깅
            } else {
               // --- 상세 디버그 로그 추가 --- 
               console.log(`[DEBUG] User ${userId}, Block ${docId}, Session ${doc.id}: Conditions FAILED or session not active.`);
               // 조건 실패 사유 상세 로깅 (선택적)
               if (!session) console.log(` -> Reason: session data is null/undefined.`);
               else if (session.sessionType !== "active") console.log(` -> Reason: sessionType is not 'active' (${session.sessionType}).`);
               else if (!(typeof session.duration === "number" && session.duration > 0)) console.log(` -> Reason: duration is not a positive number (${session.duration}).`);
               // else if (!normalizedCategory) console.log(` -> Reason: summaryCategory is missing or invalid ('${originalCategory}').`); // 이전 조건
               else if (!targetCategoryKey) console.log(` -> Reason: normalized category '${normalizedCategory}' (from '${originalCategory}') could not be mapped to a known category (${Object.keys(categoryMap).join(', ')}).`); // 수정된 조건
                // --- 상세 디버그 로그 끝 --- 
            }
          });

          console.log(`User ${userId}, Block ${docId}: Found ${sessionsSnapshot.size} sessions, ${activeSessionCount} active sessions processed.`);

          // 4. Firestore에 저장할 데이터 구성 (categoryDurations는 정식 키 사용)
          blockData = {
             tenMinutesDurationGrowth: Math.round(categoryDurations.Growth),
             tenMinutesDurationDailyLife: Math.round(categoryDurations.DailyLife),
             tenMinutesDurationEntertainment: Math.round(categoryDurations.Entertainment),
             tenMinutesDurationQuickSwitch: Math.round(categoryDurations.QuickSwitch), // QuickSwitch 필드 추가
             calculationTimestamp: admin.firestore.FieldValue.serverTimestamp(), // UTC 서버 시간
             blockStartTimeUTC: admin.firestore.Timestamp.fromDate(blockStartTimeUTC), // 정확한 UTC 시작 시간 저장
             blockTimezone: TARGET_TIMEZONE, // 사용된 시간대 명시
             blockDateET: etDateString, // 예: "2025-04-28"
             blockTimeET: etTimeString, // 예: "04:20"
             sessionCount: activeSessionCount, // 처리된 세션 수 추가
          };
        }

        // 5. Firestore에 결과 저장
        const blockRef = db.collection(`users/${userId}/tenMinutesBlock`).doc(docId); // 문서 참조 (UTC ID 사용)
        console.log(`[DEBUG] Attempting to save to path: ${blockRef.path}`); // 경로 로깅 추가
        // 데이터 로깅 시 타임스탬프 객체 때문에 전체 로깅이 어려울 수 있으므로 일부만 로깅
        console.log(`[DEBUG] Data to save (partial): ${JSON.stringify({ ...blockData, blockStartTimeUTC: 'Timestamp', calculationTimestamp: 'Timestamp' })}`);

        await blockRef.set(blockData, { merge: true }); // set 사용 (merge는 혹시 모를 충돌 방지)

        // --- 추가: 실시간 Dailylog 업데이트 ---
        const dailyLogRef = db.collection(`users/${userId}/dailylog`).doc(todayDateET);
        const growthInc = blockData.tenMinutesDurationGrowth || 0;
        const dailyLifeInc = blockData.tenMinutesDurationDailyLife || 0;
        const entertainmentInc = blockData.tenMinutesDurationEntertainment || 0;
        const quickSwitchInc = blockData.tenMinutesDurationQuickSwitch || 0;

        // 업데이트 조건 확인: G/D/E 증가량이 있는지 먼저 확인
        const hasGdeIncrement = growthInc > 0 || dailyLifeInc > 0 || entertainmentInc > 0;
        // Q 증가량이 있는지 확인
        const hasQIncrement = quickSwitchInc > 0;

        // G/D/E 증가량이 있거나, G/D/E는 없지만 Q 증가량이 있는 경우에만 업데이트 실행
        if (hasGdeIncrement || hasQIncrement) {
            try {
                // 업데이트 시에는 모든 필드에 increment 적용 (0 더하기는 문제 없음)
                await dailyLogRef.set({
                    digitalRoutine: {
                        dailyDurationGrowth: admin.firestore.FieldValue.increment(growthInc),
                        dailyDurationDailyLife: admin.firestore.FieldValue.increment(dailyLifeInc),
                        dailyDurationEntertainment: admin.firestore.FieldValue.increment(entertainmentInc),
                        dailyDurationQuickSwitch: admin.firestore.FieldValue.increment(quickSwitchInc),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    }
                }, { merge: true });

                console.log(`User ${userId}: Updated daily log ${todayDateET} with increments (G:${growthInc}, D:${dailyLifeInc}, E:${entertainmentInc}, Q:${quickSwitchInc})`);

            } catch (dailyLogError) {
                console.error(`User ${userId}: Failed to update daily log ${todayDateET}:`, dailyLogError);
            }
        } else {
             // G/D/E/Q 모든 증가량이 0인 경우: updatedAt만 갱신 (기존 로직 유지)
             try {
                 await dailyLogRef.set({
                     digitalRoutine: {
                         updatedAt: admin.firestore.FieldValue.serverTimestamp()
                     }
                 }, { merge: true });
                 console.log(`User ${userId}: Touched daily log ${todayDateET} updatedAt (no increments).`);
             } catch (dailyLogError) {
                 console.error(`User ${userId}: Failed to touch daily log ${todayDateET}:`, dailyLogError);
             }
        }
        // --- Dailylog 업데이트 끝 ---

        console.log(`Successfully saved block ${docId} (ET: ${etDateString} ${etTimeString}) and updated daily log for user ${userId}.`); // 성공 로그 수정
      });

      // 모든 사용자 처리 기다리기
      await Promise.all(promises);
      console.log("processTenMinuteBlocks function finished successfully for all users from users_list."); // 로그 메시지 수정
      return null;

    } catch (error) {
      console.error("Error in processTenMinuteBlocks (outer catch):", error);
      // luxon 사용 시 추가적인 오류 로깅
      if (error.message && error.message.includes('luxon')) {
         console.error("Potential Luxon related error details:", error);
      }
      return null;
    }
  });

// --- 일별 집계 함수 --- //
// 주석 제거 및 변수 사용 안함 (직접 시간 지정)

/**
 * 매일 특정 시간(ET 기준 오전 5시)에 실행되어 '이틀 전'(ET 기준)의 10분 블록 데이터를 삭제합니다.
 * tenMinutesBlock 문서의 'blockDateET' 필드를 사용하여 삭제 대상을 찾습니다 (luxon 사용).
 */
exports.aggregateDailyDurations = onSchedule({
  region: "us-central1",
  schedule: "0 5 * * *", // 매일 오전 5시
  timeZone: TARGET_TIMEZONE, // 미국 동부 시간대 (피츠버그) - 삭제 기준 시간대
  // memory: "512MB", // 필요 시 메모리 설정
  // timeoutSeconds: 540, // 필요 시 타임아웃 설정 (최대 540초)
}, async (event) => {
  console.log(`Starting tenMinutesBlock cleanup function (v2 - ET ${TARGET_TIMEZONE} 5 AM, using luxon).`); // 로그 수정: 집계 -> 정리

  // 처리할 날짜 ('이틀 전', ET 기준) (luxon 사용)
  const executionTime = new Date(event.scheduleTime || Date.now()); // 스케줄러의 시간 사용 (ET 5시에 가까운 시간)
  const executionTimeET = DateTime.fromJSDate(executionTime).setZone(TARGET_TIMEZONE); // 실행 시간을 ET로 명시적 변환

  const targetDateET = executionTimeET.minus({ days: 2 }); // 이틀 전 날짜 계산
  const targetDateStringET = targetDateET.toFormat('yyyy-MM-dd'); // 이틀 전 날짜 문자열 (YYYY-MM-DD)

  console.log(`Deleting tenMinutesBlock data for ET date: ${targetDateStringET}`); // 로그 수정: 집계 -> 삭제


  try {
    // 1. 모든 사용자 ID 가져오기 (수정: users_list 컬렉션 사용)
    const usersSnapshot = await db.collection("users_list").get();
    const userIds = usersSnapshot.docs.map((doc) => doc.id);
    console.log(`Found ${userIds.length} users from users_list to process for daily cleanup.`); // 로그 수정

    const allPromises = userIds.map(async (userId) => {
      console.log(`Processing tenMinutesBlock cleanup for user: ${userId}, ET Date: ${targetDateStringET}`); // 로그 수정
      const tenMinutesBlockRef = db.collection(`users/${userId}/tenMinutesBlock`);
      // const dailyLogRef = db.collection(`users/${userId}/dailylog`).doc(targetDateStringET); // dailylog 참조 제거

      // let dailyDurations = { Growth: 0, DailyLife: 0, Entertainment: 0 }; // 집계 변수 제거
      let blocksToDelete = [];
      let totalBlocksFound = 0; // 변수명 변경

      // 2. '이틀 전'(ET 기준) 날짜의 10분 블록 데이터 가져오기 (blockDateET 필드 사용)
      console.log(`User ${userId}: Querying tenMinutesBlock where blockDateET == ${targetDateStringET}`);
      const querySnapshot = await tenMinutesBlockRef
           .where('blockDateET', '==', targetDateStringET) // ET 날짜 문자열로 정확히 쿼리
           .get();

      querySnapshot.forEach((doc) => {
          // 집계 로직 제거
          blocksToDelete.push(doc.id); // 삭제할 문서 ID 저장 (UTC 기준 ID)
          totalBlocksFound++; // 카운터 이름 변경
      });

      console.log(`User ${userId}: Found ${totalBlocksFound} tenMinutesBlock documents for ET date ${targetDateStringET}.`); // 로그 수정

      // 3. 집계 결과 dailylog 저장 로직 제거

      // 4. 처리된(찾은) 10분 블록 데이터 삭제 (Batch 사용)
      if (totalBlocksFound > 0) { // 카운터 이름 변경
        const batchSize = 500; // Firestore batch write 한계
        console.log(`User ${userId}: Starting deletion of ${blocksToDelete.length} blocks for ET date ${targetDateStringET}.`);
        for (let i = 0; i < blocksToDelete.length; i += batchSize) {
          const batch = db.batch();
          const chunk = blocksToDelete.slice(i, i + batchSize);
          console.log(`User ${userId}: Preparing batch delete for ${chunk.length} blocks (starting index ${i})...`);
          chunk.forEach(docIdToDelete => { // 변수명 변경
            batch.delete(tenMinutesBlockRef.doc(docIdToDelete)); // UTC 기준 ID로 삭제
          });
          await batch.commit();
          console.log(`User ${userId}: Batch delete committed for ${chunk.length} blocks.`);
        }
         console.log(`User ${userId}: Successfully deleted ${blocksToDelete.length} tenMinutesBlock documents for ET date ${targetDateStringET}.`);
      } else {
         console.log(`User ${userId}: No tenMinutesBlock data found for ET date ${targetDateStringET}. Skipping deletion.`); // 로그 수정
      }
    });

    // 모든 사용자 처리 완료 기다리기
    await Promise.all(allPromises);
    console.log(`tenMinutesBlock cleanup function finished successfully for ET date ${targetDateStringET}.`); // 로그 수정
    return null;

  } catch (error) {
    console.error(`Error in tenMinutesBlock cleanup for ET date ${targetDateStringET}:`, error); // 로그 수정
    // luxon 사용 시 추가적인 오류 로깅
     if (error.message && error.message.includes('luxon')) {
         console.error("Potential Luxon related error details:", error);
      }
    return null;
  }
});

// TODO: 일별 집계 함수 추가 (이 주석은 이제 불필요)
// exports.aggregateDailyDurations = ... 