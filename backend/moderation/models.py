from django.conf import settings
from django.db import models

from listings.models import Listing


class FlaggedKeyword(models.Model):
    """A word or phrase that flags a listing for review, e.g. asking for payment in advance.

    Editable in the admin. Matching ignores capitals, accents and Arabic vowel marks.
    """

    class Language(models.TextChoices):
        FRENCH = 'fr', 'French'
        ARABIC = 'ar', 'Arabic'
        ENGLISH = 'en', 'English'
        DARIJA = 'darija', 'Algerian Darija'

    phrase = models.CharField(max_length=60, unique=True)
    language = models.CharField(max_length=8, choices=Language.choices)
    note = models.CharField(max_length=120, blank=True, help_text='Why this word is suspicious.')
    active = models.BooleanField(default=True)

    class Meta:
        ordering = ['language', 'phrase']

    def __str__(self):
        return self.phrase


class Device(models.Model):
    """One app installation, identified by a private random ID the app creates once."""

    device_id = models.CharField(max_length=64, unique=True)
    first_seen = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True)
    banned = models.BooleanField(default=False, help_text='No new accounts from this device.')
    accounts = models.ManyToManyField(settings.AUTH_USER_MODEL, through='DeviceAccount',
                                      related_name='devices')

    # More accounts than this on one device looks suspicious.
    MAX_NORMAL_ACCOUNTS = 3

    def __str__(self):
        return self.device_id[:12] + '…'


class DeviceAccount(models.Model):
    """An account that signed up or logged in on a device."""

    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name='links')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                             related_name='device_links')
    first_seen = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['device', 'user'], name='unique_device_account'),
        ]


class BlockedPhone(models.Model):
    """A phone number that can't be used for new accounts (e.g. of a banned user)."""

    phone = models.CharField(max_length=10, unique=True)
    reason = models.CharField(max_length=200, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.phone


class ModerationLog(models.Model):
    """Every moderation action taken by an admin (approve, reject, suspend, ban...)."""

    class Action(models.TextChoices):
        APPROVE_LISTING = 'approve_listing', 'Approved listing'
        REJECT_LISTING = 'reject_listing', 'Rejected listing'
        SUSPEND_USER = 'suspend_user', 'Suspended user'
        REACTIVATE_USER = 'reactivate_user', 'Reactivated user'
        BAN_USER = 'ban_user', 'Banned user'
        VERIFY_PHONE = 'verify_phone', 'Marked phone as verified'
        BAN_DEVICE = 'ban_device', 'Banned device'
        DISMISS_REPORTS = 'dismiss_reports', 'Dismissed reports'

    actor = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
                              related_name='moderation_actions')
    action = models.CharField(max_length=20, choices=Action.choices)
    target_type = models.CharField(max_length=20)  # "listing", "user", "device"
    target_id = models.PositiveIntegerField()
    target_label = models.CharField(max_length=200)
    note = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.get_action_display()}: {self.target_label}'


class Report(models.Model):
    """A user reporting a listing, another user or a message. One per user per item."""

    class Target(models.TextChoices):
        LISTING = 'listing', 'Listing'
        USER = 'user', 'User'
        MESSAGE = 'message', 'Message'

    class Reason(models.TextChoices):
        SCAM = 'scam', 'Scam or fraud'
        ADVANCE_PAYMENT = 'advance_payment', 'Asks for payment in advance'
        FAKE_ITEM = 'fake_item', 'Fake or stolen item'
        OFFENSIVE = 'offensive', 'Offensive'
        OTHER = 'other', 'Other'

    class Status(models.TextChoices):
        OPEN = 'open', 'Waiting for review'
        ACTIONED = 'actioned', 'Action taken'
        DISMISSED = 'dismissed', 'Dismissed'

    reporter = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                 related_name='reports_made')
    target_type = models.CharField(max_length=10, choices=Target.choices)
    listing = models.ForeignKey(Listing, null=True, blank=True, on_delete=models.CASCADE,
                                related_name='reports')
    message = models.ForeignKey('messaging.Message', null=True, blank=True,
                                on_delete=models.CASCADE, related_name='reports')
    # Always filled: the reported user, the listing's seller or the message's sender.
    reported_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                      related_name='reports_received')
    reason = models.CharField(max_length=20, choices=Reason.choices)
    text = models.CharField(max_length=500, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.OPEN,
                              db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    handled_at = models.DateTimeField(null=True, blank=True)
    handled_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True,
                                   on_delete=models.SET_NULL, related_name='+')

    class Meta:
        ordering = ['-created_at']
        constraints = [
            # One report per user per item.
            models.UniqueConstraint(fields=['reporter', 'listing'],
                                    condition=models.Q(target_type='listing'),
                                    name='one_report_per_listing'),
            models.UniqueConstraint(fields=['reporter', 'reported_user'],
                                    condition=models.Q(target_type='user'),
                                    name='one_report_per_user'),
            models.UniqueConstraint(fields=['reporter', 'message'],
                                    condition=models.Q(target_type='message'),
                                    name='one_report_per_message'),
            models.CheckConstraint(condition=~models.Q(reporter=models.F('reported_user')),
                                   name='cannot_report_yourself'),
        ]

    def __str__(self):
        return f'Report #{self.pk}: {self.get_reason_display()} ({self.target_type})'

    def same_target(self):
        """All reports about the same listing / user / message as this one."""
        if self.target_type == self.Target.LISTING:
            return Report.objects.filter(target_type=self.target_type, listing_id=self.listing_id)
        if self.target_type == self.Target.MESSAGE:
            return Report.objects.filter(target_type=self.target_type, message_id=self.message_id)
        return Report.objects.filter(target_type=self.target_type,
                                     reported_user_id=self.reported_user_id)


class Block(models.Model):
    """`blocker` blocked `blocked`: no messages between them, no listings of each other."""

    blocker = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                related_name='blocks_made')
    blocked = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
                                related_name='blocked_by')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(fields=['blocker', 'blocked'], name='unique_block'),
            models.CheckConstraint(condition=~models.Q(blocker=models.F('blocked')),
                                   name='cannot_block_yourself'),
        ]

    def __str__(self):
        return f'{self.blocker} blocked {self.blocked}'

    @staticmethod
    def between(user_a, user_b) -> bool:
        """Has either of them blocked the other?"""
        return Block.objects.filter(
            models.Q(blocker=user_a, blocked=user_b) | models.Q(blocker=user_b, blocked=user_a)
        ).exists()


class ListingReview(Listing):
    """The "Needs review" list in the admin: the same listings, only those to check."""

    class Meta:
        proxy = True
        verbose_name = 'listing to review'
        verbose_name_plural = 'Needs review'
