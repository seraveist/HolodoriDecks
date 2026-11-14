# Runtime Exact 해시 불일치 5개 조사 — 2026-10-21

## 결과

**신규 복구는 0개다. 기존 Runtime 원본 5개는 제외를 유지한다. 다만 5개 모두 이미 현재 에셋에 맞는 Local Exact가 있어 서비스의 Exact 사용에는 누락이 없다.**

현재 Local Exact 파일들은 2026-09-30 [PR #69](https://github.com/seraveist/HolodoriDecks/pull/69), 커밋 `925e5bec0a405c2c83e9730bc3ef72377888fa7a`에서 추가됐고 이후 변경되지 않았다. 이번 조사에서는 기존 복구를 반복하거나 오래된 Runtime 객체의 해시를 현재 값으로 덮어쓰지 않았다. 계산 엔진과 Exact 계산 규칙도 변경하지 않았다.

| 지표 | 조사 전 | 조사 후 |
|---|---:|---:|
| 현재 마스터 차트 | 880 | 880 |
| Runtime Exact | 698 (79.32%) | 698 (79.32%) |
| Local Exact | 146 | 146 |
| Local/Runtime 중복 | 1 | 1 |
| 둘 중 하나로 Exact 사용 가능 | 843 (95.80%) | 843 (95.80%) |
| Exact 자료 없음 | 37 | 37 |
| Runtime 소스 확보 불가로 기록된 항목 | 25 | 25 |
| 확보된 Runtime 객체 중 해시 불일치로 제외 | 5 | 5 |
| 위 5개 중 Local Exact 사용 가능 | 5 | 5 |

## 비교한 자료

- 현재 서비스 기준: [PR #86](https://github.com/seraveist/HolodoriDecks/pull/86), `d51aa69aebe9d26e64ea27d678c548cf96d63455`.
- 현재 마스터: `holodori-net/android-database@fb21249d6bb141a0fd7b0a3519054dbb6b4a8a54`, 버전 `452bd7acfd1b9f90cc85d9978aea55b1a6bf6c2cddaff470c640462830c8c00d`.
- 현재 에셋 검증 기록: `data/generated/chart-assets.json`, catalogue revision 101. 각 Local Exact의 `susSha256`은 이 기록과 일치한다.
- Runtime 원본: [고정 corpus](https://github.com/asciisyaez/yagoo-dori/blob/6c2c95d52c268862d34fb523d965f09a3108bbbd/data/generated/holodori-chart-timelines.json), 수집일 2026-08-02. 파일 전체의 SHA-256 `0c34e934a20e29e5ded8140ab31d12617f832ed723d2b56e535d3db19c276534`를 직접 검증했다.
- 상세 결과: [JSON 보고서](exact-runtime-hash-audit-20261021.json). 원본 객체 SHA-256, 양쪽 에셋 해시와 SUS SHA-256, SP/Fever, 타입별 노트 수 및 시간 비교를 포함한다. 타임라인 전체는 재배포하지 않는다.

## 원인 구분

`chartHash`는 노트 배열의 정규화 결과가 아니다. 현재 동기화 코드는 공식 catalogue의 다운로드 에셋 MD5를 사용한다. Runtime 검증기는 corpus의 `upstreamChartHash`와 이를 문자열로 비교한다. 따라서 동시 노트 정렬이나 초↔마이크로초 변환은 `chart-hash-mismatch` 자체를 발생시키지 않는다.

5개는 모두 이전/현재 에셋 해시가 다르고, **기록된 원본 SUS SHA-256도 다르다.** 서로 다른 바이트 자료를 기반으로 한 이전 타임라인을 현재 에셋과 동일하다고 인정할 근거가 없다. 현재 Local Exact와 비교한 점수 입력에도 동시 노트 순서 및 1µs 반올림만으로 설명되지 않는 차이가 있다.

| 차트 | 이전 Runtime 에셋 해시 | 현재 에셋 해시 |
|---|---|---|
| m0066:EXPERT | `8096bd7fec1ad3b3a4956339197fdcd7` | `f89715c0d323d5f1f9bdcf8dd3fc0d3e` |
| m0337:EASY | `b944cd143582f59e96bfb8aa258b2f77` | `6baa05c06d7554471d19221e31f31d2f` |
| m0337:NORMAL | `66abaebacfd911ff68637cfd193a642a` | `6ebf653bc847ad3fcd519169bacd8a6f` |
| m0337:HARD | `9d9aa557b1d1f0d1ef667ff402491456` | `3c7867526c6f54838e4758d849b56219` |
| m0337:EXPERT | `4abac55b4efe382e72e0918979b3bf0f` | `e5d7d6797f7a67e05cf0dd12f0636077` |

### m0066:EXPERT

- 양쪽 모두 전체 노트 966개, 일반 노트 312개다. SP5개와 Fever 구간도 일치한다.
- 하지만 지속 노트는 317→313개, 릴레이 노트는 60→64개다. 동시 노트의 정렬만으로 설명되지 않는다.
- 노트 시각에도 차이가 있다. SP와 전체 노트 수만 같다는 이유로 이전 타임라인을 다시 채택할 수 없다.
- Current Local Exact: `data/generated/charts/m0066-EXPERT.json`.

### m0337 전체 난이도

- EASY/NORMAL은 노트 타입별 수가 같지만, 같은 타입의 노트를 시각순으로 비교하면 전체 361/507개가 약 1.263158초 앞당겨졌다(1µs 반올림 차이 포함).
- HARD/EXPERT는 도입부 배치와 노트 타입별 수도 다르다. 전체 노트 수가 914/1209개로 같아도 동일한 타임라인을 뜻하지 않는다.
- 모든 난이도에서 Fever 시작은 68.210526→66.947368초, 종료는 88.209868→86.946711초로 바뀌었다.
- SP 변경은 단일 시간 오프셋으로 보정할 수 없다. 모든 난이도에서 SP1은 15.157895→16.421053초로 늦어졌지만, SP2~SP4는 약 1.263158초 빨라졌다.

| 난이도 | SP 시각 차이(현재−이전, µs) | SP 시작 콤보 차이 |
|---|---|---|
| EASY | +1263158 / −1263158 / −1263158 / −1263157 / 0 | +3 / 0 / 0 / 0 / +16 |
| NORMAL | +1263158 / −1263158 / −1263158 / −1263157 / 0 | +10 / 0 / 0 / 0 / +3 |
| HARD | +1263158 / −1263158 / −1263158 / −1263157 / 0 | −20 / 0 / 0 / 0 / +28 |
| EXPERT | +1263158 / −1263158 / −1263158 / −1263157 / −1263158 | +19 / 0 / 0 / 0 / 0 |

Current Local Exact files: `data/generated/charts/m0337-{EASY,NORMAL,HARD,EXPERT}.json`.

### 확인의 한계

원본 파일의 차이는 양쪽 수집 기록의 SHA-256 차이로 확인했다. 다만 이번 실행 환경에서 원본 SUS 제공 API와 공식 에셋 catalogue가 HTTP 403을 반환해 양쪽 원본을 다시 받아 텍스트 diff하거나 같은 파서로 재실행하지는 못했다. 우회 접근은 하지 않았다. 현재 Local Exact의 원본 연결은 기존 동기화에서 기록한 검증 결과이며, 이번에 새 원본을 내려받아 재검증했다는 의미는 아니다.

따라서 **현재 자료에 비해 고정 Runtime 타임라인이 오래됐다는 결론은 지지되지만, 관측된 각 노트 차이 중 실제 SUS 수정과 파서 변경의 기여 범위는 미확정이다.** 원본 전체 변경 시점이나 운영 측 변경 의도도 확인하지 않았다. 단순 정렬·반올림 문제로 간주하여 해시 검증을 완화할 수는 없다.

upstream 저장소의 현재 커밋 `66f2ccb43a66a8a1558dfbd469a517e65a55a9cd`도 별도로 확인했다. 그 corpus의 수집일은 여전히 2026-08-02이며, m0066:EXPERT는 이전 객체와 동일하고 m0337의 네 객체는 available 목록에 없다. upstream 최신 커밋으로 바꾸는 것만으로 검증된 새 원본이 생기지는 않는다.

## 안전한 유지와 회귀 검증

5개 모두 기존 Local Exact가 현재 마스터의 ID·에셋 해시·노트 수와 일치하고 5개 SP 및 시간순 검증을 통과한다. 앱은 원래부터 Local Exact를 우선하므로 별도 복구나 Runtime 재등록이 필요하지 않다. Local Exact가 손상되면 오래된 Runtime 자료를 받지 않고 Master로 fallback해야 한다.

이번에 추가한 회귀 테스트는 다음을 검증한다.

- 실제 5개 차트에서 현재 Local Exact를 선택하며 corpus 요청을 보내지 않는다.
- 노트 수와 SP가 유효해도 오래된 에셋 해시를 허용하지 않는다.
- 현재 해시가 유지되는 동안, 다섯 이전 객체는 Runtime 인덱스에 재진입하지 않는다.
- Local Exact가 오래됐거나 SP가 불완전하면 Master로 안전하게 fallback한다.
- 동시 노트 순서·1µs 반올림과 더 큰 시각 차이를 진단에서 구분한다. 이 진단은 admission 조건을 완화하지 않는다.

```bash
node scripts/audit-exact-runtime-rejections.mjs \
  --input /path/to/pinned/holodori-chart-timelines.json \
  --output /tmp/exact-runtime-hash-audit.json
node scripts/test-exact-runtime-rejections.mjs
node scripts/run-core-regressions.mjs
```

Runtime 인덱스를 임시 파일로 재생성하여 현재 파일과 바이트 단위로 일치하는 것도 확인했다. 마스터 데이터와 일러스트 동기화는 실행하지 않았다.

## 별도 항목인 소스 확보 불가 25개

이는 고정 corpus의 intake 상태이며 이번 5개 해시 불일치와 별개다. 기존 이유는 접근 불가 21개, SP5개 미충족 4개다. 현재는 이 25개 중 21개에 Local Exact가 이미 존재하며 이번에 새로 복구한 것은 아니다.

현재 마스터 중 고정 corpus의 available/unavailable 어느 쪽에도 없는 키는 152개다. 이 중 119개는 Local Exact가 있다. 전체 Exact 미지원 37개는 소스 확보 불가 목록 중 Local이 없는 4개와 corpus 밖에서 Local도 없는 33개를 합친 수치다. Runtime 제외 5개가 Exact 미지원 37개에 추가되는 것은 아니다.
