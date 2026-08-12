import {
  ATTRIBUTE_META,
  attributeStyle,
  cleanGameMarkup,
  escapeHtml,
  renderLandscapeCardArt,
  wirePortraitFallback,
} from "./cards.js?v=20260811.19";
import { SLOT_LABELS } from "./member.js?v=20260811.19";
import { requiredElement } from "./dom.js?v=20260811.19";

const STAT_LABELS = Object.freeze({ p: "퍼포먼스", t: "테크닉", s: "센스" });

function formatNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString("ko-KR");
}

function formatPercent(value, digits = 1) {
  return `${Number(value || 0).toFixed(digits)}%`;
}

function formatSeconds(value) {
  const seconds = Math.max(0, Number(value) || 0);
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}초`;
}

export function activationTimeline(row, totalDuration) {
  const timelineDuration = Math.max(1, Number(totalDuration) || 1);
  const interval = Math.max(0.001, Number(row?.interval) || timelineDuration);
  const activeDuration = Math.max(0, Number(row?.duration) || 0);
  const checks = Math.max(0, Math.floor(Number(row?.checks) || timelineDuration / interval));
  const windows = [];
  for (let check = 1; check <= checks; check += 1) {
    const start = check * interval;
    if (start >= timelineDuration || activeDuration <= 0) continue;
    const end = Math.min(timelineDuration, start + activeDuration);
    if (end <= start) continue;
    windows.push({
      start,
      end,
      startPercent: start / timelineDuration * 100,
      widthPercent: (end - start) / timelineDuration * 100,
    });
  }
  return windows;
}

export function teamActivationTimeline(rows, totalDuration) {
  const duration = Math.max(1, Number(totalDuration) || 1);
  const events = [];
  rows.forEach((row, rowIndex) => {
    activationTimeline(row, duration).forEach((window) => {
      events.push({ time: window.start, rowIndex, delta: 1 });
      events.push({ time: window.end, rowIndex, delta: -1 });
    });
  });
  events.sort((left, right) => left.time - right.time);

  const activeCounts = new Map();
  const segments = [];
  let cursor = 0;
  let eventIndex = 0;
  while (eventIndex < events.length) {
    const time = Math.max(0, Math.min(duration, events[eventIndex].time));
    const activeIndexes = [...activeCounts.entries()]
      .filter(([, count]) => count > 0)
      .map(([rowIndex]) => rowIndex);
    if (time > cursor && activeIndexes.length) {
      const probability = 1 - activeIndexes.reduce((noneActive, rowIndex) => (
        noneActive * (1 - Math.max(0, Math.min(1, Number(rows[rowIndex]?.effectiveProbability) || 0)))
      ), 1);
      segments.push({
        start: cursor,
        end: time,
        count: activeIndexes.length,
        probability,
        startPercent: cursor / duration * 100,
        widthPercent: (time - cursor) / duration * 100,
      });
    }
    cursor = time;
    while (eventIndex < events.length
      && Math.max(0, Math.min(duration, events[eventIndex].time)) === time) {
      const event = events[eventIndex];
      activeCounts.set(event.rowIndex, (activeCounts.get(event.rowIndex) ?? 0) + event.delta);
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
  return setting ? `${state.levelMode === "max" ? "MAX" : `Lv${setting.level}`} · ${setting.potential}개화` : "";
}

function resultCard(card, index, state, fixed) {
  if (!card) {
    return `<div class="result-card empty"><div><span class="result-empty-mark">＋</span>${SLOT_LABELS[index]}<br>미선택</div></div>`;
  }
  const attribute = ATTRIBUTE_META[Number(card.attribute)] ?? ATTRIBUTE_META[1];
  const leaderBadge = index === 0 ? '<span class="result-card-role is-leader">리더</span>' : "";
  return `<article class="result-card${fixed ? " is-fixed" : ""}">
    ${renderLandscapeCardArt(card, { showMeta: false })}
    <div class="result-card-copy" style="${attributeStyle(card)}">
      <div class="result-card-meta">
        ${leaderBadge}
        <span class="result-card-level">${escapeHtml(cardProfile(state, card))}</span>
        <span class="result-card-attribute" aria-label="${escapeHtml(attribute.name)} 타입"><img src="${attribute.icon}" alt="">${escapeHtml(attribute.name)}</span>
      </div>
      <div class="result-card-identity">
        <div class="result-card-title-line">
          <span class="result-card-rarity" aria-label="희귀도 ${card.rarity}">★${Number(card.rarity)}</span>
          <strong class="result-card-character">${escapeHtml(card.character_name)}</strong>
        </div>
        <span class="result-card-name">${escapeHtml(card.name)}</span>
      </div>
    </div>
  </article>`;
}

function leaderDescription(card) {
  return cleanGameMarkup(card?.leader?.description) || "정보 없음";
}

function metric(label, value, className = "") {
  return `<div class="result-metric ${className}"><span>${escapeHtml(label)}</span><strong>${formatNumber(value)}</strong></div>`;
}

function summaryMemberGroups(cards) {
  const leader = cards[0]?.character_name ?? "미선택";
  const members = cards.slice(1).map((card) => card?.character_name).filter(Boolean).join(" · ") || "미선택";
  return `<div class="result-summary-members">
    <span><b class="is-leader">리더</b><strong>${escapeHtml(leader)}</strong></span>
    <span><b>멤버</b><strong>${escapeHtml(members)}</strong></span>
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
        <header><span>종합력</span><strong>${formatNumber(score.overallPower)}</strong></header>
        <div class="calculation-rows">
          ${calculationRow("멤버 파라미터", power.memberParameter)}
          ${calculationRow("리더 의상 스킬", power.outfit)}
          ${calculationRow("패시브 스킬", power.passive)}
          ${calculationRow("멤버 강화 보너스", power.enhancement)}
          ${calculationRow("보드·메모리", (power.board ?? 0) + (power.memory ?? 0))}
        </div>
      </article>
      <article class="calculation-card">
        <header><span>스코어 보너스</span><strong>${formatPercent(score.scoreBonusPct)}</strong></header>
        <div class="calculation-rows">
          ${calculationRow("리더 서포트", bonus.outfit, "%")}
          ${calculationRow("액티브 스킬", bonus.active, "%")}
          ${calculationRow("패시브 서포트", bonus.passive, "%")}
          ${calculationRow("스페셜 스킬", bonus.special, "%")}
          ${calculationRow("동일 주기 충돌 손실", score.detail?.collision?.lossPct, "%")}
        </div>
      </article>
    </div>`;
}

function songProjection(score, song, difficulty) {
  const projection = score.songProjection;
  if (!projection || !song) {
    return '<div class="song-projection is-generic"><strong>전체 평균</strong><span>110초 · 800노트 범용 유닛 평가 기준입니다.</span></div>';
  }
  return `
    <div class="song-projection">
      <div class="song-projection-score"><span>선택 악곡 예상 평균</span><strong>${formatNumber(projection.averageScore)}</strong></div>
      <div class="song-projection-score"><span>모든 유효 액티브 성공 시 근사 최대</span><strong>${formatNumber(projection.maxScore)}</strong></div>
      <p><b>${escapeHtml(song.title)} · ${escapeHtml(difficulty)}</b><span>${projection.context.duration}초 · 약 ${formatNumber(projection.context.notes)}노트 · ${projection.playMode === "auto" ? "AUTO (콤보 보너스 없음)" : "Manual FC"}</span></p>
    </div>`;
}

function diagnosticSkillPayload(row) {
  return encodeURIComponent(JSON.stringify([
    { label: `액티브 Lv${row.activeLevel}`, description: cleanGameMarkup(row.activeDescription) },
    {
      label: `패시브 Lv${row.passiveLevel}`,
      description: cleanGameMarkup(row.passiveActive
        ? row.passiveDescription
        : `비활성 · ${row.passiveDescription}`),
    },
    { label: `스페셜 Lv${row.specialLevel}`, description: cleanGameMarkup(row.specialDescription) },
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
      <td class="diagnostic-member-cell"><button class="diagnostic-member-trigger" type="button" aria-label="${escapeHtml(row.characterName)} 스킬 정보 보기" data-skill-tooltip="${diagnosticSkillPayload(row)}"><strong>${escapeHtml(row.characterName)}</strong><span class="diagnostic-member-meta">Lv${row.profile.level} · ${row.profile.potential}개화</span></button></td>
      <td>${row.leaderConditionMatched ? '<span class="diagnostic-leader-badge">리더 조건</span>' : ""}</td>
      <td>Lv${row.activeLevel}</td>
      <td><span class="diag-interval ${row.collision ? "is-collision" : "is-normal"}"${row.collision ? ' aria-label="동일 주기 중복"' : ""}>${row.interval}초</span></td>
      <td>${formatPercent(row.probability * 100, 0)}</td>
      <td>${row.duration}초</td>
      <td>${row.checks}회</td>
      <td>${row.expectedActivations.toFixed(1)}회</td>
      <td>${row.passiveActive ? '<span class="diag-ok">활성</span>' : '<span class="diag-off">비활성</span>'}</td>
    </tr>`).join("");
  const memberTimelineRows = diagnostics.map((row) => {
    const coverage = Math.max(0, Math.min(100, Number(row.coverage) * 100 || 0));
    const card = cardsById.get(row.cardId);
    const style = card ? attributeStyle(card) : "";
    const windows = activationTimeline(row, timelineDuration).map((window) => `
      <i class="diagnostic-activation-window" style="--start:${window.startPercent.toFixed(3)}%;--span:${window.widthPercent.toFixed(3)}%" title="${formatSeconds(window.start)}–${formatSeconds(window.end)} · 발동 성공 시" aria-hidden="true"></i>`).join("");
    return `<div class="diagnostic-timeline-row" style="${style}">
      <strong>${escapeHtml(row.characterName)}</strong>
      <span title="예상 커버율">${formatPercent(coverage, 1)}</span>
      <div class="diagnostic-timeline-cell"><div class="diagnostic-skill-timeline" role="img" aria-label="${escapeHtml(row.characterName)} · ${formatSeconds(row.interval)}마다 발동 판정 · 성공 시 ${formatSeconds(row.duration)} 유지 · 예상 커버율 ${formatPercent(coverage, 1)}">${windows}</div></div>
    </div>`;
  }).join("");
  const teamTimeline = teamActivationTimeline(diagnostics, timelineDuration);
  const teamWindows = teamTimeline.segments.map((segment) => `
    <i class="diagnostic-team-window ${segment.count > 1 ? "is-overlap" : "is-covered"}" style="--start:${segment.startPercent.toFixed(3)}%;--span:${segment.widthPercent.toFixed(3)}%;--probability:${segment.probability.toFixed(3)}" title="${formatSeconds(segment.start)}–${formatSeconds(segment.end)} · ${segment.count > 1 ? `${segment.count}명 중복` : "발동 구간"}" aria-hidden="true"></i>`).join("");
  const teamTimelineRow = `<div class="diagnostic-timeline-row diagnostic-team-row">
    <strong>팀 전체</strong>
    <span title="팀 전체 예상 커버율">${formatPercent(teamTimeline.expectedCoverage * 100, 1)}</span>
    <div class="diagnostic-timeline-cell"><div class="diagnostic-skill-timeline" role="img" aria-label="팀 전체 예상 커버율 ${formatPercent(teamTimeline.expectedCoverage * 100, 1)} · 중복 가능 구간 ${formatPercent(teamTimeline.overlapCoverage * 100, 1)}">${teamWindows}</div></div>
  </div>`;
  const timelineTicks = [0, 0.25, 0.5, 0.75, 1]
    .map((ratio) => `<span>${formatSeconds(timelineDuration * ratio)}</span>`)
    .join("");
  return `
    <section class="skill-diagnostics">
      <div class="skill-result-head">
        <div><span class="skill-kicker">SKILL INFORMATION</span><h3>스킬 정보</h3></div>
        <div class="diagnostic-leader-effect"><b>리더 효과</b><strong>${escapeHtml(leader?.character_name ?? "미선택")}</strong><span>${escapeHtml(leaderDescription(leader))}</span></div>
      </div>
      <div class="diagnostic-scroll">
        <table class="diagnostic-table">
          <thead><tr><th>#</th><th>멤버</th><th>리더 조건</th><th>액티브 Lv</th><th>주기</th><th>발동률</th><th>지속</th><th>체크</th><th>기대 발동</th><th>패시브 발동</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>
    <section class="skill-timeline-panel">
      <div class="skill-result-head timeline-result-head">
        <div><span class="skill-kicker">ACTIVATION TIMELINE</span><h3>스킬 발동 구간</h3></div>
        <span class="timeline-head-note">청록은 발동 구간, 빨강은 중복 가능 구간입니다.</span>
      </div>
      <div class="diagnostic-timeline">
        <div class="diagnostic-timeline-columns" aria-hidden="true"><span>멤버</span><span>예상 커버율</span><span>곡 진행</span></div>
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
  const expectedScore = score.rankingScore;
  const potentialScore = score.potentialRankingScore ?? score.estimatedSongMax ?? score.potentialUnitScore ?? expectedScore;
  const expectedLabel = song ? "예상 평균 스코어" : "유닛 스코어";
  const potentialLabel = song ? "근사 최대 스코어" : "잠재 스코어";
  const potentialTarget = state.simulationTarget === "potential";
  const targetLabel = potentialTarget ? potentialLabel : expectedLabel;
  const targetValue = potentialTarget ? potentialScore : expectedScore;
  const statMetrics = ["p", "t", "s"].map((stat) => metric(
    STAT_LABELS[stat],
    score.deckStats?.[stat],
  )).join("");
  const comparisonSummary = potentialTarget
    ? `<small>${escapeHtml(expectedLabel)} ${formatNumber(expectedScore)}</small>`
    : `<small>${escapeHtml(potentialLabel)} ${formatNumber(potentialScore)}</small>`;

  return `
    <details class="recommendation-result-card" data-result-index="${index}"${open ? " open" : ""}>
      <summary>
        <div class="result-summary-header">
          <span class="result-top-number">TOP ${index + 1}</span>
          <div class="result-summary-score">
            <span>${escapeHtml(targetLabel)}</span>
            <strong>${formatNumber(targetValue)}</strong>
            ${comparisonSummary}
          </div>
          ${summaryMemberGroups(cards)}
          <span class="result-expand-label" aria-hidden="true"><span class="is-collapsed">+ 상세 보기</span><span class="is-expanded">- 접기</span></span>
        </div>
        <div class="result-members result-members-preview" aria-label="추천 TOP ${index + 1} 편성 카드">
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
            ${metric(expectedLabel, expectedScore, potentialTarget ? "" : "is-concept")}
            ${metric(potentialLabel, potentialScore, potentialTarget ? "is-concept" : "")}
            ${song ? metric("유닛 스코어", score.unitScore) : ""}
            ${metric("종합력", score.overallPower)}
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
    container.innerHTML = '<div class="empty-state result-empty-state"><span aria-hidden="true">✦</span><p>악곡 아래의 계산 버튼을 누르면 선택한 목표의 추천 편성 TOP 5가 표시됩니다.</p></div>';
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
