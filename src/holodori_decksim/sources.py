from __future__ import annotations

UPSTREAM_REPO = "HolodoriDB/holodori-db-kor-diff"
UPSTREAM_REF = "main"
COMMIT_API = f"https://api.github.com/repos/{UPSTREAM_REPO}/commits/{UPSTREAM_REF}"
RAW_ROOT = f"https://raw.githubusercontent.com/{UPSTREAM_REPO}"

# Keep this list explicit so upstream schema changes are reviewable.
MASTER_FILES = (
    "version.txt",
    "Card.json",
    "Character.json",
    "LangCard_Kor.json",
    "LangCharacter_Kor.json",
    "Music.json",
    "LangMusic_Kor.json",
    "CardLevel.json",
    "CardLevelLimit.json",
    "CardPotential.json",
    "LiveLeaderSkill.json",
    "LangGeneratedLiveLeaderSkill_Kor.json",
    "LiveActiveSkill.json",
    "LiveActiveSkillLevel.json",
    "LangGeneratedLiveActiveSkillLevel_Kor.json",
    "LivePassiveSkill.json",
    "LivePassiveSkillLevel.json",
    "LangGeneratedLivePassiveSkillLevel_Kor.json",
    "LiveSpecialSkill.json",
    "LiveSpecialSkillLevel.json",
    "LangGeneratedLiveSpecialSkillLevel_Kor.json",
    "LiveSkillTrigger.json",
    "LangGeneratedLiveSkillTrigger_Kor.json",
    "LiveActiveSkillEffect.json",
    "LangGeneratedLiveActiveSkillEffect_Kor.json",
    "LivePassiveSkillEffect.json",
    "LangGeneratedLivePassiveSkillEffect_Kor.json",
)
