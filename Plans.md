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

<!-- Add tasks with cc:TODO or pm:依頼中 here. -->

> Source: `02-BUILD-PLAN.md` Phase 0–4. Deploy LLM Wiki to DESKTOP-AT1P1UD.
> Phase-to-phase is sequential; `[P]` marks within-phase parallel work.

### Phase 0: 사전 준비

- [ ] T001: D:\vault, D:\nas-sync 디렉터리 생성 + 디스크 여유 확인 `cc:TODO` [P]
- [ ] T002: 전원 설정 — 절전/최대절전 비활성화 (24h 운영) `cc:TODO` [P]
- [ ] T003: Windows Update 자동 재시작 비활성화 (NoAutoRebootWithLoggedOnUsers 레지스트리) `cc:TODO` [P]

### Phase 1: 소프트웨어 설치

- [ ] T004: Node.js 20 LTS 설치 `cc:TODO` [P] depends:Phase 0
- [ ] T005: Rust stable 1.70+ + VS Build Tools 설치 `cc:TODO` [P] depends:Phase 0
- [ ] T006: Git 설치 + user.name/email 설정 `cc:TODO` [P] depends:Phase 0
- [ ] T007: nashsu/llm_wiki clone + npm install + tauri build `cc:TODO` depends:T004,T005,T006
- [ ] T008: Obsidian 설치 (선택) `cc:TODO` [P] depends:Phase 0

### Phase 2: 프로젝트 초기화

- [ ] T009: llm_wiki 앱에서 D:\vault 프로젝트 생성 (vault 구조 자동 생성 확인) `cc:TODO` depends:T007
- [ ] T010: Anthropic API 키 입력 + 연결 테스트 `cc:TODO` depends:T009
- [ ] T011: purpose.md 작성 (Goals / Key Questions / Scope) `cc:TODO` [P] depends:T009
- [ ] T012: D:\vault git init + remote + .gitignore + 초기 커밋/푸시 `cc:TODO` [P] depends:T009

### Phase 3: NAS 동기화 설정

- [ ] T013: Synology Drive Client 설치 + NAS → D:\nas-sync 동기화 작업 생성 `cc:TODO` depends:Phase 0
- [ ] T014: sync-nas.ps1을 vault scripts에 배치 + dry-run 테스트 `cc:TODO` depends:T013
- [ ] T015: Task Scheduler 등록 — 06:30 sync, 23:00 auto-commit `cc:TODO` depends:T014

### Phase 4: 파일럿 인제스트

- [ ] T016: 테스트 문서 10–20개 raw/sources/에 배치 `cc:TODO` depends:T009,T015
- [ ] T017: llm_wiki에서 Ingest 트리거 (2-Step CoT 완료 확인) `cc:TODO` depends:T016
- [ ] T018: 위키 페이지 생성 검증 (TC-03~TC-09 핵심 항목 통과) `cc:TODO` depends:T017
- [ ] T019: Anthropic 토큰 비용 추적 ($15/20개 문서 이내 확인) `cc:TODO` depends:T017

---

## Completed

<!-- Add tasks with cc:完了 or pm:確認済 here. -->

(none)

---

## Archive

<!-- Move older completed tasks here. -->

---

## Status Marker Legend

These markers are protocol values used by Harness tooling. Keep them unchanged
unless the project has tested parser aliases.

| Marker | Meaning |
|--------|---------|
| `pm:依頼中` | PM requested work |
| `cc:TODO` | Not started by Claude Code |
| `cc:WIP` | Claude Code is working |
| `cc:完了` | Claude Code completed the task and is awaiting confirmation |
| `pm:確認済` | PM confirmed completion |
| `blocked` | Blocked; include the reason next to the task |

---

## Last Update

- **Updated at**: 2026-05-14
- **Last session owner**: Claude Code
- **Branch**: main
