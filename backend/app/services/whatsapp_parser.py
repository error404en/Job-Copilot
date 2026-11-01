"""
WhatsApp chat export parser (user-supplied exports only).

Pipeline pieces:
  read_export_text()  -> raw chat text from .txt / .zip (zip-safe, size-capped)
  parse_messages()    -> normalized messages
                         {"timestamp", "sender", "text", "source", ...}
  prefilter_messages()-> permissive, deterministic noise reduction (NOT the
                         final decision; the LLM + resolver decide)
  chunk_messages()    -> LLM-sized chunks

Nothing here talks to WhatsApp. Phone numbers are stripped from anything that
leaves this module for persistence; the raw export is never stored or logged.
"""
import io
import re
import zipfile
from datetime import datetime
from typing import Dict, List, Optional, Tuple

MAX_EXPORT_BYTES = 20 * 1024 * 1024        # max decompressed chat size
MAX_ZIP_RATIO = 200                         # compression-ratio (zip bomb) guard
MAX_ZIP_ENTRIES = 5000

# Handles Android ("12/05/26, 9:41 pm - Name: msg"), iOS ("[12/05/26, 9:41:03 PM] Name: msg"),
# 12h/24h, optional seconds, "/", "." or "-" date separators, and "at"/"," between date and time.
_MSG_START = re.compile(
    r"^\u200e?\[?"
    r"(?P<d1>\d{1,2})[/.\-](?P<d2>\d{1,2})[/.\-](?P<y>\d{2,4})"
    r"(?:,\s*|\s+at\s+|\s+)"
    r"(?P<h>\d{1,2}):(?P<m>\d{2})(?::(?P<s>\d{2}))?"
    r"\s*(?P<ap>[APap]\.?[Mm]\.?)?"
    r"\]?\s*(?:[-\u2013\u2014]\s*)?"
)
_SENDER = re.compile(r"^(?P<sender>[^:\n]{1,60}?):\s(?P<body>.*)$", re.S)

_PHONE = re.compile(r"(?<![\w/])(?:\+?\d[\d\s\-()]{8,}\d)(?![\w/])")
_URL = re.compile(r"https?://[^\s<>\"')]+", re.I)

_MEDIA_PLACEHOLDER = re.compile(
    r"^\s*(?:<media omitted>|<attached:[^>]*>|(?:image|video|audio|sticker|gif|document|contact card|"
    r"voice call|video call)\s+omitted)\s*$",
    re.I,
)
_DELETED_PLACEHOLDER = re.compile(
    r"^\s*(?:this message was deleted|you deleted this message|message deleted)\.?\s*$", re.I
)
_SYSTEM_MARKERS = (
    "messages and calls are end-to-end encrypted",
    "joined using this group's invite link",
    "joined using this community",
    "changed the group description",
    "changed this group's icon",
    "changed the subject",
    "created group",
    "created this group",
    "added you",
    "you were added",
    "security code changed",
    "missed voice call",
    "missed video call",
)

_JOB_SIGNALS = re.compile(
    r"\b(hiring|hire|opening|openings|vacanc(?:y|ies)|job|jobs|intern|internship|interns|"
    r"fresher|freshers|graduate|graduates|campus|apply|application|applications|ctc|lpa|"
    r"salary|stipend|package|referral|referrals|careers?|roles?|positions?|sde|sde-?\d|swe|"
    r"software engineer|software developer|developer|engineer|ml engineer|ai engineer|"
    r"data analyst|data scientist|analyst|remote|work from home|wfh|recruit\w*|"
    r"walk-?in|we are looking|looking for|batch|off-?campus)\b",
    re.I,
)
_BATCH_YEAR = re.compile(r"\b20(2[4-9]|3\d)\s*(?:batch|passout|pass-out|grad\w*)\b", re.I)
_NOISE_ONLY = re.compile(r"^[\W_]*$")


def strip_pii(text: str) -> str:
    """Remove phone numbers; URLs are preserved (they are the lead)."""
    if not text:
        return ""
    urls = _URL.findall(text)
    masked = text
    for i, u in enumerate(urls):
        masked = masked.replace(u, f"__URL{i}__", 1)
    masked = _PHONE.sub("[phone removed]", masked)
    for i, u in enumerate(urls):
        masked = masked.replace(f"__URL{i}__", u, 1)
    return masked.strip()


def _decode(data: bytes) -> str:
    for enc in ("utf-8-sig", "utf-8", "utf-16", "latin-1"):
        try:
            return data.decode(enc)
        except (UnicodeDecodeError, UnicodeError):
            continue
    return ""


def _safe_member(name: str) -> bool:
    n = name.replace("\\", "/")
    return not (n.startswith("/") or ".." in n.split("/") or re.match(r"^[A-Za-z]:", n))


def read_export_text(data: bytes, filename: str = "") -> str:
    """Return chat text from a .txt or .zip export.

    Zip members are read in-memory only (never extracted to disk), unsafe member
    names are ignored, and decompressed size / ratio are capped. Raises ValueError
    with a user-safe message when the archive is unusable.
    """
    if filename.lower().endswith(".zip") or data[:2] == b"PK":
        try:
            zf = zipfile.ZipFile(io.BytesIO(data))
        except zipfile.BadZipFile:
            raise ValueError("That file is not a valid ZIP archive.")
        with zf:
            infos = zf.infolist()
            if len(infos) > MAX_ZIP_ENTRIES:
                raise ValueError("The archive contains too many files.")
            txts = [
                i for i in infos
                if not i.is_dir() and i.filename.lower().endswith(".txt") and _safe_member(i.filename)
            ]
            if not txts:
                raise ValueError("No chat .txt file found in the ZIP export.")

            def rank(i: zipfile.ZipInfo) -> Tuple[int, int]:
                base = i.filename.replace("\\", "/").rsplit("/", 1)[-1].lower()
                return (0 if base == "_chat.txt" else 1 if base.startswith("whatsapp chat") else 2, -i.file_size)

            chosen = sorted(txts, key=rank)[0]
            if chosen.file_size > MAX_EXPORT_BYTES:
                raise ValueError("The chat export is too large to process.")
            if chosen.compress_size and chosen.file_size / max(chosen.compress_size, 1) > MAX_ZIP_RATIO:
                raise ValueError("The archive looks unsafe and was rejected.")
            with zf.open(chosen) as fh:  # read at most limit+1 even if header lies
                raw = fh.read(MAX_EXPORT_BYTES + 1)
            if len(raw) > MAX_EXPORT_BYTES:
                raise ValueError("The chat export is too large to process.")
            data = raw
    elif len(data) > MAX_EXPORT_BYTES:
        raise ValueError("The chat export is too large to process.")
    return _decode(data)


def _detect_day_first(chat_text: str) -> bool:
    """Heuristic: if any first number >12 it's day-first; if any second >12, month-first. Default day-first."""
    day_first_votes = month_first_votes = 0
    for line in chat_text.splitlines()[:5000]:
        m = _MSG_START.match(line)
        if not m:
            continue
        a, b = int(m.group("d1")), int(m.group("d2"))
        if a > 12:
            day_first_votes += 1
        elif b > 12:
            month_first_votes += 1
    return not (month_first_votes > day_first_votes)


def _build_timestamp(m: "re.Match", day_first: bool) -> Optional[str]:
    try:
        a, b, y = int(m.group("d1")), int(m.group("d2")), int(m.group("y"))
        day, month = (a, b) if day_first else (b, a)
        if y < 100:
            y += 2000
        hour, minute = int(m.group("h")), int(m.group("m"))
        ap = (m.group("ap") or "").lower().replace(".", "")
        if ap == "pm" and hour < 12:
            hour += 12
        elif ap == "am" and hour == 12:
            hour = 0
        return datetime(y, month, day, hour, minute, int(m.group("s") or 0)).isoformat()
    except (ValueError, TypeError):
        return None


def parse_messages(chat_text: str) -> List[Dict]:
    """Parse export text into normalized messages (multi-line aware).

    Each message: {timestamp, sender, text, source, is_system, is_media, is_deleted}.
    Lines before the first timestamped line, or malformed lines, are attached to the
    previous message or ignored; the parser never raises on bad input.
    """
    if not chat_text:
        return []
    text = chat_text.replace("\u200e", "").replace("\u202f", " ").replace("\u00a0", " ")
    day_first = _detect_day_first(text)
    messages: List[Dict] = []
    current: Optional[Dict] = None

    def finish():
        nonlocal current
        if current is None:
            return
        body = "\n".join(current["_lines"]).strip()
        current.pop("_lines")
        current["text"] = body
        current["is_media"] = bool(_MEDIA_PLACEHOLDER.match(body))
        current["is_deleted"] = bool(_DELETED_PLACEHOLDER.match(body))
        low = body.lower()
        if current["sender"] is None or any(mk in low for mk in _SYSTEM_MARKERS):
            if current["sender"] is None or len(body) < 160:
                current["is_system"] = True
        messages.append(current)
        current = None

    for line in text.split("\n"):
        line = line.rstrip("\r")
        m = _MSG_START.match(line)
        if m:
            finish()
            rest = line[m.end():]
            sm = _SENDER.match(rest)
            current = {
                "timestamp": _build_timestamp(m, day_first),
                "sender": sm.group("sender").strip() if sm else None,
                "source": "whatsapp",
                "is_system": False,
                "_lines": [sm.group("body") if sm else rest],
            }
        elif current is not None:
            current["_lines"].append(line)
        # else: header junk / malformed line before first message -> ignored
    finish()
    return messages


def is_phone_like(value: Optional[str]) -> bool:
    return bool(value) and bool(re.fullmatch(r"[+\d][\d\s\-()]{6,}", value.strip()))


def prefilter_messages(messages: List[Dict]) -> List[Dict]:
    """Permissive deterministic pre-filter. Keeps anything that *might* be a lead.

    Dropped: system messages, media/deleted placeholders, empty/punctuation-only text.
    Kept: any message with a job signal, a batch-year mention, or a URL.
    """
    kept: List[Dict] = []
    for msg in messages:
        if msg.get("is_system") or msg.get("is_media") or msg.get("is_deleted"):
            continue
        body = (msg.get("text") or "").strip()
        if len(body) < 12 or _NOISE_ONLY.match(body):
            continue
        if _JOB_SIGNALS.search(body) or _BATCH_YEAR.search(body) or _URL.search(body):
            kept.append(msg)
    return kept


def sanitize_message(msg: Dict) -> Dict:
    """PII-minimized copy suitable for LLM input and persistence (no phone numbers)."""
    sender = msg.get("sender")
    return {
        "timestamp": msg.get("timestamp"),
        "sender": None if (not sender or is_phone_like(sender)) else strip_pii(sender),
        "text": strip_pii(msg.get("text") or ""),
        "source": "whatsapp",
    }


def chunk_messages(messages: List[Dict], max_chars: int = 6000, max_messages: int = 25) -> List[List[Dict]]:
    """Group messages into LLM-sized chunks."""
    chunks: List[List[Dict]] = []
    cur: List[Dict] = []
    size = 0
    for msg in messages:
        n = len(msg.get("text") or "") + 40
        if cur and (size + n > max_chars or len(cur) >= max_messages):
            chunks.append(cur)
            cur, size = [], 0
        cur.append(msg)
        size += n
    if cur:
        chunks.append(cur)
    return chunks


def parse_export(data: bytes, filename: str = "") -> Dict:
    """High-level: bytes -> {messages_total, relevant, messages(sanitized relevant)}."""
    chat_text = read_export_text(data, filename)
    all_msgs = parse_messages(chat_text)
    relevant = prefilter_messages(all_msgs)
    return {
        "messages_total": len(all_msgs),
        "messages_relevant": len(relevant),
        "messages": [sanitize_message(m) for m in relevant],
    }
