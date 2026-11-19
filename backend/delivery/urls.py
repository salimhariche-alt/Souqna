from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    CommuneListView,
    EstimateView,
    NotificationViewSet,
    OfferViewSet,
    OrderViewSet,
    RelayPointListView,
)

router = DefaultRouter()
router.register('orders', OrderViewSet, basename='order')
router.register('notifications', NotificationViewSet, basename='notification')
router.register('offers', OfferViewSet, basename='offer')

urlpatterns = [
    path('communes/', CommuneListView.as_view(), name='communes'),
    path('delivery/relay-points/', RelayPointListView.as_view(), name='delivery-relay-points'),
    path('delivery/estimate/', EstimateView.as_view(), name='delivery-estimate'),
    *router.urls,
]
