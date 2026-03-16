"""Parse raw FIX messages into structured Python dicts."""
from __future__ import annotations
import simplefix


def parse_fix_message(msg: simplefix.FixMessage | bytes) -> dict:
    if isinstance(msg, (bytes, bytearray)):
        parser = simplefix.FixParser()
        parser.append_buffer(msg)
        msg = parser.get_message()
        if msg is None:
            return {"msg_type": "", "tags": {}, "raw_pairs": []}

    raw_pairs: list[dict] = []
    tags: dict[int, str] = {}
    msg_type = ""

    for tag_bytes, value_bytes in msg.pairs:
        tag = int(tag_bytes) if isinstance(tag_bytes, (bytes, bytearray)) else int(tag_bytes)
        value = value_bytes.decode("utf-8", errors="replace") if isinstance(value_bytes, (bytes, bytearray)) else str(value_bytes)
        raw_pairs.append({"tag": tag, "value": value})
        tags[tag] = value
        if tag == 35:
            msg_type = value

    return {"msg_type": msg_type, "tags": tags, "raw_pairs": raw_pairs}


def fix_message_to_raw_string(msg: simplefix.FixMessage | bytes) -> str:
    if isinstance(msg, simplefix.FixMessage):
        raw = msg.encode()
    elif isinstance(msg, (bytes, bytearray)):
        raw = msg
    else:
        return str(msg)
    return raw.decode("utf-8", errors="replace").replace("\x01", "|").rstrip("|")
