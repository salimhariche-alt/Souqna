"""All /api/ endpoints in one router, so the /api/ home page lists them all."""

from rest_framework.routers import DefaultRouter

from listings.views import CategoryViewSet, FavoriteViewSet, ListingViewSet
from messaging.views import ConversationViewSet

router = DefaultRouter()
router.register('categories', CategoryViewSet, basename='category')
router.register('listings', ListingViewSet, basename='listing')
router.register('favorites', FavoriteViewSet, basename='favorite')
router.register('conversations', ConversationViewSet, basename='conversation')

urlpatterns = router.urls
