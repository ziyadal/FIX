"""Tests for FIX dictionary tag/enum lookups."""
import pytest
from backend.fix_dictionary import FixDictionary


@pytest.fixture(scope="module")
def dictionary():
    return FixDictionary()


class TestTagLookup:
    def test_known_tag_name(self, dictionary):
        """Standard FIX tags resolve to their names."""
        assert dictionary.get_tag_name(35) == "MsgType"
        assert dictionary.get_tag_name(55) == "Symbol"
        assert dictionary.get_tag_name(269) == "MDEntryType"

    def test_unknown_tag_returns_tag_number(self, dictionary):
        """Unknown tags return 'Tag_NNNNN' string."""
        assert dictionary.get_tag_name(99999) == "Tag_99999"

    def test_tag_name_from_string(self, dictionary):
        """Tags passed as strings are handled."""
        assert dictionary.get_tag_name("35") == "MsgType"


class TestEnumLookup:
    def test_msg_type_enum(self, dictionary):
        """MsgType enum values resolve to descriptions."""
        result35W = dictionary.get_enum_value(35, "W")
        assert result35W == "MARKET_DATA_SNAPSHOT"

    def test_md_entry_type_enum(self, dictionary):
        """MDEntryType enum values resolve."""
        bid = dictionary.get_enum_value(269, "0")
        assert bid == "BID"

    def test_unknown_enum_returns_raw_value(self, dictionary):
        """Unknown enum values return the raw value."""
        assert dictionary.get_enum_value(35, "ZZZ") == "ZZZ"

    def test_unknown_tag_enum_returns_raw_value(self, dictionary):
        """Enum lookup on unknown tag returns raw value."""
        assert dictionary.get_enum_value(99999, "X") == "X"


class TestDescribeTag:
    def test_describe_returns_full_info(self, dictionary):
        """describe_tag returns tag name, raw value, and human description."""
        result = dictionary.describe_tag(35, "W")
        assert result["tag"] == 35
        assert result["name"] == "MsgType"
        assert result["value"] == "W"
        assert result["description"] == "MARKET_DATA_SNAPSHOT"

    def test_describe_non_enum_tag(self, dictionary):
        """Non-enum tags have value as description."""
        result = dictionary.describe_tag(55, "BTCUSDT")
        assert result["name"] == "Symbol"
        assert result["value"] == "BTCUSDT"
        assert result["description"] == "BTCUSDT"
