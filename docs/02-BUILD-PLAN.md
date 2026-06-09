# 02. 구축 계획

문서 번호: LW-BUILD-001
버전: 1.0
작성일: 2026-05-14

---

## Phase 0: 사전 준비 (1시간)

### 0.1 환경 설정 스크립트 실행

```powershell
# 관리자 PowerShell에서 실행
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser
.\scripts\fix-encoding.ps1    # UTF-8 BOM 적용 (한국어 ps1 필수)
.\scripts\setup-env.ps1       # 전원설정, 디렉터리, SW 확인, WinUpdate
```

> **주의:** Cowork/에디터로 .ps1 파일 수정 후 반드시 `fix-encoding.ps1` 실행.
> PowerShell 5.1은 UTF-8 BOM 없으면 한국어를 CP949로 해석하여 파싱 에러 발생.

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

### 1.1 일괄 설치 스크립트

```powershell
# 관리자 PowerShell에서 실행
.\scripts\install-deps.ps1    # Node.js LTS + Rust + protoc 자동 설치
```

설치 후 PATH 미반영 시 수동 추가:

```powershell
# PATH에 Node.js + Cargo 추가 (영구 + 현재 세션)
$nodePath = "C:\Program Files\nodejs"
$cargoPath = "$env:USERPROFILE\.cargo\bin"
$currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
$newPaths = @()
if ($currentPath -notlike "*$nodePath*") { $newPaths += $nodePath }
if ($currentPath -notlike "*$cargoPath*") { $newPaths += $cargoPath }
if ($newPaths.Count -gt 0) {
    $updated = ($currentPath.TrimEnd(';') + ';' + ($newPaths -join ';'))
    [Environment]::SetEnvironmentVariable("Path", $updated, "User")
}
$env:Path = "$nodePath;$cargoPath;$env:Path"
```

### 1.2 설치 확인 (새 PowerShell 창)

```powershell
node --version    # v20+ (LTS)
rustc --version   # 1.70+
cargo --version
git --version     # 2.x
protoc --version  # libprotoc 3.x 이상 (prost-build 빌드 필수)
git config --global user.name "your-name"
git config --global user.email "your-email"
```

> **참고:** winget이 설치는 하지만 PATH에 자동 등록하지 않는 경우가 있음.
> Node.js: `C:\Program Files\nodejs`, Rust: `%USERPROFILE%\.cargo\bin` 확인.

### 1.3 nashsu/llm_wiki 빌드

```powershell
# 이 repo 루트에서 실행 (관리자 불필요)
.\scripts\build-llm-wiki.ps1
```

스크립트가 자동으로 수행하는 작업:
1. `C:\dev` 디렉터리 생성
2. `nashsu/llm_wiki` 클론 → `C:\dev\llm_wiki`
3. `npm install` (의존성 설치)
4. `npm run tauri build` (프로덕션 빌드)
5. 완료 후 다음 단계 안내 출력

개발 모드(빌드 생략)로만 확인할 경우:

```powershell
.\scripts\build-llm-wiki.ps1 -DevOnly
# 이후 직접 실행:
cd C:\dev\llm_wiki
npm run tauri dev
```

> **빌드 실패 시 체크리스트:**
> - Visual Studio Build Tools C++ 워크로드 설치 확인
> - `rustc --version` → 1.70 이상
> - `node --version` → 20 이상
> - `npm install` 이 에러 없이 완료됐는지 확인

### 1.4 Obsidian 설치 (선택)

```powershell
winget install Obsidian.Obsidian
```

설치 후 `D:\vault\llm-wiki-vault` 를 vault로 열기.
llm_wiki가 자동 생성하는 `.obsidian/` 설정을 사용.

---

## Phase 2: 프로젝트 초기화 (30분)

### 2.1 llm_wiki 프로젝트 생성

1. llm_wiki 앱 실행: `C:\dev\llm_wiki\src-tauri\target\release\llm-wiki.exe`
2. Welcome Screen → "New Project"
3. 부모 디렉터리: `D:\vault` 선택, 프로젝트 이름: `llm-wiki-vault`
4. 템플릿: "Research" 선택
5. 자동 생성 확인:
   - `D:\vault\llm-wiki-vault\purpose.md`
   - `D:\vault\llm-wiki-vault\schema.md`
   - `D:\vault\llm-wiki-vault\raw\sources\`
   - `D:\vault\llm-wiki-vault\wiki\`
   - `D:\vault\llm-wiki-vault\.llm-wiki\`

> **완료 (2026-05-19):** 프로젝트 생성 완료. 경로: `D:\vault\llm-wiki-vault\`

### 2.2 LLM 제공자 설정

llm_wiki Settings에서 ChatGPT Codex로 구성:

| 설정 | 값 |
|------|------|
| Provider | ChatGPT Codex |
| 구독 | ChatGPT Pro ($200/월) |
| 과금 방식 | 월정액 내 rate limit 기반, 추가 토큰 비용 없음 |

> **변경 (2026-05-22):** ChatGPT Codex (Pro) 로 전환.
> 이전: Claude Code CLI (local) + GitHub Models API (보조).
> rate limit 도달 시 llm_wiki 큐가 자동 대기·재개.

### 2.3 purpose.md 작성

커스텀 한국어 purpose.md (10개 섹션, 194줄) 작성 완료.
템플릿: `scripts/purpose.md.template` 기반, 플레이스홀더를 프로젝트 실정에 맞게 채움.
최종 파일: `D:\vault\llm-wiki-vault\purpose.md`

주요 내용:
- 조직: DR_Dev, 도메인: X-ray FPD 하드웨어·의료기기 SW·반도체 계측
- 엔티티 6종 (ic, sensor, standard, project, subsystem, vendor)
- 개념 4종 (알고리즘, 프로토콜, 물리적 원리, 설계 패턴)
- Obsidian callout 형식: `> [!conflict]`, `> [!info]`
- 태그 체계: 도메인 5종 + 상태 4종

> **완료 (2026-05-19):** purpose.md 작성 및 llm_wiki 에디터에서 저장 확인.
> 상세 내용은 `purpose-for-vault.md` (workspace) 참조.

### 2.4 Git 초기화

```powershell
cd D:\vault\llm-wiki-vault
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

인허가/RA 관련 7개 폴더 동기화. 파일 크기 상한 없음 (Full Ingest).

```powershell
# scripts/sync-nas.ps1 — 7개 지정 폴더 동기화
# 대상 폴더: DHF (인허가), RA, Standard(국제), 연구소 문서등록대장, 타사 메뉴얼, Project, Restricted_Backup
# 대상 확장자: *.pdf, *.md, *.txt, *.docx, *.xlsx, *.xls, *.pptx

# DryRun 모드로 테스트
.\scripts\sync-nas.ps1 -DryRun

# 실제 동기화
.\scripts\sync-nas.ps1
```

> 대상 폴더 추가/제거: `sync-nas.ps1` 내 `$TargetFolders` 배열 수정.
> 대상 폴더 목록: `docs/01-SYSTEM-SPEC.md` §1.3 참조.

### 3.3 자동 동기화 (Task Scheduler)

```powershell
# 매일 06:30에 NAS(Z:) → vault 동기화
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -File D:\agent-work\nas-llm\scripts\sync-nas.ps1"
$trigger = New-ScheduledTaskTrigger -Daily -At 6:30am
Register-ScheduledTask -TaskName "LLM-Wiki-NAS-Sync" `
    -Action $action -Trigger $trigger -RunLevel Highest
```

---

## Phase 4: 전량 인제스트 (2~3개월)

> **LLM 제공자:** Codex CLI (\@openai/codex\ v0.132.0) — ChatGPT Plus OAuth (gpt-5.4)
> **전략:** \atch-enqueue.ps1\로 폴더 단위 배치 투입. \watchdog-ingest.ps1\이 5분마다 진전 감시·재시작.
> **현황 (2026-06-09):**
> - raw/sources: ~51,296 파일 (전체 동기화 완료)
> - wiki/sources: **2,037 페이지** (품질 분석 포함, 구버전 스텁 제외)
> - 처리 중: DHF 457건 + 연구소 7건 = **464개** 큐 진행 중
> - 미처리: RA (~13,045건) + 타사 메뉴얼 + Project 등

### 4.1 인제스트 순서 (실측 기준)

| 순번 | 대상 폴더 | DOCX/XLSX/TXT 수 | 상태 |
|------|-----------|-----------------|------|
| 1 | DHF (인허가) | 1,332 (미처리 457) | 🔄 진행 중 |
| 2 | 연구소 문서등록대장 | 7 | 🔄 진행 중 |
| 3 | RA | ~13,045 | ⏳ 대기 |
| 4 | 타사 메뉴얼 | 미확인 | ⏳ 대기 |
| 5 | Project | 미확인 | ⏳ 대기 |

> PDF는 인제스트 대상 제외 (텍스트 추출 불가).
> 이미 처리된 파일은 ingest-cache(파일명 기준)로 자동 스킵.

### 4.2 배치 큐 투입 방법

\\\powershell
# 폴더 단위 배치 투입 (앱 자동 중단 후 재시작)
.\scripts\batch-enqueue.ps1 -SourceFolder "RA" -BatchSize 500

# 건식 테스트 (큐 수정 없이 대상 파일만 출력)
.\scripts\batch-enqueue.ps1 -SourceFolder "RA" -DryRun

# 이미 처리된 스텁도 재처리 (품질 업그레이드)
.\scripts\batch-enqueue.ps1 -SourceFolder "DHF (인허가)" -IncludeCached
\\\

> **주의:** 앱 실행 중 큐 파일을 직접 수정하면 앱의 saveQueue가 덮어씀.
> 반드시 \atch-enqueue.ps1\을 사용할 것 — 앱을 자동으로 중단 후 수정.

### 4.3 watchdog 운영

Task Scheduler에서 \watchdog-ingest.ps1\을 5분 주기로 실행:

\\\powershell
\ = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-ExecutionPolicy Bypass -File D:\vault\llm-wiki-vault\scripts\watchdog-ingest.ps1"
\ = New-ScheduledTaskTrigger -RepetitionInterval (New-TimeSpan -Minutes 5) `
    -Once -At (Get-Date)
Register-ScheduledTask -TaskName "LLM-Wiki-Watchdog" `
    -Action \ -Trigger \ -RunLevel Highest
\\\

watchdog 동작 기준:
- 60분 내 큐 총 항목 수 감소 없음 + codex 미실행 → stuck 항목 failed 처리 후 재시작
- 앱 미실행 + pending > 0 → 앱 자동 재시작
- 처리 중 + codex 실행 중 → 대기 (대용량 파일 정상 처리)

### 4.4 검증 항목 (TC-03~TC-09)

| # | 항목 | 판정 기준 |
|---|------|----------|
| 1 | 위키 페이지 생성 | raw 문서당 최소 1개 source summary 생성 |
| 2 | frontmatter | type, title, tags, sources, related 필드 존재 |
| 3 | 위키링크 | \[[slug]]\ 형식으로 페이지 간 연결 |
| 4 | 한국어 분석 | 구버전 "(Analysis not available)" 스텁 아님 |
| 5 | 증분 캐시 | 동일 파일 재인제스트 시 건너뜀 (ingest-cache.json) |

### 4.5 비용

ChatGPT Pro 월정액 \ 내 처리. 추가 토큰 과금 없음.
모니터링 대상: rate limit 도달 빈도, 일일 처리량.
실측 처리 속도: ~6건/시간 (파일 크기에 따라 4~10분/건).

## Phase 5: 안정화 및 확장 (2~4주)

### 5.1 자료 확장

- 7개 폴더 전량 동기화 완료 (2026-05-22 기준 ~51,000 파일)
- Phase 4 인제스트 완료 후 NAS 신규 파일은 sync-nas.ps1이 06:30에 자동 반영
- 추가 폴더 필요 시 `sync-nas.ps1` `$TargetFolders` 배열에 추가

### 5.2 Git 커밋 자동화

```powershell
# scripts/auto-commit.ps1
cd D:\vault\llm-wiki-vault
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
$rawCount = (Get-ChildItem D:\vault\llm-wiki-vault\raw\sources -Recurse -File).Count
$wikiCount = (Get-ChildItem D:\vault\llm-wiki-vault\wiki -Recurse -Filter "*.md").Count
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
