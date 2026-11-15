from rest_framework import serializers

from .models import Category, Favorite, Listing, ListingPhoto

MAX_PHOTO_BYTES = 10 * 1024 * 1024  # 10 MB


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name_ar', 'name_fr', 'name_en', 'parent']


class SellerSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    display_name = serializers.CharField()


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
        photos = list(listing.photos.all())  # uses prefetched photos, ordered by position
        if not photos:
            return None
        url = photos[0].image.url
        request = self.context.get('request')
        return request.build_absolute_uri(url) if request else url


class ListingDetailSerializer(serializers.ModelSerializer):
    """Full listing: used for one listing's page, and for creating/editing."""

    seller = SellerSerializer(read_only=True)
    photos = ListingPhotoSerializer(many=True, read_only=True)
    category_name = serializers.CharField(source='category.name_en', read_only=True)
    wilaya_name = serializers.CharField(source='get_wilaya_display', read_only=True)
    condition_label = serializers.CharField(source='get_condition_display', read_only=True)

    class Meta:
        model = Listing
        fields = ['id', 'title', 'description', 'price_dzd', 'category', 'category_name',
                  'size', 'brand', 'condition', 'condition_label', 'wilaya', 'wilaya_name',
                  'status', 'seller', 'photos', 'created_at']
        read_only_fields = ['created_at']


class FavoriteSerializer(serializers.ModelSerializer):
    listing = ListingListSerializer(read_only=True)

    class Meta:
        model = Favorite
        fields = ['id', 'listing', 'created_at']
