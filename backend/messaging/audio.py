"""Check an uploaded voice message without trusting its name or what the app says.

Accepted: AAC audio, either in an M4A/MP4 container (what phones record) or as raw
ADTS AAC (.aac). Max 1 MB and 60 seconds. The duration is read from the file itself.
"""

MAX_AUDIO_BYTES = 1024 * 1024  # 1 MB
MAX_DURATION_MS = 60_000
# Recorders stop a fraction of a second late: allow a little extra.
DURATION_TOLERANCE_MS = 1_500
MIN_DURATION_MS = 500  # shorter = an accidental tap

# ADTS sampling-frequency index -> samples per second.
_ADTS_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025,
               8000, 7350]


class AudioError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _not_supported():
    return AudioError('audio_not_supported',
                      'Voice messages must be AAC audio (M4A or AAC file).')


# MP4 / M4A ----------------------------------------------------------------------------

def _boxes(data: bytes, start: int, end: int):
    """The MP4 "boxes" between start and end: (type, content start, box end)."""
    i = start
    while i + 8 <= end:
        size = int.from_bytes(data[i:i + 4], 'big')
        kind = data[i + 4:i + 8]
        header = 8
        if size == 1:  # 64-bit size
            if i + 16 > end:
                raise _not_supported()
            size = int.from_bytes(data[i + 8:i + 16], 'big')
            header = 16
        elif size == 0:  # until the end
            size = end - i
        if size < header or i + size > end:
            raise _not_supported()
        yield kind, i + header, i + size
        i += size


def _child(data, start, end, kind):
    for box_kind, content, box_end in _boxes(data, start, end):
        if box_kind == kind:
            return content, box_end
    return None


def _mp4_duration_ms(data: bytes) -> int:
    moov = _child(data, 0, len(data), b'moov')
    if moov is None:
        raise _not_supported()
    mvhd = _child(data, *moov, b'mvhd')
    if mvhd is None:
        raise _not_supported()
    p = mvhd[0]
    version = data[p]
    if version == 1:
        timescale = int.from_bytes(data[p + 20:p + 24], 'big')
        duration = int.from_bytes(data[p + 24:p + 32], 'big')
    else:
        timescale = int.from_bytes(data[p + 12:p + 16], 'big')
        duration = int.from_bytes(data[p + 16:p + 20], 'big')
    if not timescale:
        raise _not_supported()

    # Every track must be sound ("soun"), at least one, and the codec must be AAC (mp4a).
    tracks = 0
    for kind, content, end in _boxes(data, *moov):
        if kind != b'trak':
            continue
        tracks += 1
        mdia = _child(data, content, end, b'mdia')
        hdlr = mdia and _child(data, *mdia, b'hdlr')
        # hdlr: version/flags (4) + pre_defined (4) + handler type (4)
        if not hdlr or data[hdlr[0] + 8:hdlr[0] + 12] != b'soun':
            raise _not_supported()  # e.g. a video track
    if tracks == 0 or b'mp4a' not in data[moov[0]:moov[1]]:
        raise _not_supported()
    return round(duration * 1000 / timescale)


# Raw ADTS AAC -------------------------------------------------------------------------

def _adts_duration_ms(data: bytes) -> int:
    i, samples, rate = 0, 0, None
    while i + 7 <= len(data):
        header = data[i:i + 7]
        if header[0] != 0xFF or (header[1] & 0xF6) != 0xF0:
            raise _not_supported()
        rate_index = (header[2] & 0x3C) >> 2
        if rate_index >= len(_ADTS_RATES):
            raise _not_supported()
        rate = _ADTS_RATES[rate_index]
        length = ((header[3] & 0x03) << 11) | (header[4] << 3) | ((header[5] & 0xE0) >> 5)
        if length < 7:
            raise _not_supported()
        samples += ((header[6] & 0x03) + 1) * 1024
        i += length
    if not samples or not rate:
        raise _not_supported()
    return round(samples * 1000 / rate)


# The check ----------------------------------------------------------------------------

def inspect_audio(uploaded) -> tuple[int, str]:
    """Check a voice message file. Returns (duration in ms, file extension).

    Raises AudioError with a code: audio_too_big, audio_not_supported,
    audio_too_long or audio_too_short.
    """
    if uploaded.size > MAX_AUDIO_BYTES:
        raise AudioError('audio_too_big', 'Voice messages can be at most 1 MB.')
    data = uploaded.read()
    uploaded.seek(0)

    try:
        if len(data) >= 12 and data[4:8] == b'ftyp':
            duration, extension = _mp4_duration_ms(data), '.m4a'
        elif len(data) >= 7 and data[0] == 0xFF and (data[1] & 0xF6) == 0xF0:
            duration, extension = _adts_duration_ms(data), '.aac'
        else:
            raise _not_supported()
    except IndexError:  # a damaged or cut-off file
        raise _not_supported() from None

    if duration > MAX_DURATION_MS + DURATION_TOLERANCE_MS:
        raise AudioError('audio_too_long', 'Voice messages can be at most 60 seconds long.')
    if duration < MIN_DURATION_MS:
        raise AudioError('audio_too_short', 'This voice message is too short.')
    return min(duration, MAX_DURATION_MS), extension
