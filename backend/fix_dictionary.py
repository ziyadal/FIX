"""FIX data dictionary -- maps tag numbers to names and enum values to descriptions."""
import xml.etree.ElementTree as ET
from pathlib import Path

_SCHEMA_PATH = Path(__file__).parent / "schemas" / "spot-fix-md.xml"


class FixDictionary:
    def __init__(self, schema_path: str | Path | None = None):
        self._tag_names: dict[int, str] = {}
        self._enum_values: dict[int, dict[str, str]] = {}
        self._parse(Path(schema_path) if schema_path else _SCHEMA_PATH)

    def _parse(self, path: Path) -> None:
        tree = ET.parse(path)
        root = tree.getroot()
        for field in root.iter("field"):
            if "number" not in field.attrib:
                continue
            tag_num = int(field.attrib["number"])
            tag_name = field.attrib["name"]
            self._tag_names[tag_num] = tag_name
            enums = {}
            for val in field.iter("value"):
                enums[val.attrib["enum"]] = val.attrib["description"]
            if enums:
                self._enum_values[tag_num] = enums

    def get_tag_name(self, tag: int | str) -> str:
        tag_num = int(tag)
        return self._tag_names.get(tag_num, f"Tag_{tag_num}")

    def get_enum_value(self, tag: int | str, value: str) -> str:
        tag_num = int(tag)
        enums = self._enum_values.get(tag_num, {})
        return enums.get(value, value)

    def describe_tag(self, tag: int | str, value: str) -> dict:
        tag_num = int(tag)
        return {
            "tag": tag_num,
            "name": self.get_tag_name(tag_num),
            "value": value,
            "description": self.get_enum_value(tag_num, value),
        }
