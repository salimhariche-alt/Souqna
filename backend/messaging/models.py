from django.conf import settings
from django.db import models
from django.db.models import F, Q

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


class Message(models.Model):
    """One message inside a conversation."""

    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name='messages'
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='messages_sent'
    )
    text = models.TextField(max_length=MAX_MESSAGE_LENGTH)
    sent_at = models.DateTimeField(auto_now_add=True, db_index=True)
    read = models.BooleanField(default=False)

    class Meta:
        ordering = ['sent_at']

    def __str__(self):
        preview = self.text if len(self.text) <= 40 else self.text[:40] + '…'
        return f'{self.sender.display_name}: {preview}'
