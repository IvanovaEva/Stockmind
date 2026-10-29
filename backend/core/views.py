from datetime import datetime, time, timedelta

from django.db import transaction
from django.db.models import Count, F, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework import generics, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import exception_handler
from rest_framework_simplejwt.tokens import RefreshToken


def custom_exception_handler(exc, context):
    response = exception_handler(exc, context)
    return response

from .filters import SaleFilter
from .models import Category, DailyInsight, Product, Sale, Supplier, UserProfile
from .permissions import IsOwner
from .serializers import (
    CategorySerializer,
    ProductSerializer,
    RegisterSerializer,
    SaleSerializer,
    SupplierSerializer,
    UserDetailSerializer,
    UserSerializer,
)


class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        refresh = RefreshToken.for_user(user)
        return Response(
            {
                "user": UserSerializer(user).data,
                "refresh": str(refresh),
                "access": str(refresh.access_token),
            },
            status=status.HTTP_201_CREATED,
        )


class MeView(generics.RetrieveUpdateAPIView):
    """GET/PATCH /api/auth/me/ - current user with profile."""

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = UserDetailSerializer

    def get_object(self):
        UserProfile.objects.get_or_create(user=self.request.user)
        return self.request.user


class CategoryViewSet(viewsets.ModelViewSet):
    serializer_class = CategorySerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    pagination_class = None

    def get_queryset(self):
        return Category.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class SupplierViewSet(viewsets.ModelViewSet):
    serializer_class = SupplierSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    search_fields = ("name", "contact_email")

    def get_queryset(self):
        return Supplier.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)


class ProductViewSet(viewsets.ModelViewSet):
    serializer_class = ProductSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    filterset_fields = ("category", "supplier")
    search_fields = ("name", "sku", "description")
    ordering_fields = ("name", "price", "stock_quantity", "created_at")
    ordering = ("-created_at",)

    def get_queryset(self):
        return (
            Product.objects.filter(user=self.request.user)
            .select_related("category", "supplier")
        )

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=["get"], url_path="low-stock")
    def low_stock(self, request):
        qs = self.get_queryset().filter(stock_quantity__lte=F("low_stock_threshold"))
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(qs, many=True)
        return Response(serializer.data)


class SaleViewSet(viewsets.ModelViewSet):
    serializer_class = SaleSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    filterset_class = SaleFilter
    ordering_fields = ("sold_at", "total_price")
    ordering = ("-sold_at",)

    def get_queryset(self):
        return Sale.objects.filter(user=self.request.user).select_related("product")

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        product_id = serializer.validated_data["product"].id
        quantity = serializer.validated_data["quantity"]
        customer_name = serializer.validated_data.get("customer_name", "")

        with transaction.atomic():
            product = Product.objects.select_for_update().get(pk=product_id)

            if product.stock_quantity < quantity:
                return Response(
                    {
                        "quantity": [
                            f"Insufficient stock. Available: {product.stock_quantity}"
                        ]
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            unit_price = product.price
            total_price = unit_price * quantity

            sale = Sale.objects.create(
                user=request.user,
                product=product,
                quantity=quantity,
                unit_price=unit_price,
                total_price=total_price,
                customer_name=customer_name,
            )

            product.stock_quantity -= quantity
            product.save(update_fields=["stock_quantity", "updated_at"])

            DailyInsight.objects.filter(
                user=request.user, date=timezone.now().date()
            ).delete()

        output = self.get_serializer(sale)
        return Response(output.data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"])
    def stats(self, request):
        """Returns last 7 days revenue + today totals + top product (for Dashboard)."""
        now = timezone.now()
        today = now.date()
        start_date = today - timedelta(days=6)
        start_datetime = timezone.make_aware(datetime.combine(start_date, time.min))

        base_qs = self.get_queryset()

        sales_by_day = {}
        for row in (
            base_qs.filter(sold_at__gte=start_datetime)
            .annotate(day=TruncDate("sold_at"))
            .values("day")
            .annotate(revenue=Sum("total_price"), count=Count("id"))
        ):
            raw_day = row.get("day")
            if hasattr(raw_day, "isoformat"):
                key = raw_day.isoformat()
            elif hasattr(raw_day, "strftime"):
                key = raw_day.strftime("%Y-%m-%d")
            else:
                key = str(raw_day)[:10]
            sales_by_day[key] = row

        last_7_days = []
        for i in range(7):
            day_date = start_date + timedelta(days=i)
            key = day_date.isoformat()
            entry = sales_by_day.get(key)
            last_7_days.append(
                {
                    "day": key,
                    "revenue": (
                        float(entry["revenue"])
                        if entry and entry["revenue"] is not None
                        else 0.0
                    ),
                    "count": entry["count"] if entry else 0,
                }
            )

        today_sales = base_qs.filter(sold_at__date=today)
        today_revenue = today_sales.aggregate(total=Sum("total_price"))["total"] or 0
        today_count = today_sales.count()

        top_product = (
            base_qs.filter(sold_at__gte=start_datetime)
            .values("product__id", "product__name")
            .annotate(total_qty=Sum("quantity"), total_revenue=Sum("total_price"))
            .order_by("-total_qty")
            .first()
        )

        return Response(
            {
                "today_revenue": today_revenue,
                "today_count": today_count,
                "last_7_days": last_7_days,
                "top_product": top_product,
            }
        )
