from django.contrib import admin
from django.db.models import Count
from django.utils.html import format_html

from .models import MAX_PHOTOS_PER_LISTING, Category, Favorite, Listing, ListingPhoto


def photo_preview(photo, size=80):
    if not photo or not photo.image:
        return '—'
    return format_html(
        '<img src="{}" style="height:{}px;width:{}px;object-fit:cover;border-radius:4px">',
        photo.image.url, size, size,
    )


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name_en', 'name_fr', 'name_ar', 'parent', 'listing_count')
    list_filter = (('parent', admin.EmptyFieldListFilter), 'parent')
    search_fields = ('name_en', 'name_fr', 'name_ar')

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(_listing_count=Count('listings'))

    @admin.display(description='listings', ordering='_listing_count')
    def listing_count(self, obj):
        return obj._listing_count


class ListingPhotoInline(admin.TabularInline):
    model = ListingPhoto
    extra = 1
    max_num = MAX_PHOTOS_PER_LISTING
    fields = ('preview', 'image', 'position')
    readonly_fields = ('preview',)

    @admin.display(description='preview')
    def preview(self, obj):
        return photo_preview(obj)


@admin.register(Listing)
class ListingAdmin(admin.ModelAdmin):
    list_display = ('cover', 'title', 'price_dzd', 'category', 'condition', 'wilaya',
                    'status', 'seller', 'created_at')
    list_display_links = ('cover', 'title')
    list_filter = ('status', 'condition', 'category', 'wilaya', 'created_at')
    list_editable = ('status',)
    search_fields = ('title', 'description', 'brand', 'seller__phone', 'seller__display_name')
    autocomplete_fields = ('seller', 'category')
    list_select_related = ('seller', 'category', 'category__parent')
    date_hierarchy = 'created_at'
    readonly_fields = ('created_at',)
    inlines = [ListingPhotoInline]

    def get_queryset(self, request):
        return super().get_queryset(request).prefetch_related('photos')

    @admin.display(description='photo')
    def cover(self, obj):
        photos = list(obj.photos.all())
        return photo_preview(photos[0] if photos else None, size=48)


@admin.register(ListingPhoto)
class ListingPhotoAdmin(admin.ModelAdmin):
    list_display = ('preview', 'listing', 'position')
    list_filter = ('position',)
    search_fields = ('listing__title',)
    autocomplete_fields = ('listing',)
    list_select_related = ('listing',)

    @admin.display(description='preview')
    def preview(self, obj):
        return photo_preview(obj, size=48)


@admin.register(Favorite)
class FavoriteAdmin(admin.ModelAdmin):
    list_display = ('user', 'listing', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('user__phone', 'user__display_name', 'listing__title')
    autocomplete_fields = ('user', 'listing')
    list_select_related = ('user', 'listing')
