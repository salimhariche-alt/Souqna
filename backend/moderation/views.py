from django.db import IntegrityError, transaction
from rest_framework import permissions, status, viewsets
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle

from souqna_api.exceptions import DetailedAPIException

from .models import Block, Report
from .reports import after_report
from .serializers import BlockedUserSerializer, BlockSerializer, ReportSerializer


class AlreadyReported(DetailedAPIException):
    status_code = status.HTTP_409_CONFLICT


class ReportViewSet(viewsets.GenericViewSet):
    """
    Report a listing, a user or a message (logged in).

    - POST /api/reports/  {"target_type": "listing"|"user"|"message", "target_id": 12,
                           "reason": "scam"|"advance_payment"|"fake_item"|"offensive"|"other",
                           "text": "optional details"}

    One report per user per item (409 "already_reported" for a second one).
    """

    serializer_class = ReportSerializer
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'reports'

    def create(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        already = {'detail': "You've already reported this.", 'code': 'already_reported'}

        report = Report(reporter=request.user, target_type=data['target_type'],
                        listing=data.get('listing'), message=data.get('message'),
                        reported_user=data['reported_user'], reason=data['reason'],
                        text=data.get('text', ''))
        if report.same_target().filter(reporter=request.user).exists():
            raise AlreadyReported(already)
        try:
            with transaction.atomic():
                report.save()
        except IntegrityError:  # the same report sent twice at the same moment
            raise AlreadyReported(already)

        after_report(report)
        return Response({'id': report.pk, 'status': 'received'}, status=status.HTTP_201_CREATED)


class BlockViewSet(viewsets.GenericViewSet):
    """
    People I blocked (logged in). Blocked people can't message me, and we don't see
    each other's listings.

    - GET    /api/blocks/            the people I blocked
    - POST   /api/blocks/            block someone: {"user": 12}
    - DELETE /api/blocks/{user_id}/  unblock them
    """

    permission_classes = [permissions.IsAuthenticated]
    serializer_class = BlockSerializer
    pagination_class = None

    def get_queryset(self):
        return Block.objects.filter(blocker=self.request.user).select_related('blocked')

    def list(self, request):
        return Response(BlockedUserSerializer(self.get_queryset(), many=True).data)

    def create(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        blocked = serializer.validated_data['user']
        try:
            with transaction.atomic():
                block, created = Block.objects.get_or_create(blocker=request.user,
                                                             blocked=blocked)
        except IntegrityError:  # the same block sent twice at the same moment
            block, created = self.get_queryset().get(blocked=blocked), False
        return Response(BlockedUserSerializer(block).data,
                        status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def destroy(self, request, pk=None):
        deleted = 0
        if str(pk).isdigit():
            deleted, _ = self.get_queryset().filter(blocked_id=int(pk)).delete()
        if not deleted:
            return Response({'detail': "You haven't blocked this user."},
                            status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)
