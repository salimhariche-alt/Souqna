from django.db import IntegrityError, transaction
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from .filters import ListingFilter
from .models import MAX_PHOTOS_PER_LISTING, Category, Favorite, Listing, ListingPhoto
from .permissions import IsSellerOrReadOnly
from .serializers import (
    CategorySerializer,
    FavoriteSerializer,
    ListingDetailSerializer,
    ListingListSerializer,
    ListingPhotoSerializer,
)


class CategoryViewSet(viewsets.ReadOnlyModelViewSet):
    """All categories, with names in Arabic, French and English. Open to everyone."""

    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = None  # there are only a few, so return them all at once


class ListingViewSet(mixins.ListModelMixin,
                     mixins.RetrieveModelMixin,
                     mixins.CreateModelMixin,
                     mixins.UpdateModelMixin,
                     viewsets.GenericViewSet):
    """
    Listings.

    - GET    /api/listings/                 active listings, newest first, 20 per page
    - POST   /api/listings/                 create a listing (logged in)
    - GET    /api/listings/{id}/            one listing with photos and seller
    - PATCH  /api/listings/{id}/            edit, or set status to reserved/sold (seller only)
    - POST   /api/listings/{id}/photos/     upload a photo (seller only, max 8)
    - POST   /api/listings/{id}/favorite/   add to my favorites (logged in)
    - DELETE /api/listings/{id}/favorite/   remove from my favorites (logged in)
    """

    permission_classes = [permissions.IsAuthenticatedOrReadOnly, IsSellerOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_class = ListingFilter
    search_fields = ['title', 'description', 'brand']

    def get_queryset(self):
        queryset = (
            Listing.objects
            .select_related('seller', 'category')
            .prefetch_related('photos')
            .order_by('-created_at', '-id')
        )
        if self.action == 'list':
            # The public list only shows items that can still be bought.
            # A single listing stays viewable after it is reserved or sold.
            queryset = queryset.filter(status=Listing.Status.ACTIVE)
        return queryset

    def filter_queryset(self, queryset):
        # Filters and search only apply to the list, not to a single listing.
        if self.action != 'list':
            return queryset
        return super().filter_queryset(queryset)

    def get_serializer_class(self):
        if self.action == 'list':
            return ListingListSerializer
        if self.action == 'photos':
            return ListingPhotoSerializer
        return ListingDetailSerializer

    def perform_create(self, serializer):
        # The seller is always the logged-in user, and new listings always start active.
        serializer.save(seller=self.request.user, status=Listing.Status.ACTIVE)

    @action(detail=True, methods=['post'], parser_classes=[MultiPartParser, FormParser])
    def photos(self, request, pk=None):
        """Upload one photo (form field "image"). It gets the next free position 1-8."""
        listing = self.get_object()  # also checks that you are the seller
        serializer = ListingPhotoSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)

        used = set(listing.photos.values_list('position', flat=True))
        free = [p for p in range(1, MAX_PHOTOS_PER_LISTING + 1) if p not in used]
        if not free:
            return Response(
                {'detail': f'A listing can have at most {MAX_PHOTOS_PER_LISTING} photos.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            with transaction.atomic():
                serializer.save(listing=listing, position=free[0])
        except IntegrityError:  # two uploads at the same moment took the same slot
            return Response({'detail': 'Please try uploading the photo again.'},
                            status=status.HTTP_409_CONFLICT)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post', 'delete'],
            permission_classes=[permissions.IsAuthenticated])
    def favorite(self, request, pk=None):
        """POST adds this listing to my favorites; DELETE removes it."""
        listing = self.get_object()
        if request.method == 'POST':
            favorite, created = Favorite.objects.get_or_create(user=request.user, listing=listing)
            data = FavoriteSerializer(favorite, context={'request': request}).data
            return Response(data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

        deleted, _ = Favorite.objects.filter(user=request.user, listing=listing).delete()
        if not deleted:
            return Response({'detail': 'This listing is not in your favorites.'},
                            status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)


class FavoriteViewSet(mixins.ListModelMixin, viewsets.GenericViewSet):
    """GET /api/favorites/ - my favorite listings, most recently added first."""

    serializer_class = FavoriteSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            Favorite.objects
            .filter(user=self.request.user)
            .select_related('listing__category')
            .prefetch_related('listing__photos')
            .order_by('-created_at', '-id')
        )
