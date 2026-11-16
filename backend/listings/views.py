from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from accounts.permissions import IsPhoneVerified
from moderation.checks import check_listing, check_photo
from moderation.images import fingerprint, strip_hidden_data
from moderation.limits import check_daily_limit

from .filters import ListingFilter
from .models import MAX_PHOTOS_PER_LISTING, Category, Favorite, Listing, ListingPhoto
from .permissions import IsSellerOrReadOnly
from .serializers import (
    CategorySerializer,
    FavoriteSerializer,
    ListingDetailSerializer,
    ListingListSerializer,
    ListingPhotoSerializer,
    MyListingSerializer,
)
from .visibility import visible_listing_q


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
                     mixins.DestroyModelMixin,
                     viewsets.GenericViewSet):
    """
    Listings.

    - GET    /api/listings/                 active listings, newest first, 20 per page
    - POST   /api/listings/                 create a listing (logged in)
    - GET    /api/listings/{id}/            one listing with photos and seller
    - PATCH  /api/listings/{id}/            edit, or set status to reserved/sold (seller only)
    - DELETE /api/listings/{id}/            delete it (seller only; hidden, not erased)
    - GET    /api/listings/mine/?tab=active|review|reserved|sold   my own listings
    - GET    /api/listings/?seller=<id>     one seller's active listings (public profile)
    - POST   /api/listings/{id}/photos/     upload a photo (seller only, max 8)
    - DELETE /api/listings/{id}/photos/{photo_id}/   remove a photo (seller only)
    - POST   /api/listings/{id}/photos/order/        {"order": [ids]}: first = cover
    - POST   /api/listings/{id}/favorite/   add to my favorites (logged in)
    - DELETE /api/listings/{id}/favorite/   remove from my favorites (logged in)
    """

    permission_classes = [permissions.IsAuthenticatedOrReadOnly, IsSellerOrReadOnly]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_class = ListingFilter
    search_fields = ['title', 'description', 'brand']

    def get_permissions(self):
        # Posting a new listing needs a verified phone number.
        if self.action == 'create':
            return [permissions.IsAuthenticated(), IsPhoneVerified()]
        return super().get_permissions()

    def get_queryset(self):
        queryset = (
            Listing.objects
            .filter(deleted_at__isnull=True)  # deleted listings are gone for everyone
            .select_related('seller', 'category')
            .prefetch_related('photos')
            .order_by('-created_at', '-id')
        )
        if self.action == 'mine':
            return queryset.filter(seller=self.request.user)
        # Moderation and blocks (see visibility.py). A seller still sees their own
        # flagged/rejected listings.
        user = self.request.user
        visible = visible_listing_q(user)
        if self.action == 'list':
            # The public list only shows items that can still be bought.
            # A single listing stays viewable after it is reserved or sold.
            return queryset.filter(visible, status=Listing.Status.ACTIVE)
        if user.is_authenticated:
            return queryset.filter(visible | Q(seller=user))
        return queryset.filter(visible)

    def filter_queryset(self, queryset):
        # Filters and search only apply to the list, not to a single listing.
        if self.action != 'list':
            return queryset
        return super().filter_queryset(queryset)

    def get_serializer_class(self):
        if self.action == 'list':
            return ListingListSerializer
        if self.action == 'mine':
            return MyListingSerializer
        if self.action == 'photos':
            return ListingPhotoSerializer
        return ListingDetailSerializer

    def create(self, request, *args, **kwargs):
        check_daily_limit(request.user, 'listings')  # 10 a day for new accounts, 50 after
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        # The seller is always the logged-in user, and new listings always start active.
        listing = serializer.save(seller=self.request.user, status=Listing.Status.ACTIVE)
        check_listing(listing)  # price and text checks (may flag it for review)

    def perform_update(self, serializer):
        before = serializer.instance
        watched = ('title', 'description', 'price_dzd', 'category_id')
        old = {field: getattr(before, field) for field in watched}
        listing = serializer.save()
        # Check again only if the text, price or category changed (not for "mark as sold").
        if any(getattr(listing, field) != value for field, value in old.items()):
            check_listing(listing)

    def destroy(self, request, *args, **kwargs):
        """DELETE /api/listings/{id}/ - the seller deletes it. It disappears everywhere,
        but is kept (hidden) so reports and conversations about it still make sense."""
        listing = self.get_object()  # also checks that you are the seller
        listing.deleted_at = timezone.now()
        listing.save(update_fields=['deleted_at'])
        Favorite.objects.filter(listing=listing).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=False, methods=['get'], permission_classes=[permissions.IsAuthenticated])
    def mine(self, request):
        """GET /api/listings/mine/?tab=active|review|reserved|sold - my own listings,
        including the ones under review that only I can see."""
        tabs = {
            'active': Q(status=Listing.Status.ACTIVE, review_status=Listing.Review.APPROVED),
            'review': ~Q(review_status=Listing.Review.APPROVED),
            'reserved': Q(status=Listing.Status.RESERVED, review_status=Listing.Review.APPROVED),
            'sold': Q(status=Listing.Status.SOLD, review_status=Listing.Review.APPROVED),
        }
        tab = request.query_params.get('tab', 'active')
        if tab not in tabs:
            return Response({'detail': 'tab must be active, review, reserved or sold.'},
                            status=status.HTTP_400_BAD_REQUEST)
        listings = self.get_queryset().filter(tabs[tab])
        page = self.paginate_queryset(listings)
        data = MyListingSerializer(page, many=True, context=self.get_serializer_context()).data
        response = self.get_paginated_response(data)
        # How many in each tab, for the tab labels ("Active (3)").
        mine = self.get_queryset()
        response.data['counts'] = {name: mine.filter(q).count() for name, q in tabs.items()}
        return response

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
        # Privacy: re-save the photo without hidden data (GPS location, phone model...),
        # and take its fingerprint to spot photos copied from other sellers.
        clean = strip_hidden_data(serializer.validated_data['image'])
        try:
            with transaction.atomic():
                photo = serializer.save(listing=listing, position=free[0], image=clean,
                                        fingerprint=fingerprint(clean))
        except IntegrityError:  # two uploads at the same moment took the same slot
            return Response({'detail': 'Please try uploading the photo again.'},
                            status=status.HTTP_409_CONFLICT)
        check_photo(photo)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['delete'], url_path=r'photos/(?P<photo_id>\d+)')
    def delete_photo(self, request, pk=None, photo_id=None):
        """DELETE /api/listings/{id}/photos/{photo_id}/ - remove one photo (seller only)."""
        listing = self.get_object()  # also checks that you are the seller
        photo = listing.photos.filter(pk=photo_id).first()
        if photo is None:
            return Response({'detail': 'This photo does not exist.'},
                            status=status.HTTP_404_NOT_FOUND)
        image = photo.image
        photo.delete()
        image.delete(save=False)  # also remove the file from the server's disk
        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=['post'], url_path='photos/order')
    def order_photos(self, request, pk=None):
        """POST /api/listings/{id}/photos/order/ - {"order": [photo ids]}: the first one
        becomes the cover. Must list every photo of the listing exactly once."""
        listing = self.get_object()  # also checks that you are the seller
        order = request.data.get('order')
        photos = {photo.pk: photo for photo in listing.photos.all()}
        if (not isinstance(order, list) or not all(isinstance(i, int) for i in order)
                or sorted(order) != sorted(photos)):
            return Response({'detail': 'Send "order": a list with each photo id once.'},
                            status=status.HTTP_400_BAD_REQUEST)
        # Positions must stay 1-8 and unique at every moment, so the rows are replaced
        # in one go (same files, same fingerprints, new positions).
        with transaction.atomic():
            rows = [ListingPhoto(listing=listing, image=photos[i].image.name, position=n,
                                 fingerprint=photos[i].fingerprint)
                    for n, i in enumerate(order, start=1)]
            listing.photos.all().delete()
            ListingPhoto.objects.bulk_create(rows)
        data = ListingPhotoSerializer(listing.photos.all(), many=True,
                                      context={'request': request}).data
        return Response(data)

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
            # Hide listings that are flagged/rejected, whose seller is suspended/banned/
            # hidden, or whose seller and I have blocked each other.
            .filter(visible_listing_q(self.request.user, prefix='listing__'))
            .select_related('listing__category')
            .prefetch_related('listing__photos')
            .order_by('-created_at', '-id')
        )
