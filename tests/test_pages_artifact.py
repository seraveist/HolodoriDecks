import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('pages_artifact', ROOT / 'scripts/build-pages-artifact.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)


@pytest.mark.parametrize('relative', ['', 'data/generated/site', 'js/site', 'assets/site', 'scripts/site', '.git/site'])
def test_artifact_builder_rejects_source_and_input_directories(tmp_path, relative):
    repository = tmp_path / 'repo'
    repository.mkdir()
    with pytest.raises(ValueError, match='empty artifact directory'):
        builder.build(repository / relative, 'a' * 40, repository=repository)


def test_artifact_builder_does_not_mix_previous_output(tmp_path):
    repository, artifact = tmp_path / 'repo', tmp_path / 'site'
    repository.mkdir()
    artifact.mkdir()
    sentinel = artifact / 'old.js'
    sentinel.write_text('old build')
    with pytest.raises(ValueError):
        builder.build(artifact, 'a' * 40, repository=repository)
    assert sentinel.read_text() == 'old build'


def test_runtime_coherence_validation_rejects_mismatched_master(tmp_path):
    generated = tmp_path / 'data/generated'
    (generated / 'i18n').mkdir(parents=True)
    values = {
        'i18n/manifest.json': {'required_entry_count': 1, 'card_name_alias_count': 0, 'locales': {'ko': {}, 'en': {}, 'ja': {}}},
        'chart-index.json': {'source_commit': 'new-master', 'chart_count': 1},
        'exact-runtime-index.json': {'runtimeExactCount': 0, 'charts': {}, 'currentMasterSourceCommit': 'old-master', 'currentMasterChartCount': 1, 'source': {'sha256': 'a' * 64}},
    }
    for name, value in values.items():
        (generated / name).write_text(json.dumps(value))
    with pytest.raises(ValueError, match='stale Runtime Exact'):
        builder.validate_derived_data(tmp_path)
