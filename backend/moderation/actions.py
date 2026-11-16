"""Admin moderation actions. Every action is written to the moderation log."""

from django.db import transaction
from django.utils import timezone

from listings.models import Listing

from .models import BlockedPhone, Device, ModerationLog, Report

REPORTED = 'reported'  # the flag reason code added when 3 users report a listing


def log(actor, action, target, note=''):
    target_type = 'listing' if isinstance(target, Listing) else (
        'device' if isinstance(target, Device) else 'user')
    ModerationLog.objects.create(actor=actor, action=action, target_type=target_type,
                                 target_id=target.pk, target_label=str(target)[:200], note=note)


def close_reports(reports, status, actor):
    """Mark the still-open reports in `reports` as handled."""
    return (reports.filter(status=Report.Status.OPEN)
            .update(status=status, handled_at=timezone.now(), handled_by=actor))


def approve_listing(listing, actor, note=''):
    listing.review_status = Listing.Review.APPROVED
    listing.reviewed_at = timezone.now()
    listing.reviewed_by = actor
    listing.save(update_fields=['review_status', 'reviewed_at', 'reviewed_by'])
    # Checked and fine: the reports about it are dismissed (so they don't hide it again).
    close_reports(Report.objects.filter(target_type=Report.Target.LISTING, listing=listing),
                  Report.Status.DISMISSED, actor)
    log(actor, ModerationLog.Action.APPROVE_LISTING, listing, note)


def reject_listing(listing, actor, note=''):
    listing.review_status = Listing.Review.REJECTED
    listing.reviewed_at = timezone.now()
    listing.reviewed_by = actor
    listing.save(update_fields=['review_status', 'reviewed_at', 'reviewed_by'])
    close_reports(Report.objects.filter(target_type=Report.Target.LISTING, listing=listing),
                  Report.Status.ACTIONED, actor)
    log(actor, ModerationLog.Action.REJECT_LISTING, listing, note)


def suspend_user(user, actor, note=''):
    """Temporary: the user can't log in and their listings are hidden. Can be undone."""
    user.is_active = False
    user.save(update_fields=['is_active'])
    log(actor, ModerationLog.Action.SUSPEND_USER, user, note)


def reactivate_user(user, actor, note=''):
    user.is_active = True
    user.banned_at = None
    user.hidden_by_reports = False
    user.save(update_fields=['is_active', 'banned_at', 'hidden_by_reports'])
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
    # Every open report about them (their listings, messages, profile) is now handled.
    close_reports(Report.objects.filter(reported_user=user), Report.Status.ACTIONED, actor)
    log(actor, ModerationLog.Action.BAN_USER, user, note)


# Reports ----------------------------------------------------------------------------

def _report_note(report):
    return f'Report #{report.pk}: {report.get_reason_display()}'


@transaction.atomic
def approve_report(report, actor):
    """The report is right. Listing -> rejected. User or message -> the person is
    suspended (can be undone with "Reactivate")."""
    note = _report_note(report)
    if report.target_type == Report.Target.LISTING:
        reject_listing(report.listing, actor, note)  # also closes the listing's reports
    else:
        suspend_user(report.reported_user, actor, note)
    close_reports(report.same_target(), Report.Status.ACTIONED, actor)


@transaction.atomic
def dismiss_report(report, actor):
    """Nothing wrong: close the reports about this item and show it again."""
    note = _report_note(report)
    close_reports(report.same_target(), Report.Status.DISMISSED, actor)
    if report.target_type == Report.Target.LISTING:
        listing = report.listing
        other_reasons = [r for r in listing.flag_reasons if r.get('code') != REPORTED]
        if len(other_reasons) != len(listing.flag_reasons):
            listing.flag_reasons = other_reasons
            listing.save(update_fields=['flag_reasons'])
        # Hidden only because of the reports? Then it's visible again. (If the automatic
        # checks also flagged it, it stays in "Needs review".)
        if listing.review_status == Listing.Review.PENDING and not other_reasons:
            approve_listing(listing, actor, note)
            return
        log(actor, ModerationLog.Action.DISMISS_REPORTS, listing, note)
    else:
        user = report.reported_user
        if report.target_type == Report.Target.USER and user.hidden_by_reports:
            user.hidden_by_reports = False
            user.save(update_fields=['hidden_by_reports'])
        log(actor, ModerationLog.Action.DISMISS_REPORTS, user, note)


def ban_from_report(report, actor):
    ban_user(report.reported_user, actor, _report_note(report))
