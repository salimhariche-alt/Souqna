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
class RelayPoint:
    """A place where buyers collect parcels (and sellers can drop them off).

    `open_days` are weekday numbers (0 = Monday ... 6 = Sunday); `opens`/`closes` are
    "HH:MM". The app writes the hours in the user's language."""

    id: str  # the company's own id for the point
    name: str
    address: str
    wilaya: int
    commune_code: int
    latitude: float
    longitude: float
    open_days: list[int]
    opens: str
    closes: str
    phone: str = ''


@dataclass
class Shipment:
    tracking_number: str


@dataclass
class TrackingUpdate:
    """One step reported by the company: one of Order.Status (dropped_off, in_transit,
    at_relay, delivered, refused, returned)."""

    status: str
    at: datetime
    note: str = ''


class DeliveryProvider:
    """Override every method. `order` is a delivery.models.Order."""

    code = 'base'  # stored on each order, e.g. "yalidine"
    name = 'Base'

    def quote(self, *, origin_wilaya: int, wilaya: int, commune_code: int | None, mode: str,
              parcel_size: str = 'small') -> Quote:
        """Price and delivery time for one parcel (mode: "home" or "stop_desk";
        parcel_size: "small", "medium" or "large"). Without a commune: an estimate
        for the wilaya (shown on the listing page)."""
        raise NotImplementedError

    def relay_points(self, *, wilaya: int, commune_code: int | None = None) -> list[RelayPoint]:
        """The company's relay points in a wilaya (only that commune when given)."""
        raise NotImplementedError

    def create_shipment(self, order) -> Shipment:
        """Register the parcel (the seller drops it at `order.drop_off_point_id`, the buyer
        collects it at `order.relay_point_id`). Returns its shipment code."""
        raise NotImplementedError

    def tracking(self, order) -> list[TrackingUpdate]:
        """Everything that happened to the parcel so far, oldest first."""
        raise NotImplementedError

    def cancel(self, order) -> None:
        """Cancel before drop-off. Raise ProviderError if it is too late."""
        raise NotImplementedError
