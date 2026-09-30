from __future__ import annotations

from .board_data import BOARD_FILES

CORE_REPO = "holodori-net/android-database"
UPSTREAM_REPO = CORE_REPO
UPSTREAM_REF = "main"
GITHUB_API_ROOT = "https://api.github.com"
RAW_GITHUB_ROOT = "https://raw.githubusercontent.com"

LOCALES = {
    "ko": {
        "repository": CORE_REPO,
        "language": "kor",
        "suffix": "Kor",
    },
    "en": {
        "repository": CORE_REPO,
        "language": "eng",
        "suffix": "Eng",
    },
    "ja": {
        "repository": CORE_REPO,
        "language": "jpn",
        "suffix": "Jpn",
    },
}

# Keep this list explicit so upstream schema changes remain reviewable. These are
# the inputs required to rebuild cards/characters/music/master_refs exactly.
MASTER_FILES = (
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

MASTER_FILES += BOARD_FILES
