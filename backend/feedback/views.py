from io import BytesIO

from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework import permissions, status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from listings.serializers import MAX_PHOTO_BYTES

from .models import MAX_MESSAGE_LENGTH, Feedback

SCREENSHOT_MAX_SIDE = 1600
PLATFORMS = {'android', 'ios', 'web'}
LANGUAGES = {'ar', 'fr', 'en'}


def clean_screenshot(uploaded) -> ContentFile:
    """Upright, at most 1600 px on its longest side, saved again as a brand-new JPEG
    (so hidden data like the GPS location is never kept)."""
    uploaded.seek(0)
    with Image.open(uploaded) as original:
        image = ImageOps.exif_transpose(original).convert('RGB')
        image.thumbnail((SCREENSHOT_MAX_SIDE, SCREENSHOT_MAX_SIDE), Image.LANCZOS)
        clean = Image.new('RGB', image.size)
        clean.paste(image)
        buffer = BytesIO()
        clean.save(buffer, format='JPEG', quality=85, optimize=True)
    return ContentFile(buffer.getvalue(), name='screenshot.jpg')


class FeedbackView(APIView):
    """POST /api/feedback/ - "Send feedback" (logged in).

    Form fields (or JSON without the screenshot):
      message     what to tell the Sougna team (required, max 2000 characters)
      screenshot  optional image (max 10 MB)
      platform    optional: "android", "ios" or "web"
      language    optional: "ar", "fr" or "en" (the app's language)
    At most 20 per day per user. Read them in the admin: Feedback from testers.
    """

    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = 'feedback'

    def post(self, request):
        message = str(request.data.get('message', '')).strip()
        if not message:
            return Response({'message': ['Please write your message.']},
                            status=status.HTTP_400_BAD_REQUEST)
        if len(message) > MAX_MESSAGE_LENGTH:
            return Response({'message': [f'Messages can be at most {MAX_MESSAGE_LENGTH} '
                                         'characters.']}, status=status.HTTP_400_BAD_REQUEST)

        screenshot = None
        uploaded = request.FILES.get('screenshot')
        if uploaded is not None:
            if uploaded.size > MAX_PHOTO_BYTES:
                return Response({'screenshot': ['Photos must be 10 MB or smaller.']},
                                status=status.HTTP_400_BAD_REQUEST)
            try:
                screenshot = clean_screenshot(uploaded)
            except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
                return Response({'screenshot': ['This file is not a photo.']},
                                status=status.HTTP_400_BAD_REQUEST)

        platform = str(request.data.get('platform', '')).lower()
        language = str(request.data.get('language', '')).lower()
        feedback = Feedback(
            user=request.user,
            message=message,
            platform=platform if platform in PLATFORMS else '',
            language=language if language in LANGUAGES else '',
        )
        if screenshot is not None:
            feedback.screenshot.save('screenshot.jpg', screenshot, save=False)
        feedback.save()
        return Response({'id': feedback.pk, 'detail': 'Thank you!'},
                        status=status.HTTP_201_CREATED)
