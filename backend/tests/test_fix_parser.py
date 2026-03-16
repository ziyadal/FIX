"""Tests for FIX message parser."""
import pytest
import simplefix
from backend.fix_parser import parse_fix_message, fix_message_to_raw_string


def _build_fix_message(pairs: list[tuple[int, str]]) -> simplefix.FixMessage:
    msg = simplefix.FixMessage()
    for tag, value in pairs:
        msg.append_pair(tag, value)
    return msg


class TestParseFixMessage:
    def test_parse_snapshot_message(self):
        msg = _build_fix_message([
            (8, "FIX.4.4"), (35, "W"), (49, "SPOT"), (56, "BMDWATCH"),
            (34, "5"), (52, "20260316-12:00:00.000"), (262, "req-001"),
            (55, "BTCUSDT"), (268, "2"),
            (269, "0"), (270, "50000.00"), (271, "1.5"),
            (269, "1"), (270, "50001.00"), (271, "2.0"),
            (10, "128"),
        ])
        result = parse_fix_message(msg)
        assert result["msg_type"] == "W"
        assert result["tags"][262] == "req-001"
        assert result["tags"][55] == "BTCUSDT"
        assert len(result["raw_pairs"]) > 0

    def test_parse_empty_message(self):
        msg = _build_fix_message([(8, "FIX.4.4"), (35, "0"), (34, "1"), (10, "000")])
        result = parse_fix_message(msg)
        assert result["msg_type"] == "0"

    def test_parse_repeating_group(self):
        msg = _build_fix_message([
            (8, "FIX.4.4"), (35, "W"), (34, "1"), (268, "2"),
            (269, "0"), (270, "100.00"), (269, "1"), (270, "101.00"), (10, "000"),
        ])
        result = parse_fix_message(msg)
        assert len(result["raw_pairs"]) >= 6


class TestFixMessageToRawString:
    def test_raw_string_format(self):
        msg = _build_fix_message([(8, "FIX.4.4"), (35, "0"), (34, "1"), (10, "000")])
        raw = fix_message_to_raw_string(msg)
        assert "8=FIX.4.4" in raw
        assert "35=0" in raw
        assert "|" in raw

    def test_raw_string_from_bytes(self):
        raw_bytes = b"8=FIX.4.4\x0135=0\x0134=1\x0110=000\x01"
        raw = fix_message_to_raw_string(raw_bytes)
        assert "8=FIX.4.4" in raw
        assert "|" in raw
