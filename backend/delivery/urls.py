from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import CommuneListView, NotificationViewSet, OrderViewSet, QuoteView

router = DefaultRouter()
router.register('orders', OrderViewSet, basename='order')
router.register('notifications', NotificationViewSet, basename='notification')

urlpatterns = [
    path('communes/', CommuneListView.as_view(), name='communes'),
    path('delivery/quote/', QuoteView.as_view(), name='delivery-quote'),
    *router.urls,
]
