from django.apps import AppConfig


class PushConfig(AppConfig):
    name = 'push'
    verbose_name = 'Push notifications'

    def ready(self):
        from django.db.models.signals import post_save

        from messaging.models import Message

        from . import service

        def on_message(sender, instance, created, **kwargs):
            # Hidden messages (harassment / sexual) are still delivered: the alert never
            # shows their words anyway.
            if created:
                service.new_message(instance)

        post_save.connect(on_message, sender=Message, dispatch_uid='push-new-message')
