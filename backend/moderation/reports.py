"""Reports from users, and hiding things automatically after enough reports."""

from .checks import flag
from .models import Report

# This many DIFFERENT users with a verified phone reporting the same listing or user
# hides it until an admin reviews the reports. (Unverified reporters still count for
# the admin, but can't hide anything: making fake accounts is too easy.)
AUTO_HIDE_REPORTERS = 3


def verified_reporters(reports):
    return (reports.filter(status=Report.Status.OPEN, reporter__phone_verified=True)
            .values('reporter').distinct().count())


def after_report(report):
    """Hide the listing / user if enough verified users reported it. Returns True if hidden."""
    if report.target_type == Report.Target.MESSAGE:
        return False  # a message is never hidden automatically; admins review it
    if verified_reporters(report.same_target()) < AUTO_HIDE_REPORTERS:
        return False
    if report.target_type == Report.Target.LISTING:
        return flag(report.listing, [{
            'code': 'reported',
            'detail': f'Reported by {AUTO_HIDE_REPORTERS} or more verified users',
        }])
    user = report.reported_user
    if not user.hidden_by_reports:
        user.hidden_by_reports = True
        user.save(update_fields=['hidden_by_reports'])
    return True
