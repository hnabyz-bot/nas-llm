# 05. 아키텍처 설계

문서 번호: LW-ARCH-001
버전: 1.0
작성일: 2026-05-14

---

## 1. 전체 아키텍처

```
┌──────────────────┐
│  Synology DS224+  │
│  NAS (원본 저장소) │
│  \\10.11.1.40      │
│  \DR_Dev\공통자료  │
└────────┬─────────┘
         │ SMB (Z:\)
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DESKTOP-AT1P1UD (24h)                       │
│                                                                 │
│  ┌──────────────┐    ┌──────────────────────────────────────┐   │
│  │  sync-nas.ps1 │    │  D:\vault\llm-wiki-vault (HDD 1TB)    │   │
│  │  (Z:→raw 복사)│───▶│                                      │   │
│  │  06:30 스케줄  │    │  raw/sources/  ← immutable 원본      │   │
│  └──────────────┘    │       │                               │   │
│                       │       │ 인제스트                      │   │
│                       │       ▼                               │   │
│  ┌──────────────┐    │  ┌─────────────────────┐              │   │
│  │  nashsu/      │    │  │  2-Step CoT Ingest  │              │   │
│  │  llm_wiki     │◀──│──│  Step1: 분석         │              │   │
│  │  (Tauri App)  │    │  │  Step2: 생성         │              │   │
│  └──────┬───────┘    │  └─────────┬───────────┘              │   │
│         │             │            │                           │   │
│         │ API 호출     │            ▼                           │   │
│         ▼             │  wiki/  ← LLM이 생성·유지              │   │
│  ┌──────────────┐    │    ├── index.md                        │   │
│  │  ChatGPT      │    │    ├── overview.md                     │   │
│  │  Codex (Pro)  │    │    ├── entities/                       │   │
│  │  Pro $200/mo  │    │    ├── concepts/                       │   │
│  └──────────────┘    │    ├── sources/                         │   │
│                       │    ├── synthesis/                       │   │
│                       │    └── comparisons/                     │   │
│  ┌──────────────┐    │                                        │   │
│  │  Git          │◀──│── wiki/ 변경 추적                      │   │
│  │  (GitHub)     │    │                                        │   │
│  └──────────────┘    └──────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐                          │
│  │  Obsidian     │    │  Task         │                          │
│  │  (뷰어)       │    │  Scheduler    │                          │
│  │  wiki/ 탐색   │    │  sync/commit  │                          │
│  └──────────────┘    └──────────────┘                          │
└─────────────────────────────────────────────────────────────────┘
```

## 2. 데이터 흐름

### 2.1 인제스트 플로우

```
NAS 원본 자료 (\\10.11.1.40\DR_Dev\공통자료)
    │
    │ ① SMB 네트워크 드라이브 (Z:\)
    │
    │ ② sync-nas.ps1 (매일 06:30, 선별 복사, 확장자 필터)
    ▼
D:\vault\llm-wiki-vault\raw\sources\ (immutable)
    │
    │ ③ llm_wiki 인제스트 (수동 트리거 또는 auto-watch)
    │
    │   Step 1: 분석
    │   ├── 엔티티 식별 (IC명, 규격번호, 프로젝트명 등)
    │   ├── 개념 추출 (기술 원리, 알고리즘 등)
    │   ├── 기존 wiki 콘텐츠와 연결점 탐색
    │   └── SHA256 캐시 확인 (변경 없으면 건너뜀)
    │
    │   Step 2: 생성
    │   ├── 엔티티 페이지 생성/갱신 (wiki/entities/)
    │   ├── 개념 페이지 생성/갱신 (wiki/concepts/)
    │   ├── 소스 요약 생성 (wiki/sources/)
    │   ├── 위키링크 [[slug]] 삽입
    │   ├── frontmatter (type, title, tags, sources) 작성
    │   └── index.md, overview.md 갱신
    ▼
D:\vault\llm-wiki-vault\wiki\ (LLM 생성 지식 페이지)
    │
    │ ④ auto-commit.ps1 (매일 23:00)
    ▼
Git (Gitea) — wiki/ 변경 이력 보존
```

### 2.2 쿼리 플로우

```
사용자 질문 (llm_wiki 채팅)
    │
    │ 4-Phase Retrieval
    │
    ├── Phase 1: Tokenized Search (CJK 인식)
    ├── Phase 2: Graph Expansion (4-Signal 관련도)
    ├── Phase 3: Vector Search (LanceDB, 선택적)
    ├── Phase 4: Context Assembly
    │
    ▼
LLM 응답 생성
    │
    │ (--save 옵션 시)
    ▼
wiki/queries/ 에 응답 저장 → 미래 세션에서 재활용
```

## 3. 3계층 데이터 아키텍처

| 계층 | 위치 | 소유자 | 역할 |
|------|------|--------|------|
| Raw Sources | `raw/sources/` | 사람 | 불변 원본. LLM이 읽기만 함 |
| Wiki | `wiki/` | LLM | 생성·유지·갱신. 사람은 읽기만 |
| Schema | `schema.md` + `purpose.md` | 사람 | 위키 구조 규칙, 목적 정의 |

**핵심 계약:**
- raw/는 절대 수정하지 않음 (immutable source of truth)
- wiki/는 LLM만 쓰고 사람은 읽기만
- schema.md는 사람이 정의하고 LLM이 준수

## 4. 지식 그래프 구조

### 4.1 페이지 타입

| 타입 | 디렉터리 | 설명 |
|------|---------|------|
| entity | `wiki/entities/` | IC, 부품, 조직, 인물, 제품 |
| concept | `wiki/concepts/` | 기술 원리, 알고리즘, 방법론 |
| source | `wiki/sources/` | 원본 자료 요약 (1:1 매핑) |
| query | `wiki/queries/` | 저장된 질의응답 |
| synthesis | `wiki/synthesis/` | 교차 소스 분석, 종합 |
| comparison | `wiki/comparisons/` | 병렬 비교 |

### 4.2 4-Signal 관련도 모델

```
Page A ←→ Page B 관련도 =
  w1 × direct_link      +    # 명시적 [[wikilink]]
  w2 × source_overlap    +    # 공통 출처 참조
  w3 × adamic_adar       +    # 공유 이웃 기반 유사도
  w4 × type_affinity          # 동일 타입 간 친화도
```

### 4.3 Louvain 커뮤니티 감지

- 위키 페이지를 자동 클러스터링
- 내부 엣지 밀도 기반 응집도 평가
- 응집도 < 0.15인 커뮤니티에 경고 표시
- 클러스터 ↔ 페이지 타입 독립적으로 동작

## 5. 보안 고려사항

| 위협 | 대응 |
|------|------|
| API 키 노출 | `.llm-wiki/` 설정에 저장, .gitignore에 포함 |
| NAS 자료 유출 | API로 전송되는 건 텍스트 내용만, PDF 바이너리 자체는 미전송 |
| Win10 EOL | 방화벽 아웃바운드 제한, API 엔드포인트만 허용 |
| LLM hallucination 영구화 | source traceability (frontmatter sources 필드)로 추적 가능, lint 기능으로 검증 |
| 동시 쓰기 충돌 | 단일 사용자/단일 인스턴스 운영으로 회피 |
