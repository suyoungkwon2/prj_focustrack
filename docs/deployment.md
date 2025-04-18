# 배포 프로세스

## Chrome Web Store 배포 준비
1. manifest.json 버전 번호 확인
2. 필요한 파일들이 모두 포함되었는지 확인
   - manifest.json
   - background.js
   - content.js
   - viewer.html
   - firebase-config.js
   - 기타 필요한 리소스 파일들

## 배포 전 체크리스트
- [ ] 모든 API 키가 올바르게 설정됨
- [ ] 빌드가 성공적으로 완료됨
- [ ] 주요 기능이 모두 정상 작동함
- [ ] 버전 번호가 올바르게 업데이트됨

## 배포 단계
1. GitHub Actions 빌드 완료 확인
2. 생성된 zip 파일 다운로드
3. Chrome Web Store Developer Dashboard에 업로드
4. 검수 요청 및 배포
