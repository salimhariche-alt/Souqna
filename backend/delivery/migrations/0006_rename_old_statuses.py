"""Step E: the old status names become the new ones, and orders still waiting get a
deadline for the seller's confirmation (24 hours after they were placed)."""

from datetime import timedelta

from django.db import migrations

RENAMED = {'picked_up': 'dropped_off', 'out_for_delivery': 'at_relay'}


def forwards(apps, schema_editor):
    for name in ('Order', 'OrderEvent', 'Notification'):
        model = apps.get_model('delivery', name)
        for old, new in RENAMED.items():
            model.objects.filter(status=old).update(status=new)
    Order = apps.get_model('delivery', 'Order')
    for order in Order.objects.filter(status='created', confirm_by__isnull=True):
        order.confirm_by = order.created_at + timedelta(hours=24)
        order.save(update_fields=['confirm_by'])


def backwards(apps, schema_editor):
    for name in ('Order', 'OrderEvent', 'Notification'):
        model = apps.get_model('delivery', name)
        for old, new in RENAMED.items():
            model.objects.filter(status=new).update(status=old)


class Migration(migrations.Migration):
    dependencies = [('delivery', '0005_seller_confirmation')]
    operations = [migrations.RunPython(forwards, backwards)]
