from django.contrib import admin, messages
from django.utils.html import format_html

from . import services
from .models import Commune, Notification, Offer, Order, OrderEvent
from .providers import ProviderError


class OrderEventInline(admin.TabularInline):
    model = OrderEvent
    extra = 0
    can_delete = False
    readonly_fields = ('status', 'note', 'created_at')

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    """All orders sent by delivery. Filter by status, wilaya, mode and company."""

    list_display = ('id', 'listing', 'seller', 'buyer', 'mode', 'route', 'status_badge',
                    'item_price_dzd', 'delivery_price_dzd', 'buyer_fee_dzd', 'total',
                    'tracking_number', 'created_at')
    list_display_links = ('id', 'listing')
    list_filter = ('status', 'cancel_reason', 'wilaya', 'provider', 'created_at')
    search_fields = ('tracking_number', 'listing__title', 'buyer__phone', 'buyer__display_name',
                     'seller__phone', 'seller__display_name', 'recipient_phone', 'recipient_name')
    list_select_related = ('listing', 'buyer', 'seller', 'commune')
    date_hierarchy = 'created_at'
    inlines = [OrderEventInline]
    readonly_fields = ('conversation', 'listing', 'buyer', 'seller', 'provider', 'mode',
                       'origin_wilaya', 'wilaya', 'commune', 'stop_desk_name', 'relay_point_id',
                       'relay_point_address', 'address', 'recipient_name', 'recipient_phone',
                       'item_price_dzd', 'delivery_price_dzd', 'buyer_fee_dzd',
                       'relay_handling_dzd', 'total', 'confirm_by', 'confirmed_at',
                       'drop_off_point_id', 'drop_off_point_name', 'drop_off_point_address',
                       'tracking_number', 'status', 'cancel_reason', 'last_synced_at',
                       'created_at', 'updated_at')
    actions = ['refresh_from_company', 'cancel_orders']

    def has_add_permission(self, request):
        return False  # orders only come from the app

    @admin.display(description='wilayas')
    def route(self, order):
        return f'{order.origin_wilaya:02d} -> {order.wilaya:02d}'

    @admin.display(description='to pay at delivery (DA)')
    def total(self, order):
        return order.total_to_pay_dzd

    @admin.display(description='status', ordering='status')
    def status_badge(self, order):
        color = {'delivered': '#5C6B33', 'returned': '#9A3A20', 'cancelled': '#6B5A4C'}.get(
            order.status, '#B4472A')
        return format_html('<b style="color:{}">{}</b>', color, order.get_status_display())

    @admin.action(description='Ask the delivery company for news')
    def refresh_from_company(self, request, queryset):
        for order in queryset:
            services.sync_order(order, force=True)
        self.message_user(request, f'{queryset.count()} order(s) refreshed.')

    @admin.action(description='Cancel (only before drop-off)')
    def cancel_orders(self, request, queryset):
        done = 0
        for order in queryset:
            try:
                services.cancel_order(order)
                done += 1
            except ProviderError:
                pass
        self.message_user(request, f'{done} order(s) cancelled.',
                          messages.SUCCESS if done else messages.WARNING)


@admin.register(Commune)
class CommuneAdmin(admin.ModelAdmin):
    list_display = ('code', 'name_fr', 'name_ar', 'wilaya')
    list_filter = ('wilaya',)
    search_fields = ('name_fr', 'name_ar', 'code')


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'user', 'kind', 'status', 'order', 'read')
    list_filter = ('kind', 'status', 'read')
    search_fields = ('user__phone', 'user__display_name')
    list_select_related = ('user', 'order')


@admin.register(Offer)
class OfferAdmin(admin.ModelAdmin):
    """ "Faire une offre": every offer, its amount and what happened to it."""

    list_display = ('id', 'listing', 'buyer', 'seller', 'amount_dzd', 'list_price_dzd', 'status',
                    'created_at', 'valid_until')
    list_filter = ('status', 'created_at')
    search_fields = ('listing__title', 'buyer__phone', 'buyer__display_name', 'seller__phone',
                     'seller__display_name')
    list_select_related = ('listing', 'buyer', 'seller')
    readonly_fields = ('conversation', 'listing', 'buyer', 'seller', 'amount_dzd',
                       'list_price_dzd', 'status', 'created_at', 'responded_at', 'valid_until')

    def has_add_permission(self, request):
        return False
