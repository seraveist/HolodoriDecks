import { formatNumber as formatLocaleNumber, getLocale, t } from "../i18n.js?v=20260812.1";
import {
  ATTRIBUTE_META,
  attributeStyle,
  cleanGameMarkup,
  escapeHtml,
  renderLandscapeCardArt,
  wirePortraitFallback,
} from "./cards.js?v=20260813.2";
import { getSlotLabel } from "./member.js?v=20260812.1";
import { requiredElement } from "./dom.js?v=20260812.1";

const TARGET_STATS = Object.freeze({ performance: "p", technique: "t", sense: "s" });
const LOCAL_COPY = Object.freeze({
  ko: {
    notSelected: "미선택",
    overallPower: "종합력",
    leaderOutfit: "리더 의상 스킬",
    memberEnhancement: "멤버 강화 보너스",
    boardMemory: "보드·메모리",
    leaderSupport: "리더 서포트",
    passiveSupport: "패시브 서포트",
    collisionLoss: "동일 주기 충돌 손실",
    genericEvaluation: "110초 · 800노트 범용 유닛 평가 기준입니다.",
    selectedSongAverage: "선택 악곡 예상 평균",
    allActiveMaximum: "모든 유효 액티브 성공 시 근사 최대",
    songMeta: (duration, notes, mode, accuracy) => `${duration}초 · ${accuracy === "estimated" ? "약 " : ""}${notes}노트 · ${mode === "auto" ? "AUTO (콤보 보너스 없음)" : "Manual PERFECT FC"}`,
    chartExact: "실제 채보 노트·SP 순서 반영",
    chartMaster: "Master 풀콤보 노트 수 반영 · SP 타이밍 근사",
    chartEstimated: "노트 밀도 추정",
    specialTimeline: "스페셜 스킬 발동 순서",
    inactivePrefix: "비활성",
    skillInfoAria: (name) => `${name} 스킬 정보 보기`,
    duplicateInterval: "동일 주기 중복",
    activationSuccess: "발동 성공 시",
    expectedCoverage: "예상 커버율",
    memberTimelineAria: (name, interval, duration, coverage) => `${name} · ${interval}마다 발동 판정 · 성공 시 ${duration} 유지 · 예상 커버율 ${coverage}`,
    overlap: (count) => `${count}명 중복`,
    activationWindow: "발동 구간",
    teamAll: "팀 전체",
    teamCoverage: "팀 전체 예상 커버율",
    teamTimelineAria: (coverage, overlap) => `팀 전체 예상 커버율 ${coverage} · 중복 가능 구간 ${overlap}`,
    skillInformation: "스킬 정보",
    timelineTitle: "스킬 발동 구간",
    timelineNote: "청록은 발동 구간, 빨강은 중복 가능 구간입니다.",
    member: "멤버",
    songProgress: "곡 진행",
    expectedAverageScore: "예상 평균 스코어",
    approximateMax: "근사 최대",
    detailsShow: "+ 상세 보기",
    detailsHide: "- 접기",
    recommendationAria: (rank) => `추천 TOP ${rank} 편성 카드`,
    resultInitial: "악곡 아래의 계산 버튼을 누르면 선택한 목표의 추천 편성 TOP 5가 표시됩니다.",
  },
  en: {
    notSelected: "Not selected",
    overallPower: "Overall Power",
    leaderOutfit: "Leader Outfit Skill",
    memberEnhancement: "Member Enhancement",
    boardMemory: "Board · Memory",
    leaderSupport: "Leader Support",
    passiveSupport: "Passive Support",
    collisionLoss: "Same-Cycle Collision Loss",
    genericEvaluation: "Generic unit evaluation: 110s · 800 notes.",
    selectedSongAverage: "Selected Song Estimated Avg.",
    allActiveMaximum: "Approx. max if all valid Active Skills succeed",
    songMeta: (duration, notes, mode, accuracy) => `${duration}s · ${accuracy === "estimated" ? "approx. " : ""}${notes} notes · ${mode === "auto" ? "AUTO (no combo bonus)" : "Manual PERFECT FC"}`,
    chartExact: "Exact chart notes and SP order applied",
    chartMaster: "Master full-combo note count applied · SP timing approximated",
    chartEstimated: "Estimated from note density",
    specialTimeline: "Special Skill Order",
    inactivePrefix: "Inactive",
    skillInfoAria: (name) => `View skill information for ${name}`,
    duplicateInterval: "Duplicate activation cycle",
    activationSuccess: "if activated",
    expectedCoverage: "Expected coverage",
    memberTimelineAria: (name, interval, duration, coverage) => `${name} · activation check every ${interval} · lasts ${duration} on success · expected coverage ${coverage}`,
    overlap: (count) => `${count} overlapping members`,
    activationWindow: "activation window",
    teamAll: "Whole Team",
    teamCoverage: "Team expected coverage",
    teamTimelineAria: (coverage, overlap) => `Team expected coverage ${coverage} · possible overlap ${overlap}`,
    skillInformation: "Skill Information",
    timelineTitle: "Skill Activation Windows",
    timelineNote: "Teal shows activation windows; red shows possible overlap.",
    member: "Member",
    songProgress: "Song Progress",
    expectedAverageScore: "Estimated Average Score",
    approximateMax: "Approx. Max",
    detailsShow: "+ View Details",
    detailsHide: "- Collapse",
    recommendationAria: (rank) => `Recommended TOP ${rank} deck cards`,
    resultInitial: "Press the calculation button under Song Settings to show the TOP 5 recommendations for the selected target.",
  },
  ja: {
    notSelected: "未選択",
    overallPower: "総合力",
    leaderOutfit: "リーダー衣装スキル",
    memberEnhancement: "メンバー強化ボーナス",
    boardMemory: "ボード・メモリー",
    leaderSupport: "リーダーサポート",
    passiveSupport: "パッシブサポート",
    collisionLoss: "同一周期の競合損失",
    genericEvaluation: "110秒 · 800ノーツの汎用ユニット評価基準です。",
    selectedSongAverage: "選択楽曲の予想平均",
    allActiveMaximum: "有効なアクティブがすべて成功した場合の近似最大",
    songMeta: (duration, notes, mode, accuracy) => `${duration}秒 · ${accuracy === "estimated" ? "約" : ""}${notes}ノーツ · ${mode === "auto" ? "AUTO（コンボボーナスなし）" : "Manual PERFECT FC"}`,
    chartExact: "実譜面ノーツ・SP順序を反映",
    chartMaster: "Masterのフルコンボ数を反映 · SP時刻は近似",
    chartEstimated: "ノーツ密度から推定",
    specialTimeline: "スペシャルスキル発動順",
    inactivePrefix: "非発動",
    skillInfoAria: (name) => `${name}のスキル情報を表示`,
    duplicateInterval: "同一周期の重複",
    activationSuccess: "発動成功時",
    expectedCoverage: "期待カバー率",
    memberTimelineAria: (name, interval, duration, coverage) => `${name} · ${interval}ごとに発動判定 · 成功時${duration}継続 · 期待カバー率 ${coverage}`,
    overlap: (count) => `${count}人重複`,
    activationWindow: "発動区間",
    teamAll: "チーム全体",
    teamCoverage: "チーム全体期待カバー率",
    teamTimelineAria: (coverage, overlap) => `チーム全体期待カバー率 ${coverage} · 重複可能区間 ${overlap}`,
    skillInformation: "スキル情報",
    timelineTitle: "スキル発動区間",
    timelineNote: "青緑は発動区間、赤は重複可能区間です。",
    member: "メンバー",
    songProgress: "楽曲進行",
    expectedAverageScore: "予想平均スコア",
    approximateMax: "近似最大",
    detailsShow: "+ 詳細を見る",
    detailsHide: "- 閉じる",
    recommendationAria: (rank) => `おすすめ TOP ${rank} 編成カード`,
    resultInitial: "楽曲設定の計算ボタンを押すと、選択した目標のおすすめ編成 TOP 5 が表示されます。",
  },
});

function copy() {
  return LOCAL_COPY[getLocale()] ?? LOCAL_COPY.ko;
}

function statLabel(stat) {
  if (stat === "p") return t("target.performance");
  if (stat === "t") return t("target.technique");
  return t("target.sense");
}

function formatNumber(value) {
  return formatLocaleNumber(Math.round(Number(value) || 0));
}

function formatPercent(value, digits = 1) {
  return `${Number(value || 0).toFixed(digits)}%`;
}

function formatSeconds(value) {
  const seconds = Math.max(0, Number(value) || 0);
  return t("common.seconds", { value: Number.isInteger(seconds) ? seconds : seconds.toFixed(1) });
}

export function activationTimeline(row, totalDuration) {
  const timelineDuration = Math.max(1, Number(totalDuration) || 1);
  const exactChecks = Array.isArray(row?.activationChecks) ? row.activationChecks : [];
  if (exactChecks.length) {
    return exactChecks.map((check) => {
      const start = Math.max(0, Number(check?.time) || 0);
      const end = Math.min(timelineDuration, Math.max(start, Number(check?.end) || start));
      return {
        start,
        end,
        probability: Math.max(0, Math.min(1, Number(check?.probability) || 0)),
        startPercent: start / timelineDuration * 100,
        widthPercent: (end - start) / timelineDuration * 100,
      };
    }).filter((window) => window.end > window.start);
  }
  const interval = Math.max(0.001, Number(row?.interval) || timelineDuration);
  const activeDuration = Math.max(0, Number(row?.duration) || 0);
  const checks = Math.max(0, Math.floor(Number(row?.checks) || timelineDuration / interval));
  const probability = Math.max(0, Math.min(1, Number(row?.effectiveProbability) || 0));
  const windows = [];
  for (let check = 1; check <= checks; check += 1) {
    const start = check * interval;
    if (start >= timelineDuration || activeDuration <= 0) continue;
    const end = Math.min(timelineDuration, start + activeDuration);
    if (end <= start) continue;
    windows.push({
      start,
      end,
      probability,
      startPercent: start / timelineDuration * 100,
      widthPercent: (end - start) / timelineDuration * 100,
    });
  }
  return windows;
}

export function teamActivationTimeline(rows, totalDuration) {
  const duration = Math.max(1, Number(totalDuration) || 1);
  const events = [];
  let windowId = 0;
  rows.forEach((row, rowIndex) => {
    activationTimeline(row, duration).forEach((window) => {
      const id = windowId++;
      events.push({ time: window.start, id, rowIndex, probability: window.probability, delta: 1 });
      events.push({ time: window.end, id, rowIndex, probability: window.probability, delta: -1 });
    });
  });
  events.sort((left, right) => left.time - right.time || left.delta - right.delta);

  const activeWindows = new Map();
  const segments = [];
  let cursor = 0;
  let eventIndex = 0;
  while (eventIndex < events.length) {
    const time = Math.max(0, Math.min(duration, events[eventIndex].time));
    if (time > cursor && activeWindows.size) {
      const activeRows = new Set([...activeWindows.values()].map((event) => event.rowIndex));
      const probability = 1 - [...activeWindows.values()].reduce((noneActive, event) => (
        noneActive * (1 - Math.max(0, Math.min(1, Number(event.probability) || 0)))
      ), 1);
      segments.push({
        start: cursor,
        end: time,
        count: activeRows.size,
        probability,
        startPercent: cursor / duration * 100,
        widthPercent: (time - cursor) / duration * 100,
      });
    }
    cursor = time;
    while (eventIndex < events.length
      && Math.max(0, Math.min(duration, events[eventIndex].time)) === time) {
      const event = events[eventIndex];
      if (event.delta > 0) activeWindows.set(event.id, event);
      else activeWindows.delete(event.id);
      eventIndex += 1;
    }
  }

  const expectedCoverage = segments.reduce((sum, segment) => (
    sum + (segment.end - segment.start) / duration * segment.probability
  ), 0);
  const overlapCoverage = segments.reduce((sum, segment) => (
    sum + (segment.count > 1 ? (segment.end - segment.start) / duration : 0)
  ), 0);
  return { segments, expectedCoverage, overlapCoverage };
}

function cardProfile(state, card) {
  const setting = state.ownedCardSettings?.[card.id];
  return setting ? `${state.levelMode === "max" ? "MAX" : `Lv${setting.level}`} · ${t("card.potential")} ${setting.potential}` : "";
}

function resultCard(card, index, state, fixed) {
  const slot = getSlotLabel(index);
  if (!card) {
    return `<div class="result-card empty"><div><span class="result-empty-mark">＋</span>${escapeHtml(slot)}<br>${escapeHtml(copy().notSelected)}</div></div>`;
  }
  const attribute = ATTRIBUTE_META[Number(card.attribute)] ?? ATTRIBUTE_META[1];
  const leaderBadge = index === 0 ? `<span class="result-card-role is-leader">${t("slot.leader")}</span>` : "";
  return `<article class="result-card${fixed ? " is-fixed" : ""}">
    ${renderLandscapeCardArt(card, { showMeta: false })}
    <div class="result-card-copy" style="${attributeStyle(card)}">
      <div class="result-card-meta">
        ${leaderBadge}
        <span class="result-card-level card-copy-meta">${escapeHtml(cardProfile(state, card))}</span>
        <span class="result-card-attribute" aria-label="${escapeHtml(t("card.typeAria", { type: attribute.name }))}"><img src="${attribute.icon}" alt="">${escapeHtml(attribute.name)}</span>
      </div>
      <div class="result-card-identity">
        <div class="result-card-title-line">
          <span class="result-card-rarity card-copy-rarity" aria-label="${escapeHtml(t("card.rarityAria", { rarity: card.rarity }))}">★${Number(card.rarity)}</span>
          <strong class="result-card-character card-copy-character">${escapeHtml(card.character_name)}</strong>
        </div>
        <span class="result-card-name card-copy-name">${escapeHtml(card.name)}</span>
      </div>
    </div>
  </article>`;
}

function leaderDescription(card) {
  return cleanGameMarkup(card?.leader?.description) || t("card.infoNone");
}

function metric(label, value, className = "") {
  return `<div class="result-metric ${className}"><span>${escapeHtml(label)}</span><strong>${formatNumber(value)}</strong></div>`;
}

function summaryMemberGroups(cards) {
  const leader = cards[0]?.character_name ?? copy().notSelected;
  const members = cards.slice(1).map((card) => card?.character_name).filter(Boolean).join(" · ") || copy().notSelected;
  return `<div class="result-summary-members">
    <span><b class="is-leader">${t("slot.leader")}</b><strong>${escapeHtml(leader)}</strong></span>
    <span><b>${copy().member}</b><strong>${escapeHtml(members)}</strong></span>
  </div>`;
}

function calculationRow(label, value, suffix = "") {
  const formatted = suffix === "%" ? formatPercent(value) : `${formatNumber(value)}${suffix}`;
  return `<span><i>${escapeHtml(label)}</i><b>${formatted}</b></span>`;
}

function calculationBreakdown(score) {
  const power = score.detail?.power ?? {};
  const bonus = score.detail?.scoreBonus ?? {};
  return `
    <div class="calculation-breakdown">
      <article class="calculation-card">
        <header><span>${escapeHtml(copy().overallPower)}</span><strong>${formatNumber(score.overallPower)}</strong></header>
        <div class="calculation-rows">
          ${calculationRow(t("power.member"), power.memberParameter)}
          ${calculationRow(copy().leaderOutfit, power.outfit)}
          ${calculationRow(t("power.passive"), power.passive)}
          ${calculationRow(copy().memberEnhancement, power.enhancement)}
          ${calculationRow(copy().boardMemory, (power.board ?? 0) + (power.memory ?? 0))}
        </div>
      </article>
      <article class="calculation-card">
        <header><span>${t("result.scoreBonus")}</span><strong>${formatPercent(score.scoreBonusPct)}</strong></header>
        <div class="calculation-rows">
          ${calculationRow(copy().leaderSupport, bonus.outfit, "%")}
          ${calculationRow(t("bonus.active"), bonus.active, "%")}
          ${calculationRow(copy().passiveSupport, bonus.passive, "%")}
          ${calculationRow(t("bonus.special"), bonus.special, "%")}
          ${calculationRow(copy().collisionLoss, score.detail?.collision?.lossPct, "%")}
        </div>
      </article>
    </div>`;
}

function specialSkillTimeline(projection) {
  const windows = projection?.specialWindows ?? [];
  if (!windows.length) return "";
  return `<div class="special-skill-order"><strong>${escapeHtml(copy().specialTimeline)}</strong><ol>${windows.map((window) => `<li><b>SP ${window.slot}</b><span>${escapeHtml(window.characterName)} · ${formatSeconds(window.start)}–${formatSeconds(window.end)}</span></li>`).join("")}</ol></div>`;
}

function songProjection(score, song, difficulty) {
  const projection = score.songProjection;
  if (!projection || !song) {
    return `<div class="song-projection is-generic"><strong>${t("music.average")}</strong><span>${escapeHtml(copy().genericEvaluation)}</span></div>`;
  }
  const accuracy = projection.context.chartAccuracy ?? "estimated";
  const accuracyText = accuracy === "exact" ? copy().chartExact : accuracy === "master" ? copy().chartMaster : copy().chartEstimated;
  return `
    <div class="song-projection">
      <div class="song-projection-score"><span>${escapeHtml(copy().selectedSongAverage)}</span><strong>${formatNumber(projection.averageScore)}</strong></div>
      <div class="song-projection-score"><span>${escapeHtml(copy().allActiveMaximum)}</span><strong>${formatNumber(projection.maxScore)}</strong></div>
      <p><b>${escapeHtml(song.title)} · ${escapeHtml(difficulty)}</b><span>${escapeHtml(copy().songMeta(projection.context.duration, formatNumber(projection.context.notes), projection.playMode, accuracy))}</span></p>
      <p class="song-projection-accuracy"><span>${escapeHtml(accuracyText)}</span></p>
      ${specialSkillTimeline(projection)}
    </div>`;
}

function diagnosticSkillPayload(row) {
  return encodeURIComponent(JSON.stringify([
    { label: `${t("skill.active")} Lv${row.activeLevel}`, description: cleanGameMarkup(row.activeDescription) },
    {
      label: `${t("skill.passive")} Lv${row.passiveLevel}`,
      description: cleanGameMarkup(row.passiveActive
        ? row.passiveDescription
        : `${copy().inactivePrefix} · ${row.passiveDescription}`),
    },
    { label: `${t("skill.special")} Lv${row.specialLevel}`, description: cleanGameMarkup(row.specialDescription) },
  ]));
}

function diagnosticTable(score, cards) {
  const leader = cards[0];
  const cardsById = new Map(cards.filter(Boolean).map((card) => [card.id, card]));
  const diagnostics = score.diagnostics ?? [];
  const timelineDuration = Math.max(1, Number(score.context?.duration) || 110);
  const rows = diagnostics.map((row) => `
    <tr>
      <td><b>${row.slot}</b></td>
      <td class="diagnostic-member-cell"><button class="diagnostic-member-trigger" type="button" aria-label="${escapeHtml(copy().skillInfoAria(row.characterName))}" data-skill-tooltip="${diagnosticSkillPayload(row)}"><strong>${escapeHtml(row.characterName)}</strong><span class="diagnostic-member-meta">Lv${row.profile.level} · ${t("card.potential")} ${row.profile.potential}</span></button></td>
      <td>${row.leaderConditionMatched ? `<span class="diagnostic-leader-badge">${t("result.leaderCondition")}</span>` : ""}</td>
      <td>Lv${row.activeLevel}</td>
      <td><span class="diag-interval ${row.collision ? "is-collision" : "is-normal"}"${row.collision ? ` aria-label="${escapeHtml(copy().duplicateInterval)}"` : ""}>${formatSeconds(row.interval)}</span></td>
      <td>${formatPercent(row.probability * 100, 0)}</td>
      <td>${formatSeconds(row.duration)}</td>
      <td>${t("common.times", { value: row.checks })}</td>
      <td>${t("common.times", { value: row.expectedActivations.toFixed(1) })}</td>
      <td>${row.passiveActive ? `<span class="diag-ok">${t("result.active")}</span>` : `<span class="diag-off">${t("result.inactive")}</span>`}</td>
    </tr>`).join("");
  const memberTimelineRows = diagnostics.map((row) => {
    const coverage = Math.max(0, Math.min(100, Number(row.coverage) * 100 || 0));
    const card = cardsById.get(row.cardId);
    const style = card ? attributeStyle(card) : "";
    const coverageText = formatPercent(coverage, 1);
    const windows = activationTimeline(row, timelineDuration).map((window) => `
      <i class="diagnostic-activation-window" style="--start:${window.startPercent.toFixed(3)}%;--span:${window.widthPercent.toFixed(3)}%" title="${formatSeconds(window.start)}–${formatSeconds(window.end)} · ${escapeHtml(copy().activationSuccess)}" aria-hidden="true"></i>`).join("");
    return `<div class="diagnostic-timeline-row" style="${style}">
      <strong>${escapeHtml(row.characterName)}</strong>
      <span title="${escapeHtml(copy().expectedCoverage)}">${coverageText}</span>
      <div class="diagnostic-timeline-cell"><div class="diagnostic-skill-timeline" role="img" aria-label="${escapeHtml(copy().memberTimelineAria(row.characterName, formatSeconds(row.interval), formatSeconds(row.duration), coverageText))}">${windows}</div></div>
    </div>`;
  }).join("");
  const teamTimeline = teamActivationTimeline(diagnostics, timelineDuration);
  const teamWindows = teamTimeline.segments.map((segment) => `
    <i class="diagnostic-team-window ${segment.count > 1 ? "is-overlap" : "is-covered"}" style="--start:${segment.startPercent.toFixed(3)}%;--span:${segment.widthPercent.toFixed(3)}%;--probability:${segment.probability.toFixed(3)}" title="${formatSeconds(segment.start)}–${formatSeconds(segment.end)} · ${escapeHtml(segment.count > 1 ? copy().overlap(segment.count) : copy().activationWindow)}" aria-hidden="true"></i>`).join("");
  const teamCoverage = formatPercent(teamTimeline.expectedCoverage * 100, 1);
  const teamOverlap = formatPercent(teamTimeline.overlapCoverage * 100, 1);
  const teamTimelineRow = `<div class="diagnostic-timeline-row diagnostic-team-row">
    <strong>${escapeHtml(copy().teamAll)}</strong>
    <span title="${escapeHtml(copy().teamCoverage)}">${teamCoverage}</span>
    <div class="diagnostic-timeline-cell"><div class="diagnostic-skill-timeline" role="img" aria-label="${escapeHtml(copy().teamTimelineAria(teamCoverage, teamOverlap))}">${teamWindows}</div></div>
  </div>`;
  const timelineTicks = [0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => `<span>${formatSeconds(timelineDuration * ratio)}</span>`)
    .join("");
  return `
    <section class="skill-diagnostics">
      <div class="skill-result-head">
        <div><span class="skill-kicker">SKILL INFORMATION</span><h3>${escapeHtml(copy().skillInformation)}</h3></div>
        <div class="diagnostic-leader-effect"><b>${t("skill.leader")}</b><strong>${escapeHtml(leader?.character_name ?? copy().notSelected)}</strong><span>${escapeHtml(leaderDescription(leader))}</span></div>
      </div>
      <div class="diagnostic-scroll">
        <table class="diagnostic-table">
          <thead><tr><th>#</th><th>${escapeHtml(copy().member)}</th><th>${t("result.leaderCondition")}</th><th>${t("result.activeLevel")}</th><th>${t("result.interval")}</th><th>${t("result.probability")}</th><th>${t("result.skillDuration")}</th><th>${t("result.checks")}</th><th>${t("result.expectedActivations")}</th><th>${t("result.passive")}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
    <section class="skill-timeline-panel">
      <div class="skill-result-head timeline-result-head">
        <div><span class="skill-kicker">ACTIVATION TIMELINE</span><h3>${escapeHtml(copy().timelineTitle)}</h3></div>
        <span class="timeline-head-note">${escapeHtml(copy().timelineNote)}</span>
      </div>
      <div class="diagnostic-timeline">
        <div class="diagnostic-timeline-columns" aria-hidden="true"><span>${escapeHtml(copy().member)}</span><span>${escapeHtml(copy().expectedCoverage)}</span><span>${escapeHtml(copy().songProgress)}</span></div>
        <div class="diagnostic-timeline-list">${memberTimelineRows}${teamTimelineRow}</div>
        <div class="diagnostic-timeline-scale" aria-hidden="true"><div>${timelineTicks}</div></div>
      </div>
    </section>`;
}

let diagnosticTooltip = null;

function hideDiagnosticTooltip() {
  if (diagnosticTooltip) diagnosticTooltip.hidden = true;
}

function wireDiagnosticTooltips(container) {
  diagnosticTooltip ??= document.body.appendChild(Object.assign(document.createElement("div"), {
    id: "result-skill-tooltip",
    className: "result-skill-tooltip",
  }));
  diagnosticTooltip.setAttribute("role", "tooltip");
  diagnosticTooltip.hidden = true;

  const show = (trigger) => {
    let skills = [];
    try {
      skills = JSON.parse(decodeURIComponent(trigger.dataset.skillTooltip ?? ""));
    } catch {
      return;
    }
    diagnosticTooltip.innerHTML = skills.map((skill) => `<span><b>${escapeHtml(skill.label)}</b><em>${escapeHtml(skill.description)}</em></span>`).join("");
    diagnosticTooltip.hidden = false;
    const triggerRect = trigger.getBoundingClientRect();
    const tooltipRect = diagnosticTooltip.getBoundingClientRect();
    const left = Math.min(window.innerWidth - tooltipRect.width - 12, Math.max(12, triggerRect.left));
    const below = triggerRect.bottom + 8;
    const top = below + tooltipRect.height <= window.innerHeight - 12
      ? below
      : Math.max(12, triggerRect.top - tooltipRect.height - 8);
    diagnosticTooltip.style.left = `${left}px`;
    diagnosticTooltip.style.top = `${top}px`;
  };

  container.querySelectorAll("[data-skill-tooltip]").forEach((trigger) => {
    trigger.setAttribute("aria-describedby", diagnosticTooltip.id);
    trigger.addEventListener("pointerenter", () => show(trigger));
    trigger.addEventListener("pointerleave", hideDiagnosticTooltip);
    trigger.addEventListener("focus", () => show(trigger));
    trigger.addEventListener("blur", hideDiagnosticTooltip);
    trigger.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        hideDiagnosticTooltip();
        trigger.blur();
      }
    });
  });
}

function resultDetails(result, index, data, state, song, open) {
  const cards = result.members.map((cardId) => data.cardsById.get(cardId) ?? null);
  const score = result.score;
  const rankingScore = score.rankingScore;
  const scoreLabel = song ? copy().expectedAverageScore : t("result.unitScore");
  const targetStat = TARGET_STATS[state.simulationTarget] ?? null;
  const targetLabel = targetStat ? statLabel(targetStat) : scoreLabel;
  const targetValue = targetStat ? score.deckStats?.[targetStat] : rankingScore;
  const statMetrics = ["p", "t", "s"].map((stat) => metric(
    statLabel(stat),
    score.deckStats?.[stat],
    targetStat === stat ? "is-concept" : "",
  )).join("");
  const maxSummary = !targetStat && score.estimatedSongMax
    ? `<small>${escapeHtml(copy().approximateMax)} ${formatNumber(score.estimatedSongMax)}</small>`
    : "";
  const rank = index + 1;

  return `
    <details class="recommendation-result-card" data-result-index="${index}"${open ? " open" : ""}>
      <summary>
        <div class="result-summary-header">
          <span class="result-top-number">${t("result.top", { rank })}</span>
          <div class="result-summary-score">
            <span>${escapeHtml(targetLabel)}</span>
            <strong>${formatNumber(targetValue)}</strong>
            ${maxSummary}
          </div>
          ${summaryMemberGroups(cards)}
          <span class="result-expand-label" aria-hidden="true"><span class="is-collapsed">${escapeHtml(copy().detailsShow)}</span><span class="is-expanded">${escapeHtml(copy().detailsHide)}</span></span>
        </div>
        <div class="result-members result-members-preview" aria-label="${escapeHtml(copy().recommendationAria(rank))}">
          ${cards.map((card, cardIndex) => resultCard(
            card,
            cardIndex,
            state,
            Boolean(state.lockedSlots[cardIndex] && state.members[cardIndex] === card?.id),
          )).join("")}
        </div>
      </summary>
      <div class="recommendation-result-body">
        ${songProjection(score, song, state.difficulty)}
        <div class="result-context-row">
          <div class="result-metrics">
            ${metric(scoreLabel, rankingScore, targetStat ? "" : "is-concept")}
            ${song ? metric(copy().approximateMax, score.estimatedSongMax) : ""}
            ${metric(copy().overallPower, score.overallPower)}
            ${statMetrics}
          </div>
        </div>
        ${calculationBreakdown(score)}
        ${diagnosticTable(score, cards)}
      </div>
    </details>`;
}

export function renderResult(data, state, recommendation = null) {
  const container = requiredElement("#recommendation-results");
  const previouslyOpen = new Set(
    [...container.querySelectorAll("details[open]")].map((details) => details.dataset.resultIndex),
  );
  const results = recommendation?.results ?? [];
  const song = state.musicId ? data.musicById.get(state.musicId) : null;

  if (!results.length) {
    hideDiagnosticTooltip();
    container.innerHTML = `<div class="empty-state result-empty-state"><span aria-hidden="true">✦</span><p>${escapeHtml(copy().resultInitial)}</p></div>`;
    return;
  }

  container.innerHTML = results.map((result, index) => resultDetails(
    result,
    index,
    data,
    state,
    song,
    previouslyOpen.has(String(index)),
  )).join("");
  wirePortraitFallback(container);
  wireDiagnosticTooltips(container);
}
