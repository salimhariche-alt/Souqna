"""All /api/ endpoints in one router, so the /api/ home page lists them all."""

from rest_framework.routers import DefaultRouter

from listings.views import CategoryViewSet, FavoriteViewSet, ListingViewSet
from messaging.views import ConversationViewSet
from moderation.views import BlockViewSet, ReportViewSet

router = DefaultRouter()
router.register('categories', CategoryViewSet, basename='category')
router.register('listings', ListingViewSet, basename='listing')
router.register('favorites', FavoriteViewSet, basename='favorite')
router.register('conversations', ConversationViewSet, basename='conversation')
router.register('reports', ReportViewSet, basename='report')
router.register('blocks', BlockViewSet, basename='block')

urlpatterns = router.urls
