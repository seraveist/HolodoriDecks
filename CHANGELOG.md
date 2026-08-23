# Changelog

Holodori DeckSim의 공개 릴리스 변경 이력을 기록합니다.

형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)의 구성을 참고하고, 버전 번호는 Semantic Versioning을 따릅니다.

## [1.1.3] - 2026-08-23

### Added

- 결과 영역에 편성 비교용 예상값, 이벤트/보드/메모리 미반영, Manual PERFECT FC 기준만 안내하는 간결한 `계산 기준 ⓘ` 추가
- ★4/★5 신규 카드 portrait 자동 동기화와 provenance 기록, landscape illustration 검증/repair 경로 추가
- `holosims.net` 실제 배포 SHA·manifest·JSON 경로·카드 WebP를 검증하는 Production smoke 추가

### Changed

- 공식 라이브 서비스 주소를 `https://holosims.net/`으로 전환
- GitHub Pages 배포 SHA를 JS/카드 이미지 revision으로 사용하여 동일 파일명 교체 시 browser/CDN stale cache를 우회
- GitHub Release 발행을 Pages 배포 성공뿐 아니라 Production smoke 성공 이후로 제한
- 현재 Master 문서 기준을 174카드 / 188악곡 / 752채보 / Runtime Exact 699개로 갱신

### Fixed

- GitHub-hosted runner에서 Octo catalog가 HTTP 403을 반환할 때 공개 card-art snapshot을 우선 사용하고 Octo를 fallback으로 유지
- 신규 portrait가 300×300 카드 icon으로 들어오던 asset-class 오류를 가로형 illustration으로 교정하고 기존 잘못된 자동 import도 repair 가능하게 수정
- Pages revision rewrite가 `manifest.json`을 `manifest.js`로 오인해 production 404를 만들던 회귀를 전용 rewrite script와 JSON 보존 테스트로 차단

## [1.1.2] - 2026-08-14

### Fixed

- 계산 A가 취소된 뒤 새 계산 B가 완료한 경우, 늦게 끝난 A가 B의 결과·상태·계산 버튼을 다시 덮어쓸 수 있던 stale completion race 제거
- 계산 입력 변경 시 현재 요청을 session guard에서 즉시 무효화하고 AbortSignal로 Worker와 채보 fetch를 함께 취소
- 취소된 Runtime/Local Exact 요청이 Master fallback으로 계속 진행하지 않고 즉시 종료되도록 chart loader 보강

### Validation

- `A 시작 → 설정 변경 → B 시작/완료 → A 지연 완료` 순서에서 B만 최종 상태를 commit하는 reverse-completion 회귀 추가
- Runtime Exact chart fetch에 계산 AbortSignal이 실제 전달되고 abort 시 stale chart 결과를 반환하지 않는 회귀 추가
- v1.1.1의 카드 준비, 목표 분리, 액티브 충돌, Exact pruning, Beam, Worker watchdog, 브라우저 smoke 회귀를 그대로 재실행

## [1.1.1] - 2026-08-14

### Changed

- 카드 준비 로직이 `CardPotential`과 `master_refs`의 구조화된 Master 효과/트리거를 우선 사용하도록 분리
- ★4/★5 5개화의 스킬트리 연계 효과를 현재 점수 범위 밖으로 명시적으로 분류
- 최고 유닛 스코어 / 최고 잠재 스코어를 결과 렌더러가 직접 처리하도록 레거시 P/T/S target adapter 제거
- 계산 중 설정이 바뀐 경우 이전 Worker 결과를 폐기하도록 stale-result 방지 추가
- Worker 무응답 시 동기 계산으로 복귀하는 watchdog 추가

### Validation

- ★4/★5 전체 카드의 0~5개화 Master/기존 계산 parity 회귀
- 기대값 최적 편성과 잠재값 최적 편성이 실제로 분리되는 목표 회귀
- 동일 액티브 주기를 hard-ban하지 않고 최종 점수로 판단하는 soft-constraint 회귀
- 252개 조합에서 실제 30개 shortlist pruning 후 `모든 조합 × 5!` 전수 결과와 비교
- 강제 Beam Search와 완전탐색의 synthetic parity 회귀
- 브라우저에서 ★4/★5 정책, TOP 5, Runtime Exact Range 206, Master fail-soft fallback까지 자동 smoke 검증

## [1.1.0] - 2026-08-13

### Added

- 현재 Master 728개 채보 중 703개와 호환되는 Runtime Exact range index
- 고정 공개 chart snapshot에서 선택한 채보 객체만 HTTP Range로 lazy-load하는 Exact timeline 경로
- Local Exact → Runtime Exact → Master → Estimated 순서의 fail-soft 채보 정확도 계층
- 대상 지정 Passive Active-Skill-Effect-Up을 해당 멤버별로 적용하는 계산 경로
- Exact 타임라인의 실제 액티브 판정 시각·확률·combo·SP 발동률·대상 support를 결과 진단에 재사용
- 채보 밀도와 보유 카드 수에 따른 동적 Exact shortlist
- 작은 카드 pool에서 `모든 조합 × 5! 순열` 완전탐색과 staged optimizer 결과를 비교하는 global-search regression
- Runtime Exact index의 current-Master coherence regression
- Runtime Exact Content-Range / byte length / SHA-256 fail-closed 검증
- module Web Worker 기반 편성 탐색과 Worker 미지원 환경의 동기 fallback
- 대상 패시브, 글로벌 Exact 탐색, Runtime coherence에 대한 JavaScript regression tests

### Changed

- Exact 2차 후보를 기존 고정 TOP 10에서 상황에 따라 약 12~30개까지 확대
- 작은 보유 카드 pool에서는 가능한 전체 조합을 Exact 2차 평가 대상으로 보존
- 대상 지정 액티브 효과 지원을 `대상 수 / 5` 팀 평균 근사 대신 실제 대상 멤버의 액티브에 적용
- Exact 결과의 발동 횟수·커버율·팀 타임라인이 집계 재계산이 아니라 실제 타임라인 판정 데이터를 사용하도록 변경
- `Manual FC` 표기를 실제 계산 의미에 맞춰 `Manual PERFECT FC`로 명확화
- Runtime Exact index가 Master 데이터 동기화 시 새 chart index에 맞춰 함께 재생성되도록 sync pipeline 확장
- Runtime source가 새 Master와 불일치하면 해당 채보만 자동 제외하고 Master fallback 유지
- 저장소에 703개 변환 timeline JSON을 bulk-publish하지 않고 range metadata만 유지
- 브라우저의 무거운 조합/순열 탐색을 메인 UI 스레드에서 Web Worker로 이동

### Validation

- Unit Score calibration fixture drift 검사
- 프리셋 멤버 포함 조건 및 120순열 회귀
- 대상 지정 Passive Support 회귀
- Exact staged/global exhaustive parity 회귀
- Runtime Exact current-Master coherence 및 무결성 검사
- PR / Pages 단계에서 신규 계산 regression 재실행

## [1.0.0] - 2026-08-13

### Added

- 보유 카드·레벨·개화 상태 기반 6인 라이브 편성 시뮬레이터
- 리더 1명 + 멤버 5명의 프리셋 조건과 자동 TOP 5 추천
- 최고 유닛 스코어 / 최고 잠재 스코어 목표
- 카드 레벨, 개화, 리더, 액티브, 패시브, 스페셜 스킬 계산
- 악곡·난이도·AUTO/Manual FC별 점수 projection
- Master 풀콤보 노트 수와 note/combo score rules
- Exact SUS metadata의 노트 타임라인·SP 슬롯 시각 계산
- Exact 채보에서 멤버 5명 전체의 SP1~SP5 순서 최적화
- 계산 상세, 스킬 진단표, 개인/팀 발동 타임라인
- 내 보유 카드 관리와 JSON 내보내기/가져오기
- 카드 상세 정보, 검색, 필터, 정렬
- 한국어 / English / 日本語 로컬라이징
- 라이트 / 다크 테마 및 반응형 PC/모바일 UI
- Pretendard Variable 기반 공통 typography 계층
- HolodoriDB Master 자동 동기화와 검증 PR 파이프라인
- Exact chart hash/note-count stale protection
- GitHub Pages 자동 배포

### Changed

- 멤버 프리셋을 슬롯 위치 고정이 아닌 필수 포함 조건으로 변경
- Exact SP 채보에서는 프리셋 출신 멤버를 포함한 최종 5인 전체 순서를 재탐색
- 조합 탐색의 곡 context/kernel 캐시와 목표별 경량 평가 적용
- Exact 순열 평가에서 조합 불변 계산 재사용
- 노트 타임라인 평가를 sweep 방식으로 최적화
- 동일 벤치마크에서 조합+순서 탐색의 반복 계산 비용을 대폭 절감
- 프리셋·선택 팝업·보유 목록·결과 카드의 텍스트 계층 통일
- 결과 카드 리더 배지 높이를 일반 메타 행과 동일하게 정렬

### Infrastructure

- KO/EN/JA를 동일 `master_version` snapshot으로 정렬하는 sync resolver
- generated data 참조 무결성, 급격한 데이터 감소, 언어팩, 채보 hash 검증
- Python sync unit tests와 JavaScript chart/SP regression tests
- PR 검증 → Pages 배포 → VERSION 기반 GitHub Release의 공개 릴리스 흐름
