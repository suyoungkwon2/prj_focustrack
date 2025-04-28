const functions = require("firebase-functions");
const admin = require("firebase-admin");
// V2 스케줄러 import 추가
const {onSchedule} = require("firebase-functions/v2/scheduler");

// Firestore 인스턴스 가져오기 (admin SDK가 index.js 등에서 초기화되었다고 가정)
const db = admin.firestore();

const MINUTES_PER_BLOCK = 10;
const DAY_START_HOUR = 5; // 일과 시작 시간 (오전 5시)

/**
 * Pub/Sub 스케줄러에 의해 10분마다 트리거되어
 * 직전 10분 동안의 사용자 세션 데이터를 집계하여 Firestore에 저장합니다.
 */
exports.processTenMinuteBlocks = onSchedule({
  region: "us-central1",
  schedule: "*/10 * * * *", // 매 10분마다 실행 (cron 표현식)
  timeZone: "Asia/Seoul", // 기준 시간대 설정
  // 추가 옵션 (필요 시): memory, timeoutSeconds 등
}, async (event) => { // context 대신 event 사용
    console.log("--- processTenMinuteBlocks handler entered ---");
    console.log("Starting processTenMinuteBlocks function execution (v2).");

    const now = new Date(event.scheduleTime || Date.now()); // event.scheduleTime 사용 권장
    // 처리할 10분 블록의 *시작* 시간 계산
    const executionTimeMinutes = now.getMinutes();
    const minutesToSubtract = executionTimeMinutes % MINUTES_PER_BLOCK;
    const blockStartTime = new Date(now.getTime() - (minutesToSubtract * 60 * 1000) - (now.getSeconds() * 1000) - now.getMilliseconds());
    blockStartTime.setMinutes(blockStartTime.getMinutes() - MINUTES_PER_BLOCK); // 직전 블록 시작 시간

    const blockEndTime = new Date(blockStartTime.getTime() + MINUTES_PER_BLOCK * 60 * 1000); // 직전 블록 종료 시간 (시작 + 10분)

    // Firestore 문서 ID 생성 (YYYY-MM-DD_HHMM 형식)
    const year = blockStartTime.getFullYear();
    const month = String(blockStartTime.getMonth() + 1).padStart(2, '0');
    const day = String(blockStartTime.getDate()).padStart(2, '0');
    const hours = String(blockStartTime.getHours()).padStart(2, '0');
    const minutes = String(blockStartTime.getMinutes()).padStart(2, '0');
    const docId = `${year}-${month}-${day}_${hours}${minutes}`;

    console.log(`Processing block: ${docId} (${blockStartTime.toISOString()} to ${blockEndTime.toISOString()})`);

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
        // 2. 각 사용자별로 해당 10분간의 세션 가져오기
        const sessionsSnapshot = await db.collection(`users/${userId}/focusSessions`)
          .where("startTime", ">=", blockStartTime.getTime()) // blockStartTime 이후 시작
          .where("startTime", "<", blockEndTime.getTime())   // blockEndTime 이전 시작
          .get();

        if (sessionsSnapshot.empty) {
           await db.collection(`users/${userId}/tenMinutesBlock`).doc(docId).set({
              tenMinutesDurationGrowth: 0,
              tenMinutesDurationDailyLife: 0,
              tenMinutesDurationEntertainment: 0,
              calculationTimestamp: admin.firestore.FieldValue.serverTimestamp(),
          }, { merge: true });
          return;
        }

        // 3. 활성 세션 필터링 및 카테고리별 duration 합산
        const categoryDurations = { Growth: 0, DailyLife: 0, Entertainment: 0 };
        let activeSessionCount = 0;

        sessionsSnapshot.forEach((doc) => {
          const session = doc.data();
          if (session && session.sessionType === "active" &&
              typeof session.duration === "number" && session.duration > 0) {
            activeSessionCount++;
            switch (session.summaryCategory) {
              case "Growth":
                categoryDurations.Growth += session.duration;
                break;
              case "DailyLife":
                categoryDurations.DailyLife += session.duration;
                break;
              case "Entertainment":
                categoryDurations.Entertainment += session.duration;
                break;
            }
          }
        });

        console.log(`User ${userId}, Block ${docId}: Found ${sessionsSnapshot.size} sessions, ${activeSessionCount} active sessions processed.`);

        // 4. Firestore에 결과 저장 (소수점 제거)
        const blockData = {
           tenMinutesDurationGrowth: Math.round(categoryDurations.Growth),
           tenMinutesDurationDailyLife: Math.round(categoryDurations.DailyLife),
           tenMinutesDurationEntertainment: Math.round(categoryDurations.Entertainment),
           calculationTimestamp: admin.firestore.FieldValue.serverTimestamp(),
        };
        const blockRef = db.collection(`users/${userId}/tenMinutesBlock`).doc(docId); // 문서 참조
        console.log(`[DEBUG] Attempting to save to path: ${blockRef.path}`); // 경로 로깅 추가
        console.log(`[DEBUG] Data to save: ${JSON.stringify(blockData)}`); // 데이터 로깅 추가

        await blockRef.set(blockData, { merge: true }); // setDoc 대신 참조 사용 (기능 동일)

        console.log(`Successfully saved block ${docId} for user ${userId}.`); // 기존 성공 로그
      });

      // 모든 사용자 처리 기다리기
      await Promise.all(promises);
      console.log("processTenMinuteBlocks function finished successfully for all users from users_list."); // 로그 메시지 수정
      return null;

    } catch (error) {
      console.error("Error in processTenMinuteBlocks (outer catch):", error);
      return null;
    }
  });

// --- 일별 집계 함수 --- //
// 주석 제거 및 변수 사용 안함 (직접 시간 지정)

/**
 * 매일 특정 시간(사용자 시간대 기준 오전 5시 - 현재는 ET 기준)에 실행되어 이전 날짜의 10분 블록 데이터를 집계하고,
 * 집계된 데이터를 dailylog에 저장한 후, 사용된 10분 블록 데이터를 삭제합니다.
 */
exports.aggregateDailyDurations = onSchedule({
  region: "us-central1",
  schedule: "0 5 * * *", // 매일 오전 5시
  timeZone: "America/New_York", // 미국 동부 시간대 (피츠버그)
  // memory: "512MB", // 필요 시 메모리 설정
  // timeoutSeconds: 540, // 필요 시 타임아웃 설정 (최대 540초)
}, async (event) => {
  console.log("Starting aggregateDailyDurations function execution (v2 - ET 5 AM).");

  // 처리할 날짜 (어제) - 실행 시간대의 '어제'
  const executionTime = new Date(event.scheduleTime || Date.now()); // 스케줄러의 시간 사용
  const targetDate = new Date(executionTime);
  targetDate.setDate(targetDate.getDate() - 1); // 단순히 하루 전으로 설정 (해당 시간대 기준)
  const targetDateString = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD (UTC 기준일 수 있으나, 문서 ID로 사용)

  // 처리할 시간 범위 (ET 기준 어제 05:00:00 ~ 오늘 04:59:59)
  // 계산 편의상 UTC로 변환하여 처리하는 것이 덜 헷갈릴 수 있음
  // Firestore 타임스탬프는 보통 UTC로 저장되므로 UTC 기준으로 쿼리

  // ET 오전 5시 = UTC 09시 또는 10시 (DST 따라)
  // 정확한 계산보다는, 함수 실행 시점을 기준으로 24시간 전까지의 데이터를 가져오는 방식이 간단
  const endTimeUTC = new Date(executionTime);
  endTimeUTC.setUTCHours(9, 0, 0, 0); // 실행 당일 UTC 9시(또는 10시) - 대략 ET 5시
   // DST 고려: timeZone 설정을 했으므로 event.scheduleTime은 ET 5시에 가까운 UTC 시간일 것
   // 좀 더 명확하게: 실행 시간 기준 24시간 전부터 실행 시간까지
  const calculationEndTime = new Date(event.scheduleTime || Date.now());
  const calculationStartTime = new Date(calculationEndTime.getTime() - 24 * 60 * 60 * 1000);


  console.log(`Aggregating data for date ending around ET ${targetDateString} 05:00`);
  console.log(`Target time range (UTC): ${calculationStartTime.toISOString()} to ${calculationEndTime.toISOString()}`);


  try {
    // 1. 모든 사용자 ID 가져오기 (수정: users_list 컬렉션 사용)
    const usersSnapshot = await db.collection("users_list").get();
    const userIds = usersSnapshot.docs.map((doc) => doc.id);
    console.log(`Found ${userIds.length} users from users_list to process for daily aggregation.`);

    const allPromises = userIds.map(async (userId) => {
      console.log(`Processing daily aggregation for user: ${userId}`);
      const tenMinutesBlockRef = db.collection(`users/${userId}/tenMinutesBlock`);
      const dailyLogRef = db.collection(`users/${userId}/dailylog`).doc(targetDateString);

      let dailyDurations = { Growth: 0, DailyLife: 0, Entertainment: 0 };
      let blocksToDelete = [];

      // 2. 이전 24시간 동안의 10분 블록 데이터 가져오기
      // tenMinutesBlock 문서 ID는 YYYY-MM-DD_HHMM (KST 기준 생성) -> 실제 UTC 시간으로 쿼리 어려움
      // -> tenMinutesBlock 문서에 timestamp 필드를 추가하는 것이 장기적으로 유리
      // -> 임시방편: 넉넉하게 이틀치 접두사로 가져와서 필터링?
      // -> 현재 로직 유지하되, 시간 범위 주석 명확화
      console.warn(`User ${userId}: Aggregation relies on document IDs created based on KST. Querying based on calculated UTC range might miss/include data if server time != KST.`);

      const querySnapshot = await tenMinutesBlockRef
           // .where('calculationTimestamp', '>=', calculationStartTime) // calculationTimestamp 필드 추가 필요
           // .where('calculationTimestamp', '<', calculationEndTime)
           // 임시: ID 기반으로 최대한 가져와서 로직 내 필터링 강화 (기존 로직 활용)
           .orderBy(admin.firestore.FieldPath.documentId())
           .startAt(`${calculationStartTime.toISOString().split('T')[0]}_`) // 시작일 접두사
           .endAt(`${calculationEndTime.toISOString().split('T')[0]}_`) // 종료일 접두사
           .get();

      querySnapshot.forEach((doc) => {
          const docId = doc.id;
          const data = doc.data();
          // 문서 ID 시간보다는 calculationTimestamp (서버 저장 시간) 기준으로 필터링 필요
          // -> calculationTimestamp 필드가 있다고 가정하고 로직 수정 (없으면 추가 필요)
          if (data.calculationTimestamp) {
              const blockTime = data.calculationTimestamp.toDate(); // Firestore Timestamp 변환
              if (blockTime.getTime() >= calculationStartTime.getTime() && blockTime.getTime() < calculationEndTime.getTime()) {
                  dailyDurations.Growth += data.tenMinutesDurationGrowth || 0;
                  dailyDurations.DailyLife += data.tenMinutesDurationDailyLife || 0;
                  dailyDurations.Entertainment += data.tenMinutesDurationEntertainment || 0;
                  blocksToDelete.push(doc.id);
              }
          } else {
              // calculationTimestamp 없는 경우 경고만 출력 (또는 ID 기반 추정)
              console.warn(`User ${userId}, Block ${docId}: Missing 'calculationTimestamp'. Cannot reliably check time range.`);
          }
      });

      // 3. 집계 결과 dailylog에 저장
      if (blocksToDelete.length > 0) { // 처리할 블록이 있는 경우에만 저장 및 삭제
        const dailyLogData = {
          dailyDurationGrowth: Math.round(dailyDurations.Growth),
          dailyDurationDailyLife: Math.round(dailyDurations.DailyLife),
          dailyDurationEntertainment: Math.round(dailyDurations.Entertainment),
          aggregationTimestamp: admin.firestore.FieldValue.serverTimestamp(),
        };
        await dailyLogRef.set(dailyLogData);
        console.log(`User ${userId}: Saved daily log for ${targetDateString}. Growth: ${dailyLogData.dailyDurationGrowth}s, DailyLife: ${dailyLogData.dailyDurationDailyLife}s, Entertainment: ${dailyLogData.dailyDurationEntertainment}s`);

        // 4. 처리된 10분 블록 데이터 삭제 (Batch 사용)
        const batchSize = 500; // Firestore batch write 한계
        for (let i = 0; i < blocksToDelete.length; i += batchSize) {
          const batch = db.batch();
          const chunk = blocksToDelete.slice(i, i + batchSize);
          console.log(`User ${userId}: Preparing batch delete for ${chunk.length} blocks (starting index ${i})...`);
          chunk.forEach(docId => {
            batch.delete(tenMinutesBlockRef.doc(docId));
          });
          await batch.commit();
          console.log(`User ${userId}: Batch delete committed for ${chunk.length} blocks.`);
        }
         console.log(`User ${userId}: Deleted ${blocksToDelete.length} tenMinutesBlock documents for ${targetDateString}.`);
      } else {
         console.log(`User ${userId}: No tenMinutesBlock data found for ${targetDateString}. Skipping aggregation and deletion.`);
      }
    });

    // 모든 사용자 처리 완료 기다리기
    await Promise.all(allPromises);
    console.log(`aggregateDailyDurations function finished successfully for date ${targetDateString}.`);
    return null;

  } catch (error) {
    console.error(`Error in aggregateDailyDurations for date ${targetDateString}:`, error);
    return null;
  }
});

// TODO: 일별 집계 함수 추가
// exports.aggregateDailyDurations = ... 