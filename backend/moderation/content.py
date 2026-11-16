"""Find insults, harassment, sexual content, threats and extremism in a text.

Both the text and each word in the lists are "cleaned" the same way first, so small
tricks don't hide a word:
- capitals, accents, Arabic vowel marks           "CONNÂRD" -> "connard"
- repeated letters                                 "connnnnard" -> "conard" (both sides)
- dots, dashes, stars inside a word               "con.nard", "c*nnard"
- letters separated by spaces or dots             "c o n n a r d", "c.o.n.n.a.r.d"
- number-for-letter swaps                          "c0nn4rd", "s@l0pe"
Darija written in Latin letters uses digits as letters (3 = ع, 7 = ح, 9 = ق), so for
those words a second version that keeps the digits is compared.

Latin words must match whole words (with common endings like "s"), so "con" never
matches "concert". Arabic words may carry the usual small prefixes and endings
(ال، و، ب... / ك، ه، ها...) but can't hide inside a longer word.
"""

import re
from dataclasses import dataclass, field

from .models import SEVERITY_OF, SEVERITY_RANK, ContentTerm
from .text import simplify

LEET = str.maketrans({'0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b',
                      '@': 'a', '$': 's', '€': 'e', '!': 'i', '|': 'i'})
# 3 or more single letters separated by spaces/dots/dashes: "c o n" / "c.o.n" / "c-o-n".
_SPACED_LETTERS = re.compile(r'(?<!\w)(?:\w[ .\-_*]+){2,}\w(?!\w)')
_SEPARATORS = re.compile(r'[ .\-_*]+')
# Dots, dashes, stars inside a word: "con.nard", "c*nnard".
_INSIDE_WORD = re.compile(r'(?<=\w)[.\-_*]+(?=\w)')
_APOSTROPHES = re.compile(r"['’`´]")
_REPEATS = re.compile(r'(.)\1+')
_SPACES = re.compile(r'\s+')

_ARABIC_LETTER = '؀-ۿ'
_ARABIC_PREFIX = r'(?:وال|بال|فال|كال|لل|ال|و|ف|ب|ل|ك)?'
_ARABIC_SUFFIX = r'(?:كم|هم|ها|نا|ات|ين|ك|ه|ي|ة)?'
_LATIN_ENDING = r'(?:es|s|e|x)?'


def _prepare(text: str) -> str:
    """Lowercase, no accents, apostrophes as spaces, spaced-out letters joined."""
    text = _APOSTROPHES.sub(' ', simplify(text))
    text = _SPACED_LETTERS.sub(lambda m: _SEPARATORS.sub('', m.group(0)), text)
    text = _INSIDE_WORD.sub('', text)
    return _SPACES.sub(' ', text).strip()


def forms(text: str) -> tuple[str, str]:
    """Two cleaned versions: (digits kept, numbers turned into letters).
    Repeated letters are squeezed in both."""
    prepared = _prepare(text)
    return (_REPEATS.sub(r'\1', prepared), _REPEATS.sub(r'\1', prepared.translate(LEET)))


def _is_arabic(phrase: str) -> bool:
    return any('؀' <= c <= 'ۿ' for c in phrase)


def _pattern(term: ContentTerm):
    """(regex, which form of the text to search: 0 = digits kept, 1 = numbers decoded)."""
    digits, decoded = forms(term.phrase)
    if not digits:
        return None
    if _is_arabic(digits):
        return re.compile(rf'(?<![{_ARABIC_LETTER}]){_ARABIC_PREFIX}{re.escape(digits)}'
                          rf'{_ARABIC_SUFFIX}(?![{_ARABIC_LETTER}])'), 0
    if term.language == ContentTerm.Language.DARIJA_LATIN:
        # Digits are letters here (3 = ع, 9 = ق): compare with the digits kept, exact word.
        return re.compile(rf'(?<![a-z0-9]){re.escape(digits)}(?![a-z0-9])'), 0
    return re.compile(rf'(?<![a-z0-9]){re.escape(decoded)}{_LATIN_ENDING}(?![a-z0-9])'), 1


@dataclass
class ContentMatch:
    category: str
    phrases: list[str] = field(default_factory=list)

    @property
    def severity(self) -> str:
        return SEVERITY_OF[self.category]


def scan(text: str, terms=None) -> list[ContentMatch]:
    """Everything found in the text, one entry per category, most severe first."""
    if not text or not text.strip():
        return []
    if terms is None:
        terms = ContentTerm.objects.filter(active=True)
    text_forms = forms(text)
    found: dict[str, ContentMatch] = {}
    for term in terms:
        compiled = _pattern(term)
        if compiled and compiled[0].search(text_forms[compiled[1]]):
            found.setdefault(term.category, ContentMatch(term.category)).phrases.append(term.phrase)
    return sorted(found.values(), key=lambda m: -SEVERITY_RANK[m.severity])


def worst(text: str) -> ContentMatch | None:
    """The most severe thing found (or None)."""
    matches = scan(text)
    return matches[0] if matches else None
