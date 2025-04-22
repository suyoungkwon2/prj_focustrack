
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
        (1) 각 사이트들의 summaryTopic 데이터를 토대로, classification을 진행한다. 
        (2) 각 class에 포함되는 개별 사이트들의 id를 list of id로 모은다. 
        (3) 각 class에 포함되는 개별 사이트들의 summaryTopic, summaryPoints 데이터를 통합해 classifiedTopic, classifiedSummary로 요약한다. 
        (4) 각 class에 포함되는 개별 사이트들의 duration을 총합해 totalDuration을 구한다.
    - classification processing 단계에서는 바로 직전 프로세스에서 도출한 output data를 함께 활용합니다. 
        - 예를들어 A, B, C, D 4개의 세트에 각각 50개의 사이트가 누적 되어있습니다.
        - A의 결과를 도출할 때에는 A 세트의 데이터를 사용합니다.
        - B의 결과를 도출할 때에는 A의 output data와 B 세트의 데이터를 사용합니다.
        - C의 결과를 도출할 때에는 B의 output data와 C 세트의 데이터를 사용합니다.
        - D의 결과를 도출할 때에는 C의 output data와 D 세트의 데이터를 사용합니다.


5. ouput data 상세
    - 이 섹션은 output data의 정의에 대해 상세히 기술합니다. 
    - class는 total duration을 기준으로, 최대 상위 {6}개를 저장합니다. 
    - classifiedTopic: 여러개의 유관한 사이트의 'summaryPoints, summaryTopic'을 토대로, 이 class를 핵심적으로 요약할 수 있는 주제를 명료하고 간결한 구문으로 도출합니다. 
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