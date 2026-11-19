from django.conf import settings
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q

from souqna_api.wilayas import Wilaya

MAX_PHOTOS_PER_LISTING = 8


class Category(models.Model):
    """A product category, named in Arabic, French and English.

    Main categories have no parent; sub-categories point to their parent.
    """

    name_ar = models.CharField('name (Arabic)', max_length=100)
    name_fr = models.CharField('name (French)', max_length=100)
    name_en = models.CharField('name (English)', max_length=100)
    parent = models.ForeignKey(
        'self', null=True, blank=True, on_delete=models.PROTECT, related_name='children'
    )

    class Meta:
        verbose_name_plural = 'categories'
        ordering = ['name_en']

    def __str__(self):
        if self.parent_id:
            return f'{self.parent} › {self.name_en}'
        return self.name_en


class Listing(models.Model):
    """An item a seller has put up for sale."""

    class Condition(models.TextChoices):
        NEW_WITH_TAGS = 'new_with_tags', 'New with tags'
        NEW_WITHOUT_TAGS = 'new_without_tags', 'New without tags'
        VERY_GOOD = 'very_good', 'Very good'
        GOOD = 'good', 'Good'
        SATISFACTORY = 'satisfactory', 'Satisfactory'

    class ParcelSize(models.TextChoices):
        # Every item is sold with delivery (to a relay point); the delivery company
        # prices the parcel by its size (Step 5.1).
        SMALL = 'small', 'Small (clothes, accessories - up to 1 kg)'
        MEDIUM = 'medium', 'Medium (shoes, bag, small electronics - up to 5 kg)'
        LARGE = 'large', 'Large (up to 15 kg)'

    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        RESERVED = 'reserved', 'Reserved'
        SOLD = 'sold', 'Sold'

    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='listings'
    )
    title = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    price_dzd = models.PositiveIntegerField('price (DZD)')
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name='listings')
    size = models.CharField(max_length=20, blank=True)
    brand = models.CharField(max_length=50, blank=True)
    condition = models.CharField(max_length=20, choices=Condition.choices)
    wilaya = models.PositiveSmallIntegerField(choices=Wilaya.choices)
    parcel_size = models.CharField(max_length=10, choices=ParcelSize.choices,
                                   default=ParcelSize.SMALL)
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.ACTIVE, db_index=True
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    # Moderation. Honest listings stay "approved" and nothing changes for them.
    # A listing flagged by the automatic checks becomes "pending_review": hidden from
    # everyone except its seller until an admin approves or rejects it.
    class Review(models.TextChoices):
        APPROVED = 'approved', 'Approved'
        PENDING = 'pending_review', 'Needs review'
        REJECTED = 'rejected', 'Rejected'

    review_status = models.CharField(
        max_length=16, choices=Review.choices, default=Review.APPROVED, db_index=True
    )
    # What the automatic checks found, e.g. [{"code": "low_price", "detail": "..."}].
    # Shown to admins only (never to the seller, so scammers can't learn the rules).
    flag_reasons = models.JSONField(default=list, blank=True)
    flagged_at = models.DateTimeField(null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name='+',
    )
    # Deleted by the seller (or with their account): hidden everywhere, but kept so
    # reports, flags and conversations about it still make sense.
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class ListingPhoto(models.Model):
    """One photo of a listing. Position 1 is the cover photo; max 8 per listing."""

    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name='photos')
    image = models.ImageField(upload_to='listings/%Y/%m/')
    position = models.PositiveSmallIntegerField(
        default=1,
        validators=[MinValueValidator(1), MaxValueValidator(MAX_PHOTOS_PER_LISTING)],
    )
    # 16-character "difference hash" of the photo, to find copies of the same photo
    # (see moderation/images.py). Empty for photos that couldn't be read.
    fingerprint = models.CharField(max_length=16, blank=True, db_index=True)

    class Meta:
        ordering = ['listing', 'position']
        constraints = [
            # Positions 1-8, each used once per listing => at most 8 photos.
            models.UniqueConstraint(
                fields=['listing', 'position'], name='unique_photo_position_per_listing'
            ),
            models.CheckConstraint(
                condition=Q(position__gte=1) & Q(position__lte=MAX_PHOTOS_PER_LISTING),
                name='photo_position_between_1_and_8',
            ),
        ]

    def __str__(self):
        return f'{self.listing} – photo {self.position}'


class Favorite(models.Model):
    """A user saving a listing they like."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='favorites'
    )
    listing = models.ForeignKey(Listing, on_delete=models.CASCADE, related_name='favorites')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(fields=['user', 'listing'], name='unique_favorite'),
        ]

    def __str__(self):
        return f'{self.user} ♥ {self.listing}'
