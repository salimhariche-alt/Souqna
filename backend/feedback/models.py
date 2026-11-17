import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone

MAX_MESSAGE_LENGTH = 2000


def screenshot_file_name(feedback, filename):
    """feedback/2026/11/<random>.jpg - a random name nobody can guess."""
    return f'feedback/{timezone.now():%Y/%m}/{uuid.uuid4().hex}.jpg'


class Feedback(models.Model):
    """A message sent with "Send feedback" (Profile tab), with an optional screenshot."""

    class Status(models.TextChoices):
        NEW = 'new', 'New'
        READ = 'read', 'Read'
        DONE = 'done', 'Done'

    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL,
                             related_name='feedback')
    message = models.TextField(max_length=MAX_MESSAGE_LENGTH)
    # Re-saved by the server: max 1600 px, JPEG, no hidden data (GPS location...).
    screenshot = models.ImageField(upload_to=screenshot_file_name, blank=True)
    # Where it was sent from, to help find the problem: "android", "ios" or "web".
    platform = models.CharField(max_length=10, blank=True)
    language = models.CharField(max_length=2, blank=True)
    status = models.CharField(max_length=4, choices=Status.choices, default=Status.NEW)
    admin_note = models.TextField(blank=True, help_text='Only you see this.')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ['-created_at']
        verbose_name_plural = 'feedback'

    def __str__(self):
        first_line = self.message.strip().splitlines()[0] if self.message.strip() else ''
        return f'#{self.pk} {first_line[:60]}'
