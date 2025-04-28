# Digital Routine 기능 이해

## 1. 목적
사용자의 하루 동안(오전 5시 ~ 다음 날 오전 5시)의 웹 브라우징 활동을 **10분 단위 블록 시각화**와 **카테고리별 정확한 총 사용 시간**으로 나누어 제공합니다. 이를 통해 시간 사용 패턴 파악 및 활동 시간 분석을 돕습니다.

## 2. 핵심 기능 및 데이터 흐름

### 가. 10분 블록 데이터 계산 및 저장 (백엔드 - Cloud Functions)
- **실행 주기:** 매 10분 정각 (예: 10:10, 10:20) Cloud Scheduler에 의해 트리거됩니다.
- **처리 대상:** 실행 시점 직전 10분 구간 (예: 10:10 실행 시 10:00:00 ~ 10:09:59).
- **데이터 소스:**
    - **사용자 목록:** Firestore `/users_list` 컬렉션에서 모든 사용자 ID 로드.
    - **세션 데이터:** 각 사용자 ID에 대해 Firestore `/users/{userUUID}/focusSessions`에서 해당 10분 구간의 세션 데이터 로드.
- **계산 로직:**
    - 로드된 세션 중 `sessionType === 'active'`인 세션만 필터링.
    - 활성 세션의 `summaryCategory` ('Growth', 'DailyLife', 'Entertainment')별 `duration`(초) 합산.
- **저장 데이터:**
    - `tenMinutesDurationGrowth`: 해당 10분간 Growth 카테고리 총 시간(초).
    - `tenMinutesDurationDailyLife`: 해당 10분간 Daily Life 카테고리 총 시간(초).
    - `tenMinutesDurationEntertainment`: 해당 10분간 Entertainment 카테고리 총 시간(초).
- **저장소 및 경로:** Firestore `/users/{userUUID}/tenMinutesBlock/{YYYY-MM-DD_HHMM}` (HHMM은 10분 블록 시작 시간, 예: 10:00 데이터는 _1000).

### 나. 시각화 (프론트엔드) 
- **데이터 소스:** Firestore `/users/{userUUID}/tenMinutesBlock`에서 해당 날짜(오전 5시 기준)의 10분 블록 데이터(144개) 로드.
- **Major Category 계산:** 각 10분 블록 문서에 저장된 `tenMinutesDuration...` 값들을 비교하여 가장 큰 값을 가진 카테고리를 해당 블록의 **Major Category**로 결정합니다. (이 계산은 프론트엔드에서 수행)
- **UI 표시:**
    - **시간대별 활동 그리드:** 계산된 Major Category에 따라 24x6 그리드의 각 셀을 해당 카테고리 색상으로 표시합니다.
        - Growth: `#99DAFF`
        - Daily Life: `#FFDDAD`
        - Entertainment: `#FFD6E8`
        - 해당 10분 블록 데이터가 없거나 모든 duration이 0이면 N/A: `#E0E0E0`
    - **카테고리별 총 시간:** (다. 일별 집계 데이터 활용) 아래에서 설명할 `/users/{userUUID}/dailylog` 데이터를 읽어와 HH:MM:SS 형식으로 표시합니다.
    - 시간 축: 세로축은 시간을 나타냅니다. 하루 전체(24시간)를 나타내며, 오전 5시 부터 시작됩니다. 시간은 1시간 단위로 구분됩니다. 시간 축(세로축)에 표시되는 시간은 05시부터 다음 날 04시까지 입니다.
    - 시간 단위 블록: 각 시간대는 가로로 6개의 블록으로 나뉘어, 총 10분 단위의 활동을 표시합니다. (1시간 = 6블록 * 10분)

### 다. 일별 집계 데이터 계산 및 저장 (백엔드 - Cloud Functions)
- **실행 주기:** 매일 오전 5시 정각 Cloud Scheduler에 의해 트리거됩니다.
- **처리 대상:** 이전 날짜 (어제 오전 5시 ~ 오늘 오전 5시)의 데이터.
- **데이터 소스:**
    - **사용자 목록:** Firestore `/users_list` 컬렉션에서 모든 사용자 ID 로드.
    - **블록 데이터:** 각 사용자 ID에 대해 Firestore `/users/{userUUID}/tenMinutesBlock`에서 이전 날짜에 해당하는 모든 10분 블록 문서 로드.
- **계산 로직:**
    - 로드된 모든 10분 블록 문서의 `tenMinutesDurationGrowth`, `tenMinutesDurationDailyLife`, `tenMinutesDurationEntertainment` 값을 각각 합산합니다.
- **저장 데이터:**
    - `dailyDurationGrowth`: 이전 날짜 하루 동안의 Growth 카테고리 총 시간(초).
    - `dailyDurationDailyLife`: 이전 날짜 하루 동안의 Daily Life 카테고리 총 시간(초).
    - `dailyDurationEntertainment`: 이전 날짜 하루 동안의 Entertainment 카테고리 총 시간(초).
- **저장소 및 경로:** Firestore `/users/{userUUID}/dailylog/{YYYY-MM-DD}` (YYYY-MM-DD는 이전 날짜).
- **데이터 리셋:** `dailylog` 저장 완료 후, 이전 날짜에 해당하는 `/users/{userUUID}/tenMinutesBlock/` 아래의 모든 문서를 삭제합니다.

## 3. UI 구성 요소 (변경 없음)
- 제목: "Digital Routine"
- 카테고리 범례 및 총 시간: 각 카테고리명(아이콘 포함)과 해당 카테고리에서 보낸 총 시간(일별 집계 데이터 사용)이 함께 표시됩니다.
- 시간대별 활동 그리드: 시간 축(05-04)과 10분 단위 블록으로 구성된 메인 시각화 영역.

## 4. 기타 조건 (변경 없음)
- 하루의 기준 시간은 오전 5시입니다.

## 5. 개발 순서 (수정됨)

1.  **백엔드 설정 확인 및 구체화 (진행 중):**
    - Firebase Cloud Functions 환경 확인.
    - Cloud Scheduler 설정 계획 (매 10분, 매일 5시).
    - Firestore 경로 및 데이터 구조 확정 (`tenMinutesBlock`, `dailylog`).
2.  **백엔드 함수 구현 (10분 주기):**
    - Cloud Function 생성 (스케줄 트리거).
    - 이전 10분 세션 로드 -> 활성 세션 필터링 -> 카테고리별 duration 합산 -> `/tenMinutesBlock/{YYYY-MM-DD_HHMM}` 저장 로직 구현.
3.  **백엔드 스케줄러 설정:**
    - Cloud Scheduler에서 10분 주기 작업 설정 및 함수 연결.
4.  **백엔드 함수 구현 (일별 집계 및 리셋):**
    - Cloud Function 생성 (스케줄 트리거 - 매일 5시).
    - 이전 날짜 `/tenMinutesBlock` 데이터 로드 -> 카테고리별 총합 계산 -> `/dailylog/{YYYY-MM-DD}` 저장 로직 구현.
    - 이전 날짜 `/tenMinutesBlock` 데이터 삭제 로직 구현.
5.  **백엔드 스케줄러 설정:**
    - Cloud Scheduler에서 매일 5시 작업 설정 및 함수 연결.
6.  **확장 프로그램 코드 정리:**
    - `background.js` 등에서 기존 `hourlyBlocks` 계산/저장/리셋 로직 및 관련 `chrome.storage.local` 사용 부분 제거. `calculateMajorCategoryForBlock` 함수 등 불필요 로직 제거.
7.  **프론트엔드 구현:**
    - UI 컴포넌트 골격 생성 (`DigitalRoutine.js`, `DigitalRoutine.css`).
    - Firestore `/tenMinutesBlock` 데이터 로드 기능 구현.
    - 로드한 데이터로 Major Category 계산 로직 구현.
    - 계산된 Major Category 기반 그리드 렌더링 구현.
    - Firestore `/dailylog` 데이터 로드 기능 구현.
    - 로드한 데이터로 총 시간 표시 (HH:MM:SS 변환).
    - 데이터 로딩 상태, 오류 처리 등 UI 개선.
8.  **종합 테스트 및 디버깅:**
    - 백엔드 함수 및 스케줄러 정상 작동 확인.
    - 프론트엔드 데이터 로드 및 표시 정확성 확인.
    - 경계 시간(오전 5시) 처리 확인.
    - 데이터 리셋 확인.