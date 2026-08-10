from __future__ import annotations

UPSTREAM_REPO = "HolodoriDB/holodori-db-kor-diff"
RAW_BASE = "https://raw.githubusercontent.com/HolodoriDB/holodori-db-kor-diff/main"

# Keep this list explicit so upstream schema changes are reviewable.
MASTER_FILES = (
    "version.txt",
    "Card.json",
    "Character.json",
    "LangCard_Kor.json",
    "LangCharacter_Kor.json",
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
    "LivePassiveSkillEffect.json",
)
