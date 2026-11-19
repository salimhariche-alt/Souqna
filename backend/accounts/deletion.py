"""Deleting an account (required by Apple and Google).

What happens:
- personal data is erased: phone, email, name, wilaya, profile photo, password;
- all the user's listings are hidden (deleted), favourites, blocks and the messages
  they sent with "Send feedback" (with screenshots) are removed;
- the account can't be used any more.
What is kept (Safety step 4): flagged content and the moderation log (they hold their
own copies of the text, name and phone), reports, and conversations (so the other
person still sees the messages they exchanged). A banned phone number stays banned.
"""

from django.db import transaction
from django.utils import timezone

from listings.models import Favorite
from moderation.models import Block, ModerationLog

DELETED_NAME = 'Deleted account'


@transaction.atomic
def delete_account(user):
    from moderation.actions import log

    now = timezone.now()
    log(user, ModerationLog.Action.DELETE_ACCOUNT, user,
        f'Phone {user.phone or "-"}, email {user.email or "-"}')  # written before erasing

    user.listings.filter(deleted_at__isnull=True).update(deleted_at=now)
    Favorite.objects.filter(user=user).delete()
    Block.objects.filter(blocker=user).delete()
    # "Send feedback" messages and screenshots may hold personal data: erase them.
    for feedback in user.feedback.all():
        if feedback.screenshot:
            feedback.screenshot.delete(save=False)
        feedback.delete()
    if user.avatar:
        user.avatar.delete(save=False)
    # Reviews they wrote: the stars still count, their words are erased.
    from delivery.models import Review
    Review.objects.filter(author=user).update(comment='')
    # No more push notifications to their phones.
    from push.models import PushDevice
    PushDevice.objects.filter(user=user).delete()

    user.phone = None
    # Every account needs a phone or an email: an address that can never receive mail.
    user.email = f'deleted-{user.pk}@deleted.invalid'
    user.display_name = DELETED_NAME
    user.wilaya = None
    user.avatar = ''
    user.phone_verified = False
    user.phone_verified_at = None
    user.is_active = False
    user.deleted_at = now
    user.set_unusable_password()
    user.save()
