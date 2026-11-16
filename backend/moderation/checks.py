"""Automatic checks that flag a listing for review.

A flagged listing becomes "pending_review": hidden from everyone except its seller
until an admin approves or rejects it. Checks only ever ADD flags; approving is
always a human decision.
"""

import statistics

from django.utils import timezone

from listings.models import Listing, ListingPhoto

from .images import SIMILAR_MAX_DIFFERENT_BITS, different_bits, is_too_plain
from .models import FlaggedKeyword
from .text import find_keywords, find_link, find_phone_number

LOW_PRICE_RATIO = 0.30        # less than 30% of the usual price...
MIN_LISTINGS_FOR_PRICE = 10   # ...once the category has at least 10 listings


def _price_flag(listing):
    others = (Listing.objects
              .filter(category=listing.category, review_status=Listing.Review.APPROVED)
              .exclude(pk=listing.pk)
              .values_list('price_dzd', flat=True))
    prices = list(others)
    if len(prices) < MIN_LISTINGS_FOR_PRICE:
        return None
    typical = statistics.median(prices)
    if listing.price_dzd < LOW_PRICE_RATIO * typical:
        return {'code': 'low_price',
                'detail': f'{listing.price_dzd} DA vs typical {round(typical)} DA '
                          f'in this category ({len(prices)} listings)'}
    return None


def _text_flags(listing):
    text = f'{listing.title}\n{listing.description}'
    flags = []
    phone = find_phone_number(text)
    if phone:
        flags.append({'code': 'contact_phone', 'detail': f'Phone number in the text: {phone}'})
    link = find_link(text)
    if link:
        flags.append({'code': 'contact_link', 'detail': f'Link in the text: {link}'})
    phrases = FlaggedKeyword.objects.filter(active=True).values_list('phrase', flat=True)
    words = find_keywords(text, phrases)
    if words:
        flags.append({'code': 'advance_payment', 'detail': 'Suspicious words: ' + ', '.join(words)})
    return flags


def photo_flag(photo):
    """Is this photo (almost) the same as a photo of ANOTHER seller's listing?"""
    if not photo.fingerprint or is_too_plain(photo.fingerprint):
        return None
    seller_id = photo.listing.seller_id
    others = (ListingPhoto.objects
              .exclude(listing__seller_id=seller_id)
              .exclude(fingerprint='')
              .values_list('fingerprint', 'listing_id'))
    for other_fp, other_listing_id in others:
        if is_too_plain(other_fp):
            continue
        if different_bits(photo.fingerprint, other_fp) <= SIMILAR_MAX_DIFFERENT_BITS:
            return {'code': 'duplicate_photo',
                    'detail': f'Photo {photo.position} looks like a photo of listing '
                              f'#{other_listing_id} (another seller)'}
    return None


def flag(listing, reasons):
    """Mark the listing as needing review and remember why (without duplicates)."""
    reasons = [r for r in reasons if r]
    if not reasons:
        return False
    known = {(r['code'], r['detail']) for r in listing.flag_reasons}
    listing.flag_reasons = listing.flag_reasons + [
        r for r in reasons if (r['code'], r['detail']) not in known]
    if listing.review_status != Listing.Review.PENDING:
        listing.review_status = Listing.Review.PENDING
        listing.flagged_at = timezone.now()
    listing.save(update_fields=['flag_reasons', 'review_status', 'flagged_at'])
    return True


def check_listing(listing):
    """Run the price and text checks (after creating or editing a listing)."""
    return flag(listing, [_price_flag(listing), *_text_flags(listing)])


def check_photo(photo):
    """Run the photo check (after uploading a photo)."""
    return flag(photo.listing, [photo_flag(photo)])
