export const LEADER_SUPPORT_REGISTRY = Object.freeze({
  version: 1,
  triggers: Object.freeze({
    LiveSkillTriggerType_LIVE_SKILL_TRIGGER_TYPE_DECK_CARD_ATTRIBUTE: Object.freeze({
      requiredFields: Object.freeze(["threshold", "cardAttributeType"]),
    }),
    LiveSkillTriggerType_LIVE_SKILL_TRIGGER_TYPE_DECK_CARD_CHARACTER_GROUPING: Object.freeze({
      requiredFields: Object.freeze(["threshold", "characterGroupingId"]),
    }),
  }),
  effects: Object.freeze({
    LivePassiveSkillEffectType_LIVE_PASSIVE_SKILL_EFFECT_TYPE_ALL_PARAMETER_UP_PERMIL_UP: Object.freeze({
      requiredFields: Object.freeze(["value", "liveSkillEffectTargetId"]),
      supportedTargets: Object.freeze(["live_skill_effect_target-all"]),
    }),
    LivePassiveSkillEffectType_LIVE_PASSIVE_SKILL_EFFECT_TYPE_PERFORMANCE_UP_PERMIL_UP: Object.freeze({
      requiredFields: Object.freeze(["value", "liveSkillEffectTargetId"]),
      supportedTargets: Object.freeze(["live_skill_effect_target-all"]),
    }),
    LivePassiveSkillEffectType_LIVE_PASSIVE_SKILL_EFFECT_TYPE_TECHNIQUE_UP_PERMIL_UP: Object.freeze({
      requiredFields: Object.freeze(["value", "liveSkillEffectTargetId"]),
      supportedTargets: Object.freeze(["live_skill_effect_target-all"]),
    }),
    LivePassiveSkillEffectType_LIVE_PASSIVE_SKILL_EFFECT_TYPE_SENSE_UP_PERMIL_UP: Object.freeze({
      requiredFields: Object.freeze(["value", "liveSkillEffectTargetId"]),
      supportedTargets: Object.freeze(["live_skill_effect_target-all"]),
    }),
    LivePassiveSkillEffectType_LIVE_PASSIVE_SKILL_EFFECT_TYPE_LIVE_ACTIVE_SKILL_EFFECT_UP_PERMIL_UP: Object.freeze({
      requiredFields: Object.freeze(["value", "liveSkillEffectTargetId"]),
      supportedTargets: Object.freeze(["live_skill_effect_target-all"]),
    }),
  }),
});

function collectRows(leader, keys) {
  return keys.flatMap((key) => Array.isArray(leader?.[key]) ? leader[key] : []);
}

function checkRow(row, rules, kind) {
  const type = String(row?.type ?? "").trim();
  const rule = rules[type];
  const issues = [];
  if (!type || !rule) {
    issues.push({ kind, type: type || "<missing>", issue: "unsupported_type" });
    return issues;
  }
  for (const field of rule.requiredFields ?? []) {
    if (row?.[field] == null || row[field] === "") {
      issues.push({ kind, type, issue: "missing_field", field });
    }
  }
  if (rule.supportedTargets) {
    const target = String(row?.liveSkillEffectTargetId ?? "");
    if (!rule.supportedTargets.includes(target)) {
      issues.push({ kind, type, issue: "unsupported_target", target: target || "<missing>" });
    }
  }
  return issues;
}

export function leaderSupportStatus(leader) {
  if (!leader) return { understood: true, issues: [] };
  const issues = [
    ...collectRows(leader, ["trigger", "additional_trigger"])
      .flatMap((row) => checkRow(row, LEADER_SUPPORT_REGISTRY.triggers, "trigger")),
    ...collectRows(leader, ["effect", "additional_effect"])
      .flatMap((row) => checkRow(row, LEADER_SUPPORT_REGISTRY.effects, "effect")),
  ];
  return { understood: issues.length === 0, issues };
}

export function auditLeaderSupport(cards) {
  const observedTriggerTypes = new Set();
  const observedEffectTypes = new Set();
  const unknownCards = [];
  const issueKeys = new Set();

  for (const card of cards ?? []) {
    const leader = card?.leader;
    if (!leader) continue;
    for (const row of collectRows(leader, ["trigger", "additional_trigger"])) {
      observedTriggerTypes.add(String(row?.type ?? "<missing>"));
    }
    for (const row of collectRows(leader, ["effect", "additional_effect"])) {
      observedEffectTypes.add(String(row?.type ?? "<missing>"));
    }
    const status = leaderSupportStatus(leader);
    if (!status.understood) {
      status.issues.forEach((issue) => issueKeys.add(JSON.stringify(issue)));
      unknownCards.push({
        cardId: card.id,
        characterName: card.character_name ?? "",
        issues: status.issues,
      });
    }
  }

  return {
    registryVersion: LEADER_SUPPORT_REGISTRY.version,
    observedTriggerTypes: [...observedTriggerTypes].sort(),
    observedEffectTypes: [...observedEffectTypes].sort(),
    issues: [...issueKeys].map((value) => JSON.parse(value)),
    unknownCards,
    understood: unknownCards.length === 0,
  };
}
