# 초목기사 기출문제 웹앱

2026-02-27 기준으로 제작한 기출문제 연습 웹앱 샘플입니다.
브라우저에서 바로 실행 가능한 정적 웹앱으로, GitHub Pages 등에 바로 배포 가능합니다.

## 기능
- 문제 목록 표시
- 4지선다형/주관식 타입 지원
- 즉시 채점(문제 단위), 전체 점수 계산
- 오답 복기 모드
- 랜덤 출제
- JSON으로 문제 임포트/수정
- 모바일 친화 UI

## 빠른 시작
1. 로컬 실행
   - `index.html`을 브라우저로 열기
   - 또는 정적 서버 실행
   ```bash
   python -m http.server 5173
   # 브라우저: http://localhost:5173
   ```

2. 문제 편집
   - `data/questions.json` 파일 수정

3. 배포
   - GitHub 새 저장소 생성 후
   - 아래 명령으로 업로드
   ```bash
   cd chomok-exam-webapp
   git init
   git add .
   git commit -m "chore: init 초목기사 기출문제 웹앱"
   git branch -M main
   git remote add origin <YOUR_GITHUB_REPO_URL>
   git push -u origin main
   ```

## GitHub Pages 배포(권장)
- GitHub 저장소의 Settings > Pages > Deploy from a branch
- Branch: `main`, folder: `/ (root)`

