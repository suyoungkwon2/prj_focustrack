이 페이지는 @project_description.md 파일의 "6. 익스텐션 정보 구조 - (1.1) Today's Picks" 기능을 위한 알고리즘을 설명합니다. 

1. "(1.1) Today's Picks" 기능 요약
    - 최근 방문한 페이지들을 분석해, 유사한 주제로 묶습니다.
    - '주제, 내용'을 AI로 요약합니다.
    - 주제별 머무른 총 시간을 제공합니다.
    - 3개의 카테고리 중 'Growth' 카테고리의 페이지만을 대상으로 합니다.
    - 주제별로 방문한 웹사이트 기록을 확인할 수 있습니다.

2. 알고리즘
    a. Active 세션 중 summaryCategory 가 "Growth" 인 항목만을 대상으로 합니다. 
    b. "Growth"인 항목이 총 {30}개가 쌓이면 Classification 알고리즘이 시행됩니다. Calssification을 한번 시행한 뒤에는 다시 0부터 집계 합니다. 
    c. Classification에 활용되는 input data는 users 컬렉션 하위의 focusSessions 컬렉션에서 활용하며, 종류는 다음과 같습니다. 
        - id
        - summaryPoints
        - summaryTopic
        - duration
    d. Classification 결과로 도출되는 output data는 다음과 같습니다.
        - classifiedTopic
        - classifiedSummary
        - classifiedKeywords
        - totalDuration 
        - list of id
    e. Classification 결과는 users 컬렉션 하위의 'classed' 컬렉션(신규 생성 필요)에 저장됩니다. 
    f. Classification 결과는 Frontend 페이지로 연결됩니다.

3. input data 상세
    - 이 섹션은 input data의 활용 방안에 대해 상세히 기술합니다. 
    - id: focusSessions 컬렉션과의 relation을 위해 key로 활용합니다.
    - summaryPoints: 개별 사이트의 상세한 내용을 전달하기 위해 활용합니다. 
    - summaryTopic: 개별 사이트의 대표적인 내용을 전달하기 위해 활용합니다.
    - duration: 사이트별로 가중치를 부여하기 위해 활용합니다. 오래 머무른 사이트는 중요도가 높고, 짧게 머무른 사이트는 중요도가 낮습니다. duration의 최저값은 15초 입니다. 

4. Classification Processing 상세
    - 이 섹션은 classification processing 단계에 대해 상세히 기술합니다. 
    - {30}개 사이트의 input data를 분석하여, 유사한 주제를 가진 site들을 분류하고 하나의 주제로 묶습니다.
    - processing 순서는 다음과 같습니다. 
        (1) 각 사이트들의 summaryTopic 데이터를 토대로, classification을 진행한다. summaryPoints는 이과정에서 활용되지 않는다. 
        (2) 각 class에 포함되는 개별 사이트들의 id를 list of id로 모은다. 
        (3) 각 class에 포함되는 개별 사이트들의 summaryTopic, summaryPoints 데이터를 통합해 classifiedTopic, classifiedSummary로 요약한다. 
        (4) 각 class에 포함되는 개별 사이트들의 duration을 총합해 totalDuration을 구한다.
    - Classification에는 duration을 함께 확인합니다. duration이 긴 사이트의 summaryTopic이나 summaryPoints에 더 높은 가중치를 두어야 합니다. 
    - Classificaiton 과정은 문맥상 의미적 유사성을 토대로 유사한 주제를 볶어주세요.
    - classification processing 단계에서는 바로 직전 프로세스에서 도출한 output data를 함께 활용합니다. 
        - 예를들어 A, B, C, D 4개의 세트에 각각 50개의 사이트가 누적 되어있습니다.
        - A의 결과를 도출할 때에는 A 세트의 데이터를 사용합니다.
        - B의 결과를 도출할 때에는 A의 output data와 B 세트의 데이터를 사용합니다.
        - C의 결과를 도출할 때에는 B의 output data와 C 세트의 데이터를 사용합니다.
        - D의 결과를 도출할 때에는 C의 output data와 D 세트의 데이터를 사용합니다.
    - 이전 세트의 결과가 다음 세트의 분류(grouping) 자체에 영향을 미치고, 최종 요약 생성에도 활용됩니다. 


5. ouput data 상세
    - 이 섹션은 output data의 정의에 대해 상세히 기술합니다. 
    - class는 total duration을 기준으로, 최대 상위 {6}개를 저장합니다. 
    - classifiedTopic: 최대 40자. 여러개의 유관한 사이트의 'summaryPoints, summaryTopic'을 토대로, 이 class를 핵심적으로 요약할 수 있는 주제를 명료하고 간결한 구문으로 도출합니다. 
    - classifiedSummary: 여러개의 유관한 사이트의 'summaryPoints, summaryTopic'을 토대로, 이 class의 내용을 요약하여 3~5개의 bullet points로 제공합니다. 
    - classifiedKeywords: 여러개의 유관한 사이트의 'summaryPoints, summaryTopic'을 토대로, 이 class의 내용을 대표할 수 있는 키워드를 최대 10개로 도출합니다. 
    - totalDuration: Classified 된 사이트들의 duration을 총합해 각 class에서 머무른 총 duration을 도출한 값입니다.. 가장 오래 머무른 class가 가장 중요하고, 덜 머무른 class가 덜 중요하다는 의미로 사용됩니다. 이 데이터는 sorting 등에 활용됩니다. 
    - list of id: 하나의 Class 내에 묶인 사이트들의 id 리스트 입니다. 이후 id 값을 relation으로, 사이트 정보를 불러옵니다. 

6. Frontend 화면
    - 이 섹션은 화면에서 위의 classification 도출 결과가 어떻게 보여지는지 상세히 기술합니다.
    - Frontend 화면은 figma를 참고하세요: https://www.figma.com/design/R3RQhODO7oMgs0W2QFgVCB/-LSMA--Screen?node-id=91-27014&t=0dKSKQ3Z0RA8m4my-4
    - classifiedTopic이 간결한 한줄로 제공됩니다.
    - classifiedSummary가 줄글 형태로 제공됩니다.
    - 해당 class 에서 가장 최근에 방문한 사이트 한개의 주소와 pavicon이 대표로 보여집니다. 
    - 'See All' 버튼을 누르면 접혀있던 사이트 목록이 나타나고 이 class에 해당하는 모든 사이트의 pavicon과 url이 불러와집니다. 가장 최근에 방문한 사이트가 가장 위에 위치합니다. 
    - 해당 class에서 머무른 총 시간인 totalDuration이 함께 표시됩니다.
    - 총 6개의 Class 카드가 totalDuration이 가장 높은 순으로 위에서 부터 아레로 세로로 정렬되어있습니다. 

## 7. 구현 전략 (Implementation Strategy)

### 진행 구조: 단계별 AI 호출 방식 (Multi-Step AI Approach)
이 방식은 각 AI 작업을 별도의 API 호출로 분리하여 처리하는 구조입니다. 복잡성을 낮추고 각 단계의 결과를 더 명확하게 제어할 수 있다는 장점이 있습니다.

1.  **데이터 준비 (Data Preparation):**
    *   트리거: "Growth" 카테고리의 `focusSessions` 항목이 30개 누적되면 이 프로세스를 시작합니다. (Firestore 리스너, 스케줄링된 함수 등 활용)
    *   데이터 로딩: 해당 30개 세션의 `id`, `summaryPoints`, `summaryTopic`, `duration` 데이터를 데이터베이스에서 가져옵니다.
2.  **1단계: 사이트 분류 (AI Call 1 - Classification)**
    *   **입력:** 30개 세션의 `id`, `summaryTopic`, `duration` 정보 리스트. (참고: 문서 4.(1)에 따라 `summaryPoints`는 제외)
    *   **AI 프롬프트:**
        *   "다음 세션 목록을 의미론적 유사성을 기반으로 그룹화해주세요."
        *   "각 세션의 `summaryTopic`을 주요 기준으로 사용하되, `duration`이 긴 세션의 내용에 더 높은 가중치를 부여하여 그룹화해주세요."
        *   "결과는 각 그룹에 속하는 세션 `id`들의 리스트 목록으로 반환해주세요. 예: `[[id1, id5, id12], [id2, id8], [id3, id10, id25], ...]`"
    *   **처리:** AI API를 호출하고, 반환된 그룹 목록 (ID 리스트의 리스트)을 파싱합니다.
3.  **2단계: 그룹별 요약 및 키워드 추출 (AI Call 2 - Summarization per Group)**
    *   **처리:** 1단계에서 얻은 각 그룹(`[id1, id5, id12]`, `[id2, id8]`, ...)에 대해 반복 작업을 수행합니다.
    *   **입력 (각 그룹별):** 해당 그룹에 속한 세션들의 `summaryTopic`, `summaryPoints`, `duration` 정보 리스트.
    *   **AI 프롬프트 (각 그룹별):**
        *   "다음 세션 정보들을 바탕으로 이 그룹의 핵심 내용을 요약하는 `classifiedTopic` (최대 40자, 간결한 구문), `classifiedSummary` (3-5개 글머리 기호), 그리고 내용을 대표하는 `classifiedKeywords` (최대 10개)를 생성해주세요."
        *   "`duration`이 긴 세션의 내용을 중요하게 고려해주세요."
        *   "결과는 다음 JSON 형식으로 반환해주세요: `{ \"classifiedTopic\": \"...\", \"classifiedSummary\": [\"...", \"...\"], \"classifiedKeywords\": [\"...", ...] }`"
        *   **처리:** 각 그룹별로 AI API를 호출하고, 반환된 JSON 결과를 파싱합니다.
4.  **데이터 계산 및 조합 (Calculation & Combination):**
    *   **처리:** 각 그룹에 대해 다음 작업을 수행합니다.
        *   `totalDuration`: 해당 그룹에 속한 세션들의 `duration`을 모두 합산합니다.
        *   결합: 1단계의 `list of id`와 2단계의 요약 결과(`classifiedTopic`, `classifiedSummary`, `classifiedKeywords`), 그리고 계산된 `totalDuration`을 하나의 객체로 합칩니다.
5.  **결과 필터링 및 저장 (Filtering & Storage):**
    *   **처리:**
        *   생성된 모든 그룹 객체들을 `totalDuration` 기준으로 내림차순 정렬합니다.
        *   상위 6개 그룹만 선택합니다.
        *   선택된 그룹 객체들을 `classed` 컬렉션에 저장합니다.
6.  **누적 처리 로직 (Cumulative Logic - 별도 고려):**
    *   문서에 기술된 "이전 세트의 결과 활용" 로직은 AI 호출과는 별개로 구현하는 것이 명확해 보입니다. 초기에는 이 부분을 제외하고 핵심 분류/요약 기능부터 구현하는 것이 좋습니다.

### 이 구조의 장점:
*   **명확성:** 각 AI 호출의 역할이 분명합니다.
*   **제어 용이성:** 각 단계별 결과를 확인하고 디버깅하기 쉽습니다.
*   **프롬프트 단순화:** 각 작업에 맞는 비교적 간단한 프롬프트를 작성할 수 있습니다.
*   **유연성:** 중간 계산(e.g., `totalDuration`)이나 가중치 적용 로직을 AI 호출과 분리하여 구현할 수 있습니다.


### 구현 시 고려사항:
*   **오류 처리:** 각 AI API 호출 및 데이터 처리 단계에서 발생할 수 있는 오류(API 오류, 파싱 오류 등)를 적절히 처리해야 합니다.
*   **로깅:** 각 단계의 입력, 출력, 중간 결과를 로깅하여 디버깅 및 성능 분석에 활용합니다.
*   **비동기 처리:** 여러 그룹에 대한 요약(2단계)은 병렬로 처리하여 성능을 개선할 수 있습니다.
