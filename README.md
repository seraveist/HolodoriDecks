# Holodori DeckSim

**v1.1.0** · 홀로라이브 드림스 보유 카드 기반 6인 라이브 편성 시뮬레이터

> 비공식 팬메이드 도구입니다. COVER Corporation, hololive production 및 게임 운영 주체와 제휴·후원·공식 인증 관계가 없습니다.

라이브 서비스: https://seraveist.github.io/HolodoriDecks/

## 주요 기능

- 리더 1자리 + 멤버 5자리의 6인 프리셋
- 보유 카드와 카드별 현재 레벨·개화 단계 저장
- 현재 레벨 / 카드 최대 레벨 계산 전환
- 리더/멤버 동일 홀로멤 분리 옵션
- `최고 유닛 스코어` / `최고 잠재 스코어` 목표별 TOP 5 자동 추천
- 악곡·난이도·AUTO / Manual PERFECT FC 조건 선택
- 카드 레벨·개화·리더·액티브·패시브·스페셜 스킬 반영
- 대상 지정 패시브 서포트를 해당 멤버의 액티브에 개별 적용
- 동일 액티브 주기의 중복/충돌 보정
- 악곡별 예상 평균 / 근사 최대 스코어
- Local Exact 및 Runtime Exact 채보의 실제 노트 시각·노트 타입·SP1~SP5 반영
- Exact 채보에서 최종 멤버 5명의 SP 순서 최대 `5! = 120` 재최적화
- 채보 밀도와 보유 카드 수에 따른 동적 Exact shortlist
- 큰 조합에서는 Beam Search, 작은 조합에서는 Exact Search
- Web Worker 기반 편성 탐색과 동기 fallback
- 계산 근거, 스킬 진단표, 실제 Exact 발동 체크 기반 타임라인
- 카드 상세, 검색, 필터, 정렬
- 보유 카드 JSON 내보내기 / 가져오기
- 한국어 / English / 日本語
- 라이트 / 다크 테마, 반응형 PC·태블릿·모바일 UI
- HolodoriDB Master 자동 동기화와 검증 PR
- GitHub Pages 자동 배포 및 VERSION 기반 GitHub Release

## 기본 사용 흐름

1. `내 보유 카드`에서 사용할 카드를 등록하고 레벨·개화 상태를 설정합니다.
2. `편성하기` 프리셋에서 반드시 사용할 리더나 멤버가 있다면 선택합니다.
3. 시뮬레이션 목표, 육성 반영, 리더/멤버 분리 여부를 설정합니다.
4. 악곡·난이도·플레이 기준을 선택합니다. 악곡을 선택하지 않으면 범용 유닛 스코어를 기준으로 계산합니다.
5. `추천 편성 계산`을 누르면 TOP 5와 계산 근거가 표시됩니다.

보유 카드·레벨·개화·프리셋·언어·테마는 브라우저 `localStorage`에 저장됩니다.

## 프리셋 규칙

프리셋은 **필수 조건**입니다.

- 리더 프리셋: 선택한 카드를 리더로 고정합니다.
- 멤버 프리셋: 선택한 카드를 최종 5인 멤버에 반드시 포함하지만 선택 당시의 멤버 슬롯에는 고정하지 않습니다.
- 비어 있는 자리는 목표에 맞춰 자동 탐색합니다.
- Exact SP 채보에서는 최종 5명의 순서를 최대 `5! = 120`개까지 평가하여 SP1~SP5 배치를 최적화합니다.
- Exact SP 데이터가 없는 경우 현재 집계형 모델은 멤버 순서에 중립적이므로 별도 순열 검색을 하지 않습니다.

즉 멤버 프리셋의 의미는 `이 위치에 고정`이 아니라 **`이 카드를 반드시 사용`**입니다.

## 시뮬레이션 목표

### 최고 유닛 스코어

- 악곡 미선택: 일반 발동 확률을 반영한 범용 유닛 스코어
- 악곡 선택: 해당 악곡의 예상 평균 스코어

### 최고 잠재 스코어

- 악곡 미선택: 유효한 액티브가 모두 성공한다고 가정한 잠재 유닛 스코어
- 악곡 선택: 해당 악곡에서 모든 유효 액티브가 성공할 때의 근사 최대 스코어

안정적인 덱과 이상적인 고점이 높은 덱은 서로 다른 TOP 5를 반환할 수 있습니다.

## 계산 엔진

현재 엔진 식별자:

```text
unit-score-v0.5-potential + song-score-v0.4-chart-timeline
```

주요 계산 항목:

- 카드 레벨별 파라미터
- 개화 1: Active Lv2
- 개화 2: 전체 파라미터 +10%
- 개화 3: Special Lv2
- 개화 4: Passive Lv2
- 리더 기본/추가 조건과 효과
- 액티브 발동 확률·주기·지속시간·스코어 업
- 패시브 조건과 파라미터/액티브 효과 지원
- 대상 지정 Active Skill Effect Up의 멤버별 적용
- 스페셜 스킬 지속시간·스코어 효과 증가·발동률 증가
- 동일 액티브 주기의 충돌 손실
- 악곡 재생시간·스코어 계수
- Master 풀콤보 노트 수
- Manual PERFECT FC의 PERFECT 노트 계수와 콤보 보너스
- Exact 채보의 실제 노트 시각·노트 타입·SP 슬롯 시각

범용 유닛 스코어는 calibration fixture 기반 경험 상수 `K = 2.037342`를 사용합니다. 따라서 아래의 Exact 표기는 **채보 시간축이 Exact라는 의미**이며 공식 클라이언트의 전체 최종 점수식을 완전 복제했다는 의미는 아닙니다.

## 채보 정확도 계층

v1.1.0은 다음 순서로 가능한 가장 높은 정확도의 채보를 사용합니다.

```text
Local Exact metadata
  → 저장소에 포함된 검증된 노트 타임라인 + SP 시각
  ↓ 없으면
Runtime Exact metadata
  → 고정 공개 snapshot에서 선택한 채보 객체만 HTTP Range로 로드
  ↓ 없거나 무결성 검증 실패 시
Master chart
  → 실제 풀콤보 노트 수 + 집계형 SP 근사
  ↓ 없으면
Estimated
  → 난이도별 노트 밀도 추정
```

현재 snapshot:

- 악곡: 182
- Master 난이도별 채보: 728
- Local Exact 파일: 1 (`m0049 / EXPERT`)
- 현재 Master와 호환되는 Runtime Exact: **703 / 728**
- Runtime source에서 사용 불가로 기록된 채보: 25 / 728

`chart-index.json`의 `exact_metadata_count`는 저장소에 직접 포함된 **Local Exact 파일만** 계산합니다. Runtime Exact 커버리지는 `data/generated/exact-runtime-index.json`의 `runtimeExactCount`를 사용합니다.

### Runtime Exact 안전장치

Runtime Exact는 703개의 변환 timeline JSON을 이 저장소에 bulk-publish하지 않습니다. 약 0.28MB의 range index만 포함하며 사용자가 선택한 채보 객체만 가져옵니다.

사용 전 다음을 검증합니다.

- 현재 Master와 `musicId + difficulty`
- `chartHash`
- `fullComboNoteCount`
- `chartAssetId`
- `normalNoteCount`
- HTTP `206 Partial Content`
- 요청한 byte 구간과 `Content-Range`
- 반환 byte length
- 객체 SHA-256
- 노트 수·노트 타입·시간 순서
- 5개의 SP marker와 시간 순서

검증할 수 없거나 하나라도 불일치하면 Runtime Exact를 사용하지 않고 Master fallback으로 내려갑니다.

상세 감사 기록은 [EXACT_CHART_CORPUS.md](EXACT_CHART_CORPUS.md)를 참고하세요.

## 검색 알고리즘

조합 수가 작을 때는 모든 조합을 평가하고, 큰 경우 Beam Search로 전환합니다.

```text
EXACT_CASE_LIMIT = 650,000
BEAM_MEMBER_LIMIT = 52
BEAM_WIDTH = 360
BEAM_SECONDARY_WIDTH = 180
```

Exact 채보에서는 조합 선정과 SP 순서를 분리합니다.

```text
Master-only 1차 조합 탐색
→ 채보 밀도/보유 수 기반 shortlist
→ shortlist의 각 5인 조합에 대해 최대 120순열 Exact 타임라인 평가
→ 최종 TOP 5
```

v1.1.0의 shortlist는 기존 고정 10개가 아니라 대략 12~30개입니다. 고밀도 채보는 성능을 위해 좁히고, 작은 보유 카드 풀은 가능한 전체 조합을 보존합니다. 작은 synthetic pool에서는 `모든 조합 × 120순열` 완전탐색과 staged optimizer의 결과가 동일한지 회귀 테스트합니다.

곡 context·콤보 평균·song kernel은 캐시하며, SP 순열에서는 동일 5인 조합의 리더/패시브/파라미터 계산을 재사용합니다. 브라우저에서는 편성 탐색을 module Web Worker로 실행하고 Worker를 사용할 수 없는 환경에서는 같은 계산 코어를 메인 스레드에서 fallback 실행합니다.

## v1.1 계산 범위와 제한

이 항목은 결과 해석을 위한 README 전용 안내입니다.

- 이 프로젝트는 공식 게임 클라이언트의 내부 최종 점수식을 그대로 복제한 도구가 아니라 확인 가능한 Master 데이터와 검증 fixture를 바탕으로 한 **편성 시뮬레이터**입니다.
- 계정별 **홀로멤버 보드 / 메모리 보정은 현재 계산에 포함하지 않습니다.** 해당 기여도는 0으로 유지됩니다.
- **이벤트 보너스는 현재 계산에 포함하지 않습니다.**
- Manual 모드는 일반적인 모든 FC 판정 분포가 아니라 **PERFECT 기준의 Manual PERFECT FC**입니다.
- Exact metadata의 Fever 구간은 보존하지만 솔로 점수에 미확인 Fever 배율을 임의 적용하지 않습니다.
- 따라서 표시 점수는 편성 간 비교와 추천을 위한 예상값이며, 인게임 결과와 반올림·미확인 계정 보정·향후 Master 변경 등에 따라 차이가 날 수 있습니다.

## Exact 진단 데이터

Exact 악곡에서 점수 계산과 상세 결과가 서로 다른 모델을 사용하지 않도록 v1.1.0부터 실제 타임라인 평가에서 생성된 멤버별 체크 데이터를 진단 UI에 재사용합니다.

- 각 액티브 판정 시각
- 해당 판정의 combo
- 해당 판정의 SP 발동률 보정
- 실제 판정 확률
- 대상별 정적 support
- 해당 체크의 score-up
- 실제 노트 구간 기준 예상 coverage

Master/Estimated fallback에서는 기존 집계형 진단 모델을 사용합니다.

## 데이터 동기화

핵심 Master:

- `HolodoriDB/holodori-db-kor-diff`
- `HolodoriDB/holodori-db-eng-diff`
- `HolodoriDB/holodori-db-jpn-diff`

KO/EN/JA는 동일 `master_version` snapshot으로 정렬합니다.

`.github/workflows/sync-master-data.yml`은 매일 00:15 KST에 실행되며 upstream이 변경되면 다음을 수행합니다.

```text
upstream 변경 감지
→ 같은 master_version의 KO/EN/JA snapshot 해석
→ cards / characters / music / skills 생성
→ i18n 생성
→ Master chart index / score rules 생성
→ pinned Runtime Exact index를 새 Master에 맞춰 재생성
→ 구조/회귀/Runtime coherence 검증
→ automation/master-data-sync 브랜치
→ 자동 검토 PR
→ 사람이 확인 후 merge
```

Runtime Exact source가 새 Master의 일부 채보와 더 이상 맞지 않으면 해당 채보는 새 index에서 제외되고 Master fallback을 사용합니다. sync는 자동으로 `main`에 merge하지 않습니다. 자세한 내용은 [DATA_SYNC.md](DATA_SYNC.md)를 참고하세요.

## 검증

PR과 Pages 배포에서 다음을 자동 검증합니다.

- Python sync unit tests / release metadata
- JavaScript syntax와 ESM import
- Unit Score calibration fixture
- 프리셋 포함 조건 및 SP 120순열
- 대상 지정 Passive Support 회귀
- 작은 pool의 Exact 글로벌 완전탐색 parity
- Runtime Exact Content-Range / SHA / current-Master coherence
- generated data와 KO/EN/JA completeness
- CSS semantic theme layering

수동 브라우저 확인 항목은 [LOCAL_TEST.md](LOCAL_TEST.md)를 참고하세요.

## 로컬 실행

요구 환경:

- Node.js 24 이상
- Python 3.11 이상

```bash
python -m pip install -e '.[test]'
node scripts/build-i18n.mjs
node scripts/build-chart-index.mjs
python scripts/validate-generated-data.py
python -m pytest -q
node scripts/test-chart-scoring.mjs
node scripts/test-targeted-passive-support.mjs
node scripts/test-exact-global-search.mjs
node scripts/test-exact-runtime-source.mjs
python -m http.server 8000
```

브라우저에서 `http://localhost:8000/`을 엽니다.

## 주요 구조

```text
index.html
styles.css
css/
js/
  app.js
  state.js
  recommend.js
  score.js
  chart-data.js
  chart-score.js
  order.js
  optimizer-core.js
  optimizer-client.js
  optimizer-worker.js
  ui/
src/holodori_decksim/
scripts/
data/generated/
  manifest.json
  cards.json
  characters.json
  music.json
  chart-index.json
  exact-runtime-index.json
  live-score-rules.json
  charts/
  i18n/
.github/workflows/
  validate.yml
  pages.yml
  sync-master-data.yml
  release.yml
VERSION
CHANGELOG.md
LICENSE
NOTICE.md
```

## 라이선스와 출처

이 저장소에서 프로젝트 제작자가 직접 작성한 소스 코드와 문서는 `LICENSE`의 MIT License를 따릅니다. 게임 파생 데이터·이미지·상표와 외부 chart/SUS 자료의 권리는 각 원 출처 및 권리자에게 있으며 프로젝트의 MIT License로 재허가되지 않습니다.

자세한 출처와 권리 범위는 [NOTICE.md](NOTICE.md)를 확인하세요.
