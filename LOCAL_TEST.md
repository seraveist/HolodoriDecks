# Holodori DeckSim v1 로컬 테스트

이 문서는 v1 공개 전후의 수동 회귀 테스트 기준입니다.

## 1. 준비

요구 환경:

- Node.js 24 이상
- Python 3.11 이상

동기화 도구와 pytest 설치:

```bash
python -m pip install -e '.[test]'
```

생성 데이터 재검증:

```bash
node scripts/build-i18n.mjs
node scripts/build-chart-index.mjs
python scripts/validate-generated-data.py
python -m pytest -q
node scripts/test-chart-scoring.mjs
```

정적 서버 실행:

```bash
python -m http.server 8000
```

Windows에서 `python` 명령이 없다면:

```bash
py -m http.server 8000
```

브라우저에서 `http://localhost:8000/`을 엽니다.

## 2. 초기 로드

1. 앱이 오류 배너 없이 로드되는지 확인합니다.
2. `편성하기` / `내 보유 카드` 탭 전환이 정상인지 확인합니다.
3. 카드·캐릭터·악곡 데이터가 정상 표시되는지 확인합니다.
4. 새로고침해도 저장된 보유 카드·레벨·개화·프리셋·언어·테마가 유지되는지 확인합니다.

## 3. 언어 / 테마

1. 한국어 / English / 日本語 전환 시 UI, 카드·캐릭터·악곡명, 스킬 설명이 같이 바뀌는지 확인합니다.
2. 언어를 변경해도 보유 카드·레벨·개화·프리셋 상태가 유지되는지 확인합니다.
3. 헤더의 테마 버튼으로 라이트 ↔ 다크가 즉시 전환되는지 확인합니다.
4. 새로고침 후 마지막 테마가 유지되는지 확인합니다.
5. 좁은 화면에서도 테마 버튼과 언어 선택기가 한 줄을 유지하는지 확인합니다.
6. 다크 모드에서 패널·입력 필드·결과 카드·모달·스킬 표의 대비가 충분한지 확인합니다.

## 4. 내 보유 카드

1. 카드 검색·희귀도·타입·보유 상태·정렬 필터가 정상 동작하는지 확인합니다.
2. 카드를 보유/미보유로 전환할 수 있는지 확인합니다.
3. 보유 카드의 레벨과 개화 0~5를 변경할 수 있는지 확인합니다.
4. `현재 목록 모두 보유`와 `보유 목록 비우기`가 정상 동작하는지 확인합니다.
5. JSON 내보내기 후 다시 가져왔을 때 보유 카드와 레벨·개화가 복원되는지 확인합니다.
6. 카드 상세 정보 버튼이 카드 선택 동작과 충돌하지 않는지 확인합니다.

## 5. 카드 텍스트 계층

프리셋 / 카드 선택 팝업 / 내 보유 카드 / 결과 카드에서 같은 정보는 같은 시각 계층을 사용해야 합니다.

1. 캐릭터명이 모든 카드 표현에서 같은 크기·굵기로 보이는지 확인합니다.
2. 카드명이 같은 크기로 보이는지 확인합니다.
3. Lv·개화 메타가 같은 크기로 보이는지 확인합니다.
4. 작은 배지/희귀도/타입 텍스트가 지나치게 뭉개지지 않는지 확인합니다.
5. 결과 카드에서 리더 배지 유무와 관계없이 캐릭터명·카드명 시작 높이가 멤버 카드와 일치하는지 확인합니다.
6. Windows 100% / 125% / 150% 배율 또는 브라우저 확대에서 작은 텍스트가 심하게 번지지 않는지 확인합니다.

## 6. 프리셋 동작

1. 리더 슬롯에 카드를 지정하면 추천 결과에서도 해당 카드가 리더로 유지되는지 확인합니다.
2. 멤버 프리셋에 카드를 지정하면 해당 카드는 최종 멤버 5명에 포함되는지 확인합니다.
3. 멤버 프리셋을 예를 들어 `멤버 4`에 지정해도 결과에서 반드시 `멤버 4` 위치에 고정되지 않는지 확인합니다.
4. 프리셋 카드의 `×`를 누르면 팝업 없이 해당 조건만 제거되는지 확인합니다.
5. `프리셋 초기화`는 6개 프리셋만 비우고 보유 카드 목록은 유지하는지 확인합니다.
6. 리더/멤버 분리 옵션을 켰을 때 리더와 같은 홀로멤이 멤버에 들어가지 않는지 확인합니다.
7. 충돌하는 프리셋을 지정했을 때 현재 언어로 경고/오류가 표시되는지 확인합니다.

## 7. 시뮬레이션 목표

시뮬레이션 목표에는 아래 두 항목만 있어야 합니다.

- `최고 유닛 스코어`
- `최고 잠재 스코어`

확인 항목:

1. 악곡 미선택 + 최고 유닛 스코어에서 일반 유닛 스코어 기준 TOP 5가 표시되는지 확인합니다.
2. 악곡 미선택 + 최고 잠재 스코어에서 잠재 유닛 스코어 기준 TOP 5가 표시되는지 확인합니다.
3. 특정 악곡 + 최고 유닛 스코어에서 예상 평균 스코어 기준으로 정렬되는지 확인합니다.
4. 특정 악곡 + 최고 잠재 스코어에서 근사 최대 스코어 기준으로 정렬되는지 확인합니다.
5. 목표·악곡·난이도·AUTO/Manual·육성 반영을 바꾸면 기존 결과가 무효화되는지 확인합니다.

## 8. Exact 채보 / SP 순서

현재 회귀 검증용 실제 채보로 `m0049 / EXPERT`를 사용할 수 있습니다.

1. `m0049`, `EXPERT`를 선택하고 계산합니다.
2. 상세 결과에 실제 채보 반영 안내와 `스페셜 스킬 발동 순서`가 표시되는지 확인합니다.
3. SP1~SP5에 카드명과 시작/종료 시각이 표시되는지 확인합니다.
4. 멤버 프리셋으로 카드를 여러 장 지정한 뒤 다시 계산해도 지정 카드들이 포함되면서 순서는 재배치될 수 있는지 확인합니다.
5. 같은 5인 조합이라도 SP 순서에 따라 점수가 달라질 수 있는지 확인합니다.

다른 Master-only 악곡에서도 계산이 오류 없이 완료되고 실제 풀콤보 노트 수 기반 안내가 표시되는지 확인합니다.

## 9. 결과 카드 / 상세 결과

1. TOP 1~5가 순서대로 표시되는지 확인합니다.
2. 카드 6장이 리더 + 멤버 5명 순으로 표시되는지 확인합니다.
3. 결과 카드의 타입 아이콘, 희귀도, Lv/개화, 캐릭터명, 카드명이 식별 가능한지 확인합니다.
4. TOP 카드의 예상 평균/근사 최대 및 주요 숫자가 선명하게 보이는지 확인합니다.
5. 결과를 펼치면 악곡 예상값, 종합력, P/T/S, 스코어 보너스 산식이 표시되는지 확인합니다.
6. 스킬 진단표에 발동 간격·확률·지속시간·기대 횟수·패시브 상태가 표시되는지 확인합니다.
7. 멤버명에 포인터/키보드 포커스를 주면 스킬 툴팁이 표시되는지 확인합니다.
8. 개인/팀 발동 타임라인이 정상 렌더링되는지 확인합니다.
9. 결과를 열어 둔 상태에서 다른 TOP 카드를 열거나 조건을 변경해도 UI가 깨지지 않는지 확인합니다.

## 10. 모바일 / 좁은 화면

600px 이하에서 확인합니다.

1. 프리셋 슬롯이 2열로 배치되는지 확인합니다.
2. 카드 선택 팝업과 보유 카드가 2열로 표시되는지 확인합니다.
3. 추천 결과의 6장 카드를 강제로 축소하지 않고 좌우 스크롤할 수 있는지 확인합니다.
4. 카드 단위 스크롤/스냅이 자연스러운지 확인합니다.
5. 카드 텍스트 계층은 데스크톱과 동일하게 유지되는지 확인합니다.
6. 결과 헤더의 큰 숫자만 반응형으로 축소되고 잘리지 않는지 확인합니다.
7. 모달이 화면 밖으로 벗어나지 않고 내부 스크롤되는지 확인합니다.

## 11. 데이터 동기화 수동 점검

변경을 실제 반영하지 않고 최신 upstream을 검증하려면 GitHub Actions의 `Sync Holodori master data`를 `dry_run=true`로 실행합니다.

로컬에서는 다음 명령으로 현재 snapshot을 강제 재생성할 수 있습니다.

```bash
holodori-sync --force
node scripts/build-i18n.mjs
node scripts/build-chart-index.mjs
python scripts/validate-generated-data.py
python -m pytest -q
node scripts/test-chart-scoring.mjs
```

생성 결과가 동일 snapshot이면 불필요한 timestamp 차이 없이 deterministic한지 확인합니다.

## 12. 릴리스 metadata

현재 버전은 다음 세 위치가 일치해야 합니다.

```text
VERSION
pyproject.toml [project].version
src/holodori_decksim/__init__.py __version__
```

확인:

```bash
cat VERSION
python - <<'PY'
import tomllib
from pathlib import Path
from holodori_decksim import __version__
print('package:', __version__)
print('pyproject:', tomllib.loads(Path('pyproject.toml').read_text(encoding='utf-8'))['project']['version'])
PY
```

`python -m pytest -q`의 release metadata 테스트가 VERSION, README, CHANGELOG, LICENSE, NOTICE를 함께 검증합니다.

## 13. PR / Pages 자동 검증

PR에서는 `.github/workflows/validate.yml`이 다음을 자동 검사합니다.

- Python sync tests
- release metadata
- JavaScript syntax / ESM imports
- 추천 목표 정렬
- 핵심 UI 규칙
- semantic theme layering
- i18n completeness
- generated data integrity
- chart index / score rules
- exact chart metadata
- SP order regression

`main` 병합 후 `.github/workflows/pages.yml`이 핵심 검증을 다시 수행하고 Pages를 배포합니다.

성공한 Pages 배포에 대해 `VERSION` tag/release가 아직 없으면 `.github/workflows/release.yml`이 해당 배포 커밋을 태그하고 GitHub Release를 생성합니다.
