"""Tests for "Send feedback" (Step 4.1).

Run with:  python manage.py test
"""

import shutil
import tempfile
from io import BytesIO

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, override_settings
from PIL import Image
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.deletion import delete_account
from accounts.models import User

from .models import Feedback

URL = '/api/feedback/'
TEMP_MEDIA = tempfile.mkdtemp(prefix='sougna-test-feedback-')


def screenshot(size=(1080, 2400)):
    """A phone-sized PNG screenshot, with hidden data (a camera model tag)."""
    image = Image.new('RGB', size, (23, 120, 74))
    exif = Image.Exif()
    exif[0x0110] = 'Secret Phone Model'
    buffer = BytesIO()
    image.save(buffer, format='PNG', exif=exif)
    return SimpleUploadedFile('shot.png', buffer.getvalue(), content_type='image/png')


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class FeedbackTests(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEMP_MEDIA, ignore_errors=True)

    def setUp(self):
        cache.clear()  # reset the "20 per day" counter
        self.user = User.objects.create_user(phone='0661112200', display_name='Tester')
        self.client.force_authenticate(self.user)

    def test_must_be_logged_in(self):
        self.client.force_authenticate(None)
        response = self.client.post(URL, {'message': 'Hello'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_text_only(self):
        response = self.client.post(URL, {'message': '  The Sell button is hard to find. ',
                                          'platform': 'android', 'language': 'fr'},
                                    format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        feedback = Feedback.objects.get()
        self.assertEqual(feedback.message, 'The Sell button is hard to find.')
        self.assertEqual(feedback.user, self.user)
        self.assertEqual((feedback.platform, feedback.language), ('android', 'fr'))
        self.assertEqual(feedback.status, Feedback.Status.NEW)
        self.assertFalse(feedback.screenshot)

    def test_message_required(self):
        response = self.client.post(URL, {'message': '   '}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['message'], ['Please write your message.'])

    def test_message_too_long(self):
        response = self.client.post(URL, {'message': 'x' * 2001}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unknown_platform_ignored(self):
        self.client.post(URL, {'message': 'Hi', 'platform': 'toaster'}, format='json')
        self.assertEqual(Feedback.objects.get().platform, '')

    def test_with_screenshot_cleaned_and_resized(self):
        response = self.client.post(URL, {'message': 'See the picture', 'screenshot': screenshot()},
                                    format='multipart')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        feedback = Feedback.objects.get()
        self.assertTrue(feedback.screenshot.name.startswith('feedback/'))
        self.assertTrue(feedback.screenshot.name.endswith('.jpg'))
        with Image.open(feedback.screenshot.path) as saved:
            self.assertEqual(saved.format, 'JPEG')
            self.assertLessEqual(max(saved.size), 1600)
            self.assertNotIn(0x0110, saved.getexif())  # hidden data removed

    def test_not_an_image(self):
        fake = SimpleUploadedFile('shot.png', b'not an image', content_type='image/png')
        response = self.client.post(URL, {'message': 'Hi', 'screenshot': fake},
                                    format='multipart')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['screenshot'], ['This file is not a photo.'])
        self.assertFalse(Feedback.objects.exists())

    def test_limit_per_day(self):
        for _ in range(20):
            self.assertEqual(self.client.post(URL, {'message': 'Hi'}, format='json').status_code,
                             status.HTTP_201_CREATED)
        response = self.client.post(URL, {'message': 'One more'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)

    def test_deleted_account_erases_feedback(self):
        self.client.post(URL, {'message': 'My number is 0661112200', 'screenshot': screenshot()},
                         format='multipart')
        path = Feedback.objects.get().screenshot.path
        delete_account(self.user)
        self.assertFalse(Feedback.objects.exists())
        import os
        self.assertFalse(os.path.exists(path))

    def test_admin_pages(self):
        self.client.post(URL, {'message': 'Crash when I open a listing',
                               'screenshot': screenshot()}, format='multipart')
        feedback = Feedback.objects.get()
        admin = User.objects.create_superuser(phone='0799999991', password='Sougna-2026!',
                                              display_name='Admin')
        browser = Client()
        browser.force_login(admin)
        page = browser.get('/admin/feedback/feedback/')
        self.assertEqual(page.status_code, 200)
        self.assertContains(page, 'Crash when I open a listing')
        page = browser.get(f'/admin/feedback/feedback/{feedback.pk}/change/')
        self.assertEqual(page.status_code, 200)
        self.assertContains(page, feedback.screenshot.url)
        feedback.refresh_from_db()
        self.assertEqual(feedback.status, Feedback.Status.READ)  # opened = read
        self.assertEqual(browser.get('/admin/feedback/feedback/add/').status_code, 403)
