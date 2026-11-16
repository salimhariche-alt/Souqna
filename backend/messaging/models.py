import os
import uuid

from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.utils import timezone

MAX_MESSAGE_LENGTH = 1000


class Conversation(models.Model):
    """A private chat between a buyer and a seller about one listing."""

    listing = models.ForeignKey(
        'listings.Listing', on_delete=models.CASCADE, related_name='conversations'
    )
    buyer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='conversations_as_buyer',
    )
    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='conversations_as_seller',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            # One conversation per buyer per listing.
            models.UniqueConstraint(
                fields=['listing', 'buyer'], name='unique_conversation_per_buyer'
            ),
            # Sellers can't chat with themselves.
            models.CheckConstraint(
                condition=~Q(buyer=F('seller')), name='buyer_is_not_seller'
            ),
        ]

    def __str__(self):
        return f'{self.buyer.display_name} → {self.seller.display_name}: {self.listing}'


def voice_file_name(message, filename):
    """voice/2026/11/<random>.m4a - a random name, so nobody can guess another
    conversation's voice message address."""
    extension = os.path.splitext(filename)[1].lower() or '.m4a'
    return f'voice/{timezone.now():%Y/%m}/{uuid.uuid4().hex}{extension}'


class Message(models.Model):
    """One message inside a conversation: either text or a voice recording."""

    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name='messages'
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='messages_sent'
    )
    # Empty for a voice message.
    text = models.TextField(max_length=MAX_MESSAGE_LENGTH, blank=True)
    # Voice message (AAC/M4A, max 60 s, max 1 MB - checked in messaging/audio.py).
    audio = models.FileField(upload_to=voice_file_name, blank=True)
    duration_ms = models.PositiveIntegerField(null=True, blank=True)
    # For later: the voice message written out, so the same safety checks as text can
    # run on it. Not filled yet.
    transcript = models.TextField(blank=True)
    sent_at = models.DateTimeField(auto_now_add=True, db_index=True)
    read = models.BooleanField(default=False)
    # Safety: the message contains a phone number, a link, WhatsApp/Telegram or
    # payment-in-advance words. It is still delivered; the receiver sees a warning.
    flagged = models.BooleanField(default=False, db_index=True)
    # e.g. [{"code": "contact_phone", "detail": "..."}] (details for admins only).
    flag_reasons = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ['sent_at']
        constraints = [
            # Exactly one of: text, or a voice recording.
            models.CheckConstraint(
                condition=(Q(text='') & ~Q(audio='')) | (~Q(text='') & Q(audio='')),
                name='message_is_text_or_voice',
            ),
        ]

    @property
    def is_voice(self) -> bool:
        return bool(self.audio)

    def __str__(self):
        if self.is_voice:
            preview = f'[voice {round((self.duration_ms or 0) / 1000)} s]'
        else:
            preview = self.text if len(self.text) <= 40 else self.text[:40] + '…'
        return f'{self.sender.display_name}: {preview}'
