from datetime import timedelta

from django.conf import settings
from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.forms import UserChangeForm, UserCreationForm
from django.db.models import Count, Q
from django.http import HttpResponseRedirect
from django.urls import reverse
from django.utils import timezone
from django.utils.html import format_html, format_html_join
from django.utils.safestring import mark_safe

from moderation import actions as moderation_actions
from moderation.models import ModerationLog

from .models import InviteCode, PhoneVerification, User


def verify_phone_by_admin(user, admin_user) -> bool:
    """Mark the user's phone as verified (beta mode: instead of an SMS code).
    Returns False if there was nothing to do."""
    if user.phone_verified or not user.phone:
        return False
    user.phone_verified = True
    user.phone_verified_at = timezone.now()
    user.save(update_fields=['phone_verified', 'phone_verified_at'])
    moderation_actions.log(admin_user, ModerationLog.Action.VERIFY_PHONE, user)
    return True


class WaitingForVerificationFilter(admin.SimpleListFilter):
    """Beta mode: new accounts that still need the admin's "Verify" click."""

    title = 'verification'
    parameter_name = 'waiting'

    def lookups(self, request, model_admin):
        return [('yes', 'Waiting for verification')]

    def queryset(self, request, queryset):
        if self.value() == 'yes':
            return queryset.filter(phone_verified=False, phone__isnull=False, is_active=True,
                                   deleted_at__isnull=True)
        return queryset


class SougnaUserCreationForm(UserCreationForm):
    class Meta:
        model = User
        fields = ('phone', 'email', 'display_name')


class SougnaUserChangeForm(UserChangeForm):
    class Meta:
        model = User
        fields = '__all__'


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    form = SougnaUserChangeForm
    add_form = SougnaUserCreationForm

    list_display = ('phone', 'display_name', 'email', 'wilaya', 'verification',
                    'items_sold_count',
                    'suspicious_messages', 'open_reports', 'strikes', 'account_status',
                    'invite_code', 'preferred_language',
                    'is_staff', 'date_joined')
    list_filter = (WaitingForVerificationFilter, 'phone_verified', 'is_active',
                   'hidden_by_reports', 'invite_code', 'preferred_language', 'wilaya', 'is_staff')
    list_select_related = ('invite_code',)
    search_fields = ('phone', 'display_name', 'email', 'invite_code__code', 'invite_code__name')
    ordering = ('-date_joined',)
    actions = ['mark_phone_verified', 'suspend_users', 'reactivate_users', 'ban_users',
               'remove_avatars']

    fieldsets = (
        (None, {'fields': ('phone', 'password')}),
        ('Profile', {'fields': ('display_name', 'email', 'wilaya', 'preferred_language',
                                'avatar', 'deleted_at')}),
        ('Trust', {'fields': ('phone_verified', 'phone_verified_at', 'banned_at',
                              'hidden_by_reports', 'messaging_blocked_until',
                              'safety_tips_seen_at', 'invite_code')}),
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

    @admin.display(description='phone verified', ordering='phone_verified')
    def verification(self, user):
        """A green tick, or a one-click "Verify" button (it is inside the list's form, so
        it is sent with the page's security token - see changelist_view)."""
        if user.phone_verified:
            return mark_safe('<span style="color:#17784A" title="verified">&#10004;</span>')
        if not user.phone or user.deleted_at or not user.is_active:
            return '-'
        return format_html('<button type="submit" name="_verify_user" value="{}" class="button" '
                           'style="padding:2px 10px">Verify</button>', user.pk)

    def changelist_view(self, request, extra_context=None):
        # The "Verify" button of one row (see verification above).
        if request.method == 'POST' and '_verify_user' in request.POST:
            if not self.has_change_permission(request):
                return HttpResponseRedirect(request.get_full_path())
            user = User.objects.filter(pk=request.POST['_verify_user']).first()
            if user and verify_phone_by_admin(user, request.user):
                self.message_user(request, f'{user.display_name} ({user.phone}) is now verified.')
            else:
                self.message_user(request, 'Nothing to do: already verified or no phone.',
                                  messages.WARNING)
            return HttpResponseRedirect(request.get_full_path())
        extra_context = extra_context or {}
        if settings.BETA_MODE:
            waiting = User.objects.filter(phone_verified=False, phone__isnull=False,
                                          is_active=True, deleted_at__isnull=True).count()
            extra_context['subtitle'] = (f'Beta mode: {waiting} account(s) waiting for '
                                         'verification (filter "Waiting for verification")')
        return super().changelist_view(request, extra_context)

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
        count = sum(verify_phone_by_admin(user, request.user)
                    for user in queryset.filter(phone_verified=False, phone__isnull=False))
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

    @admin.action(description='Remove profile photo (e.g. after a report)')
    def remove_avatars(self, request, queryset):
        count = 0
        for user in queryset.exclude(avatar=''):
            user.avatar.delete(save=True)
            moderation_actions.log(request.user, ModerationLog.Action.REMOVE_AVATAR, user)
            count += 1
        self.message_user(request, f'{count} profile photo(s) removed.')


@admin.register(InviteCode)
class InviteCodeAdmin(admin.ModelAdmin):
    """Beta mode: codes needed to sign up. Leave "code" empty to get a random one."""

    list_display = ('name', 'code_display', 'uses_display', 'expires_at', 'state', 'created_at')
    list_filter = ('is_active',)
    search_fields = ('name', 'code')
    fields = ('name', 'code', 'max_uses', 'expires_at', 'is_active', 'how_to_share',
              'people_who_joined')
    readonly_fields = ('how_to_share', 'people_who_joined')

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(_uses=Count('users'))

    @admin.display(description='code', ordering='code')
    def code_display(self, invite):
        return format_html('<b style="font-family:monospace;font-size:1.1em">{}</b>',
                           invite.code)

    @admin.display(description='used', ordering='_uses')
    def uses_display(self, invite):
        url = reverse('admin:accounts_user_changelist')
        return format_html('<a href="{}?invite_code__id__exact={}">{} / {}</a>',
                           url, invite.pk, invite._uses, invite.max_uses)

    @admin.display(description='status')
    def state(self, invite):
        problem = invite.problem()
        if problem is None:
            return mark_safe('<b style="color:#17784A">works</b>')
        label = {'inactive': 'turned off', 'expired': 'expired', 'used_up': 'used up'}[problem]
        return format_html('<b style="color:#ba2121">{}</b>', label)

    @admin.display(description='how to share it')
    def how_to_share(self, invite):
        if not invite.pk:
            return 'Save first: the code appears here.'
        return format_html(
            'Send this to your testers:<br><code style="font-size:1.1em">Open https://sougnadz.com '
            '(or the app), tap Profile -> Sign up, and enter the invite code {}</code>',
            invite.code)

    @admin.display(description='people who joined with this code')
    def people_who_joined(self, invite):
        if not invite.pk:
            return '-'
        users = invite.users.order_by('-date_joined')
        if not users:
            return 'Nobody yet.'
        return format_html('<ul style="margin:0;padding-left:1.2em">{}</ul>', format_html_join(
            '', '<li><a href="{}">{}</a> - {} - joined {} - {}</li>',
            ((reverse('admin:accounts_user_change', args=[u.pk]), u.display_name,
              u.phone or u.email, f'{u.date_joined:%d/%m/%Y %H:%M}',
              'verified' if u.phone_verified else 'waiting for verification')
             for u in users)))


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
