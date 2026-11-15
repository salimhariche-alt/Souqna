from django.contrib import admin
from django.db.models import Count, Q

from .models import Conversation, Message


class MessageInline(admin.TabularInline):
    model = Message
    extra = 0
    fields = ('sender', 'text', 'sent_at', 'read')
    readonly_fields = ('sent_at',)
    autocomplete_fields = ('sender',)


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ('listing', 'buyer', 'seller', 'message_count', 'unread_count',
                    'created_at')
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
        )

    @admin.display(description='messages', ordering='_message_count')
    def message_count(self, obj):
        return obj._message_count

    @admin.display(description='unread', ordering='_unread_count')
    def unread_count(self, obj):
        return obj._unread_count


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ('short_text', 'sender', 'conversation', 'sent_at', 'read')
    list_filter = ('read', 'sent_at')
    search_fields = ('text', 'sender__phone', 'sender__display_name')
    autocomplete_fields = ('conversation', 'sender')
    list_select_related = ('sender', 'conversation__listing', 'conversation__buyer',
                           'conversation__seller')
    date_hierarchy = 'sent_at'

    @admin.display(description='text')
    def short_text(self, obj):
        return obj.text if len(obj.text) <= 60 else obj.text[:60] + '…'
