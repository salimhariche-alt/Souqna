from django.contrib import admin, messages
from django.db.models import Count
from django.http import HttpResponseRedirect
from django.urls import reverse
from django.utils.html import format_html, format_html_join

from listings.models import Listing

from . import actions
from .models import (
    BlockedPhone,
    Device,
    DeviceAccount,
    FlaggedKeyword,
    ListingReview,
    ModerationLog,
)

REASON_LABELS = {
    'low_price': 'Price much lower than usual',
    'duplicate_photo': "Photo copied from another seller's listing",
    'contact_phone': 'Phone number in the text',
    'contact_link': 'Link in the text',
    'advance_payment': 'Asks for payment in advance',
}


def reasons_html(listing):
    if not listing.flag_reasons:
        return '—'
    return format_html_join(
        '', '<div><b>{}</b><br><span style="color:#666">{}</span></div>',
        ((REASON_LABELS.get(r.get('code'), r.get('code')), r.get('detail', ''))
         for r in listing.flag_reasons),
    )


# "Needs review" -------------------------------------------------------------------

@admin.register(ListingReview)
class ListingReviewAdmin(admin.ModelAdmin):
    """Listings flagged by the automatic checks. Approve or reject each one."""

    change_form_template = 'admin/moderation/listingreview/change_form.html'
    list_display = ('cover', 'title', 'price_dzd', 'seller', 'seller_verified', 'reasons',
                    'flagged_at')
    list_display_links = ('cover', 'title')
    list_select_related = ('seller', 'category')
    search_fields = ('title', 'description', 'seller__phone', 'seller__display_name')
    ordering = ('flagged_at',)  # oldest first: they've waited longest
    actions = ['approve_selected', 'reject_selected']
    readonly_fields = ('photos_preview', 'reasons', 'title', 'description', 'price_dzd',
                       'category', 'condition', 'wilaya', 'seller', 'created_at', 'flagged_at')
    fields = readonly_fields

    def get_queryset(self, request):
        return (super().get_queryset(request)
                .filter(review_status=Listing.Review.PENDING)
                .prefetch_related('photos'))

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    @admin.display(description='photo')
    def cover(self, listing):
        photo = next(iter(listing.photos.all()), None)
        if not photo:
            return '—'
        return format_html('<img src="{}" style="height:48px;width:48px;object-fit:cover;'
                           'border-radius:4px">', photo.image.url)

    @admin.display(description='photos')
    def photos_preview(self, listing):
        return format_html_join(
            '', '<img src="{}" style="height:120px;margin:0 6px 6px 0;border-radius:6px">',
            ((p.image.url,) for p in listing.photos.all())) or '—'

    @admin.display(description='why it was flagged')
    def reasons(self, listing):
        return reasons_html(listing)

    @admin.display(description='seller phone verified', boolean=True)
    def seller_verified(self, listing):
        return listing.seller.phone_verified

    @admin.action(description='Approve selected listings')
    def approve_selected(self, request, queryset):
        count = 0
        for listing in queryset:
            actions.approve_listing(listing, request.user)
            count += 1
        self.message_user(request, f'{count} listing(s) approved.')

    @admin.action(description='Reject selected listings')
    def reject_selected(self, request, queryset):
        count = 0
        for listing in queryset:
            actions.reject_listing(listing, request.user)
            count += 1
        self.message_user(request, f'{count} listing(s) rejected.', messages.WARNING)

    def response_change(self, request, listing):
        """The Approve / Reject buttons on a listing's page."""
        if '_approve' in request.POST:
            actions.approve_listing(listing, request.user)
            self.message_user(request, f'Approved: {listing}')
        elif '_reject' in request.POST:
            actions.reject_listing(listing, request.user)
            self.message_user(request, f'Rejected: {listing}', messages.WARNING)
        else:
            return super().response_change(request, listing)
        return HttpResponseRedirect(reverse('admin:moderation_listingreview_changelist'))


# Suspicious words -------------------------------------------------------------------

@admin.register(FlaggedKeyword)
class FlaggedKeywordAdmin(admin.ModelAdmin):
    list_display = ('phrase', 'language', 'active', 'note')
    list_editable = ('active',)
    list_filter = ('language', 'active')
    search_fields = ('phrase', 'note')


# Devices ------------------------------------------------------------------------

class TooManyAccountsFilter(admin.SimpleListFilter):
    title = 'accounts on this device'
    parameter_name = 'accounts'

    def lookups(self, request, model_admin):
        return [('suspicious', f'More than {Device.MAX_NORMAL_ACCOUNTS}'),
                ('normal', f'{Device.MAX_NORMAL_ACCOUNTS} or fewer')]

    def queryset(self, request, queryset):
        if self.value() == 'suspicious':
            return queryset.filter(_accounts__gt=Device.MAX_NORMAL_ACCOUNTS)
        if self.value() == 'normal':
            return queryset.filter(_accounts__lte=Device.MAX_NORMAL_ACCOUNTS)
        return queryset


class DeviceAccountInline(admin.TabularInline):
    model = DeviceAccount
    extra = 0
    fields = ('user', 'first_seen', 'last_seen')
    readonly_fields = fields
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Device)
class DeviceAdmin(admin.ModelAdmin):
    list_display = ('short_id', 'account_count', 'suspicious', 'banned', 'first_seen', 'last_seen')
    list_filter = (TooManyAccountsFilter, 'banned')
    search_fields = ('device_id', 'links__user__phone', 'links__user__display_name')
    readonly_fields = ('device_id', 'first_seen', 'last_seen')
    fields = ('device_id', 'banned', 'first_seen', 'last_seen')
    inlines = [DeviceAccountInline]
    actions = ['ban_selected']

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(_accounts=Count('links', distinct=True))

    @admin.display(description='device')
    def short_id(self, device):
        return str(device)

    @admin.display(description='accounts', ordering='_accounts')
    def account_count(self, device):
        return device._accounts

    @admin.display(description='flag')
    def suspicious(self, device):
        if device._accounts > Device.MAX_NORMAL_ACCOUNTS:
            return format_html('<b style="color:#ba2121">⚠ suspicious ({} accounts)</b>',
                               device._accounts)
        return ''

    @admin.action(description='Ban selected devices (no new accounts)')
    def ban_selected(self, request, queryset):
        count = 0
        for device in queryset:
            device.banned = True
            device.save(update_fields=['banned'])
            actions.log(request.user, ModerationLog.Action.BAN_DEVICE, device)
            count += 1
        self.message_user(request, f'{count} device(s) banned.', messages.WARNING)


@admin.register(BlockedPhone)
class BlockedPhoneAdmin(admin.ModelAdmin):
    list_display = ('phone', 'reason', 'created_at')
    search_fields = ('phone', 'reason')


# Moderation log (read-only) ---------------------------------------------------------

@admin.register(ModerationLog)
class ModerationLogAdmin(admin.ModelAdmin):
    list_display = ('created_at', 'actor', 'action', 'target_type', 'target_label', 'note')
    list_filter = ('action', 'target_type', 'created_at')
    search_fields = ('target_label', 'note', 'actor__display_name', 'actor__phone')
    date_hierarchy = 'created_at'

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
