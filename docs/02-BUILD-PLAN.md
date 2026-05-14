# 02. 구축 계획

문서 번호: LW-BUILD-001
버전: 1.0
작성일: 2026-05-14

---

## Phase 0: 사전 준비 (1시간)

### 0.1 디스크 정리 및 파티션 확인

```powershell
# 디스크 여유 공간 확인
Get-PSDrive -PSProvider FileSystem | Select Name, @{N='Free(GB)';E={[math]::Round($_.Free/1GB,1)}}, @{N='Used(GB)';E={[math]::Round($_.Used/1GB,1)}}

# D: 드라이브 vault 디렉터리 생성
New-Item -ItemType Directory -Path "D:\vault" -Force
New-Item -ItemType Directory -Path "D:\vault\raw\sources" -Force
New-Item -ItemType Directory -Path "D:\vault\raw\assets" -Force
New-Item -ItemType Directory -Path "D:\nas-sync" -Force
```

### 0.2 전원 설정 (24시간 운영)

```powershell
# 고성능 전원 프로필 활성화
powercfg /setactive 8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c

# 절전/최대절전 비활성화
powercfg /change standby-timeout-ac 0
powercfg /change hibernate-timeout-ac 0
powercfg /change disk-timeout-ac 0
powercfg /change monitor-timeout-ac 30

# 최대절전 파일 제거 (SSD 용량 확보)
powercfg /hibernate off
```

### 0.3 Windows Update 자동 재시작 비활성화

```powershell
# 레지스트리로 자동 재시작 차단
$path = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU"
New-Item -Path $path -Force
Set-ItemProperty -Path $path -Name "NoAutoRebootWithLoggedOnUsers" -Value 1 -Type DWord
```

---

## Phase 1: 소프트웨어 설치 (2시간)

### 1.1 Node.js 20 LTS

```powershell
# winget으로 설치 (또는 https://nodejs.org 에서 다운로드)
winget install OpenJS.NodeJS.LTS --version 20.18.0

# 설치 확인
node --version   # v20.x.x
npm --version    # 10.x.x
```

### 1.2 Rust 툴체인

```powershell
# rustup 설치 (https://rustup.rs)
# Visual Studio Build Tools 필요 — rustup 설치 중 자동 안내

rustup default stable
rustc --version   # 1.70+ 확인
cargo --version
```

### 1.3 Git

```powershell
winget install Git.Git

git --version
git config --global user.name "your-name"
git config --global user.email "your-email"
```

### 1.4 nashsu/llm_wiki 빌드

```powershell
# 소스 클론
cd C:\dev
git clone https://github.com/nashsu/llm_wiki.git
cd llm_wiki

# 의존성 설치
npm install

# 개발 모드 실행 (빌드 전 동작 확인)
npm run tauri dev

# 프로덕션 빌드
npm run tauri build
# → src-tauri/target/release/bundle/ 에 설치 파일 생성
```

> **빌드 실패 시 체크리스트:**
> - Visual Studio Build Tools C++ 워크로드 설치 확인
> - Rust stable 1.70+ 확인
> - Node.js 20+ 확인
> - `npm install` 에러 없이 완료 확인

### 1.5 Obsidian 설치 (선택)

```powershell
winget install Obsidian.Obsidian
```

설치 후 `D:\vault` 를 vault로 열기.
llm_wiki가 자동 생성하는 `.obsidian/` 설정을 사용.

---

## Phase 2: 프로젝트 초기화 (30분)

### 2.1 llm_wiki 프로젝트 생성

1. llm_wiki 앱 실행
2. Welcome Screen → "New Project"
3. 디렉터리: `D:\vault` 선택
4. 템플릿: "Research" 또는 "General" 선택
5. 자동 생성 확인:
   - `D:\vault\purpose.md`
   - `D:\vault\schema.md`
   - `D:\vault\raw\sources\`
   - `D:\vault\wiki\`
   - `D:\vault\.llm-wiki\`

### 2.2 LLM 제공자 설정

llm_wiki Settings에서:

| 설정 | 값 |
|------|------|
| Provider | Anthropic |
| API Key | `sk-ant-xxxxx` |
| Model | claude-sonnet-4-20250514 (비용 효율) |

### 2.3 purpose.md 작성

```markdown
# Purpose

## Goals
- 회사 기술 자료(데이터시트, 규격서, 설계문서)를 구조화된 지식 베이스로 컴파일
- 교차참조와 모순 표시를 통한 기술 의사결정 지원
- NAS 자료의 점진적 지식 자산화

## Key Questions
- 각 ROIC/Gate IC의 타이밍 파라미터 비교?
- 규격서 간 상충되는 요구사항?
- 프로젝트별 기술 의존성 맵?

## Scope
- X-ray FPD 하드웨어 관련 기술문서
- 의료기기 규격서 (IEC, FDA, CE)
- 소프트웨어 설계 문서
```

### 2.4 Git 초기화

```powershell
cd D:\vault
git init
git remote add origin <your-gitea-or-github-url>

# .gitignore 생성
@"
.llm-wiki/chat-history/
.obsidian/workspace.json
.obsidian/workspace-mobile.json
raw/sources/*.pdf
raw/sources/*.docx
"@ | Out-File -Encoding utf8 .gitignore

git add .
git commit -m "init: LLM Wiki vault 초기화"
git push -u origin main
```

> **raw/sources/ 바이너리 파일(PDF 등)은 .gitignore에 포함.**
> Git은 wiki/ (마크다운)와 설정 파일만 추적.
> 원본 자료는 NAS가 원본 저장소.

---

## Phase 3: NAS 동기화 설정 (1시간)

### 3.1 Synology Drive Client 방식 (권장)

1. Synology Drive Client 설치
2. 동기화 작업 생성:
   - NAS 폴더: `/volume1/shared/datasheets` (예시)
   - 로컬 폴더: `D:\nas-sync\datasheets`
   - 동기화 방향: NAS → PC (단방향 다운로드)
   - 파일 필터: `*.pdf, *.md, *.txt, *.docx, *.xlsx`

### 3.2 선별 투입 스크립트

```powershell
# scripts/sync-nas.ps1
# NAS 동기화 스테이징에서 vault raw로 선별 복사

param(
    [string]$Source = "D:\nas-sync\datasheets",
    [string]$Destination = "D:\vault\raw\sources\datasheets",
    [string[]]$Extensions = @("*.pdf", "*.md", "*.txt", "*.docx")
)

if (-not (Test-Path $Destination)) {
    New-Item -ItemType Directory -Path $Destination -Force
}

foreach ($ext in $Extensions) {
    $files = Get-ChildItem -Path $Source -Filter $ext -Recurse
    foreach ($file in $files) {
        $destFile = Join-Path $Destination $file.Name
        if (-not (Test-Path $destFile)) {
            Copy-Item $file.FullName $destFile
            Write-Host "[NEW] $($file.Name)" -ForegroundColor Green
        }
    }
}

Write-Host "`nSync complete. New files copied to raw/sources/" -ForegroundColor Cyan
```

### 3.3 자동 동기화 (Task Scheduler)

```powershell
# 매일 06:00에 NAS → vault 동기화
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-File D:\vault\scripts\sync-nas.ps1"
$trigger = New-ScheduledTaskTrigger -Daily -At 6am
Register-ScheduledTask -TaskName "LLM-Wiki-NAS-Sync" `
    -Action $action -Trigger $trigger -RunLevel Highest
```

---

## Phase 4: 파일럿 인제스트 (1주)

### 4.1 테스트 자료 투입

1. `D:\vault\raw\sources\` 에 10~20개 문서 배치
2. llm_wiki 앱에서 "Ingest" 실행
3. 2단계 인제스트 확인:
   - Step 1 (분석): 엔티티·개념 추출
   - Step 2 (생성): 위키 페이지 생성 + frontmatter 출처 추적
4. `wiki/` 폴더에 생성된 페이지 확인

### 4.2 검증 항목

| # | 항목 | 판정 기준 |
|---|------|----------|
| 1 | 위키 페이지 생성 | raw 문서당 최소 1개 source summary 생성 |
| 2 | 엔티티 추출 | 주요 IC/부품명이 entities/ 에 개별 페이지로 존재 |
| 3 | 위키링크 | `[[slug]]` 형식으로 페이지 간 연결 |
| 4 | frontmatter | type, title, tags, sources 필드 존재 |
| 5 | index.md | 전체 카탈로그 반영 |
| 6 | overview.md | 전역 요약 자동 갱신 |
| 7 | 증분 캐시 | 동일 파일 재인제스트 시 건너뜀 (SHA256) |

### 4.3 비용 추적

파일럿 기간 동안 Anthropic 대시보드에서 일일 토큰 소모량 기록.
목표: 20개 문서 인제스트 총 비용 $15 이내.

---

## Phase 5: 안정화 및 확장 (2~4주)

### 5.1 자료 확장

- 파일럿 통과 후 NAS 추가 폴더를 동기화 대상에 포함
- 배치 단위: 20~30개씩 점진 투입
- 매 배치 후 wiki/ 품질 확인

### 5.2 Git 커밋 자동화

```powershell
# scripts/auto-commit.ps1
cd D:\vault
$changes = git status --porcelain wiki/
if ($changes) {
    git add wiki/
    $date = Get-Date -Format "yyyy-MM-dd HH:mm"
    git commit -m "wiki: auto-update $date"
    git push
}
```

Task Scheduler로 매일 23:00에 실행.

### 5.3 상태 점검 루틴

```powershell
# scripts/health-check.ps1
Write-Host "=== LLM Wiki Health Check ===" -ForegroundColor Cyan

# 디스크 여유
Get-PSDrive C, D | Format-Table Name, @{N='Free(GB)';E={[math]::Round($_.Free/1GB,1)}}

# vault 통계
$rawCount = (Get-ChildItem D:\vault\raw\sources -Recurse -File).Count
$wikiCount = (Get-ChildItem D:\vault\wiki -Recurse -Filter "*.md").Count
Write-Host "Raw sources: $rawCount"
Write-Host "Wiki pages:  $wikiCount"
Write-Host "Ratio:       $([math]::Round($wikiCount/$rawCount, 1))x" 

# llm_wiki 프로세스
$proc = Get-Process -Name "llm*wiki*" -ErrorAction SilentlyContinue
if ($proc) { Write-Host "llm_wiki: RUNNING" -ForegroundColor Green }
else { Write-Host "llm_wiki: STOPPED" -ForegroundColor Red }

# Git 상태
cd D:\vault
$dirty = git status --porcelain wiki/
if ($dirty) { Write-Host "Git: uncommitted changes in wiki/" -ForegroundColor Yellow }
else { Write-Host "Git: clean" -ForegroundColor Green }
```
