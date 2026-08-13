from __future__ import annotations

import re
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def test_release_version_metadata_is_aligned() -> None:
    version = _read("VERSION").strip()
    assert re.fullmatch(r"\d+\.\d+\.\d+", version)

    project = tomllib.loads(_read("pyproject.toml"))["project"]
    assert project["version"] == version

    readme = _read("README.md")
    changelog = _read("CHANGELOG.md")
    assert f"**v{version}**" in readme
    assert f"## [{version}]" in changelog


def test_v1_release_documents_exist_and_identify_project_status() -> None:
    assert "MIT License" in _read("LICENSE")
    notice = _read("NOTICE.md")
    assert "비공식 팬메이드" in notice
    assert "HolodoriDB/holodori-db-kor-diff" in notice
    assert "asciisyaez/yagoo-dori" in notice
    assert "orioncactus/pretendard" in notice


def test_readme_describes_current_engine_and_preset_semantics() -> None:
    readme = _read("README.md")
    assert "unit-score-v0.5-potential + song-score-v0.4-chart-timeline" in readme
    assert "이 카드를 반드시 사용" in readme
    assert "5! = 120" in readme
    assert "v1.1 계산 범위와 제한" in readme
    assert "Runtime Exact" in readme
    assert "Manual PERFECT FC" in readme

    stale_phrases = (
        "Unit Score Engine v0.4-potential",
        "잠긴 멤버 슬롯을 유지한 채",
        "현재 `music.json`에는 실제 노트 타임라인이 없으므로",
        "다음 릴리스 후보: Runtime Exact",
    )
    for phrase in stale_phrases:
        assert phrase not in readme


def test_local_test_matches_v1_preset_and_release_flow() -> None:
    local_test = _read("LOCAL_TEST.md")
    assert "멤버 프리셋을 예를 들어 `멤버 4`에 지정해도" in local_test
    assert "m0049 / EXPERT" in local_test
    assert "VERSION" in local_test
    assert "release.yml" in local_test
    assert "Unit Score Engine v0.4-potential" not in local_test


def test_release_workflow_uses_deployed_commit_and_version_file() -> None:
    workflow = _read(".github/workflows/release.yml")
    assert 'workflows: ["Deploy GitHub Pages"]' in workflow
    assert "workflow_run.head_sha" in workflow
    assert "VERSION" in workflow
    assert "gh release create" in workflow
