const APP_VERSION = "20260812.1";
const LOCALE_STORAGE_KEY = "holodori-decksim:locale";
const DEFAULT_LOCALE = "ko";
const SUPPORTED = new Set(["ko", "en", "ja"]);
const HTML_LANG = Object.freeze({ ko: "ko", en: "en", ja: "ja" });
const NUMBER_LOCALE = Object.freeze({ ko: "ko-KR", en: "en-US", ja: "ja-JP" });
const SUFFIX = Object.freeze({ ko: "Kor", en: "Eng", ja: "Jpn" });
const LANGUAGE_FILES = Object.freeze([
  "LangCard",
  "LangCharacter",
  "LangMusic",
  "LangGeneratedLiveLeaderSkill",
  "LangGeneratedLiveActiveSkillLevel",
  "LangGeneratedLiveActiveSkillEffect",
  "LangGeneratedLivePassiveSkillLevel",
  "LangGeneratedLivePassiveSkillEffect",
  "LangGeneratedLiveSpecialSkillLevel",
  "LangGeneratedLiveSkillTrigger",
  "LangGeneratedLiveSkillEffectTarget",
]);

const UI = Object.freeze({
  ko: {
    "app.description": "홀로라이브 드림스 6인 편성 시뮬레이터",
    "app.name": "홀로도리 편성기",
    "skip.main": "본문으로 건너뛰기",
    "language.label": "언어",
    "nav.main": "주요 화면",
    "tab.deck": "편성하기",
    "tab.owned": "내 보유 카드",
    "preset.title": "프리셋",
    "preset.target": "시뮬레이션 목표",
    "target.score": "최고 스코어",
    "target.performance": "퍼포먼스",
    "target.technique": "테크닉",
    "target.sense": "센스",
    "preset.levelMode": "육성 반영",
    "level.current": "현재 레벨 기준",
    "level.max": "카드 최대 레벨 기준",
    "preset.separate": "리더/멤버 분리",
    "preset.clear": "프리셋 초기화",
    "preset.guide": "계산에 고정할 리더나 멤버만 선택하세요. 선택하지 않은 자리는 시뮬레이션 목표에 맞춰 자동 편성됩니다.",
    "preset.slotsAria": "고정 프리셋 슬롯",
    "music.title": "악곡 세팅",
    "music.name": "악곡 이름",
    "music.loading": "악곡 데이터를 불러오는 중...",
    "music.average": "전체 평균",
    "music.difficulty": "난이도",
    "music.playMode": "플레이 기준",
    "play.auto": "AUTO 검증",
    "play.manual": "Manual FC 근사",
    "calculate.button": "추천 편성 계산",
    "result.title": "결과 계산",
    "result.initial": "악곡 아래의 계산 버튼을 누르면 추천 편성 TOP 5가 표시됩니다.",
    "owned.title": "내 보유 카드 리스트",
    "owned.export": "JSON 내보내기",
    "owned.import": "JSON 가져오기",
    "owned.back": "편성으로 돌아가기",
    "owned.searchAria": "보유 카드 검색",
    "owned.searchPlaceholder": "캐릭터 또는 카드 이름 검색",
    "filter.rarity": "희귀도",
    "filter.rarityAria": "희귀도 필터",
    "filter.rarityAll": "희귀도 전체",
    "filter.type": "타입",
    "filter.typeAria": "타입 필터",
    "filter.typeAll": "타입 전체",
    "filter.display": "표시",
    "filter.ownedAria": "보유 상태 필터",
    "filter.allCards": "모든 카드",
    "filter.ownedOnly": "보유 카드만",
    "filter.unownedOnly": "미보유 카드만",
    "filter.sort": "정렬",
    "filter.sortAria": "카드 정렬",
    "sort.latest": "최신 데이터순",
    "sort.game": "인게임 캐릭터순",
    "sort.power": "추천력 높은 순",
    "sort.rarity": "희귀도 높은 순",
    "sort.character": "캐릭터 이름",
    "sort.cardName": "카드 이름",
    "sort.data": "데이터 순서",
    "attribute.cute": "큐트",
    "attribute.pure": "퓨어",
    "attribute.happy": "해피",
    "owned.allVisible": "현재 목록 모두 보유",
    "owned.clear": "보유 목록 비우기",
    "picker.title": "카드 선택",
    "picker.close": "카드 선택 닫기",
    "picker.searchAria": "카드 검색",
    "picker.searchPlaceholder": "캐릭터 또는 카드 이름 검색",
    "picker.all": "전체",
    "picker.clearSlot": "현재 슬롯 비우기",
    "detail.kicker": "CARD INFORMATION",
    "detail.title": "카드 상세 정보",
    "detail.close": "카드 상세 정보 닫기",
    "card.noImage": "이미지 없음",
    "card.rarityAria": "희귀도 {rarity}",
    "card.typeAria": "{type} 타입",
    "card.noName": "이름 없음",
    "card.infoNone": "정보 없음",
    "card.details": "상세",
    "card.detailsAria": "{character} 카드 상세 정보",
    "card.level": "레벨",
    "card.ownedLevel": "보유 레벨",
    "card.maxLevel": "MAX 레벨",
    "card.potential": "개화",
    "card.unowned": "미보유 카드",
    "card.auto": "자동",
    "skill.active": "액티브 스킬",
    "skill.passive": "패시브 스킬",
    "skill.special": "스페셜 스킬",
    "skill.leader": "리더 효과",
    "slot.leader": "리더",
    "slot.member": "멤버 {index}",
    "slot.selectAria": "{slot} 카드 선택",
    "slot.select": "카드 선택",
    "slot.tap": "슬롯을 눌러주세요",
    "slot.fixed": "고정",
    "slot.recommended": "추천",
    "slot.changeAria": "{slot} {character} 카드 변경 · {status}",
    "picker.ownedCount": "보유 카드 {owned}장 · {visible}장 표시",
    "picker.noMatch": "조건에 맞는 보유 카드가 없습니다.",
    "picker.registerFirst": "먼저 내 보유 카드 리스트를 등록해 주세요.",
    "picker.register": "보유 카드 등록하기",
    "picker.inDeck": "편성 중",
    "picker.modalTitle": "{slot} 카드 선택",
    "owned.count": "{count}장 보유",
    "owned.total": "전체 {count}장",
    "owned.visible": "{count}장 표시",
    "owned.none": "조건에 맞는 카드가 없습니다.",
    "owned.info": "정보",
    "owned.confirmClear": "보유 카드 목록과 개화/레벨 설정을 모두 비울까요?",
    "owned.exportName": "holodori-owned-cards.json",
    "owned.importSuccess": "보유 카드 데이터를 가져왔습니다.",
    "owned.importInvalid": "올바른 홀로도리 보유 카드 JSON 파일이 아닙니다.",
    "owned.importError": "JSON 파일을 읽지 못했습니다.",
    "preset.conflict": "리더/멤버 분리 조건과 충돌하는 고정 카드가 있습니다.",
    "calc.needSix": "점수 조합을 계산하려면 보유 카드를 최소 6장 등록해 주세요.",
    "calc.runningTop": "TOP {count} 계산 중…",
    "calc.running": "계산 중…",
    "calc.changed": "조건이 변경되었습니다. 추천 편성을 다시 계산해 주세요.",
    "app.loadingCards": "카드 데이터를 불러오는 중입니다.",
    "app.versionMismatch": "HTML과 JavaScript 버전이 일치하지 않습니다. 페이지를 새로고침해 주세요.",
    "app.domMismatch": "화면 구성 버전이 일치하지 않습니다: {selector}. 페이지를 새로고침해 주세요.",
    "app.startFailed": "앱을 시작하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요. ({message})",
    "data.requestFailed": "{path} 요청 실패 ({status})",
    "data.invalid": "카드, 캐릭터 또는 악곡 데이터 형식이 올바르지 않습니다.",
    "data.countMismatch": "동기화 manifest와 카드·캐릭터·악곡 데이터 개수가 일치하지 않습니다.",
    "result.none": "추천 결과가 없습니다.",
    "result.needCards": "카드를 6장 이상 보유로 등록한 뒤 추천 계산을 실행하세요.",
    "result.calculating": "추천 편성을 계산하고 있습니다.",
    "result.comparing": "보유 카드 조합을 비교하는 중입니다.",
    "result.top": "TOP {rank}",
    "result.expand": "펼치기",
    "result.unitScore": "유닛 스코어",
    "result.conceptUnitScore": "{concept} 중심 편성 · 유닛 스코어",
    "result.conceptNote": "* 선택한 컨셉의 조건을 만족하는 후보 중 유닛 스코어 순위입니다.",
    "result.scoreBonus": "스코어 보너스",
    "result.songAverage": "악곡 예상 평균",
    "result.power": "파워",
    "result.details": "상세 계산",
    "result.detailsHelp": "개화/레벨/스킬 발동 구조까지 포함한 계산 근거입니다.",
    "result.parameterSum": "파라미터 합산",
    "result.unitScoreCalc": "유닛 스코어",
    "result.songProjection": "선택 악곡 예상값",
    "result.songScore": "악곡 예상 스코어",
    "result.songHelp": "AUTO는 콤보 보너스를 제외한 구조 검증용 · 수동은 FC 콤보 보너스(최대 +10%) 포함",
    "result.averageScore": "평균 스코어",
    "result.maxScore": "최고 스코어 근사",
    "result.estimatedNotes": "노트 수 추정",
    "result.duration": "재생 시간",
    "result.songCoefficient": "악곡 계수",
    "result.comboBonus": "콤보 보너스",
    "result.activationDetails": "스킬 발동 상세",
    "result.activationHelp": "리더/액티브/패시브 조건을 빠르게 확인할 수 있습니다.",
    "result.timeline": "발동 타임라인",
    "result.timelinePersonal": "개인 스킬 발동 주기",
    "result.timelineExpected": "개인 기대 확률/커버리지",
    "result.timelineOverlap": "팀 겹침 구간",
    "result.timelineTeam": "팀 스킬 발동 주기",
    "result.timelineLegend": "반투명 = 이론상 스킬 발동 구간 · 굵은 칸 = 여러 스킬이 겹칠 수 있는 구간",
    "result.timelineSkill": "스킬",
    "result.theoreticalAverage": "이론 평균 {value}회",
    "result.probabilityExpected": "확률 기대 {value}회",
    "result.expectedCoverage": "기대 커버 {value}%",
    "result.theoreticalOverlap": "이론 겹침 {value}%",
    "result.probabilityOverlap": "확률 겹침 기대 {value}%",
    "result.personalCoverage": "개인 커버리지 {value}%",
    "result.teamExpectedOverlap": "팀 기대 / 겹침",
    "result.leaderCondition": "리더 조건",
    "result.activeLevel": "액티브 Lv",
    "result.interval": "발동 간격",
    "result.probability": "발동 확률",
    "result.skillDuration": "지속 시간",
    "result.checks": "이론 발동 횟수",
    "result.expectedActivations": "평균 발동 기대치",
    "result.passive": "패시브",
    "result.met": "충족",
    "result.unmet": "불충족",
    "result.noneShort": "없음",
    "result.active": "발동",
    "result.inactive": "조건 미충족",
    "result.exactSearch": "정확 탐색",
    "result.beamSearch": "빔 탐색",
    "result.searchMeta": "{mode} · 고정 {fixed}장 · 평가 {evaluated}개",
    "power.member": "멤버 파라미터",
    "power.leader": "리더 효과",
    "power.board": "홀로멤버 보드",
    "power.passive": "패시브",
    "power.memory": "메모리",
    "power.potential": "개화 2단계 10% 증가",
    "bonus.outfitLeader": "의상/리더 효과",
    "bonus.active": "액티브 스킬",
    "bonus.board": "홀로멤버 보드",
    "bonus.passive": "패시브",
    "bonus.special": "스페셜 스킬",
    "bonus.total": "합계",
    "common.seconds": "{value}초",
    "common.times": "{value}회",
    "common.cards": "{value}장",
  },
  en: {
    "app.description": "Hololive Dreams six-member deck simulator",
    "app.name": "Holodori DeckSim",
    "skip.main": "Skip to main content",
    "language.label": "Language",
    "nav.main": "Main views",
    "tab.deck": "Build Deck",
    "tab.owned": "My Cards",
    "preset.title": "Preset",
    "preset.target": "Simulation Target",
    "target.score": "Highest Score",
    "target.performance": "Performance",
    "target.technique": "Technique",
    "target.sense": "Sense",
    "preset.levelMode": "Training",
    "level.current": "Current Levels",
    "level.max": "Max Card Levels",
    "preset.separate": "Separate Leader/Member",
    "preset.clear": "Reset Preset",
    "preset.guide": "Select only the leader or members you want to lock. Empty slots are automatically filled for the selected simulation target.",
    "preset.slotsAria": "Locked preset slots",
    "music.title": "Song Settings",
    "music.name": "Song",
    "music.loading": "Loading song data...",
    "music.average": "Overall Average",
    "music.difficulty": "Difficulty",
    "music.playMode": "Play Model",
    "play.auto": "AUTO Validation",
    "play.manual": "Manual FC Estimate",
    "calculate.button": "Calculate Recommended Decks",
    "result.title": "Results",
    "result.initial": "Press the calculation button under Song Settings to show the TOP 5 recommended decks.",
    "owned.title": "My Card List",
    "owned.export": "Export JSON",
    "owned.import": "Import JSON",
    "owned.back": "Back to Deck",
    "owned.searchAria": "Search owned cards",
    "owned.searchPlaceholder": "Search character or card name",
    "filter.rarity": "Rarity",
    "filter.rarityAria": "Rarity filter",
    "filter.rarityAll": "All Rarities",
    "filter.type": "Type",
    "filter.typeAria": "Type filter",
    "filter.typeAll": "All Types",
    "filter.display": "Show",
    "filter.ownedAria": "Ownership filter",
    "filter.allCards": "All Cards",
    "filter.ownedOnly": "Owned Only",
    "filter.unownedOnly": "Unowned Only",
    "filter.sort": "Sort",
    "filter.sortAria": "Card sorting",
    "sort.latest": "Latest Data",
    "sort.game": "In-Game Character Order",
    "sort.power": "Highest Recommendation Power",
    "sort.rarity": "Highest Rarity",
    "sort.character": "Character Name",
    "sort.cardName": "Card Name",
    "sort.data": "Data Order",
    "attribute.cute": "Cute",
    "attribute.pure": "Pure",
    "attribute.happy": "Happy",
    "owned.allVisible": "Mark Visible as Owned",
    "owned.clear": "Clear Owned List",
    "picker.title": "Select Card",
    "picker.close": "Close card selection",
    "picker.searchAria": "Search cards",
    "picker.searchPlaceholder": "Search character or card name",
    "picker.all": "All",
    "picker.clearSlot": "Clear Current Slot",
    "detail.kicker": "CARD INFORMATION",
    "detail.title": "Card Details",
    "detail.close": "Close card details",
    "card.noImage": "No image",
    "card.rarityAria": "Rarity {rarity}",
    "card.typeAria": "{type} type",
    "card.noName": "Unnamed",
    "card.infoNone": "No information",
    "card.details": "Details",
    "card.detailsAria": "Card details for {character}",
    "card.level": "Level",
    "card.ownedLevel": "Owned Level",
    "card.maxLevel": "MAX Level",
    "card.potential": "Awakening",
    "card.unowned": "Unowned Card",
    "card.auto": "Auto",
    "skill.active": "Active Skill",
    "skill.passive": "Passive Skill",
    "skill.special": "Special Skill",
    "skill.leader": "Leader Effect",
    "slot.leader": "Leader",
    "slot.member": "Member {index}",
    "slot.selectAria": "Select card for {slot}",
    "slot.select": "Select Card",
    "slot.tap": "Click this slot",
    "slot.fixed": "Locked",
    "slot.recommended": "Recommended",
    "slot.changeAria": "Change {slot} card for {character} · {status}",
    "picker.ownedCount": "{owned} owned · {visible} shown",
    "picker.noMatch": "No owned cards match these filters.",
    "picker.registerFirst": "Register your owned cards first.",
    "picker.register": "Register Owned Cards",
    "picker.inDeck": "In Deck",
    "picker.modalTitle": "Select {slot} Card",
    "owned.count": "{count} owned",
    "owned.total": "{count} total",
    "owned.visible": "{count} shown",
    "owned.none": "No cards match these filters.",
    "owned.info": "Info",
    "owned.confirmClear": "Clear all owned cards and their level/awakening settings?",
    "owned.exportName": "holodori-owned-cards.json",
    "owned.importSuccess": "Owned card data imported.",
    "owned.importInvalid": "This is not a valid Holodori owned-card JSON file.",
    "owned.importError": "Could not read the JSON file.",
    "preset.conflict": "A locked card conflicts with the Separate Leader/Member rule.",
    "calc.needSix": "Register at least 6 owned cards before calculating deck combinations.",
    "calc.runningTop": "Calculating TOP {count}…",
    "calc.running": "Calculating…",
    "calc.changed": "Conditions changed. Recalculate the recommended decks.",
    "app.loadingCards": "Loading card data.",
    "app.versionMismatch": "The HTML and JavaScript versions do not match. Refresh the page.",
    "app.domMismatch": "The screen layout version does not match: {selector}. Refresh the page.",
    "app.startFailed": "The app could not start. Refresh the page and try again. ({message})",
    "data.requestFailed": "Request failed for {path} ({status})",
    "data.invalid": "Card, character, or song data has an invalid format.",
    "data.countMismatch": "The sync manifest counts do not match the card, character, and song data.",
    "result.none": "No recommendations found.",
    "result.needCards": "Register at least 6 owned cards, then run the recommendation calculation.",
    "result.calculating": "Calculating recommended decks.",
    "result.comparing": "Comparing combinations of your owned cards.",
    "result.top": "TOP {rank}",
    "result.expand": "Expand",
    "result.unitScore": "Unit Score",
    "result.conceptUnitScore": "{concept}-focused · Unit Score",
    "result.conceptNote": "* Ranked by Unit Score among candidates that satisfy the selected concept.",
    "result.scoreBonus": "Score Bonus",
    "result.songAverage": "Estimated Song Avg.",
    "result.power": "Power",
    "result.details": "Calculation Details",
    "result.detailsHelp": "Includes awakening, level, and skill activation structure.",
    "result.parameterSum": "Parameter Total",
    "result.unitScoreCalc": "Unit Score",
    "result.songProjection": "Selected Song Projection",
    "result.songScore": "Estimated Song Score",
    "result.songHelp": "AUTO excludes combo bonuses for structural validation · Manual includes FC combo bonus (up to +10%)",
    "result.averageScore": "Average Score",
    "result.maxScore": "Approx. Max Score",
    "result.estimatedNotes": "Estimated Notes",
    "result.duration": "Duration",
    "result.songCoefficient": "Song Coefficient",
    "result.comboBonus": "Combo Bonus",
    "result.activationDetails": "Skill Activation Details",
    "result.activationHelp": "Quickly inspect leader, active, and passive conditions.",
    "result.timeline": "Activation Timeline",
    "result.timelinePersonal": "Individual Skill Cycle",
    "result.timelineExpected": "Expected Probability/Coverage",
    "result.timelineOverlap": "Team Overlap",
    "result.timelineTeam": "Team Skill Cycle",
    "result.timelineLegend": "Transparent = theoretical activation window · Bold = possible multi-skill overlap",
    "result.timelineSkill": "Skill",
    "result.theoreticalAverage": "Theoretical avg. {value}",
    "result.probabilityExpected": "Expected {value}",
    "result.expectedCoverage": "Expected coverage {value}%",
    "result.theoreticalOverlap": "Theoretical overlap {value}%",
    "result.probabilityOverlap": "Expected overlap {value}%",
    "result.personalCoverage": "Personal coverage {value}%",
    "result.teamExpectedOverlap": "Team expected / overlap",
    "result.leaderCondition": "Leader Condition",
    "result.activeLevel": "Active Lv",
    "result.interval": "Interval",
    "result.probability": "Activation Rate",
    "result.skillDuration": "Duration",
    "result.checks": "Theoretical Checks",
    "result.expectedActivations": "Expected Activations",
    "result.passive": "Passive",
    "result.met": "Met",
    "result.unmet": "Not Met",
    "result.noneShort": "None",
    "result.active": "Active",
    "result.inactive": "Condition Not Met",
    "result.exactSearch": "Exact Search",
    "result.beamSearch": "Beam Search",
    "result.searchMeta": "{mode} · {fixed} locked · {evaluated} evaluated",
    "power.member": "Member Parameters",
    "power.leader": "Leader Effect",
    "power.board": "Holomem Board",
    "power.passive": "Passive",
    "power.memory": "Memory",
    "power.potential": "Awakening 2: +10%",
    "bonus.outfitLeader": "Outfit/Leader Effect",
    "bonus.active": "Active Skill",
    "bonus.board": "Holomem Board",
    "bonus.passive": "Passive",
    "bonus.special": "Special Skill",
    "bonus.total": "Total",
    "common.seconds": "{value}s",
    "common.times": "{value} times",
    "common.cards": "{value} cards",
  },
  ja: {
    "app.description": "ホロライブ ドリームス 6人編成シミュレーター",
    "app.name": "ホロドリ編成シミュレーター",
    "skip.main": "本文へスキップ",
    "language.label": "言語",
    "nav.main": "メイン画面",
    "tab.deck": "編成する",
    "tab.owned": "所持カード",
    "preset.title": "プリセット",
    "preset.target": "シミュレーション目標",
    "target.score": "最高スコア",
    "target.performance": "パフォーマンス",
    "target.technique": "テクニック",
    "target.sense": "センス",
    "preset.levelMode": "育成反映",
    "level.current": "現在レベル基準",
    "level.max": "カード最大レベル基準",
    "preset.separate": "リーダー/メンバー分離",
    "preset.clear": "プリセットをリセット",
    "preset.guide": "固定したいリーダーやメンバーだけ選択してください。未選択の枠はシミュレーション目標に合わせて自動編成されます。",
    "preset.slotsAria": "固定プリセット枠",
    "music.title": "楽曲設定",
    "music.name": "楽曲名",
    "music.loading": "楽曲データを読み込み中...",
    "music.average": "全体平均",
    "music.difficulty": "難易度",
    "music.playMode": "プレイ基準",
    "play.auto": "AUTO 検証",
    "play.manual": "Manual FC 近似",
    "calculate.button": "おすすめ編成を計算",
    "result.title": "計算結果",
    "result.initial": "楽曲設定の計算ボタンを押すと、おすすめ編成 TOP 5 が表示されます。",
    "owned.title": "所持カード一覧",
    "owned.export": "JSON エクスポート",
    "owned.import": "JSON インポート",
    "owned.back": "編成に戻る",
    "owned.searchAria": "所持カード検索",
    "owned.searchPlaceholder": "キャラクター名またはカード名で検索",
    "filter.rarity": "レアリティ",
    "filter.rarityAria": "レアリティフィルター",
    "filter.rarityAll": "全レアリティ",
    "filter.type": "タイプ",
    "filter.typeAria": "タイプフィルター",
    "filter.typeAll": "全タイプ",
    "filter.display": "表示",
    "filter.ownedAria": "所持状態フィルター",
    "filter.allCards": "すべてのカード",
    "filter.ownedOnly": "所持カードのみ",
    "filter.unownedOnly": "未所持カードのみ",
    "filter.sort": "並び順",
    "filter.sortAria": "カード並び順",
    "sort.latest": "最新データ順",
    "sort.game": "ゲーム内キャラ順",
    "sort.power": "おすすめ力が高い順",
    "sort.rarity": "レアリティが高い順",
    "sort.character": "キャラクター名",
    "sort.cardName": "カード名",
    "sort.data": "データ順",
    "attribute.cute": "キュート",
    "attribute.pure": "ピュア",
    "attribute.happy": "ハッピー",
    "owned.allVisible": "表示中をすべて所持にする",
    "owned.clear": "所持リストを空にする",
    "picker.title": "カード選択",
    "picker.close": "カード選択を閉じる",
    "picker.searchAria": "カード検索",
    "picker.searchPlaceholder": "キャラクター名またはカード名で検索",
    "picker.all": "すべて",
    "picker.clearSlot": "現在の枠を空にする",
    "detail.kicker": "CARD INFORMATION",
    "detail.title": "カード詳細情報",
    "detail.close": "カード詳細情報を閉じる",
    "card.noImage": "画像なし",
    "card.rarityAria": "レアリティ {rarity}",
    "card.typeAria": "{type}タイプ",
    "card.noName": "名称なし",
    "card.infoNone": "情報なし",
    "card.details": "詳細",
    "card.detailsAria": "{character}のカード詳細情報",
    "card.level": "レベル",
    "card.ownedLevel": "所持レベル",
    "card.maxLevel": "MAXレベル",
    "card.potential": "覚醒",
    "card.unowned": "未所持カード",
    "card.auto": "自動",
    "skill.active": "アクティブスキル",
    "skill.passive": "パッシブスキル",
    "skill.special": "スペシャルスキル",
    "skill.leader": "リーダー効果",
    "slot.leader": "リーダー",
    "slot.member": "メンバー {index}",
    "slot.selectAria": "{slot}のカードを選択",
    "slot.select": "カード選択",
    "slot.tap": "枠をクリックしてください",
    "slot.fixed": "固定",
    "slot.recommended": "おすすめ",
    "slot.changeAria": "{slot}の{character}カードを変更 · {status}",
    "picker.ownedCount": "所持 {owned}枚 · {visible}枚表示",
    "picker.noMatch": "条件に合う所持カードがありません。",
    "picker.registerFirst": "先に所持カード一覧を登録してください。",
    "picker.register": "所持カードを登録",
    "picker.inDeck": "編成中",
    "picker.modalTitle": "{slot}カードを選択",
    "owned.count": "{count}枚所持",
    "owned.total": "全 {count}枚",
    "owned.visible": "{count}枚表示",
    "owned.none": "条件に合うカードがありません。",
    "owned.info": "情報",
    "owned.confirmClear": "所持カードと覚醒/レベル設定をすべて削除しますか？",
    "owned.exportName": "holodori-owned-cards.json",
    "owned.importSuccess": "所持カードデータをインポートしました。",
    "owned.importInvalid": "有効なホロドリ所持カード JSON ファイルではありません。",
    "owned.importError": "JSON ファイルを読み込めませんでした。",
    "preset.conflict": "固定カードがリーダー/メンバー分離条件と競合しています。",
    "calc.needSix": "編成計算には所持カードを6枚以上登録してください。",
    "calc.runningTop": "TOP {count} を計算中…",
    "calc.running": "計算中…",
    "calc.changed": "条件が変更されました。おすすめ編成を再計算してください。",
    "app.loadingCards": "カードデータを読み込み中です。",
    "app.versionMismatch": "HTML と JavaScript のバージョンが一致しません。ページを更新してください。",
    "app.domMismatch": "画面構成のバージョンが一致しません: {selector}。ページを更新してください。",
    "app.startFailed": "アプリを起動できませんでした。ページを更新して再試行してください。({message})",
    "data.requestFailed": "{path} の取得に失敗しました ({status})",
    "data.invalid": "カード、キャラクター、または楽曲データの形式が正しくありません。",
    "data.countMismatch": "同期 manifest とカード・キャラクター・楽曲データの件数が一致しません。",
    "result.none": "おすすめ結果がありません。",
    "result.needCards": "所持カードを6枚以上登録してから、おすすめ計算を実行してください。",
    "result.calculating": "おすすめ編成を計算中です。",
    "result.comparing": "所持カードの組み合わせを比較しています。",
    "result.top": "TOP {rank}",
    "result.expand": "開く",
    "result.unitScore": "ユニットスコア",
    "result.conceptUnitScore": "{concept}重視編成 · ユニットスコア",
    "result.conceptNote": "* 選択したコンセプト条件を満たす候補をユニットスコア順に表示します。",
    "result.scoreBonus": "スコアボーナス",
    "result.songAverage": "楽曲予想平均",
    "result.power": "パワー",
    "result.details": "計算詳細",
    "result.detailsHelp": "覚醒/レベル/スキル発動構造を含む計算根拠です。",
    "result.parameterSum": "パラメータ合計",
    "result.unitScoreCalc": "ユニットスコア",
    "result.songProjection": "選択楽曲の予想値",
    "result.songScore": "楽曲予想スコア",
    "result.songHelp": "AUTO はコンボボーナスを除外した構造検証用 · Manual は FC コンボボーナス（最大 +10%）を含みます",
    "result.averageScore": "平均スコア",
    "result.maxScore": "最高スコア近似",
    "result.estimatedNotes": "推定ノーツ数",
    "result.duration": "再生時間",
    "result.songCoefficient": "楽曲係数",
    "result.comboBonus": "コンボボーナス",
    "result.activationDetails": "スキル発動詳細",
    "result.activationHelp": "リーダー/アクティブ/パッシブ条件をすばやく確認できます。",
    "result.timeline": "発動タイムライン",
    "result.timelinePersonal": "個別スキル発動周期",
    "result.timelineExpected": "個別期待確率/カバー率",
    "result.timelineOverlap": "チーム重複区間",
    "result.timelineTeam": "チームスキル発動周期",
    "result.timelineLegend": "半透明 = 理論上のスキル発動区間 · 太枠 = 複数スキルが重なる可能性のある区間",
    "result.timelineSkill": "スキル",
    "result.theoreticalAverage": "理論平均 {value}回",
    "result.probabilityExpected": "確率期待 {value}回",
    "result.expectedCoverage": "期待カバー {value}%",
    "result.theoreticalOverlap": "理論重複 {value}%",
    "result.probabilityOverlap": "確率重複期待 {value}%",
    "result.personalCoverage": "個別カバー率 {value}%",
    "result.teamExpectedOverlap": "チーム期待 / 重複",
    "result.leaderCondition": "リーダー条件",
    "result.activeLevel": "アクティブ Lv",
    "result.interval": "発動間隔",
    "result.probability": "発動確率",
    "result.skillDuration": "持続時間",
    "result.checks": "理論発動回数",
    "result.expectedActivations": "平均発動期待値",
    "result.passive": "パッシブ",
    "result.met": "達成",
    "result.unmet": "未達成",
    "result.noneShort": "なし",
    "result.active": "発動",
    "result.inactive": "条件未達成",
    "result.exactSearch": "完全探索",
    "result.beamSearch": "ビーム探索",
    "result.searchMeta": "{mode} · 固定 {fixed}枚 · 評価 {evaluated}件",
    "power.member": "メンバーパラメータ",
    "power.leader": "リーダー効果",
    "power.board": "ホロメンボード",
    "power.passive": "パッシブ",
    "power.memory": "メモリー",
    "power.potential": "覚醒2段階 10%増加",
    "bonus.outfitLeader": "衣装/リーダー効果",
    "bonus.active": "アクティブスキル",
    "bonus.board": "ホロメンボード",
    "bonus.passive": "パッシブ",
    "bonus.special": "スペシャルスキル",
    "bonus.total": "合計",
    "common.seconds": "{value}秒",
    "common.times": "{value}回",
    "common.cards": "{value}枚",
  },
});

let currentLocale = DEFAULT_LOCALE;
let languagePack = Object.freeze({});

function normalizeLocale(value) {
  const short = String(value ?? "").trim().toLowerCase().split(/[-_]/)[0];
  return SUPPORTED.has(short) ? short : DEFAULT_LOCALE;
}

export function getStoredLocale() {
  try {
    return normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY) || DEFAULT_LOCALE);
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function saveLocale(locale) {
  const normalized = normalizeLocale(locale);
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, normalized);
  } catch {
    // Storage can be unavailable in privacy/sandbox modes. The current page still works.
  }
  return normalized;
}

export function getLocale() {
  return currentLocale;
}

export function t(key, params = {}) {
  const template = UI[currentLocale]?.[key] ?? UI.ko[key] ?? key;
  return String(template).replace(/\{([a-zA-Z0-9_]+)\}/g, (_, name) => String(params[name] ?? `{${name}}`));
}

export function langText(id, fallback = "") {
  const key = String(id ?? "").trim();
  if (!key) return String(fallback ?? "");
  return languagePack[key] ?? String(fallback ?? "");
}

export function formatNumber(value, options) {
  return new Intl.NumberFormat(NUMBER_LOCALE[currentLocale] ?? "ko-KR", options).format(Number(value) || 0);
}

export function localeCompare(left, right) {
  return String(left ?? "").localeCompare(String(right ?? ""), NUMBER_LOCALE[currentLocale] ?? "ko-KR");
}

function rawUrl(repository, commit, fileName) {
  return `https://raw.githubusercontent.com/${repository}/${commit}/${fileName}`;
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.text();
}

function flattenRows(rows, target) {
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    const id = String(row?.id ?? row?.data?.id ?? "").trim();
    const text = row?.data?.text;
    if (id && typeof text === "string" && text.trim()) target[id] = text;
  }
}

async function loadRemotePack(manifest, locale) {
  const config = manifest?.locales?.[locale];
  if (!config?.repository || !config?.commit) return {};
  const suffix = config.suffix || SUFFIX[locale];
  const version = (await fetchText(rawUrl(config.repository, config.commit, "version.txt"))).trim();
  if (version !== String(manifest.master_version ?? "").trim()) {
    throw new Error(`locale master version mismatch (${locale})`);
  }
  const rows = await Promise.all(LANGUAGE_FILES.map((base) => (
    fetchJson(rawUrl(config.repository, config.commit, `${base}_${suffix}.json`))
  )));
  const pack = {};
  rows.forEach((items) => flattenRows(items, pack));
  return pack;
}

async function loadPack(manifest, locale) {
  const localUrl = new URL(`../data/generated/i18n/${locale}.json`, import.meta.url);
  localUrl.searchParams.set("v", String(manifest?.master_version ?? APP_VERSION));
  try {
    return await fetchJson(localUrl);
  } catch (error) {
    if (locale === "ko") {
      console.info("[i18n] local Korean pack unavailable; using embedded Korean data.", error);
      return {};
    }
    console.warn(`[i18n] local ${locale} pack unavailable; loading pinned upstream fallback.`, error);
    return loadRemotePack(manifest, locale);
  }
}

export async function initI18n(manifest) {
  currentLocale = getStoredLocale();
  try {
    languagePack = Object.freeze(await loadPack(manifest, currentLocale));
  } catch (error) {
    console.error(`[i18n] failed to load ${currentLocale}; falling back to Korean display data.`, error);
    currentLocale = DEFAULT_LOCALE;
    languagePack = Object.freeze({});
  }
  document.documentElement.lang = HTML_LANG[currentLocale] ?? "ko";
  document.title = "Holodori DeckSim";
  const description = document.querySelector('meta[name="description"]');
  if (description) description.setAttribute("content", t("app.description"));
  applyStaticTranslations(document);
  return currentLocale;
}

export function applyStaticTranslations(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });
  root.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
    element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
  });
  root.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  });
  root.querySelectorAll("[data-i18n-title]").forEach((element) => {
    element.setAttribute("title", t(element.dataset.i18nTitle));
  });
}

function localizeSkillGroup(group, prefix, cardId) {
  if (!group) return group;
  return {
    ...group,
    levels: (group.levels ?? []).map((level) => ({
      ...level,
      description: langText(
        `${prefix}-${cardId}.${Number(level.level) || 1}-description`,
        level.description,
      ),
    })),
  };
}

function localizeCharacter(character) {
  const localizedName = langText(`la-name-${character.id}`, character.name);
  return {
    ...character,
    name: localizedName,
    short_name: langText(`la-short_name-${character.id}`, character.short_name || localizedName),
  };
}

function localizeMusic(song) {
  return {
    ...song,
    title: langText(`la-music_title-${song.id}`, song.title),
    singer_name: langText(`la-singer_name-${song.id}`, song.singer_name),
  };
}

function localizeCard(card, charactersById) {
  const suffix = String(card.id).replace(/^card-/, "");
  const character = charactersById.get(card.character_id);
  const characterName = character?.name ?? card.character_name;
  const localized = {
    ...card,
    name: langText(`la-card_name-${suffix}`, card.name),
    character_name: characterName,
    characterName,
    leader: card.leader ? {
      ...card.leader,
      description: langText(`la-generated-live_leader_skill-${card.id}-description`, card.leader.description),
    } : card.leader,
    skills: card.skills ? {
      ...card.skills,
      active: localizeSkillGroup(card.skills.active, "la-generated-live_active_skill", card.id),
      passive: localizeSkillGroup(card.skills.passive, "la-generated-live_passive_skill", card.id),
      special: localizeSkillGroup(card.skills.special, "la-generated-live_special_skill", card.id),
    } : card.skills,
  };
  const flavorId = `la-card_flavor-${suffix}`;
  if (Object.hasOwn(localized, "flavor")) localized.flavor = langText(flavorId, localized.flavor);
  if (Object.hasOwn(localized, "flavor_text")) localized.flavor_text = langText(flavorId, localized.flavor_text);
  if (Object.hasOwn(localized, "flavorText")) localized.flavorText = langText(flavorId, localized.flavorText);
  return localized;
}

export function localizeAppData(data) {
  const characters = data.characters.map(localizeCharacter);
  const charactersById = new Map(characters.map((row) => [row.id, row]));
  const cards = data.cards.map((card) => localizeCard(card, charactersById));
  const music = data.music.map(localizeMusic);
  return {
    ...data,
    characters,
    charactersById,
    cards,
    cardsById: new Map(cards.map((row) => [row.id, row])),
    music,
    musicById: new Map(music.map((row) => [row.id, row])),
  };
}

export const SUPPORTED_LOCALES = Object.freeze(["ko", "en", "ja"]);
