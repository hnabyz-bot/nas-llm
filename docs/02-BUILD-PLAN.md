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
# NAS 네트워크 드라이브 매핑 (Z:)은 Phase 3에서 설정
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

### 3.1 SMB 네트워크 드라이브 매핑

NAS에 SMB로 직접 접근하여 Synology Drive Client 없이 운영.

```powershell
# NAS 공유 폴더를 Z: 드라이브로 영구 매핑
net use Z: \\10.11.1.40\DR_Dev\공통자료 /persistent:yes

# 연결 확인
Test-Path Z:\
net use Z:
```

> **참고:** Synology Drive Client는 불필요. SMB 직접 연결로 단순화.

### 3.2 선별 투입 스크립트

```powershell
# scripts/sync-nas.ps1
# NAS(SMB 네트워크 드라이브)에서 vault raw/sources로 선별 복사

param(
    [string]$Source = "Z:\",
    [string]$Destination = "D:\vault\raw\sources",
    [string[]]$Extensions = @("*.pdf", "*.md", "*.txt", "*.docx", "*.xlsx"),
    [switch]$DryRun
)

# NAS 네트워크 드라이브 접근 확인
if (-not (Test-Path $Source)) {
    Write-Host "NAS 드라이브 접근 불가: $Source" -ForegroundColor Red
    Write-Host "  net use Z: \\10.11.1.40\DR_Dev\공통자료 /persistent:yes" -ForegroundColor Yellow
    exit 1
}

foreach ($ext in $Extensions) {
    $files = Get-ChildItem -Path $Source -Filter $ext -Recurse -File -ErrorAction SilentlyContinue
    foreach ($file in $files) {
        $relativePath = $file.FullName.Substring($Source.Length).TrimStart('\')
        $destFile = Join-Path $Destination $relativePath
        $destDir = Split-Path $destFile -Parent

        if (-not (Test-Path $destFile)) {
            if (-not $DryRun) {
                if (-not (Test-Path $destDir)) {
                    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
                }
                Copy-Item $file.FullName $destFile
            }
            Write-Host "  [NEW] $relativePath" -ForegroundColor Green
        }
    }
}
```

### 3.3 자동 동기화 (Task Scheduler)

```powershell
# 매일 06:30에 NAS(Z:) → vault 동기화
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-File D:\vault\scripts\sync-nas.ps1"
$trigger = New-ScheduledTaskTrigger -Daily -At 6:30am
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
