from datetime import datetime, time

from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from django_filters import rest_framework as filters

from .models import Sale


class SaleFilter(filters.FilterSet):
    start_date = filters.CharFilter(method="filter_start_date")
    end_date = filters.CharFilter(method="filter_end_date")

    class Meta:
        model = Sale
        fields = ["product", "start_date", "end_date"]

    def filter_start_date(self, queryset, name, value):
        if not value:
            return queryset
        dt = parse_datetime(value)
        if dt is not None:
            if timezone.is_naive(dt):
                dt = timezone.make_aware(dt)
            return queryset.filter(sold_at__gte=dt)
        d = parse_date(value)
        if d is not None:
            dt = timezone.make_aware(datetime.combine(d, time.min))
            return queryset.filter(sold_at__gte=dt)
        return queryset

    def filter_end_date(self, queryset, name, value):
        if not value:
            return queryset
        dt = parse_datetime(value)
        if dt is not None:
            if timezone.is_naive(dt):
                dt = timezone.make_aware(dt)
            return queryset.filter(sold_at__lte=dt)
        d = parse_date(value)
        if d is not None:
            dt = timezone.make_aware(datetime.combine(d, time.max))
            return queryset.filter(sold_at__lte=dt)
        return queryset
