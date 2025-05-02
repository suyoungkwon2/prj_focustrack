# Today's Picks 기능 설명

## 개요

"Today's Picks"는 사용자의 최근 브라우징 활동 중 'Growth' 카테고리에 속하는 페이지들을 분석하여, 유사한 주제별로 묶어 요약 및 관련 정보를 제공하는 기능입니다. Home 화면 중앙 컬럼에 표시됩니다.

## 데이터 흐름 및 처리

1.  **데이터 소스:** Firebase Firestore
    *   **분류된 주제/요약 정보:** `/users/{userId}/classed` 컬렉션. 각 문서는 하나의 주제 요약 블록에 해당합니다.
        *   `classifiedTopic`: AI가 생성한 주제명 (문자열)
        *   `classifiedSummary`: AI가 생성한 요약 내용 (문자열)
        *   `sessionIds`: 해당 주제와 관련된 `focusSessions` 문서 ID 목록 (배열)
        *   `createdAt`: 문서 생성 타임스탬프 (Firestore Timestamp, 정렬에 사용)
        *   `category`: 해당 주제의 카테고리 (문자열, 예: 'Growth'). 이 필터링은 백엔드 또는 데이터 로딩 시점에 적용될 수 있습니다 (현재 프론트엔드 로직에는 미적용).
    *   **개별 방문 세션 정보:** `/users/{userId}/focusSessions` 컬렉션. 각 문서는 특정 웹사이트 방문 세션에 해당합니다.
        *   `url`: 방문한 웹사이트 URL (문자열)
        *   기타 세션 관련 데이터 (시작/종료 시간 등)

2.  **실시간 업데이트:**
    *   Firestore의 `onSnapshot` 리스너를 사용하여 `/users/{userId}/classed` 컬렉션의 변경 사항을 실시간으로 감지합니다.
    *   백엔드에서 새로운 `classed` 문서가 생성되거나 기존 문서가 업데이트되면, 프론트엔드에 자동으로 반영됩니다.

3.  **데이터 로딩 (프론트엔드 - `HomePage.jsx`):**
    *   컴포넌트 마운트 시, 현재 로그인된 사용자의 `userId`를 사용하여 Firestore 리스너를 설정합니다.
    *   `/users/{userId}/classed` 컬렉션에서 `createdAt` 필드를 기준으로 최신순(내림차순)으로 정렬된 최대 6개의 문서를 구독합니다. (주의: 사용자 요구사항 '선입선출'과 실제 구현 '최신순' 확인 필요)
    *   리스너 콜백 함수 내에서:
        *   가져온 각 `classed` 문서에 대해 `sessionIds` 배열을 순회합니다.
        *   각 `sessionId`를 사용하여 `/users/{userId}/focusSessions` 컬렉션에서 해당 문서의 `url` 정보를 비동기적으로 가져옵니다 (`getDoc` 사용).
        *   `Promise.all`을 사용하여 모든 관련 `focusSession` 데이터 조회가 완료될 때까지 기다립니다.
        *   최종적으로 `classed` 문서의 `classifiedTopic`, `classifiedSummary`와 함께 조회된 `focusSessions` 데이터(`id`, `url` 포함)를 객체 형태로 묶어 상태(`picksData`)에 저장합니다.
    *   `HomePage`는 `picksData` 배열을 순회하며 각 항목에 대해 `TodaysPicks` 컴포넌트를 렌더링하고, 필요한 데이터를 `props`로 전달합니다.

## UI 컴포넌트 (`TodaysPicks.jsx`)

*   **입력 데이터 (Props):** `classifiedTopic`, `classifiedSummary`, `focusSessions` 배열 (`{id, url}`)
*   **주요 기능:**
    *   `classifiedTopic`을 카드 제목으로 표시합니다.
    *   `classifiedSummary`를 카드 본문에 표시합니다 (Ant Design `Paragraph` 컴포넌트의 `ellipsis` 기능으로 여러 줄 요약 및 'more' 버튼 제공).
    *   `focusSessions` 배열의 첫 번째 항목(사이트 URL)은 항상 표시됩니다.
        *   사이트의 Favicon과 도메인 이름을 표시합니다.
        *   도메인 이름에 마우스를 올리면 전체 URL이 Tooltip으로 표시됩니다.
        *   링크 클릭 시 새 탭(`target="_blank"`)에서 해당 URL이 열립니다.
    *   `focusSessions` 배열에 항목이 2개 이상일 경우:
        *   "See All" 토글 버튼 (위/아래 화살표 아이콘 포함)이 표시됩니다.
        *   토글 버튼 클릭 시 나머지 `focusSessions` 항목들이 첫 번째 항목과 동일한 형식으로 표시되거나 숨겨집니다.

## 기타 참고 사항

*   사용자 ID (`userId`)는 현재 `HomePage.jsx`에 하드코딩되어 있으며, 실제 인증 시스템과 연동하여 동적으로 가져와야 합니다.
*   `classed` 컬렉션의 정렬 기준 필드(`createdAt`) 및 정렬 방향(최신순 vs. 오래된 순)은 요구사항에 따라 확인 및 조정이 필요할 수 있습니다.
*   데이터 로딩 중 및 에러 발생 시 사용자에게 적절한 피드백(로딩 메시지, 에러 메시지)을 제공합니다.
*   Favicon 로딩 실패 또는 유효하지 않은 URL에 대한 기본적인 에러 처리가 포함되어 있습니다.
