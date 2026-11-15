from rest_framework.routers import DefaultRouter

from .views import CategoryViewSet, FavoriteViewSet, ListingViewSet

router = DefaultRouter()
router.register('categories', CategoryViewSet, basename='category')
router.register('listings', ListingViewSet, basename='listing')
router.register('favorites', FavoriteViewSet, basename='favorite')

urlpatterns = router.urls
