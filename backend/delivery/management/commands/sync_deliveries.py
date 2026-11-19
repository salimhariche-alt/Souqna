"""python manage.py sync_deliveries - cancel the orders the seller didn't confirm in
time, then ask the delivery company for news about every order still on its way (to run
every few minutes on the server, e.g. with cron)."""

from django.core.management.base import BaseCommand

from delivery import services
from delivery.models import Order


class Command(BaseCommand):
    help = 'Update the status of every order still on its way.'

    def handle(self, *args, **options):
        services.expire_late_orders()
        orders = Order.objects.exclude(status__in=Order.FINAL)
        for order in orders:
            services.sync_order(order, force=True)
        self.stdout.write(f'{orders.count()} order(s) checked.')
