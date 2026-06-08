---
_harness_template: "Plans.md.template"
_harness_version: "4.10.0"
---

# Plans.md - Task Tracking

> **Project**: nas-llm
> **Last updated**: 2026-05-14
> **Updated by**: Claude Code

---

## In Progress

<!-- Add tasks with cc:WIP here. -->

(none)

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
- [ ] T017: 34개 non-PDF 인제스트 완료 확인 `cc:WIP` (2026-06-08 시작)
- [ ] T018: 인제스트 품질 검증 (TC-03~TC-09 핵심 항목) `cc:TODO` depends:T017
- [ ] T019: 순번2~5 연속 인제스트 (나머지 ~32K 파일 큐 투입 전략 수립) `cc:TODO` depends:T017
- [ ] T019a: 일일 처리량·rate limit 모니터링 `cc:TODO` depends:T017

### Phase 5: 안정화 및 확장

> depends:Phase 4

#### 5-1. 자료 확장

- [x] T020: NAS 7개 폴더 sync-nas.ps1 포함 범위 확정 및 적용 `pm:CONFIRMED` (2026-05-22)
- [ ] T021: 배치 단위 20–30개씩 raw/sources/에 점진 투입 (1차 배치) `cc:TODO` depends:T020
- [ ] T022: 1차 배치 후 wiki/ 품질 확인 (페이지 구조·링크 정합성 검토) `cc:TODO` depends:T021
- [ ] T023: 배치 단위 20–30개씩 raw/sources/에 점진 투입 (2차 배치) `cc:TODO` depends:T022
- [ ] T024: 2차 배치 후 wiki/ 품질 확인 `cc:TODO` depends:T023

#### 5-2. 자동화 스케줄 완성

- [ ] T025: auto-commit.ps1 Task Scheduler 등록 — 매일 23:00 `cc:TODO` depends:Phase 4
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

- **Updated at**: 2026-06-08
- **Last session owner**: Claude Code (watchdog 버그 3종 수정, 큐 복원, 인제스트 재개)
- **Branch**: main
