from rest_framework import permissions, serializers, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import PushDevice, PushSettings


class DeviceSerializer(serializers.Serializer):
    token = serializers.RegexField(r'^Expo(nent)?PushToken\[[^\]]{8,180}\]$', max_length=200,
                                   error_messages={'invalid': 'Not a push address.'})
    platform = serializers.ChoiceField(choices=['android', 'ios'], required=False)


class DevicesView(APIView):
    """
    - POST   /api/push/devices/ {"token", "platform"}  this phone wants alerts (for me)
    - DELETE /api/push/devices/ {"token"}              log out: this phone gets nothing more
    """

    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = DeviceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # A phone belongs to the last person who logged in on it.
        PushDevice.objects.update_or_create(
            token=serializer.validated_data['token'],
            defaults={'user': request.user,
                      'platform': serializer.validated_data.get('platform', '')})
        return Response({'ok': True}, status=status.HTTP_201_CREATED)

    def delete(self, request):
        token = str(request.data.get('token', ''))
        PushDevice.objects.filter(user=request.user, token=token).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class SettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = PushSettings
        fields = ['orders', 'messages']


class SettingsView(APIView):
    """GET / PATCH /api/push/settings/ {"orders": bool, "messages": bool}"""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response(SettingsSerializer(PushSettings.for_user(request.user)).data)

    def patch(self, request):
        serializer = SettingsSerializer(PushSettings.for_user(request.user), data=request.data,
                                        partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
