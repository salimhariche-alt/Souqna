"""Device IDs (one private random ID per app installation) and blocked phone numbers."""

import re

from .models import BlockedPhone, Device, DeviceAccount

_VALID_DEVICE_ID = re.compile(r'^[A-Za-z0-9-]{8,64}$')


def clean_device_id(value) -> str | None:
    """The device ID if it looks valid, else None (old app versions, web, nonsense)."""
    if isinstance(value, str) and _VALID_DEVICE_ID.match(value):
        return value
    return None


def is_device_banned(device_id) -> bool:
    device_id = clean_device_id(device_id)
    return bool(device_id) and Device.objects.filter(device_id=device_id, banned=True).exists()


def is_phone_blocked(phone) -> bool:
    return bool(phone) and BlockedPhone.objects.filter(phone=phone).exists()


def record_device(user, device_id) -> Device | None:
    """Remember that this account was used on this device (sign up / log in)."""
    device_id = clean_device_id(device_id)
    if not device_id:
        return None
    device, _ = Device.objects.get_or_create(device_id=device_id)
    link, created = DeviceAccount.objects.get_or_create(device=device, user=user)
    if not created:
        link.save(update_fields=['last_seen'])
    device.save(update_fields=['last_seen'])
    return device
