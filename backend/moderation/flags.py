"""Recording offensive content: the evidence (copies), the strike and the alert."""

from .alerts import send_alert
from .models import ContentFlag, Severity
from .strikes import apply_sanctions

CONTEXT_MESSAGES = 6  # how many earlier messages of the conversation are copied


def _context(conversation):
    """Copy of the last messages of the conversation (kept even if they're deleted)."""
    if conversation is None:
        return []
    recent = conversation.messages.select_related('sender').order_by('-sent_at', '-id')
    return [{
        'id': m.id,
        'sender': m.sender.display_name,
        'sender_id': m.sender_id,
        'text': m.text or f'[voice message {round((m.duration_ms or 0) / 1000)} s]',
        'sent_at': m.sent_at.isoformat(),
    } for m in reversed(recent[:CONTEXT_MESSAGES])]


def _user_fields(user):
    return {'user': user, 'user_label': f'{user.display_name} (#{user.pk})'[:200],
            'user_phone': user.phone or user.email or ''}


def record_message_flag(match, *, user, text, conversation=None, message=None):
    """An offensive message (delivered or not). Counts as a strike."""
    delivered = message is not None
    flag = ContentFlag.objects.create(
        source=ContentFlag.Source.MESSAGE if delivered else ContentFlag.Source.BLOCKED_MESSAGE,
        category=match.category,
        severity=match.severity,
        urgent=match.severity == Severity.BLOCK,
        strike=True,
        message=message,
        conversation=conversation,
        content=text,
        matched=match.phrases,
        context=_context(conversation),
        **_user_fields(user),
    )
    if flag.urgent:
        send_alert(flag)
    apply_sanctions(user)
    return flag


def record_listing_flag(match, listing):
    """An offensive listing: sent to "Needs review". It becomes a strike only if an
    admin confirms it."""
    existing = ContentFlag.objects.filter(listing=listing, category=match.category,
                                          status=ContentFlag.Status.PENDING).first()
    text = f'{listing.title}\n{listing.description}'
    if existing:  # edited again: keep one flag, with the latest text
        existing.content = text
        existing.matched = match.phrases
        existing.save(update_fields=['content', 'matched'])
        return existing
    flag = ContentFlag.objects.create(
        source=ContentFlag.Source.LISTING,
        category=match.category,
        severity=match.severity,
        urgent=match.severity == Severity.BLOCK,
        strike=False,
        listing=listing,
        content=text,
        matched=match.phrases,
        **_user_fields(listing.seller),
    )
    if flag.urgent:
        send_alert(flag)
    return flag
