1. 목적 / 연구 주제
- 내가 진행중인 연구의 수단이 될 크롬 익스텐션을 만들고자 합니다. 
- 연구 주제는 집중력이 낮은 사람들에게 어떤 정보를 보여주면 집중력을 높일 수 있는지 알아보는 것입니다. 
- 사용자 타겟은 대학생, 대학원생, 리서쳐입니다. 웹에서 정보를 탐색하는 시간이 긴 사람들입니다. 
- 크롬 익스텐션을 설치하면 방문 기록을 실시간으로 수집하여, 다양한 기능을 제공합니다.

2. Key Features
- 방문 기록 수집
- 방문 기록 분석
- 방문 기록 시각화
- 방문 기록 저장
- 브라우징 히스토리 기반 관심 주제 요약 및 주제별 방문 페이지 기록 제공
- 주제별 소요 시간 제공
- 브라우징 히스토리를 3개의 카테고리로 분류하여, 핵심 활동 카테고리 제공
- 브라우징 습관 및 루틴 시작화
- 집중 레벨 점수화

3. 설정
- 내 컴퓨터는 맥북입니다.
- 저는 개발 경험이 없는 디자이너입니다. 
- 개발 경험이 없는 멤버 한명 함께 프로젝트를 진행합니다. 
- 개발 경험이 없는 멤버 2명이라, 개발을 최대한 깔끔하고 쉽게 구현하고 싶습니다.
- Gemini API 호출 기능이 많습니다. 
- github: https://github.com/suyoungkwon2/prj_focustrack
- firebase: https://console.firebase.google.com/u/1/project/focustrack-3ba34/

4. 사용 기술
- Firebase을 이용해 DB를 구축하고,
- JavaScript, HTML, CSS를 이용해 크롬 익스텐션을 만들고 싶습니다.
- 일부 Ant Design Library version 4.23.3과, 직접 디자인한 프론트엔드를 구현하고 싶습니다.
- MCP를 사용해 Figma 디자인을 코드로 변환하고 싶습니다.
- Gemini API를 사용해 브라우징 히스토리 기반 관심 주제 요약 및 주제별 방문 페이지 기록 제공 기능을 구현하고 싶습니다.

5. 상세
- 깔끔하고 잘 동작하는 크롬 익스텐션을 만들고 싶습니다.
- 주로 PC에서 사용될 익스텐션입니다.
- 모든 유저의 응답은 구분해서 분석이 가능해야 합니다. 이를 고려해서 테이블을 설계해야 합니다.
- 카테고리는 3가지로 분류합니다: Growth, Entertainment, Daily Life
- 크롬 익스텐션을 설치하면, 크롬 브라우저의 새 탭을 열 때 FocusTrack 화면이 첫 화면이 됩니다. 

6. 익스텐션 정보 구조
(1) Home
- 가장 핵심이 되고 중요한 화면입니다.
- key features들을 모두 포함합니다.
(1.1) Today's Picks
- 최근 방문한 페이지들을 유사한 주제로 묶습니다.
- '주제, 내용'을 AI로 요약합니다.
- 주제별 머무른 총 시간을 제공합니다.
- 3개의 카테고리 중 'Growth' 카테고리의 페이지만을 대상으로 합니다.
- 주제별로 방문한 웹사이트 기록을 확인할 수 있습니다.
(1.2) Digital Routine
- 오늘 하루동안 방문한 웹사이트의 카테고리 변화를 시각화합니다.
- 24시간을 1시간 단위로 나누고, 1시간은 10분 단위로 나눈 블럭을 확인할 수 있습니다.
- 각 블럭은 10분동안 방문한 웹사이트의 카테고리 중, 가장 major한 카테고리의 색상을 표시합니다. 
- 방문 기록이 아예 없는 시간 블럭은 회색으로 표시합니다.
- 3개의 카테고리별 머무른 총 시간을 제공합니다.
(1.3) Monitoring
- 오늘 하루 동안의 집중력 관련 지표를 확인할 수 있습니다.
- Total Browsing Time: 오늘 하루 동안의 총 browsing time 합계
- Max Focus: 오늘 하루 동안 가장 긴 집중력 유지 시간을 안내한다. 
- Average Focus: 오늘 하루 평균 집중력 유지 시간을 안내한다. 
- 집중력 유지 시간: 집중력 유지 시간은 동일한 카테고리 내에서, 동일한 주제의 web browsing을 유지한 duration을 의미한다.
- Focus Score: 집중력 점수
    Focus_Score:  100 \times \left(\frac{(CFD / 60) \times 0.4 + WLR \times 0.4 - (SF / 20) \times 0.1 - (DS / 15) \times 0.1}{1} \right)
    1. Switch Frequency (SF)
        - Measures how often users switch between categories.
        - Frequent category switches indicate lower focus.
        - Example: More than 5 switches within 10 minutes = high switch frequency.
        - Impact on FS: Higher SF = Lower Focus Score
    2. Continuous Focus Duration (CFD)
        - Measures the average uninterrupted time spent in 'Growth' category before switching to another category.
        - Longer durations indicate better focus.
        - Example: Spending 25+ minutes in one category = high focus.
        - Impact on FS: Higher CFD = Higher Focus Score
    3. Work-to-Leisure Ratio (WLR)
        - The proportion of time spent on 'Growth' category compared to 'Entertainment' category.
        - A higher ratio means better focus.
        - Example: 75% of total browsing time in 'Growth' category = high focus.
        - Impact on FS: Higher WLR = Higher Focus Score
     4. Distraction Score (DS)
        - Measures how often users transition from 'Growth' directly to 'Entertainment & Daily Life' category.
        - Frequent transitions indicate more distractions.
        - Example: Switching from an online lecture to YouTube frequently = high distraction.
        - Impact on FS: Higher DS = Lower Focus Score
(1.4) Smart Alerts
- 최근 1시간 내 'Entertainment & Daily Life' 카테고리의 웹 사이트 방문 누적 시간이 30분 이상 지속된다고 판단되면 '시간 낭비 중'이라는 메세지의 Alert를 표시한다. 
- 최근 30분 내 방문한 사이트의 카테고리가 연속적으로 10분 이상 유지되지 않고 계속해서 바뀐다면, '집중 필요' 라는 메세지의 Alert를 표시한다.
(1.5) Frequently Visited Sites
- 최근 3일 동안 방문한 웹사이트 중, 가장 많이 방문한 웹사이트 6개를 제공한다. 
- 아이콘을 클릭하면 해당 웹사이트로 이동한다. 
(1.6) G-Suites
- G-Suites 툴 중 '지메일, 캘린더, 독스, 시트, 슬라이드' 툴을 포함해 총 8개의 핵심 툴 아이콘을 확인할 수 있다.
- 아이콘을 클릭하면 해당 툴로 이동한다. 
(1.7) Welcome Message
- 사용자가 설정한 이름과 함께, '오늘도 화이팅' 과 같은 인사말을 표시한다.
- 인사말은 접속 시간에 따라 다르게 표시된다.
- 사용자가 이름을 설정하지 않으면, 인사말만 표시된다.
- 현재 시간을 보여준다.
(2) Trend
- (추후 내용 추가)
(3) Gallery
- 방문한 웹사이트에서 중요했던 이미지들을 모아서 보여준다.
- 이미지들은 최근 방문한 순서대로 정렬된다.
- 이미지들을 클릭하면 해당 이미지의 원본 페이지로 이동한다.
- 방문 웹사이트의 'category' 별로 이미지를 분류해서 제공한다.
- 방문 일자를 보여준다.
(4) History
- 방문한 웹사이트의 기록을 확인할 수 있다.
- 기록은 시간순으로 정렬된다.
- 크롬에서 기본으로 제공하는 방문 기록과 동일하다.
(5) Settings
- 사용자의 이름을 설정할 수 있다. 

7.  각 페이지별 피그마 스크린 링크
(1) Home
- https://www.figma.com/design/R3RQhODO7oMgs0W2QFgVCB/-LSMA--Screen?node-id=91-27014&t=Na0JltcIKiX44Obo-4
(2) Trend
- https://www.figma.com/design/R3RQhODO7oMgs0W2QFgVCB/-LSMA--Screen?node-id=112-3476&t=Na0JltcIKiX44Obo-4
(3) Gallery
- https://www.figma.com/design/R3RQhODO7oMgs0W2QFgVCB/-LSMA--Screen?node-id=113-2830&t=Na0JltcIKiX44Obo-4
(4) History
- https://www.figma.com/design/R3RQhODO7oMgs0W2QFgVCB/-LSMA--Screen?node-id=114-8086&t=Na0JltcIKiX44Obo-4


8. 디자인 시스템
- UI 프레임워크: Ant Design v4.23.3 (헤더와 좌측 메뉴 바 컴포넌트)

9. 배포 및 버전 관리
- 배포 목표일: 2024년 4월 27일
- 배포 플랫폼: Chrome Web Store
- 버전 관리 규칙:
  * MAJOR.MINOR.PATCH 형식 사용 (예: 1.2.3)
  * MAJOR: 수동 변경 (큰 기능 변경 시)
  * MINOR: main 브랜치 배포 시 자동 증가
  * PATCH: 개별 브랜치 푸시 시 자동 증가

10. 개발 프로세스
- Feature 단위 개발 및 테스트
- API 호출 테스트 중심
- 상세 로깅 시스템 구현
- Git 사용 경험이 적은 팀을 위한 간단한 워크플로우 채택

