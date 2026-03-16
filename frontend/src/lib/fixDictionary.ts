const TAG_NAMES: Record<number, string> = {
  8: "BeginString", 9: "BodyLength", 10: "Checksum",
  34: "MsgSeqNum", 35: "MsgType", 49: "SenderCompID",
  52: "SendingTime", 55: "Symbol", 56: "TargetCompID", 58: "Text",
  98: "EncryptMethod", 108: "HeartBtInt", 112: "TestReqID",
  141: "ResetSeqNumFlag", 146: "NoRelatedSym", 148: "Headline",
  262: "MDReqID", 263: "SubscriptionRequestType", 264: "MarketDepth",
  266: "AggregatedBook", 267: "NoMDEntryTypes", 268: "NoMDEntries",
  269: "MDEntryType", 270: "MDEntryPx", 271: "MDEntrySize",
  279: "MDUpdateAction", 320: "SecurityReqID",
  371: "RefTagID", 372: "RefMsgType", 373: "SessionRejectReason",
  553: "Username", 559: "SecurityListRequestType",
  562: "MinTradeVol", 893: "LastFragment", 969: "MinPriceIncrement",
  1140: "MaxTradeVol",
  25016: "ErrorCode", 25000: "RecvWindow",
};

const MSG_TYPE_NAMES: Record<string, string> = {
  "0": "Heartbeat", "1": "TestRequest", "3": "Reject",
  "5": "Logout", "A": "Logon", "B": "News",
  "V": "MarketDataRequest", "W": "MarketDataSnapshotFullRefresh",
  "X": "MarketDataIncrementalRefresh", "Y": "MarketDataRequestReject",
  "x": "SecurityListRequest", "y": "SecurityList",
  "XLQ": "LimitQuery", "XLR": "LimitResponse",
};

const MD_ENTRY_TYPES: Record<string, string> = {
  "0": "BID", "1": "OFFER", "2": "TRADE",
};

const MD_UPDATE_ACTIONS: Record<string, string> = {
  "0": "NEW", "1": "CHANGE", "2": "DELETE",
};

export function getTagName(tag: number): string {
  return TAG_NAMES[tag] || `Tag_${tag}`;
}

export function getMsgTypeName(value: string): string {
  return MSG_TYPE_NAMES[value] || value;
}

export function describeTagValue(tag: number, value: string): string {
  if (tag === 35) return MSG_TYPE_NAMES[value] || value;
  if (tag === 269) return MD_ENTRY_TYPES[value] || value;
  if (tag === 279) return MD_UPDATE_ACTIONS[value] || value;
  return value;
}
