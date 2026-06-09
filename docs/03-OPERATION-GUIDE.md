# 03. 운영 가이드

문서 번호: LW-OPS-001
버전: 1.1
작성일: 2026-05-22

---

## 1. 일상 운영

### 1.1 자동화 작업 스케줄

| 시각 | 작업 | 스크립트 |
|------|------|---------|
| 06:30 | NAS(Z:\) → raw/sources 7개 폴더 선별 복사 | `sync-nas.ps1` |
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

- ChatGPT Pro $200/월 정액 내 처리 — 추가 토큰 과금 없음
- 모니터링 대상: rate limit 도달 빈도, 일일 처리량 (페이지/일)
- ChatGPT 사용량: chat.openai.com → 설정 → 사용량 탭
- 월 처리량 목표: Phase 4 전량 인제스트 51,000 파일 / 2~3개월

---

### 1.4 유틸리티 스크립트

| 스크립트 | 용도 | 실행 시점 |
|---------|------|----------|
| `fix-encoding.ps1` | .ps1 파일에 UTF-8 BOM 적용 | .ps1 파일 수정 후 |
| `install-deps.ps1` | Node.js + Rust winget 설치 | Phase 1 초기 1회 |
| `setup-env.ps1` | 전원, 디렉터리, PATH, SW 확인 | Phase 0 초기 1회 |
| `watchdog-ingest.ps1` | 인제스트 진전 감시, 앱 자동 재시작 | Task Scheduler 5분 주기 |
| `batch-enqueue.ps1` | 폴더 단위 DOCX/XLSX/TXT 배치 큐 투입 | 인제스트 배치 시작 시 |
| `preprocess-queue.ps1` | 대용량 파일 청크 분할 후 재투입 | 대용량 파일 인제스트 실패 시 |

> PowerShell 5.1은 BOM 없는 UTF-8을 CP949로 해석 → 한국어 포함 .ps1은 반드시 BOM 필요.
>
> **watchdog 등록:**
> ```powershell
> $action = New-ScheduledTaskAction -Execute "powershell.exe" `
>     -Argument "-ExecutionPolicy Bypass -File D:\vault\llm-wiki-vault\scripts\watchdog-ingest.ps1"
> $trigger = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 5) -Once -At (Get-Date)
> Register-ScheduledTask -TaskName "LLM-Wiki-Watchdog" -Action $action -Trigger $trigger -RunLevel Highest
> ```

---

## 2. 자료 투입 규칙

### 2.1 투입 원칙

1. **배치 단위:** 초기 인제스트 — 폴더 단위 순차 처리 (51,000 파일 / 7개 폴더)
2. **파일 형식:** PDF, MD, TXT, DOCX (llm_wiki 지원 포맷)
3. **명명 규칙:** 원본 파일명 유지 (LLM이 파일명을 분류 힌트로 사용)
4. **폴더 구조:** NAS 디렉터리 구조를 raw/sources/ 하위에 보존
5. **금지:** raw/sources/ 내 파일 수정·삭제 (immutable)
6. **정상 운영 후:** 일일 증분 투입 20~30개 이하 권장

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
2. Codex CLI 로그인 상태 확인: `codex login status` → "Logged in using ChatGPT"
3. 네트워크 연결 확인 (api.openai.com 접근)
4. Rate limit 확인 — ChatGPT Pro는 분당 요청 제한 있음
5. 파일 인코딩 확인 (UTF-8 권장)
6. 실패 항목 재시도: 큐 파일에서 retryCount를 0으로 리셋 후 앱 재시작

### 3.6 인제스트 큐 트러블슈팅

**큐 상태 확인:**
```powershell
$q = Get-Content "D:\vault\llm-wiki-vault\.llm-wiki\ingest-queue.json" -Raw | ConvertFrom-Json
$q | Group-Object status | Select Name, Count
```

**실패 항목 재시도 (retryCount 리셋):**
```powershell
# 앱 중단
Stop-Process -Name "llm-wiki" -Force -ErrorAction SilentlyContinue

# 실패 항목을 pending으로 리셋
$qPath = "D:\vault\llm-wiki-vault\.llm-wiki\ingest-queue.json"
$q = Get-Content $qPath -Raw | ConvertFrom-Json
$q | Where-Object { $_.status -eq "failed" } | ForEach-Object {
    $_.status = "pending"; $_.retryCount = 0; $_.error = $null
}
$q | ConvertTo-Json -Depth 10 | Set-Content $qPath -Encoding UTF8

# 앱 재시작 (ProcessStartInfo 방식 — PATH 전달 필수)
$env:PATH = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("PATH","User")
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "C:\dev\llm_wiki\src-tauri\target\release\llm-wiki.exe"
$psi.UseShellExecute = $false; $psi.CreateNoWindow = $false
$psi.EnvironmentVariables["PATH"] = $env:PATH
[System.Diagnostics.Process]::Start($psi) | Out-Null
```

**zombie codex 프로세스 정리:**
```powershell
Get-Process -Name "codex" -ErrorAction SilentlyContinue | Stop-Process -Force
```

**큐가 비었는데 앱이 idle인 경우:**
```powershell
# 다음 배치 투입
.\scripts\batch-enqueue.ps1 -SourceFolder "RA" -BatchSize 500
```

### 3.3 NAS 연결 끊김

```powershell
# SMB 연결 상태 확인
Test-NetConnection -ComputerName 10.11.1.40 -Port 445

# Z: 드라이브 매핑 상태 확인
net use Z:

# 연결 끊어진 경우 재매핑
net use Z: /delete
net use Z: \\10.11.1.40\DR_Dev\공통자료 /persistent:yes
```

### 3.4 디스크 용량 부족

```powershell
# D: 드라이브 대용량 파일 확인
Get-ChildItem D:\vault\llm-wiki-vault -Recurse | Sort Length -Descending | Select -First 20 Name, @{N='MB';E={[math]::Round($_.Length/1MB,1)}}

# Git 이력 정리
cd D:\vault\llm-wiki-vault
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
| file-snapshot.json | auto-commit 시 .bak 복사 | 매일 |
| purpose.md, schema.md | Git 추적 | 변경 시 |

### 4.1 file-snapshot.json 보호

full rescan 회피를 위한 snapshot 백업 정책:

```powershell
# auto-commit.ps1 내 wiki/ 커밋 전에 실행
$VaultPath = "D:\vault\llm-wiki-vault"
Copy-Item "$VaultPath\.llm-wiki\file-snapshot.json" `
           "$VaultPath\.llm-wiki\file-snapshot.bak" -Force
```

**복원 절차** (snapshot 손상 시):
```powershell
# 1. 백업에서 복원 (full rescan 회피)
Copy-Item "$VaultPath\.llm-wiki\file-snapshot.bak" `
           "$VaultPath\.llm-wiki\file-snapshot.json" -Force

# 2. 백업도 없을 경우 — 빈 스키마로 리셋 (full rescan 발생)
Set-Content "$VaultPath\.llm-wiki\file-snapshot.json" `
  '{"version":1,"updatedAt":0,"files":{}}' -Encoding UTF8
```

> **주의:** 빈 스키마 리셋 시 51,000+ 파일 full rescan → HDD 기준 5~15분 소요.

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

- Obsidian에서 `D:\vault\llm-wiki-vault` 열기
- 그래프 뷰로 지식 구조 시각적 탐색
- Obsidian은 읽기 전용 뷰어로만 사용 (wiki/ 직접 수정 금지)
