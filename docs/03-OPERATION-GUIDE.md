# 03. 운영 가이드

문서 번호: LW-OPS-001
버전: 1.0
작성일: 2026-05-14

---

## 1. 일상 운영

### 1.1 자동화 작업 스케줄

| 시각 | 작업 | 스크립트 |
|------|------|---------|
| 06:00 | NAS → nas-sync 동기화 | Synology Drive Client |
| 06:30 | nas-sync → raw/sources 선별 복사 | `sync-nas.ps1` |
| - | llm_wiki auto-watch가 raw/ 변경 감지 | 앱 내장 |
| 23:00 | wiki/ Git 자동 커밋 & 푸시 | `auto-commit.ps1` |
| 일요일 09:00 | 상태 점검 | `health-check.ps1` |

### 1.2 수동 작업

| 작업 | 빈도 | 방법 |
|------|------|------|
| 자료 투입 판단 | 수시 | NAS에서 어떤 폴더를 동기화 대상에 추가할지 결정 |
| 인제스트 트리거 | 필요 시 | llm_wiki UI에서 수동 Ingest (auto-watch 외) |
| purpose.md 갱신 | 월 1회 | 연구 방향, 핵심 질문 업데이트 |
| schema.md 조정 | 필요 시 | 페이지 타입 추가, frontmatter 규칙 변경 |
| Lint 실행 | 주 1회 | llm_wiki → Lint 탭에서 구조 점검 |
| Review 처리 | 주 1회 | llm_wiki → Review 탭에서 LLM 플래그 항목 확인·판단 |

### 1.3 비용 모니터링

- Anthropic Console (https://console.anthropic.com) → Usage 탭
- 주간 토큰 소모량 기록
- 월 예산 임계값 설정: 초기 $50, 안정화 후 조정

---

## 2. 자료 투입 규칙

### 2.1 투입 원칙

1. **배치 단위:** 한 번에 20~30개 이하
2. **파일 형식:** PDF, MD, TXT, DOCX (llm_wiki 지원 포맷)
3. **명명 규칙:** 원본 파일명 유지 (LLM이 파일명을 분류 힌트로 사용)
4. **폴더 구조:** NAS 디렉터리 구조를 raw/sources/ 하위에 보존
5. **금지:** raw/sources/ 내 파일 수정·삭제 (immutable)

### 2.2 대용량 파일 처리

| 파일 크기 | 처리 방법 |
|----------|----------|
| < 1MB | 그대로 투입 |
| 1~10MB | PDF의 경우 텍스트 추출 가능 여부 확인 후 투입 |
| > 10MB | 챕터/섹션 단위로 분할 투입 권장 |
| 이미지 위주 PDF | 스캔 문서는 OCR 선행 필요 (별도 도구) |

---

## 3. 트러블슈팅

### 3.1 llm_wiki 앱이 시작되지 않을 때

```powershell
# Tauri WebView2 런타임 확인
Get-AppxPackage *WebView2*

# 없으면 설치
# https://developer.microsoft.com/en-us/microsoft-edge/webview2/
```

### 3.2 인제스트 실패 시

1. llm_wiki → Activity 패널에서 에러 메시지 확인
2. API 키 유효성 확인 (Anthropic Console)
3. 네트워크 연결 확인 (api.anthropic.com 접근)
4. 파일 인코딩 확인 (UTF-8 권장)
5. 큐에서 실패 항목 Retry

### 3.3 NAS 연결 끊김

```powershell
# SMB 연결 상태 확인
Test-NetConnection -ComputerName <NAS-IP> -Port 445

# Synology Drive Client 재시작
Get-Process "Synology Drive Client" | Stop-Process -Force
Start-Process "C:\Program Files\Synology\SynologyDrive\bin\cloud-drive-ui.exe"
```

### 3.4 디스크 용량 부족

```powershell
# D: 드라이브 대용량 파일 확인
Get-ChildItem D:\vault -Recurse | Sort Length -Descending | Select -First 20 Name, @{N='MB';E={[math]::Round($_.Length/1MB,1)}}

# Git 이력 정리
cd D:\vault
git gc --aggressive
```

### 3.5 wiki/ 품질 저하 감지 시

1. Lint 실행: 고아 페이지, 깨진 링크, 누락 페이지 확인
2. 문제 페이지를 wiki/에서 삭제 후 해당 소스를 재인제스트
3. schema.md 규칙 강화 (LLM 지시 정밀화)

---

## 4. 백업 전략

| 대상 | 방법 | 주기 |
|------|------|------|
| wiki/ | Git push (자동) | 매일 |
| raw/sources/ | NAS가 원본, 로컬은 사본 | - |
| .llm-wiki/ (앱 설정) | 수동 백업 → NAS | 월 1회 |
| purpose.md, schema.md | Git 추적 | 변경 시 |

---

## 5. 확장 시나리오

### 5.1 Deep Research 활용

llm_wiki의 Deep Research 기능:
1. LLM이 검색 주제 자동 생성
2. Tavily/SerpApi/SearXNG로 웹 검색
3. 검색 결과를 자동으로 wiki에 인제스트

설정: Settings → Web Search → API 키 입력

### 5.2 Chrome Web Clipper

1. llm_wiki Chrome 확장 설치
2. 웹페이지에서 원클릭으로 raw/sources/에 마크다운 저장
3. 자동 인제스트 트리거

### 5.3 Obsidian 병행 사용

- Obsidian에서 `D:\vault` 열기
- 그래프 뷰로 지식 구조 시각적 탐색
- Obsidian은 읽기 전용 뷰어로만 사용 (wiki/ 직접 수정 금지)
