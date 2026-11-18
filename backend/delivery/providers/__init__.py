"""Delivery companies ("providers").

The rest of the app only talks to the common interface in base.py, through
get_provider(). To add a real company (Yalidine, ZR Express, Maystro...):
  1. write delivery/providers/yalidine.py with a class YalidineProvider(DeliveryProvider)
     that calls the company's API (keys from settings.DELIVERY_KEYS, i.e. .env);
  2. set DJANGO_DELIVERY_PROVIDER=delivery.providers.yalidine.YalidineProvider in .env.
Nothing else in the app needs to change.
"""

from django.conf import settings
from django.utils.module_loading import import_string

from .base import DeliveryProvider, ProviderError, Quote, Shipment, TrackingUpdate

__all__ = ['DeliveryProvider', 'ProviderError', 'Quote', 'Shipment', 'TrackingUpdate', 'get_provider']


def get_provider() -> DeliveryProvider:
    return import_string(settings.DELIVERY_PROVIDER)()
