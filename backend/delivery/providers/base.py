"""The common interface every delivery company must follow."""

from dataclasses import dataclass
from datetime import datetime


class ProviderError(Exception):
    """The delivery company refused or could not be reached."""


@dataclass
class Quote:
    """A price estimate for one parcel."""

    price_dzd: int
    days_min: int
    days_max: int
    # Stop-desk: the relay point where the buyer picks up the parcel.
    stop_desk_name: str = ''


@dataclass
class Shipment:
    tracking_number: str


@dataclass
class TrackingUpdate:
    """One step reported by the company: one of Order.Status (picked_up, in_transit,
    out_for_delivery, delivered, returned)."""

    status: str
    at: datetime
    note: str = ''


class DeliveryProvider:
    """Override every method. `order` is a delivery.models.Order."""

    code = 'base'  # stored on each order, e.g. "yalidine"
    name = 'Base'

    def quote(self, *, origin_wilaya: int, wilaya: int, commune_code: int, mode: str) -> Quote:
        """Price and delivery time for one parcel (mode: "home" or "stop_desk")."""
        raise NotImplementedError

    def create_shipment(self, order) -> Shipment:
        """Ask the company to pick up the parcel. Returns its tracking number."""
        raise NotImplementedError

    def tracking(self, order) -> list[TrackingUpdate]:
        """Everything that happened to the parcel so far, oldest first."""
        raise NotImplementedError

    def cancel(self, order) -> None:
        """Cancel before pick-up. Raise ProviderError if it is too late."""
        raise NotImplementedError
