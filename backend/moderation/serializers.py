from django.db.models import Q
from rest_framework import serializers

from accounts.models import User
from listings.models import Listing
from listings.visibility import visible_listing_q
from messaging.models import Message

from .models import Block, Report


class ReportSerializer(serializers.Serializer):
    """POST /api/reports/ - {"target_type": "listing"|"user"|"message", "target_id": 12,
    "reason": "scam", "text": "optional details"}"""

    target_type = serializers.ChoiceField(choices=Report.Target.choices)
    target_id = serializers.IntegerField(min_value=1)
    reason = serializers.ChoiceField(choices=Report.Reason.choices)
    text = serializers.CharField(max_length=500, required=False, allow_blank=True,
                                 trim_whitespace=True, default='')

    def validate(self, data):
        me = self.context['request'].user
        kind, target_id = data['target_type'], data['target_id']

        if kind == Report.Target.LISTING:
            listing = (Listing.objects.filter(visible_listing_q(me) | Q(seller=me))
                       .filter(pk=target_id).first())
            if listing is None:
                raise serializers.ValidationError({'target_id': "This listing doesn't exist."})
            if listing.seller_id == me.id:
                raise serializers.ValidationError(
                    {'target_id': "You can't report your own listing."})
            data.update(listing=listing, reported_user=listing.seller)

        elif kind == Report.Target.USER:
            user = User.objects.filter(pk=target_id, is_active=True).first()
            if user is None:
                raise serializers.ValidationError({'target_id': "This user doesn't exist."})
            if user.pk == me.id:
                raise serializers.ValidationError({'target_id': "You can't report yourself."})
            data.update(reported_user=user)

        else:
            # Only a message someone else sent me, in one of my conversations.
            message = (Message.objects
                       .filter(Q(conversation__buyer=me) | Q(conversation__seller=me))
                       .exclude(sender=me)
                       .select_related('sender')
                       .filter(pk=target_id).first())
            if message is None:
                raise serializers.ValidationError({'target_id': "This message doesn't exist."})
            data.update(message=message, reported_user=message.sender)
        return data


class BlockedUserSerializer(serializers.ModelSerializer):
    """One person I blocked."""

    id = serializers.IntegerField(source='blocked.id')
    display_name = serializers.CharField(source='blocked.display_name')
    blocked_at = serializers.DateTimeField(source='created_at')

    class Meta:
        model = Block
        fields = ['id', 'display_name', 'blocked_at']


class BlockSerializer(serializers.Serializer):
    """POST /api/blocks/ - {"user": 12}"""

    user = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        error_messages={'does_not_exist': "This user doesn't exist.",
                        'incorrect_type': "This user doesn't exist."},
    )

    def validate_user(self, user):
        if user.pk == self.context['request'].user.id:
            raise serializers.ValidationError("You can't block yourself.")
        return user
