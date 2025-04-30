# 프론트엔드 개발 계획

## 1. 개발 환경 설정 및 기본 구조 (Done)
- **기술 스택:** React, JavaScript, HTML, CSS
- **UI 라이브러리:** Ant Design v4.23.3 (헤더, 네비게이션 등 일부 컴포넌트 활용)
- **프로젝트 구조:** Vite를 사용하여 React 프로젝트 설정 (`frontend` 폴더)
- **기본 레이아웃:**
    - Ant Design `Layout`, `Header`, `Menu` 컴포넌트를 사용하여 기본 레이아웃 (`Layout.jsx`) 구현 (로고, 네비게이션 메뉴: Today, Trend, Gallery, History 포함)
    - `react-router-dom`을 사용하여 기본 페이지 라우팅 (`main.jsx`, `App.jsx`) 설정
    - 각 페이지별 기본 컴포넌트 생성 (`pages/HomePage.jsx` 등)
- **크롬 익스텐션 설정:**
    - 루트 `manifest.json` 파일 수정: `action` 제거, `chrome_url_overrides.newtab`을 `dist/index.html`로 설정
    - `frontend/vite.config.js` 수정: 빌드 결과물을 루트 `dist` 폴더로 출력하도록 설정
- **각 페이지별 피그마 스크린 링크**
    - Home: https://www.figma.com/design/R3RQhODO7oMgs0W2QFgVCB/-LSMA--Screen?node-id=91-27014&t=Na0JltcIKiX44Obo-4
    - Trend: https://www.figma.com/design/R3RQhODO7oMgs0W2QFgVCB/-LSMA--Screen?node-id=112-3476&t=Na0JltcIKiX44Obo-4
    - Gallery: https://www.figma.com/design/R3RQhODO7oMgs0W2QFgVCB/-LSMA--Screen?node-id=113-2830&t=Na0JltcIKiX44Obo-4
    - History: https://www.figma.com/design/R3RQhODO7oMgs0W2QFgVCB/-LSMA--Screen?node-id=114-8086&t=Na0JltcIKiX44Obo-4

## 2. Home 화면 개발 (점진적 개발)
- `Home` 화면을 여러 React 컴포넌트로 분리하여 개발합니다.
- 각 컴포넌트 개발 시, 정적 UI 구현 후 백엔드 연동 (Firebase 데이터 로딩)을 진행합니다.

### 컴포넌트 개발 순서 (예시):
1.  **`WelcomeMessage`** (Done - Basic UI): 사용자 이름 및 시간에 따른 인사말, 현재 시간 표시 (정적/간단한 로직)
    - 기본 UI 및 로직 구현 (`frontend/src/components/home/WelcomeMessage.jsx`)
    - `HomePage`에 통합
    - (TODO: Firebase 연동하여 실제 사용자 이름 표시)
    - (Note: `HomePage` 그리드 레이아웃에 배치 완료)
2.  **`GSuites`** (Placeholder): G-Suites 앱 아이콘 및 링크 목록 (정적)
    - Placeholder 컴포넌트 생성 및 `HomePage` 배치
3.  **`FrequentlyVisitedSites`** (Placeholder): 최근 방문 사이트 목록 (Firebase 데이터 필요)
    - Placeholder 컴포넌트 생성 및 `HomePage` 배치
4.  **`Monitoring`** (Placeholder): 각종 지표 (Total Browsing Time, Max/Average Focus, Focus Score) 표시 (Firebase 데이터 및 계산 로직 필요)
    - Placeholder 컴포넌트 생성 및 `HomePage` 배치
5.  **`DigitalRoutine`** (Placeholder): 시간대별 카테고리 시각화 (Firebase 데이터 필요, 시각화 로직 복잡)
    - Placeholder 컴포넌트 생성 및 `HomePage` 배치
6.  **`TodaysPicks`** (Placeholder): AI 요약 주제, 시간, 관련 페이지 목록 (Gemini API 및 Firebase 데이터 필요)
    - Placeholder 컴포넌트 생성 및 `HomePage` 배치
7.  **`SmartAlerts`** (Placeholder): 특정 조건 충족 시 알림 표시 (백그라운드 로직 또는 프론트엔드 상태 기반)
    - Placeholder 컴포넌트 생성 및 `HomePage` 배치

(Note: `HomePage.jsx`에 Ant Design Grid (`Row`, `Col`)를 사용하여 3단 레이아웃 구조 구현 완료. `index.css`의 `body` 스타일 수정하여 전체 너비 문제 해결 시도.)

## 3. Trend 화면 개발
- (추후 내용 구체화 필요)
- `Home` 화면 개발 이후 진행

## 4. Gallery 화면 개발
- 카테고리별/날짜별 이미지 갤러리 UI 구현
- 이미지 클릭 시 원본 페이지 이동 기능
- Firebase 데이터 연동

## 5. History 화면 개발
- 방문 기록 목록 UI 구현 (크롬 History API 또는 Firebase 데이터 활용)
- 날짜/그룹별 보기 토글 기능

## 6. Settings 화면 개발
- 사용자 이름 설정 입력 필드 및 저장 기능 구현
- Firebase 데이터 연동

## 7. 공통 사항
- **상태 관리:** React Context API 또는 Zustand/Redux 등 상태 관리 라이브러리 도입 고려 (애플리케이션 복잡도에 따라 결정)
- **테스팅:** 주요 컴포넌트 및 기능 단위 테스트 고려
- **코드 스타일:** 일관된 코드 스타일 유지 (ESLint, Prettier 설정)

## 8. 백엔드 연동
- 각 컴포넌트 개발 시 필요한 Firebase 데이터 구조 확인 및 연동
- Firestore 데이터 읽기/쓰기 로직 구현
- Gemini API 호출 로직 구현 (필요시 백엔드 함수 경유)
