# 초목기사 기출문제 웹앱

정적 HTML/CSS/JS 기반의 기출문제 연습 앱입니다.

## 핵심 기능
- 문제 타입: 객관식(`multiple`) / 단답형(`short`)
- 한문항/전체 보기 모드 전환
- 시험 모드 타이머 + 시험 종료 자동 채점
- 난이도 필터(하/중/상) 및 표시 개수 제한
- JSON 임포트(텍스트/파일)
- 로컬 백업 저장/복원
- 오답 복기 + 오답 마크다운 복사
- 프리셋(빠른 체크/본시험 모의/학습 루틴) 지원
- 채점 후 자동 다음(시험 모드에서 옵션)
- 단답형 정규화 강화(단위/기호 표기 유연 매칭)

## 로컬 실행
```bash
cd chomok-exam-webapp
python -m http.server 8000
# 브라우저: http://127.0.0.1:8000
```

> 서버 없이 `index.html`을 바로 열어도 기본 동작합니다.

## 데이터 형식
`data.json` 예시
```json
{
  "questions": [
    {
      "id": "Q1",
      "question": "문항 내용",
      "type": "multiple",
      "options": ["1", "2", "3", "4"],
      "answer": "2",
      "explanation": "해설",
      "difficulty": "normal"
    },
    {
      "id": "Q2",
      "question": "면적 단위로 알맞은 것은?",
      "type": "short",
      "answer": "㎠",
      "explanation": "단위 정규화 처리",
      "difficulty": "easy"
    }
  ]
}
```
- `id`가 비어있거나 중복되면 앱에서 자동 보정합니다.

## 시험 프리셋 사용법
- 프리셋: 빠른 체크, 본시험 모의, 학습 루틴, 직접설정
- `시험 시작`은 현재 설정 기준으로 즉시 세션이 구성됩니다.
- 시험 모드에서 `채점 후 자동 다음`을 켜면 한문항씩 퀴즈 시 진행이 빨라집니다.

## 오답 복기/채점
- 시험 종료/시간 종료 시 오답 목록 패널이 자동으로 열립니다.
- 오답 복사 시 각 문항별로 `난이도`, `내 답안`, `정답`, `해설`이 함께 출력됩니다.

## GitHub 배포
```bash
git init -b main

git add README.md index.html styles.css script.js data.json .gitignore
git commit -m "chore: update chomok exam webapp"

git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

## GitHub Pages 배포(권장)
1. GitHub 저장소 Settings > Pages
2. Source: `Deploy from a branch`
3. Branch: `main`, Folder: `/ (root)`
4. 저장 후 제공되는 Pages URL로 배포 확인

## 마무리 체크
- `http://127.0.0.1:8000/index.html` 응답 확인
- 채점/복기/복사 동작 확인
