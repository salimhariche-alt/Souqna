from django.contrib import admin, messages
from django.db.models import Count
from django.http import HttpResponseRedirect
from django.template.response import TemplateResponse
from django.urls import path, reverse
from django.utils.html import format_html, format_html_join

from listings.models import Listing

from . import actions
from .content import forms, scan
from .models import (
    Block,
    BlockedPhone,
    ContentCategory,
    ContentFlag,
    ContentTerm,
    Device,
    DeviceAccount,
    FlaggedKeyword,
    ListingReview,
    ModerationLog,
    Report,
    Severity,
)
from .reports import AUTO_HIDE_REPORTERS, verified_reporters
from .strikes import strike_count

REASON_LABELS = {
    'low_price': 'Price much lower than usual',
    'duplicate_photo': "Photo copied from another seller's listing",
    'contact_phone': 'Phone number in the text',
    'contact_link': 'Link in the text',
    'advance_payment': 'Asks for payment in advance',
    'messaging_app': 'Mentions WhatsApp / Telegram / another app',
    'reported': 'Reported by users',
    'offensive_insult': 'Insult',
    'offensive_harassment': 'Harassment',
    'offensive_sexual': 'Sexual content',
    'offensive_threat': 'THREAT of violence',
    'offensive_extremism': 'TERRORISM / extremism',
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


# Reports ----------------------------------------------------------------------------

def admin_link(obj, label=None):
    if obj is None:
        return '—'
    url = reverse(f'admin:{obj._meta.app_label}_{obj._meta.model_name}_change', args=[obj.pk])
    return format_html('<a href="{}">{}</a>', url, label or str(obj))


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    """Reports from users. Open one to Approve (take action), Dismiss or Ban."""

    change_form_template = 'admin/moderation/report/change_form.html'
    list_display = ('created_at', 'target_type', 'what', 'reported_user', 'reason',
                    'reporter', 'reporter_verified', 'reports_on_it', 'status')
    list_filter = ('status', 'target_type', 'reason', 'created_at')
    search_fields = ('text', 'listing__title', 'message__text', 'reported_user__phone',
                     'reported_user__display_name', 'reporter__phone', 'reporter__display_name')
    list_select_related = ('listing', 'message', 'reported_user', 'reporter')
    readonly_fields = ('status', 'target_type', 'what', 'hidden_now', 'reported_user',
                       'reason', 'text', 'reporter', 'reporter_verified', 'reports_on_it',
                       'other_reports', 'created_at', 'handled_at', 'handled_by')
    fields = readonly_fields
    actions = ['approve_selected', 'dismiss_selected']

    def changelist_view(self, request, extra_context=None):
        # Opening "Reports" shows the ones waiting for review first.
        if request.method == 'GET' and not request.GET:
            return HttpResponseRedirect(request.path + '?status__exact=open')
        return super().changelist_view(request, extra_context)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    @admin.display(description='reported item')
    def what(self, report):
        if report.target_type == Report.Target.LISTING:
            return admin_link(report.listing, f'Listing: {report.listing}')
        if report.target_type == Report.Target.MESSAGE:
            if report.message.is_voice:  # listen to it right here
                from messaging.admin import audio_player
                return format_html('Voice message: {}', audio_player(report.message))
            text = report.message.text
            return format_html('Message: “{}”', text if len(text) <= 120 else text[:120] + '…')
        return admin_link(report.reported_user, f'User: {report.reported_user}')

    @admin.display(description='reporter phone verified', boolean=True)
    def reporter_verified(self, report):
        return report.reporter.phone_verified

    @admin.display(description='verified reporters (open)')
    def reports_on_it(self, report):
        n = verified_reporters(report.same_target())
        if n >= AUTO_HIDE_REPORTERS and report.target_type != Report.Target.MESSAGE:
            return format_html('<b style="color:#ba2121">{} — hidden automatically</b>', n)
        return n

    @admin.display(description='hidden right now?')
    def hidden_now(self, report):
        if report.target_type == Report.Target.LISTING:
            return report.listing.get_review_status_display()
        user = report.reported_user
        if user.banned_at:
            return 'User banned'
        if not user.is_active:
            return 'User suspended'
        return 'User hidden (reported)' if user.hidden_by_reports else 'Visible'

    @admin.display(description='all reports about this item')
    def other_reports(self, report):
        rows = report.same_target().select_related('reporter')
        return format_html_join(
            '', '<div>{} — <b>{}</b> by {} ({}){}</div>',
            ((r.created_at.strftime('%Y-%m-%d %H:%M'), r.get_reason_display(), r.reporter,
              r.get_status_display(), f': “{r.text}”' if r.text else '') for r in rows))

    @admin.action(description='Approve: take action (reject listing / suspend user)')
    def approve_selected(self, request, queryset):
        count = 0
        for report in queryset.filter(status=Report.Status.OPEN):
            report.refresh_from_db()
            if report.status == Report.Status.OPEN:  # not already closed with another one
                actions.approve_report(report, request.user)
                count += 1
        self.message_user(request, f'{count} report(s) approved.', messages.WARNING)

    @admin.action(description='Dismiss: nothing wrong, show it again')
    def dismiss_selected(self, request, queryset):
        count = 0
        for report in queryset.filter(status=Report.Status.OPEN):
            report.refresh_from_db()
            if report.status == Report.Status.OPEN:
                actions.dismiss_report(report, request.user)
                count += 1
        self.message_user(request, f'{count} report(s) dismissed.')

    def response_change(self, request, report):
        """The Approve / Dismiss / Ban buttons on a report's page."""
        if '_approve' in request.POST:
            actions.approve_report(report, request.user)
            self.message_user(request, f'Approved: {report}', messages.WARNING)
        elif '_dismiss' in request.POST:
            actions.dismiss_report(report, request.user)
            self.message_user(request, f'Dismissed: {report}')
        elif '_ban' in request.POST:
            if report.reported_user_id == request.user.pk:
                self.message_user(request, "You can't ban yourself.", messages.ERROR)
            else:
                actions.ban_from_report(report, request.user)
                self.message_user(request, f'Banned: {report.reported_user}', messages.WARNING)
        else:
            return super().response_change(request, report)
        return HttpResponseRedirect(reverse('admin:moderation_report_changelist'))


@admin.register(Block)
class BlockAdmin(admin.ModelAdmin):
    list_display = ('blocker', 'blocked', 'created_at')
    search_fields = ('blocker__phone', 'blocker__display_name',
                     'blocked__phone', 'blocked__display_name')
    list_select_related = ('blocker', 'blocked')
    readonly_fields = ('blocker', 'blocked', 'created_at')

    def has_add_permission(self, request):
        return False


# Content moderation (Safety step 4) ---------------------------------------------------

SEVERITY_COLORS = {Severity.WARN: '#b06000', Severity.HIDE: '#8a2be2', Severity.BLOCK: '#ba2121'}


@admin.register(ContentTerm)
class ContentTermAdmin(admin.ModelAdmin):
    """Insults, harassment, sexual content, threats, extremism: the words to look for.
    Use "Test a text" (top right) to try a sentence."""

    change_list_template = 'admin/moderation/contentterm/change_list.html'
    list_display = ('phrase', 'category', 'level', 'language', 'active', 'note')
    list_editable = ('active',)
    list_filter = ('category', 'language', 'active')
    search_fields = ('phrase', 'note')

    @admin.display(description='what happens')
    def level(self, term):
        return format_html('<b style="color:{}">{}</b>', SEVERITY_COLORS[term.severity],
                           Severity(term.severity).label)

    def get_urls(self):
        return [path('test/', self.admin_site.admin_view(self.test_view),
                     name='moderation_contentterm_test'),
                *super().get_urls()]

    def test_view(self, request):
        """Type any text and see what the checks find (and the cleaned versions)."""
        text = request.POST.get('text', '') if request.method == 'POST' else ''
        matches = scan(text) if text else []
        context = {
            **self.admin_site.each_context(request),
            'title': 'Test a text',
            'opts': self.model._meta,
            'text': text,
            'tested': bool(text),
            'matches': [{'category': ContentCategory(m.category).label,
                         'severity': Severity(m.severity).label,
                         'color': SEVERITY_COLORS[m.severity],
                         'phrases': ', '.join(m.phrases)} for m in matches],
            'forms': forms(text) if text else None,
        }
        return TemplateResponse(request, 'admin/moderation/contentterm/test.html', context)


class UrgentFirst(admin.SimpleListFilter):
    title = 'status'
    parameter_name = 'queue'

    def lookups(self, request, model_admin):
        return [('todo', 'To review (pending)'), ('urgent', 'Urgent only'),
                ('done', 'Reviewed')]

    def queryset(self, request, queryset):
        if self.value() == 'todo':
            return queryset.filter(status=ContentFlag.Status.PENDING)
        if self.value() == 'urgent':
            return queryset.filter(urgent=True)
        if self.value() == 'done':
            return queryset.exclude(status=ContentFlag.Status.PENDING)
        return queryset


@admin.register(ContentFlag)
class ContentFlagAdmin(admin.ModelAdmin):
    """The moderation queue: urgent items first. Open one for the context and buttons."""

    change_form_template = 'admin/moderation/contentflag/change_form.html'
    list_display = ('priority', 'created_at', 'category', 'source', 'user_label', 'snippet',
                    'strikes_30_days', 'status')
    list_display_links = ('priority', 'created_at', 'snippet')
    list_filter = (UrgentFirst, 'category', 'severity', 'source', 'status')
    search_fields = ('content', 'user_label', 'user_phone')
    ordering = ('-urgent', 'status', '-created_at')
    readonly_fields = ('priority', 'status', 'category', 'severity', 'source', 'user_link',
                       'user_phone', 'content_box', 'matched', 'where', 'conversation_context',
                       'strike', 'strike_history', 'created_at', 'reviewed_at', 'reviewed_by')
    fields = readonly_fields

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False  # evidence is kept

    @admin.display(description='priority', ordering='urgent')
    def priority(self, flag):
        if flag.urgent:
            return format_html('<b style="color:#fff;background:#ba2121;padding:2px 6px;'
                               'border-radius:4px">{}</b>', 'URGENT')
        return format_html('<span style="color:{}">{}</span>', SEVERITY_COLORS[flag.severity],
                           flag.get_severity_display())

    @admin.display(description='text')
    def snippet(self, flag):
        return flag.content if len(flag.content) <= 70 else flag.content[:70] + '…'

    @admin.display(description='strikes (30 days)')
    def strikes_30_days(self, flag):
        return strike_count(flag.user) if flag.user_id else '—'

    @admin.display(description='user')
    def user_link(self, flag):
        if flag.user_id is None:
            return f'{flag.user_label} (account deleted)'
        return admin_link(flag.user, flag.user_label)

    @admin.display(description='flagged text')
    def content_box(self, flag):
        return format_html('<div style="white-space:pre-wrap;padding:8px;background:#fff4cc;'
                           'border-radius:6px;max-width:640px">{}</div>', flag.content)

    @admin.display(description='where')
    def where(self, flag):
        if flag.listing_id:
            return admin_link(flag.listing, f'Listing: {flag.listing}')
        if flag.conversation_id:
            return admin_link(flag.conversation, f'Conversation #{flag.conversation_id}')
        return '—'

    @admin.display(description='conversation around it (copy)')
    def conversation_context(self, flag):
        if not flag.context:
            return '—'
        return format_html_join(
            '', '<div style="margin:2px 0"><span style="color:#666">{}</span> <b>{}</b>: {}</div>',
            ((row.get('sent_at', '')[:16].replace('T', ' '), row.get('sender', ''),
              row.get('text', '')) for row in flag.context))

    @admin.display(description="this user's strike history")
    def strike_history(self, flag):
        if flag.user_id is None:
            return '—'
        rows = (ContentFlag.objects.filter(user_id=flag.user_id)
                .exclude(pk=flag.pk).order_by('-created_at')[:20])
        if not rows:
            return 'No other flags.'
        return format_html_join(
            '', '<div>{} — <b>{}</b> ({}){}: {}</div>',
            ((r.created_at.strftime('%Y-%m-%d %H:%M'), r.get_category_display(),
              r.get_status_display(), ' · strike' if r.strike else '',
              r.content[:80]) for r in rows))

    def response_change(self, request, flag):
        """The Dismiss / Confirm / Suspend / Ban buttons."""
        if '_dismiss' in request.POST:
            actions.dismiss_flag(flag, request.user)
            self.message_user(request, 'Dismissed: the strike was removed.')
        elif '_confirm' in request.POST:
            actions.confirm_flag(flag, request.user)
            self.message_user(request, 'Confirmed.', messages.WARNING)
        elif '_suspend' in request.POST or '_ban' in request.POST:
            if flag.user_id is None:
                self.message_user(request, 'This account no longer exists.', messages.ERROR)
                return HttpResponseRedirect(request.path)
            if flag.user_id == request.user.pk:
                self.message_user(request, "You can't suspend or ban yourself.", messages.ERROR)
                return HttpResponseRedirect(request.path)
            actions.confirm_flag(flag, request.user)
            if '_ban' in request.POST:
                actions.ban_user(flag.user, request.user, f'Flag #{flag.pk}')
                self.message_user(request, f'Banned: {flag.user}', messages.WARNING)
            else:
                actions.suspend_user(flag.user, request.user, f'Flag #{flag.pk}')
                self.message_user(request, f'Suspended: {flag.user}', messages.WARNING)
        else:
            return super().response_change(request, flag)
        return HttpResponseRedirect(reverse('admin:moderation_contentflag_changelist'))


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
