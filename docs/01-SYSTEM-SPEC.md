# 01. 시스템 사양서

문서 번호: LW-SPEC-001
버전: 1.0
작성일: 2026-05-14

---

## 1. 하드웨어 사양

### 1.1 대상 시스템

| 항목 | 값 |
|------|------|
| 장치 이름 | DESKTOP-AT1P1UD |
| 프로세서 | Intel Core i5-10500 @ 3.10GHz (Comet Lake, 6C/12T, TDP 65W) |
| 메모리 | 16.0GB DDR4 (15.8GB 사용 가능) |
| 스토리지 (C:) | 256GB NVMe SSD — SSSTC CL1-3D256-Q11 |
| 스토리지 (D:) | 1TB HDD — Seagate ST1000DM010-2EP102 (7200RPM) |
| 그래픽 | Intel UHD Graphics 630 (128MB 공유) |
| 시스템 종류 | 64비트, x64 기반 |
| 장치 ID | 5D1E4AD5-433F-42F1-809A-E9CF2B82FC1C |

### 1.2 디스크 배치 전략

```
C: (SSD 256GB)
├── Windows 10 Pro
├── Node.js 20 LTS
├── Rust 1.70+
├── Git
└── nashsu/llm_wiki (Tauri 앱 바이너리)

D: (HDD 1TB)
├── vault/                    ← LLM Wiki 프로젝트 루트
│   ├── purpose.md
│   ├── schema.md
│   ├── raw/
│   │   ├── sources/          ← 원본 자료 (immutable)
│   │   └── assets/           ← 로컬 이미지
│   ├── wiki/
│   │   ├── index.md          ← 콘텐츠 카탈로그
│   │   ├── overview.md       ← 전역 요약 (자동 갱신)
│   │   ├── log.md            ← 작업 이력
│   │   ├── entities/
│   │   ├── concepts/
│   │   ├── sources/
│   │   ├── queries/
│   │   ├── synthesis/
│   │   └── comparisons/
│   ├── .obsidian/            ← Obsidian vault 설정
│   └── .llm-wiki/            ← 앱 설정, 채팅 이력
## (Z: 네트워크 드라이브)       ← NAS SMB 직접 연결 (\\10.11.1.40\DR_Dev\공통자료)
```

### 1.3 NAS 연동 사양

| 항목 | 값 |
|------|------|
| NAS | Synology DS224+ |
| 프로토콜 | SMB 3.0 |
| 마운트 방식 | SMB 네트워크 드라이브 (Z:\) — `net use Z: \\10.11.1.40\DR_Dev\공통자료 /persistent:yes` |
| 동기화 방향 | NAS (Z:\) → `sync-nas.ps1` 선별 복사 → `D:\vault\raw\sources\` |
| 동기화 대상 | 지정 폴더만 (데이터시트, 규격서, 기술문서) |

---

## 2. 소프트웨어 사양

### 2.1 필수 소프트웨어

| 소프트웨어 | 버전 | 용도 | 설치 위치 |
|-----------|------|------|----------|
| Node.js | 20 LTS | llm_wiki 빌드, npx skills | C: |
| Rust | 1.70+ stable | Tauri 백엔드 빌드 | C: |
| Git | 최신 | 버전 관리 | C: |
| nashsu/llm_wiki | latest main | 데스크톱 앱 | C:\Program Files\llm_wiki |
| Obsidian | 최신 | vault 뷰어 (선택) | C: |

### 2.2 LLM 제공자 설정

| 제공자 | 용도 | 비고 |
|--------|------|------|
| GitHub Models API (권장) | 주 인제스트 + 쿼리 | Copilot 구독 활용, GitHub PAT 인증 |
| Anthropic (Claude) | 대안 | API 키 필요, 토큰 과금 |
| OpenAI | 대안 | API 키 필요, 토큰 과금 |
| Ollama (로컬) | 보조/오프라인 테스트 | CPU 전용, 속도 제한적 |

> **참고:** GitHub Copilot 구독(hnabyz-bot) 보유 → GitHub Models API를 OpenAI 호환 endpoint로 사용.
> base URL: `https://models.inference.ai.azure.com`, 인증: GitHub PAT.
> i5-10500 + UHD 630에서 Ollama 로컬 LLM은 소형 모델(7B 이하)만 실용적.

### 2.3 선택 소프트웨어

| 소프트웨어 | 용도 |
|-----------|------|
| (불필요 — SMB 직접 연결 사용) | |
| Windows Terminal | CLI 작업 환경 |
| Obsidian | wiki/ 폴더 그래프 뷰 탐색 |

---

## 3. 네트워크 요구사항

| 항목 | 요구사항 |
|------|---------|
| 인터넷 | 필수 (LLM API 호출) |
| LAN | NAS SMB 접근용 |
| 방화벽 허용 | api.anthropic.com, api.openai.com, NAS IP |
| 대역폭 | 일반 사무환경 수준 충분 (API 호출은 텍스트 기반) |

---

## 4. 24시간 운영 설정

### 4.1 전원 관리

| 설정 | 값 |
|------|------|
| 절전 모드 | 사용 안 함 |
| 최대 절전 | 사용 안 함 |
| 화면 끄기 | 30분 |
| 하드 디스크 끄기 | 사용 안 함 |

### 4.2 Windows Update 관리

| 설정 | 값 |
|------|------|
| 활성 시간 | 06:00 ~ 02:00 (20시간) |
| 자동 재시작 | 비활성화 (gpedit 또는 레지스트리) |
| 업데이트 적용 | 수동, 주말 점검 시 |

### 4.3 Win10 EOL 대응 (2025-10 이후)

- 보안 패치 미제공 상태
- 방화벽에서 LLM API 엔드포인트 + NAS만 허용, 기타 아웃바운드 차단
- 브라우저 사용 최소화
- 중장기: Win11 또는 Linux 전환 검토

---

## 5. 리소스 예상 사용량

### 5.1 메모리 (16GB 기준)

| 프로세스 | 예상 사용량 |
|---------|-----------|
| Windows 10 OS | ~3.5GB |
| llm_wiki (Tauri) | ~200MB |
| Node.js 런타임 | ~200MB |
| Obsidian (선택) | ~300MB |
| Git 작업 | ~100MB |
| **합계** | **~4.3GB** |
| **여유** | **~11.5GB** |

### 5.2 디스크

| 드라이브 | 예상 사용 | 여유 |
|---------|----------|------|
| C: SSD 256GB | OS 40GB + 소프트웨어 20GB = ~60GB | ~190GB |
| D: HDD 1TB | vault 예상 50~200GB | 800~950GB |

### 5.3 API 토큰 비용 (월간 예상)

| 시나리오 | raw 문서 수 | 월 예상 비용 |
|---------|-----------|------------|
| 파일럿 | 20개 | $5~15 |
| 일반 운영 | 100개 | $30~80 |
| 대규모 | 500개+ | $100~300+ |

> 문서 크기, 인제스트 빈도, 쿼리 횟수에 따라 변동.
> SHA256 증분 캐시로 재인제스트 비용 절감.
