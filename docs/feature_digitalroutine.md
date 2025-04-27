# Digital Routine 기능 이해

1. 목적: 사용자의 하루 동안(24시간)의 웹 브라우징 활동을 카테고리별로 시각화하여 보여주는 기능입니다. 이를 통해 사용자는 자신의 시간 사용 패턴을 직관적으로 파악할 수 있습니다.

2. 시각화 방식:
- 시간 축: 세로축은 시간을 나타냅니다. 하루 전체(24시간)를 나타내며, 오전 5시 부터 시작됩니다. 시간은 1시간 단위로 구분됩니다. 시간 축(세로축)에 표시되는 시간은 05시부터 다음 날 04시까지 입니다.
- 시간 단위 블록: 각 시간대는 가로로 6개의 블록으로 나뉘어, 총 10분 단위의 활동을 표시합니다. (1시간 = 6블록 * 10분)
- 색상: 각 10분 블록은 해당 시간 동안 가장 많이 방문한 웹사이트의 카테고리(Growth, Daily Life, Entertainment) 색상으로 표시됩니다. 만약 해당 10분 동안 방문 기록이 없다면 회색으로 표시됩니다.
    - Growth: #99DAFF
    - Daily Life: #FFDDAD
    - Entertainment: #FFD6E8
    - N/A: #E0E0E0

3. 카테고리별 총 시간: 오늘 하루(오전 5시부터 다음 날 오전 5시까지) 동안 각 카테고리(Growth, Daily Life, Entertainment)에 머무른 총 시간이 시간:분:초 (HH:MM:SS) 형식으로 표시됩니다.

4. UI 구성 요소:
- 제목: "Digital Routine"
- 카테고리 범례 및 총 시간: 각 카테고리명(아이콘 포함)과 해당 카테ゴリ에서 보낸 총 시간이 함께 표시됩니다.
- 시간대별 활동 그리드: 시간 축과 10분 단위 블록으로 구성된 메인 시각화 영역입니다

5. 기타 조건:
- 하루의 기준 시간은 오전 5시입니다. 이 시간을 기준으로 데이터 집계 및 화면 표시가 초기화됩니다.
- 각 10분 구간별로 가장 많은 시간을 보낸 카테고리(major category)가 계산되어 기록됩니다.

6. 활용 데이터: 
    (1) input 데이터
        - 데이터 소스: Firebase의 users/{user uuid}/세션
        - 세션 id
        - duration
        - startTime
        - endTime
        - summaryCategory:'Growth', 'DailyLife', 'Entertainment' 중 하나로 분류되어 있습니다
        - 계산 로직: 특정 10분 구간 내 방문 기록 필터링 -> 카테고리별 duration 합산 -> 최대 duration 카테고리 선택

    (2) output 데이터
        - categoryTotalTimes: {
        growth: number, // 초 단위 총 시간
        dailyLife: number, // 초 단위 총 시간
        entertainment: number // 초 단위 총 시간
        }
        - hourlyBlocks: string[] // 크기 144 (24시간 * 6블록) 배열. 각 요소는 해당 10분 블록의 major 카테고리 ('Growth', 'DailyLife', 'Entertainment', 'N/A')


7. 데이터 저장
- 저장소: Firestore Database, /users/{uuid}/dailylog 
- 하루가 전환되는 시점을 기준으로(오전 5시), 카테고리별 총 소요 시간 데이터를 아래와 같이 저장합니다.
    - dailyDurationGrowth: 
    - dailyDurationDailyLife: 
    - dailyDurationEntertainment:
- 저장 경로는 /users/{uuid}/dailylog 입니다.
- 파일명: 파일명 형식이 YYYY-MM-DD 형식이며, 일자별 파일 내에 위 데이터를 저장합니다. (예: 2025-04-01)
- 10분 단위의 major category는 하루 단위로 임시로  chrome.storage.local에 저장하고, 하루가 전환 될 때 reset 됩니다.  


# 개발 순서:
1. Firebase 데이터 접근 설정:
    - 사용자 인증(UUID 획득) 로직을 확인하고, Firestore 데이터베이스에 접근할 수 있는지 확인합니다.
    - users/{uuid}/세션 경로에서 필요한 필드(startTime, endTime, duration, summaryCategory)를 포함한 방문 기록 데이터를 읽어오는 기본 함수를 구현합니다.
2. 핵심 로직 구현: 10분 단위 Major Category 계산:
    - 시간 변환 및 인덱싱: 주어진 타임스탬프(startTime, endTime)를 기준으로 해당 시간이 속하는 10분 블록의 인덱스(0~143)를 계산하는 함수를 만듭니다. (오전 5시 기준 고려)
    - 구간 필터링: 특정 10분 블록 인덱스에 해당하는 시간 범위 내의 Firebase 방문 기록 데이터를 필터링하는 로직을 구현합니다.
    - Major Category 결정: 필터링된 방문 기록들의 summaryCategory 별 duration을 합산하여, 해당 10분 블록의 major category ('Growth', 'DailyLife', 'Entertainment', 또는 'N/A')를 결정하는 함수(calculateMajorCategoryForBlock)를 구현합니다.
3. 임시 데이터 처리 (chrome.storage.local):
    - 저장: calculateMajorCategoryForBlock 함수를 사용하여 계산된 10분 단위 major category 결과를 chrome.storage.local의 hourlyBlocks 키 아래 배열(크기 144)에 저장/업데이트하는 함수를 구현합니다.
    - 읽기: chrome.storage.local에서 hourlyBlocks 데이터를 읽어오는 함수를 구현합니다.
    - 실시간 업데이트: 백그라운드 스크립트 등에서 새로운 방문 기록이 감지될 때마다 관련 10분 블록의 major category를 다시 계산하고 chrome.storage.local 데이터를 업데이트하는 로직을 연결합니다.
4. 카테고리별 총 시간 계산:
    - chrome.storage.local에 저장된 hourlyBlocks 데이터를 기반으로, 현재까지(오전 5시 기준) 각 카테고리별 총 시간(categoryTotalTimes)을 초 단위로 계산하는 함수(calculateCategoryTotalTimes)를 구현합니다. 이 함수는 UI 업데이트 시 호출됩니다.
5. UI 컴포넌트 골격 생성 (프론트엔드):
    - DigitalRoutine.js (또는 해당 프레임워크 컴포넌트 파일)와 DigitalRoutine.css 파일을 생성합니다.
    - HTML 구조를 만듭니다: 제목("Digital Routine"), 카테고리 범례 영역, 시간 축 레이블(05-04), 24x6 그리드 영역.
    - CSS를 사용하여 기본적인 레이아웃과 스타일(색상 변수 포함)을 적용합니다.
6. UI 데이터 바인딩 및 렌더링:
    - 총 시간 표시: UI 컴포넌트가 로드될 때 calculateCategoryTotalTimes 함수를 호출하고, 결과를 받아와 HH:MM:SS 형식으로 변환하여 카테고리 범례 옆에 표시합니다.
    - 그리드 렌더링: chrome.storage.local에서 hourlyBlocks 데이터를 읽어와, 144개 각 그리드 셀에 해당하는 major category에 따라 CSS 클래스(또는 직접 스타일)를 적용하여 색상을 입힙니다.
    - 실시간 UI 업데이트: chrome.storage.onChanged 이벤트 리스너를 사용하여 hourlyBlocks 데이터가 변경되면, 총 시간과 그리드 표시를 업데이트하는 로직을 구현합니다.
7. 일별 데이터 영구 저장 (Firestore):
    - 트리거 설정: 매일 오전 5시에 특정 작업을 수행할 로직을 구현합니다. (chrome.alarms API 사용 권장)
    - 총 시간 계산 (일별): 리셋 시점 직전에, 이전 날짜(오전 5시 ~ 다음 날 오전 5시)의 최종 카테고리별 총 시간(dailyDurationGrowth 등)을 hourlyBlocks 데이터를 이용해 계산합니다.
    - Firestore 저장: 계산된 일별 총 시간 데이터를 /users/{uuid}/dailylog/{YYYY-MM-DD} 형식의 Firestore 문서에 저장하는 함수를 구현하고, 오전 5시 트리거 로직 내에서 호출합니다.
8. 임시 데이터 리셋:
    - 오전 5시 트리거 로직 내에서 Firestore 저장 후, chrome.storage.local의 hourlyBlocks 데이터를 초기 상태(예: 모든 요소를 'N/A'로 채운 배열)로 리셋하는 코드를 추가합니다.
9. 종합 테스트 및 디버깅:
    - 데이터가 없을 때, 데이터가 쌓이는 과정, 브라우저 재시작 시, 오전 5시 경계 시간 등 다양한 시나리오에서 기능이 올바르게 작동하는지 테스트합니다.
    - Firestore 데이터 저장 및 chrome.storage.local 리셋이 정확히 수행되는지 확인합니다.