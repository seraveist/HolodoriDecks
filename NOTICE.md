# NOTICE

Holodori DeckSim은 비공식 팬메이드 편성 시뮬레이터입니다.

이 프로젝트는 COVER Corporation, hololive production, 홀로라이브 드림스의 운영 주체 또는 관련 권리자와 제휴·후원·공식 인증 관계가 없습니다.

## Source code license

이 저장소에서 프로젝트 제작자가 직접 작성한 소스 코드와 문서는 `LICENSE`의 MIT License를 따릅니다.

MIT License는 아래의 제3자 자료에 대한 권리를 부여하지 않습니다.

## Game-derived names, data and media

게임에서 파생된 캐릭터명, 카드명, 카드 이미지, 게임 데이터, 로고·상표 및 기타 미디어의 권리는 각 권리자에게 있습니다.

저장소의 `assets/cards/` 등 게임 파생 이미지/미디어는 MIT License 대상이 아닙니다.

## Master and localization data

앱의 Master 및 다국어 데이터 생성에는 다음 공개 HolodoriDB 저장소의 version-aligned snapshot을 사용합니다.

- https://github.com/HolodoriDB/holodori-db-kor-diff
- https://github.com/HolodoriDB/holodori-db-eng-diff
- https://github.com/HolodoriDB/holodori-db-jpn-diff

실제 사용 commit과 `master_version`은 `data/generated/manifest.json`, `data/upstream.json`, `data/sync_state.json`에 기록합니다.

Master/번역 데이터의 원저작권 또는 별도 이용 조건은 해당 데이터와 원 권리자의 조건을 따르며 이 프로젝트의 MIT License로 재허가되지 않습니다.

## Exact chart metadata

### Local Exact

저장소에 직접 포함된 `m0049 / EXPERT` Exact metadata는 다음 공개 SUS fixture에서 변환되었습니다.

- repository: https://github.com/asciisyaez/yagoo-dori
- source commit: `6c2c95d52c268862d34fb523d965f09a3108bbbd`
- source path: `packages/core/src/fixtures/chart-m0049-expert.sus`

변환된 metadata의 provenance는 `data/generated/charts/m0049-EXPERT.json`에도 기록되어 있습니다.

### Runtime Exact

v1.1.0은 추가 Exact timeline 계산을 위해 다음 고정 공개 snapshot을 참조합니다.

- repository: https://github.com/asciisyaez/yagoo-dori
- source commit: `6c2c95d52c268862d34fb523d965f09a3108bbbd`
- source path: `data/generated/holodori-chart-timelines.json`
- pinned SHA-256: `0c34e934a20e29e5ded8140ab31d12617f832ed723d2b56e535d3db19c276534`

해당 timeline corpus의 source manifest에는 별도 재배포 라이선스가 명시되어 있지 않습니다. 따라서 Holodori DeckSim은 호환되는 703개 채보의 변환 timeline JSON을 이 저장소에 bulk-publish하지 않습니다.

대신 `data/generated/exact-runtime-index.json`에는 현재 Master와 호환성이 확인된 채보의 byte offset, 길이, 객체 SHA-256과 Master 식별값만 저장합니다. 이 range index에는 전체 노트 타임라인이 포함되지 않습니다.

앱은 Local Exact 파일이 없는 경우 사용자가 선택한 채보 객체만 위 고정 public snapshot에서 HTTP Range로 읽습니다. 반환 데이터는 byte range, SHA-256, `musicId`, 난이도, `chartHash`, 노트 수 및 chart asset 식별값을 재검증한 뒤 메모리에서 DeckSim 형식으로 변환합니다.

외부 source 접근, 무결성 검증 또는 현재 Master 호환성이 실패하면 해당 채보는 Runtime Exact를 사용하지 않고 Master/fallback 계산으로 내려갑니다. 원 snapshot 전체 또는 변환된 전체 note corpus를 DeckSim 저장소에 복제하지 않습니다.

`data/generated/exact-runtime-index.json`은 Master sync 시 현재 chart index에 맞춰 재생성됩니다. 현재 snapshot에서의 호환 결과와 기술 감사는 `EXACT_CHART_CORPUS.md`를 참고하세요.

Exact SUS 직접 변환 파이프라인은 필요 시 다음 공개 프로젝트를 사용합니다.

- https://github.com/HolodoriDB/holodori-scores

외부 chart/SUS 자료 자체의 권리와 이용 조건은 각 원 출처와 권리자의 조건을 따릅니다.

## Typeface

웹 UI는 Pretendard Variable을 외부 CDN에서 로드합니다.

- project: https://github.com/orioncactus/pretendard
- pinned webfont version: `v1.3.9`
- license: SIL Open Font License 1.1

폰트 파일은 이 저장소의 MIT License로 재허가하지 않습니다.

## Trademarks and third-party rights

제3자의 이름, 캐릭터, 상표, 로고, 이미지 및 기타 지식재산권은 각 권리자에게 있습니다. 이 저장소에 대한 MIT License는 해당 제3자 권리의 사용 허가를 의미하지 않습니다.
