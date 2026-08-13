# Changelog

Holodori DeckSim의 공개 릴리스 변경 이력을 기록합니다.

형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/)의 구성을 참고하고, 버전 번호는 Semantic Versioning을 따릅니다.

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
