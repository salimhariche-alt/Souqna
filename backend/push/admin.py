from django.contrib import admin

from .models import PushDevice, PushSettings


@admin.register(PushDevice)
class PushDeviceAdmin(admin.ModelAdmin):
    """Phones that receive push notifications (the address is not secret, but it is
    personal: only for checking problems)."""

    list_display = ('user', 'platform', 'created_at', 'last_seen')
    list_filter = ('platform',)
    search_fields = ('user__phone', 'user__display_name')
    readonly_fields = ('user', 'token', 'platform', 'created_at', 'last_seen')

    def has_add_permission(self, request):
        return False


@admin.register(PushSettings)
class PushSettingsAdmin(admin.ModelAdmin):
    list_display = ('user', 'orders', 'messages')
    list_filter = ('orders', 'messages')
    search_fields = ('user__phone', 'user__display_name')
