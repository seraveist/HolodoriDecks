# Holodori DeckSim 로컬 테스트

이 문서는 v1.1 계열 공개 전후의 수동 회귀 테스트 기준입니다.

## 1. 준비

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
node scripts/test-song-score-invariants.mjs
node scripts/test-song-corpus.mjs
node scripts/test-targeted-passive-support.mjs
node scripts/test-passive-stat-rounding.mjs
node scripts/test-passive-target-priority.mjs
node scripts/test-support-stacking.mjs
node scripts/test-generic-order.mjs
node scripts/test-song-representative-order.mjs
node scripts/test-card-preparation.mjs
node scripts/test-simulation-targets.mjs
node scripts/test-collision-choice.mjs
node scripts/test-exact-global-search.mjs
node scripts/test-exact-pruning.mjs
node scripts/test-beam-search.mjs
node scripts/test-exact-runtime-source.mjs
node scripts/test-optimization-session.mjs
node scripts/test-chart-abort.mjs
node scripts/test-browser-smoke.mjs
python -m http.server 8000
```

Windows에서 `python` 명령이 없다면 `py -m http.server 8000`을 사용합니다. 브라우저에서 `http://localhost:8000/`을 엽니다.

GitHub Actions와 동일한 자동 브라우저 smoke는 `node scripts/test-browser-smoke.mjs`로 별도 실행할 수 있습니다.

## 2. 초기 로드 / 저장 상태

1. 앱이 오류 배너 없이 로드되는지 확인합니다.
2. `편성하기` / `내 보유 카드` 탭 전환이 정상인지 확인합니다.
3. 카드·캐릭터·악곡 데이터가 정상 표시되는지 확인합니다.
4. 새로고침 후 보유 카드·레벨·개화·프리셋·언어·테마가 유지되는지 확인합니다.

## 3. 언어 / 테마 / Typography

1. 한국어 / English / 日本語 전환 시 UI와 카드·캐릭터·악곡·스킬 문구가 함께 바뀌는지 확인합니다.
2. 헤더 테마 버튼으로 라이트 ↔ 다크가 즉시 전환되고 새로고침 후 유지되는지 확인합니다.
3. 프리셋 / 선택 팝업 / 보유 카드 / 결과 카드의 캐릭터명·카드명·Lv/개화 계층이 동일한지 확인합니다.
4. 결과 카드에서 리더 배지 유무와 관계없이 텍스트 시작 높이가 멤버 카드와 일치하는지 확인합니다.
5. Windows 100% / 125% / 150% 또는 브라우저 확대에서 작은 글씨가 심하게 번지지 않는지 확인합니다.
6. 모바일/좁은 화면에서도 카드 텍스트 계층이 데스크톱과 동일하게 유지되는지 확인합니다.

## 4. 보유 카드 / 프리셋

1. 검색·희귀도·타입·보유 상태·정렬 필터가 정상 동작하는지 확인합니다.
2. 보유/미보유, 레벨, 개화 0~5, JSON 내보내기/가져오기를 확인합니다.
3. 리더 프리셋은 리더로 유지되어야 합니다.
4. 멤버 프리셋은 최종 5명에 포함되되, 멤버 프리셋을 예를 들어 `멤버 4`에 지정해도 해당 위치에 고정되지 않는지 확인합니다.
5. 리더/멤버 분리 옵션과 프리셋 초기화를 확인합니다.

## 5. 계산 목표 / 플레이 기준

`계산 설정`의 선택 버튼은 `유닛 스코어`, `악곡 기대 스코어`, `악곡 최대 스코어` 세 개입니다. 프리셋에 목표 드롭다운이 남아 있으면 안 됩니다.

1. 유닛 목표는 악곡·난이도·플레이 기준을 숨기고, 저장된 값이 있어도 계산에 사용하지 않습니다.
2. 악곡 목표에서는 악곡 선택이 필요하며, 곡을 비우면 계산 버튼이 비활성화됩니다. 악곡 목록에는 범용 유닛 평가가 없어야 합니다.
3. 목표 전환 시 악곡·난이도·플레이 기준은 보존하고, 기존 결과는 초기화합니다. 유닛 목표에서 새로고침해도 기억된 곡 때문에 악곡 목표로 바뀌면 안 됩니다.
4. 플레이 기준은 `AUTO 플레이` / `수동 ALL PERFECT`로 표시합니다.
5. 결과 대표 점수와 순위는 선택한 목표를 따라야 합니다. 악곡 결과의 기대·최대 점수는 같은 대표 순서의 값입니다.
6. `리더를 편성에 제외`를 켜면 리더와 같은 홀로멤은 멤버로 사용할 수 없어야 합니다. 끄면 다른 카드의 같은 홀로멤을 허용합니다.

유닛 목표는 조합마다 공통 채보의 잠재 점수가 가장 높은 순서 하나를 표시합니다. 악곡 목표는 해당 곡에서 선택한 기대/최대 기준의 대표 순서 하나를 표시합니다. 멤버 프리셋은 카드 포함을 유지하며 순서는 최적화할 수 있습니다. 공통 채보 설명 박스는 표시하지 않습니다.

`node scripts/test-calculation-modes.mjs`와 `node scripts/test-browser-smoke.mjs`로 저장 설정 이전·목표 연결·악곡 복원·리더 제외·다국어 모바일 화면을 검증합니다. `node scripts/test-song-representative-order.mjs`는 Exact/Master/Estimated 및 AUTO/Manual의 두 악곡 목표를 120개 순열 전수 계산과 비교합니다.

## 6. Local Exact / Runtime Exact

### Local Exact

`m0049 / EXPERT`를 선택합니다.

1. `실제 채보 노트·SP 순서 반영` 안내가 표시되는지 확인합니다.
2. SP1~SP5에 실제 카드명과 시작/종료 시각이 표시되는지 확인합니다.
3. 프리셋 멤버가 포함되면서 SP 순서에 따라 다른 위치로 재배치될 수 있는지 확인합니다.

### Runtime Exact

`m0001 / EXPERT` 등 Local Exact 이외의 Runtime Exact 등록 채보를 선택합니다.

1. Network 탭에서 `holodori-chart-timelines.json` 요청이 발생하는지 확인합니다.
2. 요청 헤더가 `Range: bytes=...`인지 확인합니다.
3. 응답이 `206 Partial Content`이고 `Content-Range`가 요청 구간과 일치하는지 확인합니다.
4. 전체 source가 아니라 선택 채보 범위만 전송되는지 확인합니다.
5. 결과가 `실제 채보 노트·SP 순서 반영` 상태인지 확인합니다.
6. 최종 5인 SP1~SP5 순서가 재최적화되는지 확인합니다.

2026-09-08 snapshot에서는 Runtime Exact 호환 채보가 699 / 796입니다. Local/Runtime Exact를 사용할 수 없는 채보는 Master fallback으로 계산합니다.

### Fail-soft fallback

DevTools에서 Runtime Exact source 요청을 차단한 뒤 같은 곡을 다시 계산합니다.

1. 계산 자체가 실패하지 않아야 합니다.
2. `Master 풀콤보 노트 수 반영 · SP 타이밍 근사`로 내려가야 합니다.
3. 앱 전체 오류 배너가 발생하지 않아야 합니다.

## 7. Exact 진단 일치 / 대상 Passive Support

1. Exact 곡 상세 결과의 예상 발동 횟수·확률·커버율이 실제 SP 발동률 구간과 일치하는지 확인합니다.
2. 개인/팀 타임라인이 실제 액티브 판정 시각을 사용하는지 확인합니다.
3. 대상 지정 Passive Active-Skill-Effect-Up이 실제 대상 멤버의 액티브에만 적용되는지 확인합니다.

## 8. Worker / UI 응답성 / stale 요청

보유 카드를 충분히 많이 등록하고 Runtime Exact 곡을 계산합니다.

1. 계산 중 버튼이 비활성화되고 완료 후 다시 활성화되는지 확인합니다.
2. 계산 중에도 스크롤·페이지 애니메이션이 장시간 멈추지 않는지 확인합니다.
3. DevTools에서 module Worker가 생성되는지 확인합니다.
4. Worker 미지원 환경에서는 동일 계산 코어의 동기 fallback으로 결과가 나오는지 확인합니다.
5. Runtime Exact 요청이 진행 중일 때 악곡·목표·프리셋 중 하나를 바꾸면 기존 Range 요청이 취소되는지 확인합니다.
6. 설정 변경 후 새 계산 B를 완료한 다음 이전 계산 A가 늦게 종료되어도 B의 TOP 5·상태 문구·계산 버튼 상태가 지워지거나 덮어써지지 않는지 확인합니다.

## 9. 결과 / 모바일

1. TOP 1~5와 리더 + 멤버 5장이 정상 표시되는지 확인합니다.
2. 예상 평균/근사 최대, 종합력, P/T/S, 스코어 보너스 산식이 표시되는지 확인합니다.
3. 스킬 툴팁과 개인/팀 발동 타임라인이 정상인지 확인합니다.
4. 600px 이하에서 프리셋/보유 카드가 2열이고 결과 6장은 좌우 스크롤되는지 확인합니다.
5. 모달과 결과 헤더가 화면 밖으로 벗어나지 않는지 확인합니다.

## 10. 데이터 동기화

GitHub Actions의 `Sync Holodori master data`를 `dry_run=true`로 실행해 최신 upstream을 검증할 수 있습니다.

Master 변경 시 workflow는 `chart-index.json` 이후 pinned Runtime Exact corpus를 현재 Master와 다시 대조해 `exact-runtime-index.json`도 재생성해야 합니다. 새 `chartHash` 또는 노트 수와 맞지 않는 Runtime entry는 새 index에서 제외되어야 합니다.

```bash
holodori-sync --force
node scripts/build-i18n.mjs
node scripts/build-chart-index.mjs
python scripts/validate-generated-data.py
python -m pytest -q
node scripts/test-chart-scoring.mjs
node scripts/test-targeted-passive-support.mjs
node scripts/test-card-preparation.mjs
node scripts/test-simulation-targets.mjs
node scripts/test-collision-choice.mjs
node scripts/test-exact-global-search.mjs
node scripts/test-exact-pruning.mjs
node scripts/test-beam-search.mjs
node scripts/test-exact-runtime-source.mjs
node scripts/test-optimization-session.mjs
node scripts/test-chart-abort.mjs
```

## 11. 1차 실측 회귀 (2026-09-08)

다른 PC에서는 Node.js24 이상으로 `node scripts/run-scoring-validation.mjs`를 실행합니다. `node verify-handoff.mjs`는 AT까지44건·액티브/SP40/40과 미관측 AU 계획을 확인합니다. 최신 AT 관측과 AU 사전 예측은 `node scripts/test-validation-at.mjs`로 재현합니다. AK·AO·AS·AT의 미제공 값과 기존 배분식의 실패를 보존합니다. 최신 진행은 [HANDOFF_CURRENT.md](HANDOFF_CURRENT.md)를 따릅니다. `--research-grid`는 초기 후보 탐색을 재실행합니다.

`node scripts/test-unit-observations.mjs`로 H 추가 후 화면 11건의 종합력과 반복 관측을 재현합니다. `--json`을 붙이면 남은 보너스 오차를 포함한 비교 결과를 JSON으로 출력합니다. 자세한 범위는 [계산식 1차 검증 기록](SCORING_VALIDATION.md)을 참고합니다.

## 12. 릴리스 metadata

현재 버전은 `VERSION`, `pyproject.toml`, package `__version__`, README, CHANGELOG가 동일해야 합니다. `python -m pytest -q`의 release metadata 테스트와 `.github/workflows/release.yml`이 공개 버전 정합성을 검증합니다.

`main` 병합 후 `.github/workflows/pages.yml`이 핵심 검증을 다시 수행하고 Pages를 배포합니다. 성공한 Pages 배포에 대해 VERSION tag/release가 아직 없으면 `.github/workflows/release.yml`이 해당 배포 커밋을 태그하고 GitHub Release를 생성합니다.
