from datetime import timedelta

from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm
from django.db.models import Count, Q
from django.urls import reverse
from django.utils import timezone
from django.utils.html import format_html

from moderation import actions as moderation_actions
from moderation.models import ModerationLog

from .models import PhoneVerification, User


class SouqnaUserCreationForm(UserCreationForm):
    class Meta:
        model = User
        fields = ('phone', 'email', 'display_name')


class SouqnaUserChangeForm(UserChangeForm):
    class Meta:
        model = User
        fields = '__all__'


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    form = SouqnaUserChangeForm
    add_form = SouqnaUserCreationForm

    list_display = ('phone', 'display_name', 'email', 'wilaya', 'phone_verified', 'items_sold_count',
                    'suspicious_messages', 'open_reports', 'strikes', 'account_status',
                    'preferred_language',
                    'is_staff', 'date_joined')
    list_filter = ('phone_verified', 'is_active', 'hidden_by_reports', 'preferred_language',
                   'wilaya', 'is_staff')
    search_fields = ('phone', 'display_name', 'email')
    ordering = ('-date_joined',)
    actions = ['mark_phone_verified', 'suspend_users', 'reactivate_users', 'ban_users']

    fieldsets = (
        (None, {'fields': ('phone', 'password')}),
        ('Profile', {'fields': ('display_name', 'email', 'wilaya', 'preferred_language')}),
        ('Trust', {'fields': ('phone_verified', 'phone_verified_at', 'banned_at',
                              'hidden_by_reports', 'messaging_blocked_until',
                              'safety_tips_seen_at')}),
        ('Permissions', {'fields': ('is_active', 'is_staff', 'is_superuser',
                                    'groups', 'user_permissions')}),
        ('Important dates', {'fields': ('last_login', 'date_joined')}),
    )
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'description': 'Enter a phone number, an email, or both.',
            'fields': ('phone', 'email', 'display_name', 'password1', 'password2'),
        }),
    )

    def get_queryset(self, request):
        # Count for the whole page at once (not one query per user). "distinct" because
        # several counts in one query would otherwise multiply each other.
        return super().get_queryset(request).annotate(
            _items_sold=Count('listings', filter=Q(listings__status='sold'), distinct=True),
            _suspicious_messages=Count('messages_sent', filter=Q(messages_sent__flagged=True),
                                       distinct=True),
            _open_reports=Count('reports_received', filter=Q(reports_received__status='open'),
                                distinct=True),
            _strikes=Count('content_flags', distinct=True, filter=Q(
                content_flags__strike=True,
                content_flags__created_at__gte=timezone.now() - timedelta(days=30),
            ) & ~Q(content_flags__status='dismissed')),
        )

    @admin.display(description='strikes (30 days)', ordering='_strikes')
    def strikes(self, user):
        n = user._strikes
        if not n:
            return 0
        url = reverse('admin:moderation_contentflag_changelist')
        return format_html('<a href="{}?user__id__exact={}"><b style="color:#ba2121">{}</b></a>',
                           url, user.pk, n)

    @admin.display(description='items sold', ordering='_items_sold')
    def items_sold_count(self, user):
        return user._items_sold

    @admin.display(description='suspicious messages', ordering='_suspicious_messages')
    def suspicious_messages(self, user):
        """Messages with a phone number, link, WhatsApp/Telegram or payment words."""
        n = user._suspicious_messages
        if not n:
            return 0
        url = reverse('admin:messaging_message_changelist')
        return format_html('<a href="{}?flagged__exact=1&sender__id__exact={}">{}</a>',
                           url, user.pk, n)

    @admin.display(description='open reports', ordering='_open_reports')
    def open_reports(self, user):
        n = user._open_reports
        if not n:
            return 0
        url = reverse('admin:moderation_report_changelist')
        return format_html('<a href="{}?status__exact=open&reported_user__id__exact={}">'
                           '<b style="color:#ba2121">{}</b></a>', url, user.pk, n)

    @admin.display(description='account')
    def account_status(self, user):
        if user.banned_at:
            return format_html('<b style="color:#ba2121">banned</b>')
        if not user.is_active:
            return format_html('<b style="color:#b06000">suspended</b>')
        if user.hidden_by_reports:
            return format_html('<b style="color:#b06000">hidden (reported)</b>')
        return 'active'

    @admin.action(description='Mark phone as verified')
    def mark_phone_verified(self, request, queryset):
        count = 0
        for user in queryset.filter(phone_verified=False, phone__isnull=False):
            user.phone_verified = True
            user.phone_verified_at = timezone.now()
            user.save(update_fields=['phone_verified', 'phone_verified_at'])
            moderation_actions.log(request.user, ModerationLog.Action.VERIFY_PHONE, user)
            count += 1
        self.message_user(request, f'{count} user(s) marked as verified.')

    @admin.action(description='Suspend selected users (can be undone)')
    def suspend_users(self, request, queryset):
        users = list(queryset.exclude(pk=request.user.pk))  # never yourself
        for user in users:
            moderation_actions.suspend_user(user, request.user)
        self.message_user(request, f'{len(users)} user(s) suspended.', messages.WARNING)

    @admin.action(description='Reactivate selected users')
    def reactivate_users(self, request, queryset):
        users = list(queryset.filter(is_active=False))
        for user in users:
            moderation_actions.reactivate_user(user, request.user)
        self.message_user(request, f'{len(users)} user(s) reactivated.')

    @admin.action(description='Ban selected users (also blocks their phone and devices)')
    def ban_users(self, request, queryset):
        users = list(queryset.exclude(pk=request.user.pk))  # never yourself
        for user in users:
            moderation_actions.ban_user(user, request.user)
        self.message_user(request, f'{len(users)} user(s) banned.', messages.WARNING)


@admin.register(PhoneVerification)
class PhoneVerificationAdmin(admin.ModelAdmin):
    """Pending SMS codes. The code itself is never shown (only a scrambled version is stored)."""

    list_display = ('user', 'phone', 'sent_at', 'expires_at', 'failed_attempts', 'locked_until')
    search_fields = ('user__phone', 'user__display_name', 'phone')
    readonly_fields = ('user', 'phone', 'sent_at', 'expires_at', 'failed_attempts')
    exclude = ('code_hash',)
    list_select_related = ('user',)

    def has_add_permission(self, request):
        return False
