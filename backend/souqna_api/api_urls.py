"""All /api/ endpoints in one router, so the /api/ home page lists them all."""

from django.urls import path
from rest_framework.routers import DefaultRouter

from accounts.views import MemberSearchView, PublicProfileView
from feedback.views import FeedbackView
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

urlpatterns = [
    # A seller's public profile (never their phone or email).
    path('users/', MemberSearchView.as_view(), name='member-search'),
    path('users/<int:pk>/', PublicProfileView.as_view(), name='public-profile'),
    # "Send feedback" from the Profile tab (logged in).
    path('feedback/', FeedbackView.as_view(), name='feedback'),
    *router.urls,
]
