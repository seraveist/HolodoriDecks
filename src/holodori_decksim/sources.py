from __future__ import annotations

CORE_REPO = "HolodoriDB/holodori-db-kor-diff"
UPSTREAM_REPO = CORE_REPO
UPSTREAM_REF = "main"
GITHUB_API_ROOT = "https://api.github.com"
RAW_GITHUB_ROOT = "https://raw.githubusercontent.com"

LOCALES = {
    "ko": {
        "repository": "HolodoriDB/holodori-db-kor-diff",
        "suffix": "Kor",
    },
    "en": {
        "repository": "HolodoriDB/holodori-db-eng-diff",
        "suffix": "Eng",
    },
    "ja": {
        "repository": "HolodoriDB/holodori-db-jpn-diff",
        "suffix": "Jpn",
    },
}

# Keep this list explicit so upstream schema changes remain reviewable. These are
# the inputs required to rebuild cards/characters/music/master_refs exactly.
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
    "LiveActiveSkillLevel.json",
    "LangGeneratedLiveActiveSkillLevel_Kor.json",
    "LivePassiveSkillLevel.json",
    "LangGeneratedLivePassiveSkillLevel_Kor.json",
    "LiveSpecialSkillLevel.json",
    "LangGeneratedLiveSpecialSkillLevel_Kor.json",
    "LiveSkillTrigger.json",
    "LangGeneratedLiveSkillTrigger_Kor.json",
    "LiveActiveSkillEffect.json",
    "LangGeneratedLiveActiveSkillEffect_Kor.json",
    "LivePassiveSkillEffect.json",
    "LangGeneratedLivePassiveSkillEffect_Kor.json",
)
