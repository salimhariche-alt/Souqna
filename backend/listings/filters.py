import django_filters
from django.db.models import Q

from souqna_api.wilayas import Wilaya

from .models import Listing


class ListingFilter(django_filters.FilterSet):
    """Filters for /api/listings/, e.g. ?category=1&wilaya=16&min_price=1000&max_price=5000"""

    category = django_filters.NumberFilter(
        method='filter_category',
        label='Category id (also matches its sub-categories)',
    )
    wilaya = django_filters.TypedChoiceFilter(choices=Wilaya.choices, coerce=int)
    min_price = django_filters.NumberFilter(field_name='price_dzd', lookup_expr='gte')
    max_price = django_filters.NumberFilter(field_name='price_dzd', lookup_expr='lte')
    size = django_filters.CharFilter(field_name='size', lookup_expr='iexact')
    condition = django_filters.ChoiceFilter(choices=Listing.Condition.choices)

    class Meta:
        model = Listing
        fields = ['category', 'wilaya', 'min_price', 'max_price', 'size', 'condition']

    def filter_category(self, queryset, name, value):
        return queryset.filter(Q(category_id=value) | Q(category__parent_id=value))
