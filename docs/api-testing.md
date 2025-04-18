# API 테스트 가이드

## Gemini API 테스트
1. 콘솔 로그 확인 방법
   - Chrome 개발자 도구 열기 (F12)
   - Console 탭 선택
   - '[GEMINI]' 태그로 시작하는 로그 확인

2. 주요 로그 포인트
   - API 호출 시작: '[GEMINI] Calling API for summary...'
   - 응답 수신: '[GEMINI] Summary received:'
   - 에러 발생: '[GEMINI] API call failed:'

3. 테스트 체크리스트
   - API 키가 올바르게 설정되었는지 확인
   - 응답 시간이 적절한지 확인 (15초 이내)
   - 에러 발생 시 로그 캡처하여 보관