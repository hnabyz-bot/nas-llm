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

- [ ] T001: D:\vault 디렉터리 생성 + 디스크 여유 확인 `cc:TODO` [P]
- [ ] T002: 전원 설정 — 절전/최대절전 비활성화 (24h 운영) `cc:TODO` [P]
- [ ] T003: Windows Update 자동 재시작 비활성화 (NoAutoRebootWithLoggedOnUsers 레지스트리) `cc:TODO` [P]

### Phase 1: 소프트웨어 설치

- [ ] T004: Node.js 20 LTS 설치 `cc:TODO` [P] depends:Phase 0
- [ ] T005: Rust stable 1.70+ + VS Build Tools 설치 `cc:TODO` [P] depends:Phase 0
- [ ] T006: Git 설치 + user.name/email 설정 `cc:TODO` [P] depends:Phase 0
- [ ] T007: nashsu/llm_wiki c