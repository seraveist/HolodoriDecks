# Holodori DeckSim

홀로라이브 드림스의 보유 카드와 육성 상태를 기반으로 6인 라이브 편성을 계산하고, 추천 결과와 스킬 발동 구조를 확인하는 정적 웹 애플리케이션입니다.

## 현재 제공 기능

- 리더 1자리 + 멤버 5자리의 6인 프리셋
- 채워진 프리셋 슬롯을 팝업 없이 바로 비울 수 있는 슬롯별 `×` 액션
- 프리셋 초기화를 슬롯 영역과 같은 위계에 배치한 편성 UI
- 보유 카드 등록 및 카드별 현재 레벨·개화 단계 저장
- 현재 레벨/MAX 레벨 계산 전환
- 리더/멤버 동일 홀로멤 분리 옵션
- 비어 있는 프리셋 슬롯 자동 편성 및 TOP 5 추천
- **최고 유닛 스코어 / 최고 잠재 스코어** 2가지 시뮬레이션 목표
- 악곡·난이도·AUTO/Manual FC 조건 선택
- 리더·액티브·패시브·스페셜 스킬 및 개화 효과 반영
- 동일 액티브 주기 충돌 보정
- 유닛 스코어와 악곡별 예상 평균/근사 최대 스코어 표시
- 모바일 추천 결과에서 카드 가독성을 유지하는 가로 스크롤/스냅 UI
- 파라미터·점수 보너스 산식, 스킬 진단표, 발동 타임라인 표시
- 카드 상세 정보, 검색, 희귀도·타입 필터, 정렬
- 보유 카드 JSON 내보내기/가져오기
- 한국어 / English / 日本語 전환
- 헤더 아이콘 하나로 전환하는 라이트 / 다크 테마
- GitHub Pages 정적 배포

## 시뮬레이션 목표

시뮬레이션 목표는 P/T/S 파라미터 자체를 최대화하지 않고 실제 점수 계열 두 가지로 단순화했습니다.

- `최고 유닛 스코어`
  - `전체 평균`: 일반 발동 확률을 반영한 유닛 스코어 기준
  - 특정 악곡: 해당 악곡의 예상 평균 스코어 기준
- `최고 잠재 스코어`
  - `전체 평균`: 유효한 액티브가 모두 성공한다고 가정한 잠재 유닛 스코어 기준
  - 특정 악곡: 해당 악곡의 모든 유효 액티브 성공 시 근사 최대 스코어 기준

따라서 평균적으로 강한 덱과 발동 운이 이상적으로 따라왔을 때 고점이 높은 덱이 서로 다른 경우 각각 다른 TOP 5를 확인할 수 있습니다.

## 테마

화면 우측 상단의 테마 아이콘을 누르면 **라이트 ↔ 다크** 모드를 즉시 전환합니다. 별도의 테마 셀렉트는 사용하지 않습니다.

선택값은 `localStorage`의 `holodori-decksim:theme`에 `light` 또는 `dark`로 저장됩니다. 이전 버전의 `system` 값이나 저장값이 없는 브라우저는 최초 로드 시 운영체제의 `prefers-color-scheme`을 기준으로 라이트/다크 중 하나를 선택해 저장합니다.

좁은 화면에서는 테마 아이콘과 언어 셀렉트를 한 줄에 유지하고, `테마`/`언어` 라벨은 시각적으로 별도 행을 차지하지 않도록 구성합니다.

## 다국어 지원

화면 우측 상단의 언어 선택기에서 다음 세 언어를 전환할 수 있습니다.

- `ko`: 한국어
- `en`: English
- `ja`: 日本語

선택 언어는 `localStorage`의 `holodori-decksim:locale`에 저장됩니다. 기존 보유 카드·레벨·개화·프리셋 상태는 별도 키 `holodori-decksim:v2`에 저장되므로 언어를 변경해도 편성 데이터는 유지됩니다.

게임 데이터 번역은 다음 upstream 저장소의 **같은 `master_version`** 에 대응하는 커밋을 사용합니다.

- `HolodoriDB/holodori-db-kor-diff`
- `HolodoriDB/holodori-db-eng-diff`
- `HolodoriDB/holodori-db-jpn-diff`

각 언어의 Git commit SHA는 서로 달라도 됩니다. `data/generated/manifest.json`에 각 locale의 저장소·commit을 고정하고, 모든 locale의 `version.txt`가 core `master_version`과 정확히 같은지 빌드에서 검증합니다.

사용하는 언어 리소스는 `LangCard`, `LangCharacter`, `LangMusic`과 `LangGeneratedLive*` 계열입니다. 내용이 비어 있는 구형 `LangLive*` 리소스는 사용하지 않습니다.

### 언어팩 생성

Node.js 24 이상에서 다음 명령을 실행합니다.

```bash
node scripts/build-i18n.mjs
```

생성 결과:

```text
data/generated/i18n/
  ko.json
  en.json
  ja.json
  manifest.json
```

생성기는 카드·캐릭터·악곡·스킬에 실제로 필요한 LangId를 세 언어에서 모두 검사합니다. 하나라도 누락되거나 locale의 master version이 core 데이터와 다르면 실패합니다.

일부 카드 master는 `nameLangId`로 `la-card_name-*` 대신 `la-card_flavor-*`를 사용합니다. 생성기는 pinned `Card.json`의 실제 `nameLangId`를 읽어 표준 카드명 키로 정규화하므로 이 경우도 세 언어에서 동일하게 처리됩니다.

GitHub Pages 배포에서는 `.github/workflows/pages.yml`이 언어팩을 매번 새로 생성하고 검증한 뒤 Pages artifact에 포함합니다. 로컬에서 생성 언어팩이 없는 경우 영어·일본어는 manifest에 고정된 upstream commit을 fallback으로 읽으며, 한국어는 core JSON의 기존 표시값을 사용할 수 있습니다.

## 정적 웹 구조

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
js/
  app.js
  data.js
  i18n.js
  theme.js
  recommend.js
  score.js
  state.js
  ui/
    card-detail.js
    cards.js
    dom.js
    member.js
    modal.js
    music.js
    owned.js
    result.js
    result-target.js
    target.js
scripts/
  build-i18n.mjs
data/generated/
  manifest.json
  cards.json
  characters.json
  master_refs.json
  music.json
  i18n/              # CI/로컬 빌드 생성물
assets/
  cards/{card.id}.webp
  ui/
.github/workflows/
  pages.yml
  validate.yml
```

브라우저는 먼저 `data/generated/manifest.json`을 읽은 뒤 같은 동기화 버전의 `cards.json`, `characters.json`, `music.json`을 로드합니다. manifest의 카드·캐릭터·악곡 개수와 실제 JSON이 다르면 이전 데이터가 섞인 것으로 판단하고 실행을 중단합니다. 별도 API 서버나 백엔드는 사용하지 않습니다.

## 현재 데이터 스냅샷

현재 manifest 기준:

- 플레이어블 캐릭터: 62명
- 카드: 169장
- 악곡: 182곡
- 리더 데이터 보유 카드: 169장

보유 카드/프리셋 선택 UI에서는 ★4·★5 카드를 사용하며 카드 이미지는 `assets/cards/{card.id}.webp`에서 로드합니다.

## 로컬 실행

HTML module과 `fetch()`를 사용하므로 `index.html`을 직접 열지 말고 저장소 루트에서 HTTP 서버를 실행합니다.

언어팩까지 로컬에 생성하려면 먼저:

```bash
node scripts/build-i18n.mjs
```

그다음:

```bash
python -m http.server 8000
```

Windows에서 `python` 명령이 없다면:

```bash
py -m http.server 8000
```

브라우저에서 `http://localhost:8000/`을 엽니다. 자세한 수동 테스트 항목은 [LOCAL_TEST.md](LOCAL_TEST.md)를 참고하세요.

## 자동 검증

feature branch와 pull request에서는 `.github/workflows/validate.yml`이 다음 항목을 검사합니다.

- 전체 JavaScript syntax
- ESM module import/export 연결
- 최고 유닛/잠재 스코어 정렬 함수
- P/T/S 시뮬레이션 목표가 UI에서 제거되었는지 여부
- 슬롯 직접 비우기 UI와 모바일 결과 카드 규칙
- 라이트/다크 아이콘 토글 및 좁은 헤더 한 줄 배치 규칙
- pinned KO/EN/JA 언어팩 생성
- core/locale master version 일치
- 필수 LangId 누락 여부
- 대표 카드명·캐릭터명 번역 샘플
- HTML/JavaScript 앱 버전 일치

`main` 배포 시 `.github/workflows/pages.yml`도 핵심 모듈과 시뮬레이션 목표를 다시 검증하고 언어팩 생성/검증을 수행한 뒤 GitHub Pages를 배포합니다.

## 계산 엔진 상태

추천 계산은 `Unit Score Engine v0.4-potential` 및 정적 악곡 근사 계층과 경험 상수 `K=2.037342`를 사용합니다. 직접 선택한 리더·멤버 슬롯은 계산 조건으로 고정하지만, 계산 결과가 프리셋 슬롯을 덮어쓰지는 않습니다.

주요 반영 항목:

- 리더 기본/추가 조건 및 효과
- 액티브·패시브·스페셜 스킬
- 액티브 발동 확률·주기·지속시간
- 동일 주기 액티브 충돌 보정
- 일반 기대 스코어와 모든 유효 액티브 성공 기준 잠재 스코어
- 카드 레벨
- 개화 1: Active Lv2
- 개화 2: 전체 파라미터 +10%
- 개화 3: Special Lv2
- 개화 4: Passive Lv2
- 선택 악곡의 재생시간·스코어 계수
- 난이도별 추정 노트 밀도
- Manual FC의 집계 노트 기반 콤보 보너스

현재 `music.json`에는 실제 노트 타임라인이 없으므로 악곡별 점수는 집계 채보 근사입니다. 계정별 Holo멤버 보드·메모리 보정도 아직 포함하지 않습니다.
