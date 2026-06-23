---
_harness_template: "Plans.md.template"
_harness_version: "4.10.0"
---

# Plans.md - Task Tracking

> **Project**: nas-llm
> **Last updated**: 2026-06-23
> **Updated by**: Codex

---

## In Progress

<!-- Add tasks with cc:WIP here. -->

- [ ] T019b: Issue #8 continuation ingest queue `cc:WIP` (2026-06-16: source-level combined queue rebuilt, existing cache/wiki analyzed, 506 already-ingested entries pruned, 69,614 pending remain, priority applied, full ingest gate PASS, app stopped, ready flag absent)
- [ ] T039: E2E 운영 검증 — sync, preprocess, watchdog, auto-commit 상태 확인 `cc:WIP` (GitHub #12 생성, 추가 외부 이슈 등록은 정책 차단으로 로컬 추적)
- [ ] T048: Issue #17 P0-first official-quality RA ingest acceleration `cc:WIP` (2026-06-23: page-marker triage fix applied; P0 full-wiki representatives=1,775, duplicates=6,491, low-text=94, empty/recovery=667; 30-source Codex CLI evaluation passed 30/30; 300-source evaluation passed 300/300 after chunked fallback for 5 large/context-heavy sources; ranks 301-400 and 901-1000 passed 100/100 with chunked fallback for 1 context-heavy source each; ranks 401-500, 501-600, 601-700, 701-800, 801-900, 1001-1100, and 1101-1200 passed 100/100 without chunked fallback; app remains stopped)

---

## Not Started

<!-- Add tasks with cc:TODO or pm:REQUESTED here. -->

> Source: `02-BUILD-PLAN.md` Phase 0–4. Deploy LLM Wiki to DESKTOP-AT1P1UD.
> Phase-to-phase is sequential; `[P]` marks within-phase parallel work.

### Phase 0: 사전 준비

- [x] T001: D:\vault 디렉터리 생성 + 디스크 여유 확인 `pm:CONFIRMED`
- [x] T002: 전원 설정 — 절전/최대절전 비활성화 (24h 운영) `pm:CONFIRMED`
- [x] T003: Windows Update 자동 재시작 비활성화 (NoAutoRebootWithLoggedOnUsers 레지스트리) `pm:CONFIRMED`

### Phase 1: 소프트웨어 설치

- [x] T004: Node.js 20 LTS 설치 `pm:CONFIRMED` (v24.15.0)
- [x] T005: Rust stable 1.70+ + VS Build Tools 설치 `pm:CONFIRMED` (1.95.0 + VS Community 2022)
- [x] T006: Git 설치 + user.name/email 설정 `pm:CONFIRMED` (v2.42.0)
- [x] T007: nashsu/llm_wiki clone + npm install + tauri build `pm:CONFIRMED` (v0.4.9, C:\dev\llm_wiki)
- [ ] T008: Obsidian 설치 (선택) `cc:TODO` [P] depends:Phase 0

### Phase 2: 프로젝트 초기화

- [x] T009: llm_wiki 앱에서 D:\vault 프로젝트 생성 `pm:CONFIRMED` (실제 경로: D:\vault\llm-wiki-vault)
- [x] T010: LLM 제공자 설정 + 연결 확인 `pm:CONFIRMED` (Claude Code CLI local, API 키 불필요)
- [x] T011: purpose.md 작성 `pm:CONFIRMED` (D:\vault\llm-wiki-vault\purpose.md)
- [x] T012: vault git init + .gitignore + 초기 커밋 `pm:CONFIRMED` (master, 9 files)

### Phase 3: NAS 동기화 설정

- [x] T013: NAS SMB 네트워크 드라이브 매핑 (net use Z: \\10.11.1.40\DR_Dev\공통자료 /persistent:yes) `cc:DONE`
- [x] T014: sync-nas.ps1을 vault scripts에 배치 + dry-run 테스트 `cc:DONE` (D:\vault\llm-wiki-vault\scripts\, 47,000+파일 검출 확인)
- [x] T015: Task Scheduler 등록 — 06:30 sync, 23:00 auto-commit `cc:DONE` (LLM-Wiki-NAS-Sync, LLM-Wiki-Auto-Commit)

### Phase 4: 전량 인제스트 (Codex CLI)

- [x] T016: raw/sources/ 7개 폴더 배치 완료 (~51,000 파일) `pm:CONFIRMED`
- [x] T016a: watchdog-ingest.ps1 버그 수정 (Bug 3,4,5) — ProcessStartInfo PATH 전달 `cc:DONE` (2026-06-08)
- [x] T016b: 인제스트 큐 복원 (34개 non-PDF pending 항목) + 앱 재시작 `cc:DONE` (2026-06-08)
- [x] T017: 34개 non-PDF 인제스트 완료 확인 `cc:DONE` (2026-06-09 완료 — 31/34 성공, 3개 실패 재시도 예정)
- [ ] T018: 인제스트 품질 검증 (TC-03~TC-09 핵심 항목) `cc:TODO` depends:T017
- [ ] T019: 순번2~5 연속 인제스트 (나머지 ~32K 파일 큐 투입 전략 수립) `cc:WIP` (2026-06-09 — DHF 457건+연구소 7건 배치 투입, batch-enqueue.ps1 작성)
- [ ] T019a: 일일 처리량·rate limit 모니터링 `cc:TODO` depends:T017

### Phase 5: 안정화 및 확장

> depends:Phase 4

#### 5-0. 운영 우선순위 선행 작업

- [ ] T034: Issue #9 llm_wiki 로컬 운영 패치 보존 및 재현 절차 문서화 `cc:TODO` depends:T019b
- [ ] T035: Issue #10 운영 문서·Plans·이슈 불일치 정리 `cc:TODO` depends:T019b
- [ ] T036: Issue #11 llm_wiki v0.4.16 → upstream 최신 업그레이드 사전 검증 `cc:TODO` depends:T034,T035
- [x] T037: NAS sync scope 운영 버그 수정 — vault 실행 스크립트를 7개 폴더 제한 버전으로 교체 `cc:DONE` (2026-06-11, GitHub #12)
- [x] T038: ingest queue 전처리 적용 — active 원본 0개로 정리, 앱 processing 경로 _preprocessed 확인 `cc:DONE` (2026-06-11)
- [x] T040: active 원본 queue 재발 방지 — preprocess-active-originals.ps1 추가 및 watchdog 시작 전 실행 연결 `cc:DONE` (2026-06-11)
- [x] T041: 전처리 범위 7개 지정 폴더로 제한 및 malformed _preprocessed 큐 16개 분해 복구 `cc:DONE` (2026-06-11)
- [x] T042: 앱 자동 실행 경로 차단 — Watchdog/Startup/Auth-Check 비활성화, ingest-ready.flag 가드 추가 `cc:DONE` (2026-06-11)
- [x] T043: 인제스트 시작 게이트와 우선순위 룰 고정 — verify/dedupe/prioritize 스크립트와 운영 규칙 문서 추가 `cc:DONE` (2026-06-11)
- [x] T044: 전체 NAS→local→preprocess 커버리지 완료 — OCR recovery applied, 69,985 source docs preprocessed, 105 non-ingestable items excluded, source-level combined queue rebuilt `cc:DONE` (2026-06-12)
- [x] T045: 전처리 예외 재시도 금지 룰 문서화 — OCR 적용 범위와 excluded 종료 조건 기록 `cc:DONE` (2026-06-12)
- [x] T046: 큐 과증가 오류 수정 — `_by_source` 조각 210,514건 대신 원본문서 단위 `_combined` 69,985건만 production queue로 사용 `cc:DONE` (2026-06-12)

#### 5-1. 자료 확장

- [x] T020: NAS 7개 폴더 sync-nas.ps1 포함 범위 확정 및 적용 `pm:CONFIRMED` (2026-05-22)
- [ ] T021: 배치 단위 20–30개씩 raw/sources/에 점진 투입 (1차 배치) `cc:TODO` depends:T020
- [ ] T022: 1차 배치 후 wiki/ 품질 확인 (페이지 구조·링크 정합성 검토) `cc:TODO` depends:T021
- [ ] T023: 배치 단위 20–30개씩 raw/sources/에 점진 투입 (2차 배치) `cc:TODO` depends:T022
- [ ] T024: 2차 배치 후 wiki/ 품질 확인 `cc:TODO` depends:T023

#### 5-2. 자동화 스케줄 완성

- [x] T025: auto-commit.ps1 Task Scheduler 등록 — 매일 23:00 `cc:DONE` (2026-06-11 확인: 2026-06-10 23:00 성공, 다음 2026-06-11 23:00)
- [ ] T026: health-check.ps1 Task Scheduler 등록 — 매주 일요일 09:00 `cc:TODO` depends:Phase 4
- [ ] T027: 스케줄 작업 정상 실행 확인 (2일간 로그 검토) `cc:TODO` depends:T025,T026

#### 5-3. E2E 검증 (TC-10~TC-12)

- [ ] T028: TC-10 — NAS 동기화 검증 (sync-nas.ps1 스케줄 실행 후 raw/sources/ 반영 확인) `cc:TODO` depends:T027
- [ ] T029: TC-11 — Git 자동 커밋 검증 (auto-commit.ps1 실행 후 원격 저장소 반영 확인) `cc:TODO` depends:T027
- [ ] T030: TC-12 — 48시간 연속 가동 안정성 검증 (이벤트 로그 오류 없음 확인) `cc:TODO` depends:T028,T029

#### 5-4. 운영 체계 확립

- [ ] T031: purpose.md 갱신 루틴 수립 (인제스트 결과 반영 주기·담당자 확정) `cc:TODO` depends:T030
- [ ] T032: ChatGPT Pro rate limit 모니터링 체계 구축 (일일 처리량·빈도 기준 설정) `cc:TODO` depends:T030
- [ ] T033: e2e-checklist.md TC-10~TC-12 최종 판정 기입 및 운영 이관 선언 `cc:TODO` depends:T030,T031,T032

---

## Completed

<!-- Add tasks with cc:DONE or pm:CONFIRMED here. -->

### Phase 0: 사전 준비 (2026-05-14 완료)

- [x] T001: D:\vault 디렉터리 생성 + 디스크 여유 확인 `pm:CONFIRMED`
- [x] T002: 전원 설정 — 절전/최대절전 비활성화 (24h 운영) `pm:CONFIRMED`
- [x] T003: Windows Update 자동 재시작 비활성화 (NoAutoRebootWithLoggedOnUsers 레지스트리) `pm:CONFIRMED`

### Phase 1: 소프트웨어 설치 (2026-05-14 완료, T008 제외)

- [x] T004: Node.js 20 LTS 설치 `pm:CONFIRMED` (v24.15.0)
- [x] T005: Rust stable 1.70+ + VS Build Tools 설치 `pm:CONFIRMED` (1.95.0 + VS Community 2022)
- [x] T006: Git 설치 + user.name/email 설정 `pm:CONFIRMED` (v2.42.0)
- [x] T007: nashsu/llm_wiki clone + npm install + tauri build `pm:CONFIRMED` (v0.4.9, C:\dev\llm_wiki)

### Operational recovery (2026-06-16)

- [x] T047: 2026-06-15 NAS/local coverage FAIL recovery `cc:DONE` (reran sync/audit/preprocess, recovered 136 changed/missing documents plus 5 Excel COM recoveries, classified 103 terminal exclusions, rebuilt source-level combined queue to 70,120 pending, applied priority, full verify-ingest-gate PASS)

---

## Archive

<!-- Move older completed tasks here. -->

---

## Status Marker Legend

These markers are protocol values used by Harness tooling. Keep them unchanged
unless the project has tested parser aliases.

| Marker | Meaning |
|--------|---------|
| `pm:REQUESTED` | PM requested work |
| `cc:TODO` | Not started by Claude Code |
| `cc:WIP` | Claude Code is working |
| `cc:DONE` | Claude Code completed the task and is awaiting confirmation |
| `pm:CONFIRMED` | PM confirmed completion |
| `blocked` | Blocked; include the reason next to the task |

---

## Last Update

- **Updated at**: 2026-06-23
- **Last session owner**: Codex (P0-first staging-direct pipeline continued with app stopped; direct 30-source evaluation passed 30/30; 300-source evaluation passed 300/300 final validation after chunked fallback for large/context-heavy sources; ranks 301-400 and 901-1000 expansion checkpoints passed 100/100 final validation after one context-window chunked fallback each; ranks 401-500, 501-600, 601-700, 701-800, 801-900, 1001-1100, and 1101-1200 passed 100/100 final validation without chunked fallback; app future-ingest compatibility requires a disposition gate before autoIngest)
- **Branch**: main
