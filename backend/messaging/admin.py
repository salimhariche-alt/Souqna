from django.contrib import admin
from django.db.models import Count, Max, Q
from django.utils.html import format_html

from .models import Conversation, Message


def audio_player(message):
    """A small player to listen to a voice message in the admin."""
    if not message or not message.is_voice:
        return '—'
    seconds = round((message.duration_ms or 0) / 1000)
    return format_html('<audio controls preload="none" src="{}" style="height:32px"></audio> '
                       '<span style="color:#666">{} s</span>', message.audio.url, seconds)


class MessageInline(admin.TabularInline):
    model = Message
    extra = 0
    fields = ('sender', 'text', 'voice', 'sent_at', 'read')
    readonly_fields = ('voice', 'sent_at')
    autocomplete_fields = ('sender',)

    @admin.display(description='voice')
    def voice(self, obj):
        return audio_player(obj)


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ('listing', 'buyer', 'seller', 'message_count', 'unread_count',
                    'last_activity', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('listing__title', 'buyer__phone', 'buyer__display_name',
                     'seller__phone', 'seller__display_name')
    autocomplete_fields = ('listing', 'buyer', 'seller')
    list_select_related = ('listing', 'buyer', 'seller')
    readonly_fields = ('created_at',)
    inlines = [MessageInline]

    def get_queryset(self, request):
        return super().get_queryset(request).annotate(
            _message_count=Count('messages'),
            _unread_count=Count('messages', filter=Q(messages__read=False)),
            _last_activity=Max('messages__sent_at'),
        )

    @admin.display(description='last activity', ordering='_last_activity')
    def last_activity(self, obj):
        return obj._last_activity

    @admin.display(description='messages', ordering='_message_count')
    def message_count(self, obj):
        return obj._message_count

    @admin.display(description='unread', ordering='_unread_count')
    def unread_count(self, obj):
        return obj._unread_count


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ('short_text', 'voice', 'sender', 'conversation', 'sent_at', 'read',
                    'flagged', 'warnings')
    readonly_fields = ('voice', 'duration_ms')
    # "flagged" = phone number, link, WhatsApp/Telegram or payment-in-advance words.
    list_filter = ('flagged', 'read', 'sent_at')
    search_fields = ('text', 'sender__phone', 'sender__display_name')
    autocomplete_fields = ('conversation', 'sender')
    list_select_related = ('sender', 'conversation__listing', 'conversation__buyer',
                           'conversation__seller')
    date_hierarchy = 'sent_at'

    @admin.display(description='text')
    def short_text(self, obj):
        return obj.text if len(obj.text) <= 60 else obj.text[:60] + '…'

    @admin.display(description='voice')
    def voice(self, obj):
        return audio_player(obj)

    @admin.display(description='why it was marked')
    def warnings(self, obj):
        return '; '.join(r.get('detail', r.get('code', '')) for r in obj.flag_reasons) or '—'
