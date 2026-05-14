# LLM Wiki Knowledge Base — 구축 및 운영 계획

## 개요

Andrej Karpathy의 [LLM Wiki 패턴](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f)과
[nashsu/llm_wiki](https://github.com/nashsu/llm_wiki) 데스크톱 앱,
[kepano/obsidian-skills](https://github.com/kepano/obsidian-skills) 에이전트 스킬을 결합하여
회사 NAS 자료를 구조화된 지식 베이스로 자동 변환·유지하는 시스템.

## 핵심 원칙

- **사람**: 무엇을 넣을지, 무엇을 물어볼지만 결정
- **LLM**: 요약, 교차참조, 백링크 갱신, 모순 표시 전부 수행
- **지식은 컴파일**: 매번 재합성(RAG)이 아닌 사전 컴파일 + 점진 갱신

## 대상 시스템

| 항목 | 사양 |
|------|------|
| PC | DESKTOP-AT1P1UD |
| CPU | Intel i5-10500 @ 3.10GHz (6C/12T) |
| RAM | 16GB |
| 스토리지 | 256GB NVMe SSD (C:) + 1TB HDD (D:) |
| GPU | Intel UHD 630 (내장) |
| OS | Windows 10 Pro 64bit |
| 운영 모드 | 24시간 상시 가동 |

## 문서 구조

```
docs/
├── 01-SYSTEM-SPEC.md        # 시스템 사양서
├── 02-BUILD-PLAN.md          # 구축 계획
├── 03-OPERATION-GUIDE.md     # 운영 가이드
├── 04-E2E-TEST-PLAN.md       # E2E 검증 계획
└── 05-ARCHITECTURE.md        # 아키텍처 설계
tests/
├── e2e-checklist.md          # E2E 체크리스트
└── test-scenarios.md         # 테스트 시나리오
scripts/
├── setup-env.ps1             # 환경 설정 스크립트
├── sync-nas.ps1              # NAS 동기화 스크립트
└── health-check.ps1          # 상태 점검 스크립트
```

## 빠른 시작

```bash
# 1. 레포 클론
git clone <your-repo-url>
cd llm-wiki-project

# 2. 환경 설정 (PowerShell 관리자 권한)
.\scripts\setup-env.ps1

# 3. llm_wiki 빌드 & 실행
# → docs/02-BUILD-PLAN.md 참조

# 4. E2E 검증
# → docs/04-E2E-TEST-PLAN.md 참조
```

## 라이선스

내부 사용 전용
