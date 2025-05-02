# Digital Routine 기능 이해

## 1. 목적
사용자의 하루 동안(ET 기준 오전 5시 ~ 다음 날 오전 5시)의 웹 브라우징 활동을 **10분 단위 블록 시각화**와 **카테고리별 정확한 총 사용 시간**으로 나누어 제공합니다. 이를 통해 시간 사용 패턴 파악 및 활동 시간 분석을 돕습니다. **모든 시간 기준은 ET(미국 동부 시간)입니다.**

## 2. 핵심 기능 및 데이터 흐름

### 가. 10분 블록 데이터 계산 및 저장 (백엔드 - Cloud Functions)
- **실행 주기:** 매 10분마다 Cloud Scheduler에 의해 트리거됩니다.
- **처리 대상:** 실행 시점 직전 10분 구간 (예: 10:10 ET 실행 시 10:00:00 ~ 10:09:59 ET).
- **데이터 소스:**
    - **사용자 목록:** Firestore `/users_list` 컬렉션에서 모든 사용자 ID 로드.
    - **세션 데이터:** 각 사용자 ID에 대해 Firestore `/users/{userUUID}/focusSessions`에서 해당 10분 구간(UTC 시간 기준 쿼리)의 세션 데이터 로드.
- **계산 로직:**
    - 로드된 세션 중 `sessionType === 'active'`인 세션만 필터링.
    - 활성 세션의 `summaryCategory` ('Growth', 'DailyLife', 'Entertainment')별 `duration`(초) 합산.
- **저장 데이터 (Firestore `/users/{userUUID}/tenMinutesBlock/{UTC_YYYY-MM-DD_HHMM}`):**
    - `tenMinutesDurationGrowth`: 해당 10분간 Growth 카테고리 총 시간(초).
    - `tenMinutesDurationDailyLife`: 해당 10분간 Daily Life 카테고리 총 시간(초).
    - `tenMinutesDurationEntertainment`: 해당 10분간 Entertainment 카테고리 총 시간(초).
    - `blockDateET`: 해당 10분 블록이 속하는 **실제 ET 날짜** (예: "2025-05-01"). (5 AM 기준 조정 없음)
    - `blockTimeET`: 해당 10분 블록의 시작 시간 (ET 기준, HH:mm 형식, 예: "10:00").
    - `blockStartTimeUTC`: 해당 10분 블록의 시작 시간 (UTC 타임스탬프).
    - `blockTimezone`: 사용된 시간대 ("America/New_York").
    - `sessionCount`: 처리된 활성 세션 수.
    - `calculationTimestamp`: 계산 시점 서버 타임스탬프.

### 나. 시각화 (프론트엔드 - React Component)
- **날짜 계산:**
    - 컴포넌트 로드 시, **ET 기준 오전 5시**를 기준으로 "오늘"(`todayDateET`)과 "내일"(`nextDayDateET`) 날짜 문자열(YYYY-MM-DD)을 계산합니다. 이는 Firestore에서 가져올 데이터의 범위를 지정하고, 그리드 셀의 날짜를 매핑하는 데 사용됩니다.
- **데이터 로드:**
    - Firestore `/users/{userUUID}/tenMinutesBlock` 컬렉션에서 `blockDateET` 필드가 `todayDateET` 또는 `nextDayDateET`와 일치하는 모든 문서를 실시간으로 가져옵니다 (`in` 쿼리 및 `onSnapshot`).
    - 가져온 데이터는 `tenMinBlocksByDateTime` 상태 객체에 저장됩니다. 이 객체의 **키는 `YYYY-MM-DD_HHMM` 형식** (예: "2025-05-01_1430")이며, 값은 해당 Firestore 문서 데이터입니다. 여러 스냅샷으로 데이터가 들어올 경우, 이전 상태와 병합하여 이틀 치 데이터를 누적합니다.
- **Major Category 계산:**
    - 그리드의 각 셀을 렌더링할 때, 해당 셀에 해당하는 `tenMinBlocksByDateTime` 데이터를 조회합니다.
    - 조회된 데이터의 `tenMinutesDuration...` 값들을 비교하여 가장 큰 값을 가진 카테고리를 해당 블록의 **Major Category**로 결정합니다.
- **UI 표시:**
    - **시간대별 활동 그리드:**
        - **시간 축 (세로):** **ET 기준 05시부터 다음 날 04시까지** 24시간을 표시합니다.
        - **블록 (가로):** 각 시간은 6개의 10분 단위 블록으로 나뉩니다.
        - **셀 렌더링:**
            1. 각 셀의 표시 시간(`displayHour`)을 확인합니다.
            2. `displayHour`가 00~04시면 `nextDayDateET`, 05~23시면 `todayDateET`를 `targetDate`로 결정합니다.
            3. `lookupKey`를 `${targetDate}_${HHMM}` 형식으로 생성합니다.
            4. `tenMinBlocksByDateTime[lookupKey]`로 데이터를 조회하고 Major Category를 계산합니다.
            5. 계산된 Major Category에 따라 셀 배경색을 칠합니다.
                - Growth: `#99DAFF`
                - Daily Life: `#FFDDAD`
                - Entertainment: `#FFD6E8`
                - 데이터 없음 또는 모든 duration 0: `#F3F3F3` (NA)
    - **카테고리별 총 시간:** (다. 일별 집계 데이터 활용) 아래에서 설명할 `/users/{userUUID}/dailylog` 데이터를 `todayDateET` 기준으로 읽어와 HH:MM:SS 형식으로 표시합니다.
    - **현재 시간 강조:**
        1. 사용자의 현재 로컬 시간을 기준으로 **실제 ET 날짜**(`currentActualETDate`)와 **10분 블록 HHMM 키**(`currentETBlockKeyHHMM`)를 1분마다 계산합니다.
        2. `currentBlockFullKey`를 `${currentActualETDate}_${currentETBlockKeyHHMM}` 형식으로 생성합니다.
        3. 셀 렌더링 시 셀의 `lookupKey`와 `currentBlockFullKey`가 일치하면 초록색(`A5D8B4`) 안쪽 테두리로 강조합니다.

### 다. 일별 집계 데이터 계산 및 저장 (백엔드 - Cloud Functions)
- **실행 주기:** 매일 **ET 기준 오전 5시 정각** Cloud Scheduler에 의해 트리거됩니다.
- **처리 대상:** **ET 기준 '이틀 전'** 날짜 (`yyyy-MM-dd` 형식). (예: 5월 3일 5 AM 실행 시 5월 1일 데이터 처리)
- **데이터 소스:**
    - **사용자 목록:** Firestore `/users_list` 컬렉션.
    - **블록 데이터:** 각 사용자에 대해 `/users/{userUUID}/tenMinutesBlock`에서 `blockDateET` 필드가 '이틀 전' 날짜와 일치하는 모든 문서 로드.
- **계산 로직:**
    - **(주의: 현재 로직은 집계 없이 삭제만 수행)** 로드된 '이틀 전' 날짜의 모든 10분 블록 문서를 찾습니다.
- **저장 데이터 (`/users/{userUUID}/dailylog/{ET_YYYY-MM-DD}`):**
    - **(주의: 현재 `dailylog` 업데이트는 `processTenMinuteBlocks` 함수에서 실시간으로 수행됨)** 이 함수에서는 `dailylog`를 직접 업데이트하지 않습니다. 대신, `processTenMinuteBlocks` 함수가 각 10분 블록 데이터를 처리할 때마다 **ET 5 AM 기준 "오늘" 날짜**의 `dailylog` 문서 내 `digitalRoutine` 필드의 카테고리별 duration을 `FieldValue.increment()`로 즉시 업데이트합니다.
- **데이터 삭제:** '이틀 전' 날짜에 해당하는 `/users/{userUUID}/tenMinutesBlock/` 아래의 모든 문서를 삭제합니다. (일별 집계 데이터는 `dailylog`에 이미 누적되어 있으므로 원본 10분 블록 데이터는 삭제)

## 3. UI 구성 요소 (변경 없음)
- 제목: "Digital Routine"
- 카테고리 범례 및 총 시간: 각 카테고리명(아이콘 포함)과 해당 카테고리에서 보낸 총 시간(실시간 `dailylog` 데이터 사용)이 함께 표시됩니다.
- 시간대별 활동 그리드: ET 기준 시간 축(05-04)과 10분 단위 블록으로 구성된 메인 시각화 영역.

## 4. 기타 조건 (변경 없음)
- 하루의 기준 시간은 **ET 기준 오전 5시**입니다. 모든 날짜 계산 및 표시는 이 기준을 따릅니다.

## 5. 개발 순서 (완료됨)
- 모든 백엔드 및 프론트엔드 기능 구현 및 테스트 완료.