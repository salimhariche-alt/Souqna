"""Photo privacy (remove hidden data) and photo fingerprints (find copies)."""

from io import BytesIO

from django.core.files.base import ContentFile
from PIL import Image, ImageOps

# How many of the 64 fingerprint bits may differ for two photos to count as
# "the same photo" (resized, recompressed, slightly brightened...).
SIMILAR_MAX_DIFFERENT_BITS = 6


def strip_hidden_data(uploaded) -> ContentFile:
    """Re-save the photo without its hidden data (EXIF: GPS location, phone model,
    date...). The photo is turned upright first, since that info is also in EXIF."""
    uploaded.seek(0)
    with Image.open(uploaded) as original:
        image = ImageOps.exif_transpose(original)  # keep it the right way up
        keep_transparency = image.mode in ('RGBA', 'LA', 'P') and original.format == 'PNG'
        if keep_transparency:
            image = image.convert('RGBA')
            fmt, extension, options = 'PNG', 'png', {'optimize': True}
        else:
            image = image.convert('RGB')
            fmt, extension, options = 'JPEG', 'jpg', {'quality': 88, 'optimize': True}
        clean = Image.new(image.mode, image.size)  # a brand-new image: no hidden data at all
        clean.paste(image)
        buffer = BytesIO()
        clean.save(buffer, format=fmt, **options)

    name = (getattr(uploaded, 'name', None) or 'photo').rsplit('.', 1)[0]
    return ContentFile(buffer.getvalue(), name=f'{name}.{extension}')


AVATAR_SIZE = 600  # profile photos are shown small: 600 x 600 is plenty


def make_avatar(uploaded) -> ContentFile:
    """A profile photo: upright, at most 600 x 600, saved again as a new JPEG (so no
    hidden data like the GPS location is kept)."""
    uploaded.seek(0)
    with Image.open(uploaded) as original:
        image = ImageOps.exif_transpose(original).convert('RGB')
        image.thumbnail((AVATAR_SIZE, AVATAR_SIZE), Image.LANCZOS)
        clean = Image.new('RGB', image.size)
        clean.paste(image)
        buffer = BytesIO()
        clean.save(buffer, format='JPEG', quality=85, optimize=True)
    return ContentFile(buffer.getvalue(), name='avatar.jpg')


def fingerprint(file) -> str:
    """A 16-character "difference hash": the photo shrunk to 9x8 grey squares, then one
    bit per square saying "brighter than the square on its right?". Copies of the
    same photo give (almost) the same 64 bits, even resized or recompressed."""
    file.seek(0)
    with Image.open(file) as image:
        small = ImageOps.exif_transpose(image).convert('L').resize((9, 8), Image.LANCZOS)
        pixels = list(small.getdata())
    file.seek(0)
    bits = 0
    for row in range(8):
        for col in range(8):
            left = pixels[row * 9 + col]
            right = pixels[row * 9 + col + 1]
            bits = (bits << 1) | (1 if left > right else 0)
    return f'{bits:016x}'


def different_bits(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count('1')


def is_too_plain(fp: str) -> bool:
    """Almost-blank photos (one colour) all look alike - don't compare those."""
    ones = bin(int(fp, 16)).count('1')
    return ones < 6 or ones > 58
