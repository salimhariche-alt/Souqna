from rest_framework import serializers

from .models import Category, Favorite, Listing, ListingPhoto

MAX_PHOTO_BYTES = 10 * 1024 * 1024  # 10 MB


def cover_photo_url(listing, request=None):
    """Full web address of a listing's first photo, or None if it has no photos."""
    photos = list(listing.photos.all())  # uses prefetched photos, ordered by position
    if not photos:
        return None
    url = photos[0].image.url
    return request.build_absolute_uri(url) if request else url


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name_ar', 'name_fr', 'name_en', 'parent']


def avatar_url(user, request=None):
    """Full web address of a user's profile photo, or None."""
    if not user.avatar:
        return None
    url = user.avatar.url
    return request.build_absolute_uri(url) if request else url


class SellerSerializer(serializers.Serializer):
    """Public info about a seller, including trust info.

    NEVER add the phone number or email here: this is shown to everyone.
    """

    id = serializers.IntegerField()
    display_name = serializers.CharField()
    wilaya = serializers.IntegerField(allow_null=True)
    avatar = serializers.SerializerMethodField()
    phone_verified = serializers.BooleanField()
    member_since = serializers.DateTimeField(source='date_joined')
    items_sold = serializers.IntegerField()
    # {"average": 4.8, "count": 12} from reviews of delivered orders.
    rating = serializers.SerializerMethodField()

    def get_avatar(self, user):
        return avatar_url(user, self.context.get('request'))

    def get_rating(self, user):
        from delivery.services import rating_for
        return rating_for(user)


class ListingPhotoSerializer(serializers.ModelSerializer):
    class Meta:
        model = ListingPhoto
        fields = ['id', 'image', 'position']
        read_only_fields = ['position']  # chosen automatically (next free slot 1-8)

    def validate_image(self, image):
        if image.size > MAX_PHOTO_BYTES:
            raise serializers.ValidationError('Photos must be 10 MB or smaller.')
        return image


class ListingListSerializer(serializers.ModelSerializer):
    """Short version of a listing, used in lists (search results, favorites)."""

    category_name = serializers.CharField(source='category.name_en', read_only=True)
    wilaya_name = serializers.CharField(source='get_wilaya_display', read_only=True)
    condition_label = serializers.CharField(source='get_condition_display', read_only=True)
    cover_photo = serializers.SerializerMethodField()

    class Meta:
        model = Listing
        fields = ['id', 'title', 'price_dzd', 'category', 'category_name', 'size', 'brand',
                  'condition', 'condition_label', 'wilaya', 'wilaya_name', 'status',
                  'cover_photo', 'created_at']

    def get_cover_photo(self, listing):
        return cover_photo_url(listing, self.context.get('request'))


class MyListingSerializer(ListingListSerializer):
    """One of MY listings (Profile -> My listings): also its review status."""

    class Meta(ListingListSerializer.Meta):
        fields = ListingListSerializer.Meta.fields + ['review_status']


class ListingDetailSerializer(serializers.ModelSerializer):
    """Full listing: used for one listing's page, and for creating/editing."""

    seller = SellerSerializer(read_only=True)
    photos = ListingPhotoSerializer(many=True, read_only=True)
    category_name = serializers.CharField(source='category.name_en', read_only=True)
    wilaya_name = serializers.CharField(source='get_wilaya_display', read_only=True)
    condition_label = serializers.CharField(source='get_condition_display', read_only=True)
    is_favorited = serializers.SerializerMethodField()

    class Meta:
        model = Listing
        fields = ['id', 'title', 'description', 'price_dzd', 'category', 'category_name',
                  'size', 'brand', 'condition', 'condition_label', 'wilaya', 'wilaya_name',
                  'parcel_size', 'status', 'seller', 'photos', 'is_favorited', 'review_status', 'created_at']
        # review_status: only the seller can see a listing that isn't approved, so the
        # app can show "Under review". The reasons (flag_reasons) stay admin-only.
        read_only_fields = ['created_at', 'review_status']

    def get_is_favorited(self, listing):
        """True if the logged-in user has this listing in their favorites."""
        request = self.context.get('request')
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        return Favorite.objects.filter(user=user, listing=listing).exists()


class FavoriteSerializer(serializers.ModelSerializer):
    listing = ListingListSerializer(read_only=True)

    class Meta:
        model = Favorite
        fields = ['id', 'listing', 'created_at']
