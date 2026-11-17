from django.contrib import admin
from django.urls import reverse
from django.utils.html import format_html

from .models import Feedback


@admin.register(Feedback)
class FeedbackAdmin(admin.ModelAdmin):
    """Everything testers sent with "Send feedback" (newest first)."""

    list_display = ('created_at', 'short_message', 'sender', 'has_screenshot', 'platform',
                    'language', 'status')
    list_display_links = ('created_at', 'short_message')
    list_filter = ('status', 'platform', 'language')
    list_editable = ('status',)
    search_fields = ('message', 'user__display_name', 'user__phone', 'admin_note')
    list_select_related = ('user',)
    fields = ('sender', 'created_at', 'platform', 'language', 'message', 'screenshot_preview',
              'status', 'admin_note')
    readonly_fields = ('sender', 'created_at', 'platform', 'language', 'message',
                       'screenshot_preview')
    actions = ['mark_done']

    def has_add_permission(self, request):
        return False  # feedback only comes from the app

    def change_view(self, request, object_id, form_url='', extra_context=None):
        # Opening a new message marks it as read.
        Feedback.objects.filter(pk=object_id, status=Feedback.Status.NEW).update(
            status=Feedback.Status.READ)
        return super().change_view(request, object_id, form_url, extra_context)

    @admin.display(description='message')
    def short_message(self, feedback):
        text = feedback.message.strip().replace('\n', ' ')
        return text[:80] + ('...' if len(text) > 80 else '')

    @admin.display(description='from', ordering='user__display_name')
    def sender(self, feedback):
        user = feedback.user
        if user is None:
            return '-'
        url = reverse('admin:accounts_user_change', args=[user.pk])
        return format_html('<a href="{}">{}</a> ({})', url, user.display_name,
                           user.phone or user.email or '-')

    @admin.display(description='screenshot', boolean=True)
    def has_screenshot(self, feedback):
        return bool(feedback.screenshot)

    @admin.display(description='screenshot')
    def screenshot_preview(self, feedback):
        if not feedback.screenshot:
            return '-'
        return format_html('<a href="{0}" target="_blank" rel="noopener"><img src="{0}" '
                           'style="max-width:360px;max-height:640px;border:1px solid #ccc;'
                           'border-radius:6px"></a>', feedback.screenshot.url)

    @admin.action(description='Mark as done')
    def mark_done(self, request, queryset):
        count = queryset.update(status=Feedback.Status.DONE)
        self.message_user(request, f'{count} feedback message(s) marked as done.')
