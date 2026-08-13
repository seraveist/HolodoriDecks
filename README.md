# Holodori DeckSim

**v1.0.0** · 홀로라이브 드림스 보유 카드 기반 6인 라이브 편성 시뮬레이터

> 비공식 팬메이드 도구입니다. COVER Corporation, hololive production 및 게임 운영 주체와 제휴·후원·공식 인증 관계가 없습니다.

라이브 서비스: https://seraveist.github.io/HolodoriDecks/

## v1.0.0 주요 기능

- 리더 1자리 + 멤버 5자리의 6인 프리셋
- 보유 카드 등록 및 카드별 현재 레벨·개화 단계 저장
- 현재 레벨 / 카드 MAX 레벨 계산 전환
- 리더/멤버 동일 홀로멤 분리 옵션
- 비어 있는 조건을 자동 탐색하는 추천 편성 TOP 5
- `최고 유닛 스코어` / `최고 잠재 스코어` 2가지 시뮬레이션 목표
- 악곡·난이도·AUTO/Manual FC 조건 선택
- 카드 레벨·개화·리더·액티브·패시브·스페셜 스킬 반영
- 동일 액티브 주기 충돌 보정
- 악곡별 예상 평균 / 근사 최대 스코어
- 실제 채보 메타데이터가 있는 경우 노트 타임라인과 SP1~SP5 발동 순서 반영
- Exact 채보에서 최종 멤버 5명의 SP 순서 재최적화
- 조합 수에 따른 Exact / Beam 탐색 자동 전환
- 계산 근거, 스킬 진단표, 개인/팀 발동 타임라인
- 카드 상세 정보, 검색, 희귀도·타입 필터, 정렬
- 보유 카드 JSON 내보내기 / 가져오기
- 한국어 / English / 日本語
- 라이트 / 다크 테마
- PC·태블릿·모바일 반응형 UI
- GitHub Pages 정적 배포
- HolodoriDB Master 자동 동기화 및 검토용 PR 생성

## 기본 사용 흐름

1. `내 보유 카드`에서 사용할 카드를 등록하고 레벨·개화 상태를 설정합니다.
2. `편성하기`의 프리셋에서 반드시 사용할 리더나 멤버가 있다면 선택합니다.
3. 시뮬레이션 목표, 육성 반영, 리더/멤버 분리 여부를 설정합니다.
4. 악곡·난이도·플레이 기준을 선택합니다. 악곡을 선택하지 않으면 범용 유닛 스코어를 기준으로 계산합니다.
5. `추천 편성 계산`을 누르면 TOP 5와 계산 근거가 표시됩니다.

보유 카드·레벨·개화·프리셋·언어·테마 설정은 브라우저 `localStorage`에 저장됩니다.

## 프리셋 규칙

프리셋은 **필수 조건**을 지정하는 용도입니다.

- 리더 프리셋: 선택한 카드를 리더로 고정합니다.
- 멤버 프리셋: 선택한 카드를 최종 5인 멤버에 반드시 포함하지만 원래 선택했던 멤버 슬롯 번호에는 고정하지 않습니다.
- 비어 있는 자리는 목표에 맞춰 자동 탐색합니다.
- Exact SP 채보가 있는 악곡에서는 최종 5명의 순서를 최대 `5! = 120`개까지 다시 평가하여 SP1~SP5 배치를 최적화합니다.
- Exact SP 채보가 없는 경우 현재 집계형 점수 모델은 멤버 순서에 중립적이므로 별도 순열 검색을 수행하지 않습니다.

즉 멤버 프리셋의 의미는 `이 위치에 고정`이 아니라 `이 카드를 반드시 사용`입니다.

## 시뮬레이션 목표

### 최고 유닛 스코어

- 악곡 미선택: 일반 발동 확률을 반영한 범용 유닛 스코어
- 악곡 선택: 해당 악곡의 예상 평균 스코어

### 최고 잠재 스코어

- 악곡 미선택: 유효한 액티브가 모두 성공한다고 가정한 잠재 유닛 스코어
- 악곡 선택: 해당 악곡에서 모든 유효 액티브가 성공할 때의 근사 최대 스코어

평균적으로 안정적인 덱과 발동이 이상적으로 이어졌을 때 고점이 높은 덱이 다를 수 있으므로 두 목표는 서로 다른 TOP 5를 반환할 수 있습니다.

## 계산 엔진

현재 엔진 식별자는 다음과 같습니다.

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
- 패시브 조건 및 파라미터/스코어 지원
- 스페셜 스킬 지속시간·스코어 효과 증가·발동률 증가
- 동일 액티브 주기의 충돌 손실
- 악곡 재생시간·스코어 계수
- Master 풀콤보 노트 수
- Manual FC 콤보 보너스
- Exact 채보의 실제 노트 시각·노트 타입·SP 슬롯 시각

범용 유닛 스코어는 현재 calibration fixture를 기반으로 한 경험 상수 `K = 2.037342`를 사용합니다.

## 채보 정확도 계층

현재 공개된 v1.0.0은 다음 순서로 계산합니다.

```text
Local Exact metadata
  → 저장소에 포함된 검증된 실제 노트 타임라인 + SP 슬롯 시각
  ↓ 없으면
Master chart
  → 실제 풀콤보 노트 수 + 집계형 SP 근사
  ↓ 없으면
Estimated
  → 난이도별 노트 밀도 추정
```

현재 공개 v1.0.0의 Local Exact metadata는 `m0049 / EXPERT` 1개입니다.

### 다음 릴리스 후보: Runtime Exact

현재 별도 브랜치에서 아래 계층을 추가 검증하고 있습니다.

```text
Local Exact metadata
  ↓ 없으면
Pinned Runtime Exact source
  ↓ 없거나 로드 실패 시
Master chart
  ↓ 없으면
Estimated
```

후보 Runtime Exact index는 현재 Master 728개 채보 중 **703개**와 `musicId + difficulty + chartHash + fullComboNoteCount + chartAssetId + normalNoteCount`가 모두 일치합니다. 원본 공개 snapshot 전체는 약 28MB이지만, 앱은 선택한 채보 객체의 byte range만 lazy-load하도록 설계했습니다. 현재 감사 snapshot에서 unavailable로 기록된 채보는 25개이며 이들은 기존 Master/fallback을 사용합니다.

이 Runtime Exact 경로는 아직 v1.0.0 공개 릴리스에 포함되지 않았습니다. 감사·검증 세부 내용은 [EXACT_CHART_CORPUS.md](EXACT_CHART_CORPUS.md)를 참고하세요.

## v1 계산 범위와 제한

이 항목은 v1 결과를 해석할 때의 기준입니다.

- 이 프로젝트는 공식 게임 클라이언트의 내부 최종 점수식을 그대로 복제한 도구가 아니라, 확인 가능한 Master 데이터와 검증 fixture를 바탕으로 한 **시뮬레이터**입니다.
- 계정별 **홀로멤버 보드 / 메모리 보정은 v1 계산에 포함하지 않습니다.** 현재 해당 항목의 계산 기여도는 0으로 유지됩니다.
- **이벤트 보너스는 v1 계산에 포함하지 않습니다.**
- 공개 v1.0.0에서 실제 노트별 시각과 SP 발동 순서는 Local Exact metadata가 확보된 악곡/난이도에서만 사용합니다. 그 외에는 Master 풀콤보 수와 집계형 SP 모델로 fallback합니다.
- Exact metadata의 Fever 구간은 보존하지만 v1의 솔로 점수에는 별도의 Fever 배율을 임의 적용하지 않습니다.
- 따라서 앱의 점수는 편성 간 비교와 추천을 위한 예상값이며 인게임 결과와 소수점/반올림, 미확인 계정 보정, 향후 Master 변경 등에 따라 차이가 날 수 있습니다.

## 검색 알고리즘

편성 후보 수가 작을 때는 모든 조합을 평가하고, 경우의 수가 큰 경우 Beam Search로 전환합니다.

```text
EXACT_CASE_LIMIT = 650,000
BEAM_MEMBER_LIMIT = 52
BEAM_WIDTH = 360
BEAM_SECONDARY_WIDTH = 180
```

Exact SP 채보에서는 1차 조합 검색에 Master-only 컨텍스트를 사용하여 임의의 초기 멤버 순서가 조합 순위에 영향을 주지 않게 한 뒤, 상위 후보를 실제 타임라인으로 다시 평가합니다.

곡 컨텍스트·콤보 평균·song kernel을 캐시하고, SP 순열 검색에서는 동일 5인 조합의 리더/패시브/파라미터 계산을 재사용하여 반복 계산을 줄였습니다.

## 현재 데이터 스냅샷

`data/generated/manifest.json` 기준:

- 플레이어블 캐릭터: 62
- 카드: 169
- 악곡: 182
- 리더 데이터 보유 카드: 169
- 난이도별 채보: 728
- 공개 v1.0.0 Local Exact 채보 metadata: 1
- 다음 릴리스 후보 Runtime Exact 호환 채보: 703 / 728
- 후보 snapshot Runtime Exact unavailable: 25 / 728
- 지원 언어: KO / EN / JA

보유 카드/프리셋 선택 UI에서는 ★4·★5 카드를 사용합니다.

## 데이터 동기화

핵심 Master는 `HolodoriDB/holodori-db-kor-diff`를 사용하고, 표시 언어는 같은 `master_version`의 KO/EN/JA snapshot을 정렬해서 생성합니다.

- `HolodoriDB/holodori-db-kor-diff`
- `HolodoriDB/holodori-db-eng-diff`
- `HolodoriDB/holodori-db-jpn-diff`

`.github/workflows/sync-master-data.yml`은 매일 00:15 KST에 동작합니다.

```text
upstream 변경 감지
→ 동일 master_version의 KO/EN/JA snapshot 해석
→ cards / characters / music / skill 데이터 재생성
→ i18n 재생성
→ chart index / score rules 재생성
→ 구조/회귀 테스트
→ automation/master-data-sync 브랜치
→ 자동 검토 PR
→ 사람이 확인 후 merge
→ Pages 배포
```

동기화는 upstream 데이터를 자동으로 `main`에 병합하지 않습니다. 자세한 내용은 [DATA_SYNC.md](DATA_SYNC.md)를 참고하세요.

## Exact 채보 metadata

`.sus` 파일을 확보한 경우:

```bash
pip install git+https://github.com/HolodoriDB/holodori-scores.git
python scripts/ingest-chart-metadata.py path/to/chart_m0001_expert.sus
node scripts/build-chart-index.mjs
```

현재 저장소에 직접 포함된 `m0049 / EXPERT` metadata는 공개 fixture를 기반으로 하며 provenance가 JSON에 기록되어 있습니다.

- source: `asciisyaez/yagoo-dori`
- pinned commit: `6c2c95d52c268862d34fb523d965f09a3108bbbd`

다음 릴리스 후보의 대량 Exact corpus intake는 703개 변환 timeline JSON을 DeckSim 저장소에 bulk-publish하지 않습니다. 대신 `data/generated/exact-runtime-index.json`에 각 호환 채보의 byte offset/길이/SHA256과 현재 Master 식별값만 저장하고, Local Exact 파일이 없을 때 선택된 공개 source chart 객체만 range fetch한 뒤 hash/Master 정합성을 다시 검증하는 방식입니다.

후보 corpus의 source manifest에는 별도 재배포 라이선스가 명시되어 있지 않기 때문에 전체 변환 데이터의 저장소 복제를 피합니다. 자세한 감사 결과는 [EXACT_CHART_CORPUS.md](EXACT_CHART_CORPUS.md)를 참고하세요.

## 프로젝트 구조

```text
index.html
styles.css
css/
  tokens.css
  base.css
  components.css
  owned.css
  modal.css
  responsive.css
  tweaks.css
  theme.css
  typography.css
  chart-timeline.css
js/
  app.js
  data.js
  i18n.js
  theme.js
  state.js
  recommend.js
  score.js
  chart-data.js
  chart-score.js
  order.js
  ui/
src/holodori_decksim/
  sources.py
  sync.py
scripts/
  build-i18n.mjs
  build-chart-index.mjs
  build-exact-runtime-index.mjs
  import-chart-timeline-corpus.mjs
  ingest-chart-metadata.py
  validate-generated-data.py
  test-chart-scoring.mjs
  test-exact-runtime-source.mjs
tests/
  test_sync.py
  test_release_metadata.py
data/generated/
  manifest.json
  cards.json
  characters.json
  music.json
  master_refs.json
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
python -m http.server 8000
```

Runtime Exact 릴리스 후보 range index를 재생성하려면 감사 문서에 기록된 **정확히 고정된 corpus snapshot**을 별도로 받아 다음을 실행합니다.

```bash
node scripts/build-exact-runtime-index.mjs --input /path/to/holodori-chart-timelines.json
node scripts/test-exact-runtime-source.mjs
```

브라우저에서 `http://localhost:8000/`을 엽니다. `file://` 직접 열기는 ES module/CORS 제약 때문에 지원하지 않습니다.

수동 회귀 테스트 항목은 [LOCAL_TEST.md](LOCAL_TEST.md)를 참고하세요.

## 라이선스 / 출처

- 이 저장소에서 프로젝트 제작자가 작성한 소스 코드와 문서: [MIT License](LICENSE)
- 게임 파생 이름·데이터·이미지·상표 등: 각 원 권리자에게 귀속
- HolodoriDB Master/번역 데이터: 각 원 출처의 조건을 따르며 이 저장소의 MIT License 대상이 아님
- Exact chart 외부 source 및 provenance: [NOTICE.md](NOTICE.md), [EXACT_CHART_CORPUS.md](EXACT_CHART_CORPUS.md)
- Pretendard: SIL Open Font License 1.1

자세한 구분은 [NOTICE.md](NOTICE.md)를 참고하세요.
