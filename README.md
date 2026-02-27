# 토목기사 기출문제 웹앱

정적 HTML/CSS/JS 기반의 기출문제 연습 앱입니다.

## 핵심 기능
- 문제 타입: 객관식(`multiple`) / 단답형(`short`)
- 한문항/전체 보기 모드 전환

- 출제군 분리 지원: `토목기사`, `공기업`, `공무원` 카테고리로 분류 필터
- 데이터 임포트 시 `category` 필드로 분류 제어(`토목기사`는 기본값)
- 시험 모드 타이머 + 시험 종료 자동 채점
- 난이도 필터(하/중/상) 및 표시 개수 제한
- JSON 임포트(텍스트/파일)
- 모바일/키보드/접근성 튜닝 완료

## 데이터 구성
- 기본 파일: `data.json`
- 각 문제 필드
  - `id`: 고유 ID(미입력시 자동 보정)
  - `category`: `토목기사 | 공기업 | 공무원`
  - `question`: 문제 본문
  - `media`: 문제 이미지 경로(선택). `string` 또는 `{ src, alt, caption }`
  - `type`: `multiple` 또는 `short`, `truefalse`도 선택지 기반으로 동작
  - `options`: 보기 배열(객관식/truefalse)
  - `answer`: 정답(문항 유형에 맞게 문자열)
  - `explanation`: 해설
  - `difficulty`: `easy | normal | hard`

## 사용 예시(권장)
- 토목기사만 풀기: `카테고리`에서 `토목기사`
- 공기업 모의고사 형태: `카테고리`에서 `공기업`, 난이도/문항수 조정
- 공무원 시험 대비: `카테고리`에서 `공무원`, `시험 모드` + `자동 다음` 조합

## 빠른 시작
1. 로컬 실행
   - `index.html`을 브라우저로 열기
   - 또는 정적 서버 실행
   ```bash
   cd chomok-exam-webapp
   python -m http.server 8000
   # 브라우저: http://localhost:8000
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

## 이번 확장 업데이트(요약)
- 한문항씩 보기/전체 보기 전환
- 시험 모드 타이머(분 단위) 및 시험 종료 처리
- 난이도/표시개수 필터
- JSON 파일 업로드(로컬 파일 선택)
- 로컬 백업 저장/복원 및 오답 내역 마크다운 복사


### 추가로 보완된 부분
- 시험 모드에서 채점 후 자동 다음 이동(체크박스)
- 단답형 채점 정규화 강화(공백/구두점 완화 처리)
- 문제 ID 자동 보정(미지정/중복 ID 자동 재할당)
- 미응답 문항은 최종 점수에서 감점 처리

### 최근 업데이트(요약)
- 시험 모드 전용 프리셋(빠른 체크/본시험 모의/학습 루틴) 추가
- 프리셋 드롭다운과 즉시 적용 버튼 추가
- 프리셋에 따른 모드/난이도/출제방식/시간/자동 다음 설정 일괄 반영
- 미응답 포함 점수 처리 및 오답 카피 동작 유지

### 반응형/터치/접근성 보강
- 화면 너비별 대응(모바일/태블릿/데스크톱)
- 최소 터치 타깃 44px 적용
- 포커스 가시성 및 reduced-motion 대응
- 키보드 단축키(한문항 모드)
  - `←` `→` : 이전/다음
  - `1~9` : 보기 선택
  - `Enter` : 채점

## 카테고리(출제분류)

현재 버전은 `category` 기반으로 필터링합니다.
- `토목기사`
- `공기업`
- `공무원`

JSON에 `category`가 없으면 기본 `토목기사`로 처리됩니다.

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



### 그림 문제(응용역학/도면) 등록
- `data.json` 또는 JSON 임포트에서 `media` 필드를 넣으면 문제 아래에 이미지가 표시됩니다.
  - 예시(문자열): `"media": "images/응용역학_Q01.png"`
  - 예시(객체): `"media": {"src":"images/응용역학_Q01.png", "alt":"응력선도", "caption":"그림 1. 지반 응력 분포"}`
- 이미지는 `chomok-exam-webapp` 폴더에 상대경로로 넣어두면 바로 로드됩니다.
- GitHub Pages 배포 시에도 같은 상대 경로가 유지되어야 하므로, `images/` 폴더를 리포에 함께 올려주세요.

## 카테고리 샘플/템플릿 생성
- 분류별 JSON/CSV/템플릿을 한 번에 만들기:
  ```bash
  node scripts/export-category-samples.js
  ```
- 출력 파일: `templates/`
  - `토목기사.json`, `공기업.json`, `공무원.json`
  - 동일한 `*.csv`, `*.template.json`
- 템플릿 파일은 신규 문제 추가 시 스키마 복사에 사용하세요.


## 실행 스크립트
```bash
npm run start             # 로컬 정적 서버 실행(8000)
npm run validate          # 문법/데이터/템플릿 체크
npm run export-categories # 분류별 JSON/CSV 템플릿 재생성
```

## 마무리 체크
- `http://127.0.0.1:8000/index.html` 응답 확인
- 채점/복기/복사 동작 확인
