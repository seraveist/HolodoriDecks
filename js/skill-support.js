export const POTENTIAL_EFFECT_TYPE = Object.freeze({
  active: "ACTIVE_SKILL_LEVEL_UP",
  passive: "PASSIVE_SKILL_LEVEL_UP",
  special: "SPECIAL_SKILL_LEVEL_UP",
  parameter: "ALL_PARAMETER_UP_PERMIL_UP",
  skillTree: "SKILL_TREE_CONNECT_EFFECT_LEVEL_UP",
});

const SKILL_CONTEXT = Object.freeze({
  activePrimary: "active.primary",
  activeAdditional: "active.additional",
  passive: "passive",
  specialPrimary: "special.primary",
  specialAdditional: "special.additional",
});

const SCORE_SCOPE = Object.freeze({
  handled: "handled",
  ignored: "ignored",
});

export const CARD_SKILL_SUPPORT_REGISTRY = Object.freeze({
  version: 1,
  triggers: Object.freeze({
    LiveSkillTriggerType_LIVE_SKILL_TRIGGER_TYPE_COMBO_GTE: Object.freeze({
      requiredFields: Object.freeze(["threshold"]),
      supportedContexts: Object.freeze([
        SKILL_CONTEXT.activeAdditional,
        SKILL_CONTEXT.specialAdditional,
      ]),
    }),
    LiveSkillTriggerType_LIVE_SKILL_TRIGGER_TYPE_LIFE_GTE: Object.freeze({
      requiredFields: Object.freeze(["threshold"]),
      supportedContexts: Object.freeze([
        SKILL_CONTEXT.activeAdditional,
        SKILL_CONTEXT.specialAdditional,
      ]),
    }),
    LiveSkillTriggerType_LIVE_SKILL_TRIGGER_TYPE_DECK_CARD_ATTRIBUTE: Object.freeze({
      requiredFields: Object.freeze(["threshold", "cardAttributeType"]),
      supportedContexts: Object.freeze([
        SKILL_CONTEXT.activeAdditional,
        SKILL_CONTEXT.passive,
        SKILL_CONTEXT.specialAdditional,
      ]),
    }),
    LiveSkillTriggerType_LIVE_SKILL_TRIGGER_TYPE_DECK_CARD_CHARACTER_GROUPING: Object.freeze({
      requiredFields: Object.freeze(["threshold", "characterGroupingId"]),
      supportedContexts: Object.freeze([
        SKILL_CONTEXT.activeAdditional,
        SKILL_CONTEXT.passive,
        SKILL_CONTEXT.specialAdditional,
      ]),
    }),
  }),
  activeEffects: Object.freeze({
    LiveActiveSkillEffectType_LIVE_ACTIVE_SKILL_EFFECT_TYPE_SCORE_UP_PERMIL_UP: Object.freeze({
      requiredFields: Object.freeze(["value"]),
      supportedContexts: Object.freeze([
        SKILL_CONTEXT.activePrimary,
        SKILL_CONTEXT.activeAdditional,
      ]),
      scoreScope: SCORE_SCOPE.handled,
    }),
    LiveActiveSkillEffectType_LIVE_ACTIVE_SKILL_EFFECT_TYPE_SCORE_UP_EFFECT_UP_PERMIL_UP: Object.freeze({
      requiredFields: Object.freeze(["value"]),
      supportedContexts: Object.freeze([SKILL_CONTEXT.specialPrimary]),
      scoreScope: SCORE_SCOPE.handled,
    }),
    LiveActiveSkillEffectType_LIVE_ACTIVE_SKILL_EFFECT_TYPE_LIVE_ACTIVE_SKILL_ACTIVATION_PROBABILITY_UP_PERMIL_UP: Object.freeze({
      requiredFields: Object.freeze(["value"]),
      supportedContexts: Object.freeze([SKILL_CONTEXT.specialAdditional]),
      scoreScope: SCORE_SCOPE.handled,
    }),
    LiveActiveSkillEffectType_LIVE_ACTIVE_SKILL_EFFECT_TYPE_LIFE_RECOVERY: Object.freeze({
      requiredFields: Object.freeze(["value"]),
      supportedContexts: Object.freeze([SKILL_CONTEXT.specialAdditional]),
      scoreScope: SCORE_SCOPE.ignored,
    }),
    LiveActiveSkillEffectType_LIVE_ACTIVE_SKILL_EFFECT_TYPE_JUDGEMENT_ENHANCE: Object.freeze({
      requiredFields: Object.freeze([]),
      supportedContexts: Object.freeze([SKILL_CONTEXT.specialAdditional]),
      scoreScope: SCORE_SCOPE.ignored,
    }),
  }),
  passiveEffects: Object.freeze({
    LivePassiveSkillEffectType_LIVE_PASSIVE_SKILL_EFFECT_TYPE_ALL_PARAMETER_UP_PERMIL_UP: Object.freeze({
      requiredFields: Object.freeze(["value", "liveSkillEffectTargetId"]),
      supportedContexts: Object.freeze([SKILL_CONTEXT.passive]),
      supportedTargetKinds: Object.freeze(["all", "self", "attribute", "group"]),
      scoreScope: SCORE_SCOPE.handled,
    }),
    LivePassiveSkillEffectType_LIVE_PASSIVE_SKILL_EFFECT_TYPE_PERFORMANCE_UP_PERMIL_UP: Object.freeze({
      requiredFields: Object.freeze(["value", "liveSkillEffectTargetId"]),
      supportedContexts: Object.freeze([SKILL_CONTEXT.passive]),
      supportedTargetKinds: Object.freeze(["all", "self", "attribute", "group"]),
      scoreScope: SCORE_SCOPE.handled,
    }),
    LivePassiveSkillEffectType_LIVE_PASSIVE_SKILL_EFFECT_TYPE_TECHNIQUE_UP_PERMIL_UP: Object.freeze({
      requiredFields: Object.freeze(["value", "liveSkillEffectTargetId"]),
      supportedContexts: Object.freeze([SKILL_CONTEXT.passive]),
      supportedTargetKinds: Object.freeze(["all", "self", "attribute", "group"]),
      scoreScope: SCORE_SCOPE.handled,
    }),
    LivePassiveSkillEffectType_LIVE_PASSIVE_SKILL_EFFECT_TYPE_SENSE_UP_PERMIL_UP: Object.freeze({
      requiredFields: Object.freeze(["value", "liveSkillEffectTargetId"]),
      supportedContexts: Object.freeze([SKILL_CONTEXT.passive]),
      supportedTargetKinds: Object.freeze(["all", "self", "attribute", "group"]),
      scoreScope: SCORE_SCOPE.handled,
    }),
    LivePassiveSkillEffectType_LIVE_PASSIVE_SKILL_EFFECT_TYPE_LIVE_ACTIVE_SKILL_EFFECT_UP_PERMIL_UP: Object.freeze({
      requiredFields: Object.freeze(["value", "liveSkillEffectTargetId"]),
      supportedContexts: Object.freeze([SKILL_CONTEXT.passive]),
      supportedTargetKinds: Object.freeze(["all", "self", "attribute", "group"]),
      scoreScope: SCORE_SCOPE.handled,
    }),
  }),
  potentialEffects: Object.freeze({
    [POTENTIAL_EFFECT_TYPE.active]: Object.freeze({ requiredFields: Object.freeze(["upgradeCount", "value"]), scoreScope: SCORE_SCOPE.handled }),
    [POTENTIAL_EFFECT_TYPE.passive]: Object.freeze({ requiredFields: Object.freeze(["upgradeCount", "value"]), scoreScope: SCORE_SCOPE.handled }),
    [POTENTIAL_EFFECT_TYPE.special]: Object.freeze({ requiredFields: Object.freeze(["upgradeCount", "value"]), scoreScope: SCORE_SCOPE.handled }),
    [POTENTIAL_EFFECT_TYPE.parameter]: Object.freeze({ requiredFields: Object.freeze(["upgradeCount", "value"]), scoreScope: SCORE_SCOPE.handled }),
    [POTENTIAL_EFFECT_TYPE.skillTree]: Object.freeze({ requiredFields: Object.freeze(["upgradeCount"]), scoreScope: SCORE_SCOPE.ignored }),
  }),
});

const POTENTIAL_SUFFIXES = Object.freeze(Object.keys(CARD_SKILL_SUPPORT_REGISTRY.potentialEffects));

function finiteLevel(row, fallback) {
  const value = Number(row?.level);
  return Number.isFinite(value) ? value : fallback;
}

function typeString(row) {
  return String(row?.type ?? "").trim();
}

function targetKind(targetId) {
  const value = String(targetId ?? "");
  if (value === "live_skill_effect_target-all") return "all";
  if (value === "live_skill_effect_target-self") return "self";
  if (/^live_skill_effect_target-attribute-attribute_\d+-\d+$/.test(value)) return "attribute";
  if (/^live_skill_effect_target-character_grouping-.+-\d+$/.test(value)) return "group";
  return null;
}

export function potentialEffectTypeSuffix(effect) {
  const value = String(effect?.effectType ?? effect?.type ?? "");
  return POTENTIAL_SUFFIXES.find((suffix) => value.endsWith(suffix)) ?? value;
}

function issueBase(card, skillKind, level, context, kind, groupId = "") {
  return {
    cardId: card?.id ?? "<unknown-card>",
    characterName: card?.character_name ?? "",
    skillKind,
    level,
    context,
    kind,
    ...(groupId ? { groupId } : {}),
  };
}

function checkRequiredFields(row, rule, base) {
  const issues = [];
  for (const field of rule?.requiredFields ?? []) {
    if (row?.[field] == null || row[field] === "") {
      issues.push({ ...base, type: typeString(row) || "<missing>", issue: "missing_field", field });
    }
  }
  return issues;
}

function checkMasterGroup({
  card,
  masterRefs,
  collection,
  groupId,
  rules,
  skillKind,
  level,
  context,
  kind,
  required = false,
}) {
  const id = String(groupId ?? "").trim();
  const base = issueBase(card, skillKind, level, context, kind, id);
  if (!id) {
    return required ? [{ ...base, issue: "missing_group_id" }] : [];
  }

  const rows = masterRefs?.[collection]?.[id];
  if (!Array.isArray(rows) || rows.length === 0) {
    return [{ ...base, issue: "missing_master_group" }];
  }
  if (rows.length !== 1) {
    return [{ ...base, issue: "unsupported_group_shape", rowCount: rows.length }];
  }

  const row = rows[0];
  const type = typeString(row);
  const rule = rules[type];
  if (!type || !rule) {
    return [{ ...base, type: type || "<missing>", issue: "unsupported_type" }];
  }

  const issues = checkRequiredFields(row, rule, { ...base, type });
  if (rule.supportedContexts && !rule.supportedContexts.includes(context)) {
    issues.push({ ...base, type, issue: "unsupported_context" });
  }
  if (rule.supportedTargetKinds) {
    const target = String(row?.liveSkillEffectTargetId ?? "");
    const resolvedTargetKind = targetKind(target);
    if (!resolvedTargetKind || !rule.supportedTargetKinds.includes(resolvedTargetKind)) {
      issues.push({
        ...base,
        type,
        issue: "unsupported_target",
        target: target || "<missing>",
      });
    }
  }
  return issues;
}

function checkAdditionalPair(card, row, skillKind, level) {
  if (skillKind !== "active") return [];
  const effectId = String(row?.additionalLiveActiveSkillEffectGroupId ?? "").trim();
  const triggerId = String(row?.additionalLiveSkillTriggerGroupId ?? "").trim();
  if (effectId && !triggerId) {
    return [{
      ...issueBase(card, skillKind, level, SKILL_CONTEXT.activeAdditional, "shape", effectId),
      issue: "additional_effect_without_trigger",
    }];
  }
  if (triggerId && !effectId) {
    return [{
      ...issueBase(card, skillKind, level, SKILL_CONTEXT.activeAdditional, "shape", triggerId),
      issue: "trigger_without_additional_effect",
    }];
  }
  return [];
}

function auditActiveLevel(card, row, level, masterRefs) {
  const issues = [];
  for (const field of ["coolTimeMillisecond", "activationProbabilityPermilMultiply", "effectDurationMillisecond"]) {
    if (row?.[field] == null || row[field] === "") {
      issues.push({
        ...issueBase(card, "active", level, SKILL_CONTEXT.activePrimary, "level"),
        issue: "missing_field",
        field,
      });
    }
  }
  issues.push(...checkMasterGroup({
    card,
    masterRefs,
    collection: "active_effects",
    groupId: row?.liveActiveSkillEffectGroupId,
    rules: CARD_SKILL_SUPPORT_REGISTRY.activeEffects,
    skillKind: "active",
    level,
    context: SKILL_CONTEXT.activePrimary,
    kind: "active_effect",
    required: true,
  }));
  issues.push(...checkMasterGroup({
    card,
    masterRefs,
    collection: "triggers",
    groupId: row?.additionalLiveSkillTriggerGroupId,
    rules: CARD_SKILL_SUPPORT_REGISTRY.triggers,
    skillKind: "active",
    level,
    context: SKILL_CONTEXT.activeAdditional,
    kind: "trigger",
  }));
  issues.push(...checkMasterGroup({
    card,
    masterRefs,
    collection: "active_effects",
    groupId: row?.additionalLiveActiveSkillEffectGroupId,
    rules: CARD_SKILL_SUPPORT_REGISTRY.activeEffects,
    skillKind: "active",
    level,
    context: SKILL_CONTEXT.activeAdditional,
    kind: "active_effect",
  }));
  issues.push(...checkAdditionalPair(card, row, "active", level));
  return issues;
}

function auditPassiveLevel(card, row, level, masterRefs) {
  return [
    ...checkMasterGroup({
      card,
      masterRefs,
      collection: "triggers",
      groupId: row?.liveSkillTriggerGroupId,
      rules: CARD_SKILL_SUPPORT_REGISTRY.triggers,
      skillKind: "passive",
      level,
      context: SKILL_CONTEXT.passive,
      kind: "trigger",
    }),
    ...checkMasterGroup({
      card,
      masterRefs,
      collection: "passive_effects",
      groupId: row?.livePassiveSkillEffectGroupId,
      rules: CARD_SKILL_SUPPORT_REGISTRY.passiveEffects,
      skillKind: "passive",
      level,
      context: SKILL_CONTEXT.passive,
      kind: "passive_effect",
      required: true,
    }),
  ];
}

function auditSpecialLevel(card, row, level, masterRefs) {
  const issues = [];
  if (row?.effectDurationMillisecond == null || row.effectDurationMillisecond === "") {
    issues.push({
      ...issueBase(card, "special", level, SKILL_CONTEXT.specialPrimary, "level"),
      issue: "missing_field",
      field: "effectDurationMillisecond",
    });
  }
  issues.push(...checkMasterGroup({
    card,
    masterRefs,
    collection: "active_effects",
    groupId: row?.liveActiveSkillEffectGroupId,
    rules: CARD_SKILL_SUPPORT_REGISTRY.activeEffects,
    skillKind: "special",
    level,
    context: SKILL_CONTEXT.specialPrimary,
    kind: "active_effect",
    required: true,
  }));
  issues.push(...checkMasterGroup({
    card,
    masterRefs,
    collection: "triggers",
    groupId: row?.additionalLiveSkillTriggerGroupId,
    rules: CARD_SKILL_SUPPORT_REGISTRY.triggers,
    skillKind: "special",
    level,
    context: SKILL_CONTEXT.specialAdditional,
    kind: "trigger",
  }));
  issues.push(...checkMasterGroup({
    card,
    masterRefs,
    collection: "active_effects",
    groupId: row?.additionalLiveActiveSkillEffectGroupId,
    rules: CARD_SKILL_SUPPORT_REGISTRY.activeEffects,
    skillKind: "special",
    level,
    context: SKILL_CONTEXT.specialAdditional,
    kind: "active_effect",
  }));
  if (row?.additionalLiveSkillTriggerGroupId && !row?.additionalLiveActiveSkillEffectGroupId) {
    issues.push({
      ...issueBase(card, "special", level, SKILL_CONTEXT.specialAdditional, "shape", row.additionalLiveSkillTriggerGroupId),
      issue: "trigger_without_additional_effect",
    });
  }
  return issues;
}

export function potentialSupportStatus(card) {
  const issues = [];
  const ignored = [];
  for (const effect of card?.growth?.potential_effects ?? []) {
    const suffix = potentialEffectTypeSuffix(effect);
    const rule = CARD_SKILL_SUPPORT_REGISTRY.potentialEffects[suffix];
    const base = issueBase(card, "potential", Number(effect?.upgradeCount) || 0, "potential", "potential_effect");
    if (!rule) {
      issues.push({
        ...base,
        type: String(effect?.effectType ?? effect?.type ?? "") || "<missing>",
        issue: "unsupported_type",
      });
      continue;
    }
    issues.push(...checkRequiredFields(effect, rule, { ...base, type: suffix }));
    if (rule.scoreScope === SCORE_SCOPE.ignored) {
      ignored.push({ cardId: card?.id ?? "<unknown-card>", type: suffix, upgradeCount: Number(effect?.upgradeCount) || 0 });
    }
  }
  return { understood: issues.length === 0, issues, ignored };
}

export function cardSkillSupportStatus(card, masterRefs) {
  const issues = [];
  const observed = {
    triggerTypes: new Set(),
    activeEffectTypes: new Set(),
    passiveEffectTypes: new Set(),
    potentialEffectTypes: new Set(),
  };
  const ignored = [];

  const registerGroupTypes = (collection, groupId, targetSet, rules) => {
    const id = String(groupId ?? "").trim();
    if (!id) return;
    for (const row of masterRefs?.[collection]?.[id] ?? []) {
      const type = typeString(row) || "<missing>";
      targetSet.add(type);
      if (rules?.[type]?.scoreScope === SCORE_SCOPE.ignored) {
        ignored.push({ cardId: card?.id ?? "<unknown-card>", groupId: id, type });
      }
    }
  };

  for (const [index, row] of (card?.skills?.active?.levels ?? []).entries()) {
    const level = finiteLevel(row, index + 1);
    registerGroupTypes("active_effects", row?.liveActiveSkillEffectGroupId, observed.activeEffectTypes, CARD_SKILL_SUPPORT_REGISTRY.activeEffects);
    registerGroupTypes("triggers", row?.additionalLiveSkillTriggerGroupId, observed.triggerTypes, CARD_SKILL_SUPPORT_REGISTRY.triggers);
    registerGroupTypes("active_effects", row?.additionalLiveActiveSkillEffectGroupId, observed.activeEffectTypes, CARD_SKILL_SUPPORT_REGISTRY.activeEffects);
    issues.push(...auditActiveLevel(card, row, level, masterRefs));
  }

  for (const [index, row] of (card?.skills?.passive?.levels ?? []).entries()) {
    const level = finiteLevel(row, index + 1);
    registerGroupTypes("triggers", row?.liveSkillTriggerGroupId, observed.triggerTypes, CARD_SKILL_SUPPORT_REGISTRY.triggers);
    registerGroupTypes("passive_effects", row?.livePassiveSkillEffectGroupId, observed.passiveEffectTypes, CARD_SKILL_SUPPORT_REGISTRY.passiveEffects);
    issues.push(...auditPassiveLevel(card, row, level, masterRefs));
  }

  for (const [index, row] of (card?.skills?.special?.levels ?? []).entries()) {
    const level = finiteLevel(row, index + 1);
    registerGroupTypes("active_effects", row?.liveActiveSkillEffectGroupId, observed.activeEffectTypes, CARD_SKILL_SUPPORT_REGISTRY.activeEffects);
    registerGroupTypes("triggers", row?.additionalLiveSkillTriggerGroupId, observed.triggerTypes, CARD_SKILL_SUPPORT_REGISTRY.triggers);
    registerGroupTypes("active_effects", row?.additionalLiveActiveSkillEffectGroupId, observed.activeEffectTypes, CARD_SKILL_SUPPORT_REGISTRY.activeEffects);
    issues.push(...auditSpecialLevel(card, row, level, masterRefs));
  }

  const potential = potentialSupportStatus(card);
  issues.push(...potential.issues);
  ignored.push(...potential.ignored);
  for (const effect of card?.growth?.potential_effects ?? []) {
    observed.potentialEffectTypes.add(potentialEffectTypeSuffix(effect) || "<missing>");
  }

  return {
    understood: issues.length === 0,
    issues,
    ignored,
    observed: {
      triggerTypes: [...observed.triggerTypes].sort(),
      activeEffectTypes: [...observed.activeEffectTypes].sort(),
      passiveEffectTypes: [...observed.passiveEffectTypes].sort(),
      potentialEffectTypes: [...observed.potentialEffectTypes].sort(),
    },
  };
}

export function auditCardSkillSupport(cards, masterRefs) {
  const observedTriggerTypes = new Set();
  const observedActiveEffectTypes = new Set();
  const observedPassiveEffectTypes = new Set();
  const observedPotentialEffectTypes = new Set();
  const issueKeys = new Set();
  const ignoredKeys = new Set();
  const unknownCards = [];

  for (const card of cards ?? []) {
    const status = cardSkillSupportStatus(card, masterRefs);
    status.observed.triggerTypes.forEach((type) => observedTriggerTypes.add(type));
    status.observed.activeEffectTypes.forEach((type) => observedActiveEffectTypes.add(type));
    status.observed.passiveEffectTypes.forEach((type) => observedPassiveEffectTypes.add(type));
    status.observed.potentialEffectTypes.forEach((type) => observedPotentialEffectTypes.add(type));
    status.ignored.forEach((row) => ignoredKeys.add(JSON.stringify(row)));
    if (!status.understood) {
      status.issues.forEach((issue) => issueKeys.add(JSON.stringify(issue)));
      unknownCards.push({
        cardId: card?.id ?? "<unknown-card>",
        characterName: card?.character_name ?? "",
        issues: status.issues,
      });
    }
  }

  return {
    registryVersion: CARD_SKILL_SUPPORT_REGISTRY.version,
    observedTriggerTypes: [...observedTriggerTypes].sort(),
    observedActiveEffectTypes: [...observedActiveEffectTypes].sort(),
    observedPassiveEffectTypes: [...observedPassiveEffectTypes].sort(),
    observedPotentialEffectTypes: [...observedPotentialEffectTypes].sort(),
    ignoredScoreEffects: [...ignoredKeys].map((value) => JSON.parse(value)),
    issues: [...issueKeys].map((value) => JSON.parse(value)),
    unknownCards,
    understood: unknownCards.length === 0,
  };
}

export function auditPotentialSupport(cards) {
  const unsupported = [];
  for (const card of cards ?? []) {
    const status = potentialSupportStatus(card);
    for (const issue of status.issues) {
      if (issue.kind !== "potential_effect") continue;
      unsupported.push({
        cardId: card?.id ?? "<unknown-card>",
        upgradeCount: issue.level ?? 0,
        effectType: issue.type ?? "<missing>",
        issue: issue.issue,
        field: issue.field ?? null,
      });
    }
  }
  return unsupported;
}
