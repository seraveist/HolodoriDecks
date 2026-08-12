import { formatNumber, getLocale } from "../i18n.js?v=20260812.2";

const COPY = Object.freeze({
  ko: {
    unit: "유닛 스코어",
    potentialUnit: "잠재 유닛 스코어",
    expectedSong: "예상 평균 스코어",
    potentialSong: "근사 최대 스코어",
  },
  en: {
    unit: "Unit Score",
    potentialUnit: "Potential Unit Score",
    expectedSong: "Estimated Average Score",
    potentialSong: "Approx. Maximum Score",
  },
  ja: {
    unit: "ユニットスコア",
    potentialUnit: "潜在ユニットスコア",
    expectedSong: "予想平均スコア",
    potentialSong: "近似最大スコア",
  },
});

function copy() {
  return COPY[getLocale()] ?? COPY.ko;
}

function valueText(value) {
  return formatNumber(Math.round(Number(value) || 0));
}

function metricElement(label, value) {
  const element = document.createElement("div");
  element.className = "result-metric";
  element.dataset.potentialMetric = "true";
  const labelElement = document.createElement("span");
  const valueElement = document.createElement("strong");
  labelElement.textContent = label;
  valueElement.textContent = valueText(value);
  element.append(labelElement, valueElement);
  return element;
}

export function applySimulationTargetPresentation(container, state, recommendation) {
  const results = recommendation?.results ?? [];
  if (!results.length) return;

  const songSelected = Boolean(state.musicId);
  const potentialTarget = state.simulationTarget === "potential";
  const expectedLabel = songSelected ? copy().expectedSong : copy().unit;
  const potentialLabel = songSelected ? copy().potentialSong : copy().potentialUnit;

  [...container.querySelectorAll(".recommendation-result-card")].forEach((card, index) => {
    const score = results[index]?.score;
    if (!score) return;
    const expectedValue = Number(score.rankingScore) || Number(score.unitScore) || 0;
    const potentialValue = Number(score.potentialRankingScore)
      || Number(score.estimatedSongMax)
      || Number(score.potentialUnitScore)
      || expectedValue;

    const summary = card.querySelector(".result-summary-score");
    if (summary) {
      summary.querySelector("span")?.replaceChildren(document.createTextNode(potentialTarget ? potentialLabel : expectedLabel));
      summary.querySelector("strong")?.replaceChildren(document.createTextNode(valueText(potentialTarget ? potentialValue : expectedValue)));
      let comparison = summary.querySelector("small");
      if (!comparison) {
        comparison = document.createElement("small");
        summary.append(comparison);
      }
      comparison.textContent = `${potentialTarget ? expectedLabel : potentialLabel} ${valueText(potentialTarget ? expectedValue : potentialValue)}`;
    }

    const metrics = card.querySelector(".result-metrics");
    if (!metrics) return;
    const existing = [...metrics.querySelectorAll(":scope > .result-metric")];
    const expectedMetric = existing[0];
    if (!expectedMetric) return;
    expectedMetric.querySelector("span")?.replaceChildren(document.createTextNode(expectedLabel));
    expectedMetric.querySelector("strong")?.replaceChildren(document.createTextNode(valueText(expectedValue)));

    let potentialMetric;
    if (songSelected) {
      potentialMetric = existing[1];
      if (potentialMetric) {
        potentialMetric.querySelector("span")?.replaceChildren(document.createTextNode(potentialLabel));
        potentialMetric.querySelector("strong")?.replaceChildren(document.createTextNode(valueText(potentialValue)));
      }
    } else {
      potentialMetric = metrics.querySelector('[data-potential-metric="true"]');
      if (!potentialMetric) {
        potentialMetric = metricElement(potentialLabel, potentialValue);
        expectedMetric.insertAdjacentElement("afterend", potentialMetric);
      }
    }

    expectedMetric.classList.toggle("is-concept", !potentialTarget);
    potentialMetric?.classList.toggle("is-concept", potentialTarget);
  });
}
