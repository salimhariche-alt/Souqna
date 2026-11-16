"""Which listings can someone see? One rule, used everywhere (list, details, favorites,
starting a conversation, reporting).

A listing is visible when:
- it is approved (not flagged for review, not rejected),
- its seller is active (not suspended/banned) and not hidden after 3 reports,
- the viewer and the seller haven't blocked each other (either direction).
"""

from django.db.models import Q

from .models import Listing


def visible_listing_q(viewer=None, prefix=''):
    """A filter for visible listings. `prefix` is e.g. 'listing__' to filter favorites."""
    from moderation.models import Block  # here, to avoid a circular import

    def field(name):
        return prefix + name

    q = Q(**{field('review_status'): Listing.Review.APPROVED,
             field('seller__is_active'): True,
             field('seller__hidden_by_reports'): False})
    if viewer is not None and viewer.is_authenticated:
        i_blocked = Block.objects.filter(blocker=viewer).values('blocked')
        blocked_me = Block.objects.filter(blocked=viewer).values('blocker')
        q &= ~Q(**{field('seller__in'): i_blocked}) & ~Q(**{field('seller__in'): blocked_me})
    return q
