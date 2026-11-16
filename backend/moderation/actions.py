"""Admin moderation actions. Every action is written to the moderation log."""

from django.db import transaction
from django.utils import timezone

from listings.models import Listing

from .models import BlockedPhone, Device, ModerationLog


def log(actor, action, target, note=''):
    target_type = 'listing' if isinstance(target, Listing) else (
        'device' if isinstance(target, Device) else 'user')
    ModerationLog.objects.create(actor=actor, action=action, target_type=target_type,
                                 target_id=target.pk, target_label=str(target)[:200], note=note)


def approve_listing(listing, actor, note=''):
    listing.review_status = Listing.Review.APPROVED
    listing.reviewed_at = timezone.now()
    listing.reviewed_by = actor
    listing.save(update_fields=['review_status', 'reviewed_at', 'reviewed_by'])
    log(actor, ModerationLog.Action.APPROVE_LISTING, listing, note)


def reject_listing(listing, actor, note=''):
    listing.review_status = Listing.Review.REJECTED
    listing.reviewed_at = timezone.now()
    listing.reviewed_by = actor
    listing.save(update_fields=['review_status', 'reviewed_at', 'reviewed_by'])
    log(actor, ModerationLog.Action.REJECT_LISTING, listing, note)


def suspend_user(user, actor, note=''):
    """Temporary: the user can't log in and their listings are hidden. Can be undone."""
    user.is_active = False
    user.save(update_fields=['is_active'])
    log(actor, ModerationLog.Action.SUSPEND_USER, user, note)


def reactivate_user(user, actor, note=''):
    user.is_active = True
    user.banned_at = None
    user.save(update_fields=['is_active', 'banned_at'])
    BlockedPhone.objects.filter(phone=user.phone).delete()
    log(actor, ModerationLog.Action.REACTIVATE_USER, user, note)


@transaction.atomic
def ban_user(user, actor, note=''):
    """Suspended for good, and their phone number and devices can't create new accounts."""
    user.is_active = False
    user.banned_at = timezone.now()
    user.save(update_fields=['is_active', 'banned_at'])
    if user.phone:
        BlockedPhone.objects.get_or_create(phone=user.phone,
                                           defaults={'reason': f'Banned user #{user.pk}'})
    Device.objects.filter(links__user=user).update(banned=True)
    log(actor, ModerationLog.Action.BAN_USER, user, note)
