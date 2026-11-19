"""Which push notifications go to whom (called by delivery and messaging).

Every send happens after the database change is saved (transaction.on_commit), and a
failure never breaks the order or the message: the in-app notifications stay the truth.
"""

import logging

from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.utils.module_loading import import_string

from .models import PushDevice, PushSettings
from .texts import text

log = logging.getLogger(__name__)

# A chat sends at most one "new message" alert per person every this many seconds.
MESSAGE_PUSH_EVERY = 60


def _backend():
    return import_string(getattr(settings, 'PUSH_BACKEND', 'push.backends.ConsoleBackend'))()


def _send(items):
    """items: [(user, key, values, url)]. Builds one alert per phone, then sends."""
    messages = []
    for user, key, values, url in items:
        title, body = text(key, getattr(user, 'preferred_language', 'fr') or 'fr', **values)
        for device in PushDevice.objects.filter(user=user):
            messages.append({'to': device.token, 'title': title, 'body': body, 'data': {'url': url}})
    if not messages:
        return
    try:
        gone = _backend().send(messages)
    except Exception:  # noqa: BLE001 - a push problem must never break the app
        log.exception('Push notifications failed')
        return
    if gone:
        PushDevice.objects.filter(token__in=gone).delete()


def _later(items):
    if items:
        transaction.on_commit(lambda: _send(items))


# Order news (from delivery.services.notify) ----------------------------------------

def _order_key(status, role, order):
    if status == 'created':
        return 'order_created' if role == 'seller' else None  # the buyer just ordered
    if status == 'confirmed':
        return 'order_confirmed' if role == 'buyer' else None
    if status in ('dropped_off', 'at_relay'):
        return f'order_{status}' if role == 'buyer' else None
    if status in ('delivered', 'refused'):
        return f'order_{status}_{role}'
    if status == 'returned':
        return 'order_returned' if role == 'seller' else None
    if status == 'cancelled':
        # Not to the person who cancelled it themselves.
        reason = order.cancel_reason
        if (reason == 'buyer' and role == 'buyer') or (reason in ('seller', 'declined') and role == 'seller'):
            return None
        return 'order_cancelled'
    return None  # "in transit": not worth an alert


def order_update(order, status, users):
    items = []
    for user in users:
        role = 'seller' if user.pk == order.seller_id else 'buyer'
        key = _order_key(status, role, order)
        if key and PushSettings.for_user(user).orders:
            items.append((user, key, {'title': order.listing.title}, f'/order/{order.pk}'))
    _later(items)


# Messages and offers (from a new chat message) -------------------------------------

def new_message(message):
    conversation = message.conversation
    receiver = conversation.seller if message.sender_id == conversation.buyer_id else conversation.buyer
    if not PushSettings.for_user(receiver).messages:
        return
    values = {'name': message.sender.display_name, 'title': conversation.listing.title}
    url = f'/chat/{conversation.pk}'
    if message.offer_id:
        key = {'made': 'offer_made', 'accepted': 'offer_accepted',
               'declined': 'offer_declined'}.get(message.offer_event)
        if not key:
            return  # a withdrawn offer: no alert
        values['amount'] = message.offer.amount_dzd
    else:
        key = 'message'
        # Several messages in a row: one alert per minute per chat is enough.
        if not cache.add(f'push-msg-{receiver.pk}-{conversation.pk}', 1, MESSAGE_PUSH_EVERY):
            return
    _later([(receiver, key, values, url)])
