"""Read an immutable android-database snapshot without changing the app's schema."""
from __future__ import annotations

import hashlib
import json
import os
import re
import time
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen

DATABASE_REPOSITORY = "holodori-net/android-database"
CONTRACT_REPOSITORY = "holodori-net/android-protos"
CACHE = Path(__file__).resolve().parents[2] / ".local" / "master-source"


def request_bytes(url: str) -> bytes:
    headers = {"User-Agent": "HolodoriDecks-sync", "Accept": "application/vnd.github+json"}
    token = os.getenv("GITHUB_TOKEN", "")
    if token and urlparse(url).hostname == "api.github.com":
        headers["Authorization"] = f"Bearer {token}"
    for attempt in range(3):
        try:
            with urlopen(Request(url, headers=headers), timeout=60) as response:
                return response.read()
        except OSError:
            if attempt == 2:
                raise
            time.sleep(attempt + 1)
    raise AssertionError("unreachable")


def read_source(repository: str, commit: str, path: str) -> bytes:
    if repository not in {DATABASE_REPOSITORY, CONTRACT_REPOSITORY}:
        raise ValueError(f"Unexpected master repository: {repository}")
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise ValueError("Master sources must be pinned to a commit")
    if path.startswith("/") or ".." in path.split("/"):
        raise ValueError("Invalid source path")
    target = CACHE / repository / commit / path
    if target.exists():
        return target.read_bytes()
    data = request_bytes(f"https://raw.githubusercontent.com/{repository}/{commit}/{path}")
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(target.suffix + ".tmp")
    temporary.write_bytes(data)
    temporary.replace(target)
    return data


def source_path(filename: str) -> str:
    match = re.fullmatch(r"(Lang\w+)_(Kor|Eng|Jpn)\.json", filename)
    if match:
        return f"languages/{ {'Kor': 'kor', 'Eng': 'eng', 'Jpn': 'jpn'}[match[2]]}/{match[1]}.json"
    if not re.fullmatch(r"[A-Za-z0-9]+\.json", filename):
        raise ValueError(f"Invalid master table: {filename}")
    return f"tables/{filename}"


class AndroidMaster:
    def __init__(self, commit: str):
        from google.protobuf.descriptor_pb2 import FileDescriptorSet

        self.commit = commit
        self.manifest = json.loads(read_source(DATABASE_REPOSITORY, commit, "manifest.json"))
        self.report = json.loads(read_source(DATABASE_REPOSITORY, commit, "report.json"))
        if self.manifest.get("schemaVersion") != 1 or not self.report.get("success"):
            raise ValueError("Unsuccessful or unsupported Android master snapshot")
        self.version = self.manifest["masterVersion"]
        if not re.fullmatch(r"[0-9a-f]{64}", self.version) or self.report.get("masterVersion") != self.version:
            raise ValueError("Android master/report version mismatch")
        if not {"kor", "eng", "jpn"} <= set(self.manifest.get("languages", [])):
            raise ValueError("Android master is missing required locales")
        self.files = {row["path"]: row for row in self.manifest["files"]}
        self.contract_commit = self.report["inputs"]["contractRevision"]
        descriptor_bytes = read_source(CONTRACT_REPOSITORY, self.contract_commit, "descriptor-set.pb")
        self.contract_sha256 = hashlib.sha256(descriptor_bytes).hexdigest()
        descriptors = FileDescriptorSet.FromString(descriptor_bytes)
        self.messages = {}
        self.enums = {}

        def collect_enum(enum, prefix):
            self.enums[f"{prefix}.{enum.name}"] = (enum.name, {v.number: v.name for v in enum.value})

        def collect(message, prefix):
            name = f"{prefix}.{message.name}"
            self.messages[name] = message
            for enum in message.enum_type:
                collect_enum(enum, name)
            for child in message.nested_type:
                collect(child, name)

        for file in descriptors.file:
            for enum in file.enum_type:
                collect_enum(enum, f".{file.package}")
            for message in file.message_type:
                collect(message, f".{file.package}")

    def _field(self, value, field):
        if field.type == field.TYPE_ENUM:
            enum_name, values = self.enums[field.type_name]
            if not isinstance(value, dict) or values.get(value.get("number")) != value.get("name"):
                raise ValueError(f"Unknown/inconsistent enum: {field.type_name}={value!r}")
            return f"{enum_name}_{value['name']}"
        if field.type == field.TYPE_MESSAGE:
            return self._message(value, field.type_name)
        # In particular, int64 strings stay strings: do not lose JS integer precision.
        return value

    def _message(self, row, message_name):
        if not isinstance(row, dict):
            raise ValueError(f"Expected object: {message_name}")
        fields = {f.name: f for f in self.messages[message_name].field}
        result = {}
        for name, value in row.items():
            if name not in fields:
                raise ValueError(f"Unknown Android field: {message_name}.{name}")
            field = fields[name]
            if field.type == field.TYPE_MESSAGE and self.messages[field.type_name].options.map_entry:
                value_field = self.messages[field.type_name].field[1]
                converted = {k: self._field(v, value_field) for k, v in value.items()}
            elif field.label == field.LABEL_REPEATED:
                converted = [self._field(item, field) for item in value]
            else:
                converted = self._field(value, field)
            camel = field.json_name or re.sub(r"_([a-z])", lambda m: m[1].upper(), name)
            result[camel] = converted
        return result

    def table(self, filename: str) -> tuple[str, str]:
        path = source_path(filename)
        if path not in self.files:
            raise ValueError(f"Required table absent from manifest: {path}")
        raw = read_source(DATABASE_REPOSITORY, self.commit, path)
        rows = json.loads(raw)
        if not isinstance(rows, list) or len(rows) != self.files[path]["rows"]:
            raise ValueError(f"Android table row count mismatch: {path}")
        table_name = Path(path).stem
        wrapped = []
        for row in rows:
            if path.startswith("languages/"):
                if "id" not in row or set(row) - {"id", "text"} or not all(isinstance(v, str) for v in row.values()):
                    raise ValueError(f"Invalid language row: {path}")
                data = dict(row)
            else:
                data = self._message(row, f".entity.master.{table_name}")
            # Existing normalizers also read primary keys from the outer envelope.
            outer = {key: value["number"] if isinstance(value, dict) and set(value) == {"name", "number"}
                     else value for key, value in row.items() if not isinstance(value, (list, dict))
                     or (isinstance(value, dict) and set(value) == {"name", "number"})}
            wrapped.append({**outer, "data": data})
        return json.dumps(wrapped, ensure_ascii=False), hashlib.sha256(raw).hexdigest()
