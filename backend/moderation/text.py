"""Find phone numbers, links and suspicious words in a listing's text."""

import re
import unicodedata

# Arabic vowel marks (tashkeel), superscript alef and the stretching line (tatweel).
_ARABIC_MARKS = re.compile('[ً-ٰٟـ]')
_ARABIC_LETTERS = str.maketrans({'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ى': 'ي', 'ة': 'ه'})
_ARABIC_DIGITS = str.maketrans('٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789')


def simplify(text: str) -> str:
    """Lowercase, no accents ("Versément" -> "versement"), no Arabic vowel marks,
    one form of alef, Western digits - so small tricks don't hide a word."""
    text = (text or '').lower().translate(_ARABIC_DIGITS)
    text = _ARABIC_MARKS.sub('', text).translate(_ARABIC_LETTERS)
    # Remove Latin accents (but keep Arabic letters, which NFD leaves alone).
    decomposed = unicodedata.normalize('NFD', text)
    return ''.join(c for c in decomposed if unicodedata.category(c) != 'Mn' or '؀' <= c <= 'ۿ')


# 9 or more digits, possibly with spaces/dots/dashes between them:
# "0555123456", "0555 12 34 56", "+213 555 12 34 56", "0.5.5.5.1.2.3.4.5.6".
_PHONE = re.compile(r'(?:\+?\d[\s.\-/]*){9,}')
_LINK = re.compile(
    r'https?://|www\.|\b(?:wa\.me|t\.me|bit\.ly|m\.me)\b|'
    r'\b[a-z0-9-]+\.(?:com|dz|net|org|fr|me|ly|io|info|shop|store)\b'
)


def find_phone_number(text: str) -> str | None:
    match = _PHONE.search(simplify(text))
    return match.group(0).strip() if match else None


def find_link(text: str) -> str | None:
    match = _LINK.search(simplify(text))
    return match.group(0) if match else None


def _is_latin(phrase: str) -> bool:
    return all(ord(c) < 0x0600 for c in phrase)


def find_keywords(text: str, phrases) -> list[str]:
    """The phrases (e.g. "versement", "دفع مسبق") that appear in the text.

    Latin phrases must match whole words ("avance" doesn't match "avancement");
    Arabic phrases match anywhere, because Arabic attaches small words to them
    ("بالتحويل" contains "تحويل").
    """
    simple = simplify(text)
    found = []
    for phrase in phrases:
        needle = simplify(phrase).strip()
        if not needle:
            continue
        if _is_latin(needle):
            if re.search(r'(?<![a-z0-9])' + re.escape(needle) + r'(?![a-z0-9])', simple):
                found.append(phrase)
        elif needle in simple:
            found.append(phrase)
    return found
