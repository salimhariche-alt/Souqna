"""Tests for voice messages and their guardrails (Step 2.2 #6b).

Run with:  python manage.py test
"""

import shutil
import tempfile
from datetime import timedelta

from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError
from django.test import Client, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from listings.models import Category, Listing
from moderation.models import Block, Report
from souqna_api.wilayas import Wilaya

from .audio import AudioError, inspect_audio
from .models import Conversation, Message

TEMP_MEDIA = tempfile.mkdtemp(prefix='souqna-test-voice-')
URL = '/api/conversations/'


# Tiny but real audio files, built by hand ---------------------------------------------

def box(kind: bytes, payload: bytes) -> bytes:
    return (8 + len(payload)).to_bytes(4, 'big') + kind + payload


def m4a(seconds=5.0, handler=b'soun', codec=b'mp4a', padding=0) -> bytes:
    """A minimal M4A file: ftyp + moov (mvhd with the duration, one track) + mdat."""
    timescale = 1000
    ftyp = box(b'ftyp', b'M4A ' + bytes(4) + b'M4A isom')
    mvhd = box(b'mvhd', bytes(12) + timescale.to_bytes(4, 'big')
               + int(seconds * timescale).to_bytes(4, 'big') + bytes(80))
    hdlr = box(b'hdlr', bytes(8) + handler + bytes(12) + b'\x00')
    stsd = box(b'stsd', bytes(8) + box(codec, bytes(28)))
    trak = box(b'trak', box(b'mdia', hdlr + box(b'minf', box(b'stbl', stsd))))
    return ftyp + box(b'moov', mvhd + trak) + box(b'mdat', bytes(padding))


def adts(seconds=3.0) -> bytes:
    """Raw AAC (ADTS) at 16 kHz mono: 1024 samples per frame."""
    frame_length = 17
    header = bytes([0xFF, 0xF1, 0x60, 0x40, (frame_length >> 3) & 0xFF,
                    ((frame_length & 7) << 5) | 0x1F, 0xFC])
    frames = round(seconds * 16000 / 1024)
    return (header + bytes(frame_length - 7)) * frames


def upload(data: bytes, name='voice.m4a'):
    return SimpleUploadedFile(name, data, content_type='audio/mp4')


@override_settings(MEDIA_ROOT=TEMP_MEDIA)
class VoiceTestCase(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEMP_MEDIA, ignore_errors=True)

    def setUp(self):
        old = timezone.now() - timedelta(days=30)
        self.seller = self.make_user('0550000001', 'Amina', joined=old)
        self.buyer = self.make_user('0660000002', 'Yacine', joined=old)
        category = Category.objects.create(name_en='Women', name_fr='Femmes', name_ar='نساء')
        self.listing = Listing.objects.create(
            seller=self.seller, title='Robe kabyle', price_dzd=8500, category=category,
            condition=Listing.Condition.GOOD, wilaya=Wilaya.ALGER)
        self.conversation = Conversation.objects.create(listing=self.listing, buyer=self.buyer,
                                                        seller=self.seller)

    def make_user(self, phone, name, joined=None, verified=True):
        user = User.objects.create_user(phone=phone, display_name=name, phone_verified=verified)
        if joined:
            User.objects.filter(pk=user.pk).update(date_joined=joined)
            user.refresh_from_db()
        return user

    def both_texted(self, conversation=None):
        conversation = conversation or self.conversation
        Message.objects.create(conversation=conversation, sender=conversation.buyer, text='Salam')
        Message.objects.create(conversation=conversation, sender=conversation.seller, text='Oui')

    def send_voice(self, user, data=None, conversation=None, name='voice.m4a'):
        self.client.force_authenticate(user)
        conversation = conversation or self.conversation
        return self.client.post(f'{URL}{conversation.id}/voice/',
                                {'audio': upload(data if data is not None else m4a(), name)},
                                format='multipart')


# 1. The audio file itself ---------------------------------------------------------------

class AudioFileTests(VoiceTestCase):
    def check(self, data):
        return inspect_audio(upload(data))

    def test_m4a_duration_is_read_from_the_file(self):
        self.assertEqual(self.check(m4a(12.34)), (12340, '.m4a'))

    def test_raw_aac_is_accepted(self):
        duration, extension = self.check(adts(3))
        self.assertEqual(extension, '.aac')
        self.assertAlmostEqual(duration, 3000, delta=70)

    def test_not_audio_is_refused(self):
        for data in (b'hello, this is not audio at all', b'\x89PNG\r\n\x1a\n' + bytes(50),
                     m4a(handler=b'vide'), m4a(codec=b'avc1'), m4a()[:60]):
            with self.assertRaises(AudioError) as caught:
                self.check(data)
            self.assertEqual(caught.exception.code, 'audio_not_supported')

    def test_max_60_seconds(self):
        self.assertEqual(self.check(m4a(60))[0], 60000)
        self.assertEqual(self.check(m4a(61))[0], 60000)  # small tolerance, capped at 60 s
        with self.assertRaises(AudioError) as caught:
            self.check(m4a(65))
        self.assertEqual(caught.exception.code, 'audio_too_long')

    def test_too_short(self):
        with self.assertRaises(AudioError) as caught:
            self.check(m4a(0.2))
        self.assertEqual(caught.exception.code, 'audio_too_short')

    def test_max_1_mb(self):
        with self.assertRaises(AudioError) as caught:
            self.check(m4a(10, padding=1024 * 1024))
        self.assertEqual(caught.exception.code, 'audio_too_big')

    def test_message_is_text_or_voice_never_both_or_neither(self):
        with self.assertRaises(IntegrityError):
            Message.objects.create(conversation=self.conversation, sender=self.buyer, text='')


# 2. Sending a voice message ---------------------------------------------------------------

class SendVoiceTests(VoiceTestCase):
    def test_send_a_voice_message(self):
        self.both_texted()
        response = self.send_voice(self.buyer, m4a(7.5))
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual((response.data['kind'], response.data['duration_ms'], response.data['text']),
                         ('voice', 7500, ''))
        self.assertTrue(response.data['audio'].startswith('http://testserver/media/voice/'))
        message = Message.objects.get(audio__startswith='voice/')
        self.assertEqual(message.transcript, '')  # filled by a future transcription step
        # The file gets a random name (not the name the app sent).
        self.assertNotIn('voice.m4a', message.audio.name)
        self.assertRegex(message.audio.name, r'^voice/\d{4}/\d{2}/[0-9a-f]{32}\.m4a$')

    def test_the_duration_comes_from_the_file_not_the_app(self):
        self.both_texted()
        self.client.force_authenticate(self.buyer)
        self.client.post(f'{URL}{self.conversation.id}/voice/',
                         {'audio': upload(m4a(4)), 'duration_ms': 1}, format='multipart')
        self.assertEqual(Message.objects.get(audio__startswith='voice/').duration_ms, 4000)

    def test_bad_files_are_refused_with_a_reason(self):
        self.both_texted()
        cases = {b'not audio': 'audio_not_supported', m4a(90): 'audio_too_long',
                 m4a(5, padding=1024 * 1024): 'audio_too_big'}
        for data, code in cases.items():
            response = self.send_voice(self.buyer, data)
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, code)
            self.assertEqual(response.data['code'], code)
        missing = self.client.post(f'{URL}{self.conversation.id}/voice/', {}, format='multipart')
        self.assertEqual(missing.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(Message.objects.filter(audio__startswith='voice/').exists())

    def test_messages_show_kind_and_conversation_list_shows_voice(self):
        self.both_texted()
        self.send_voice(self.buyer, m4a(9))
        self.client.force_authenticate(self.seller)
        detail = self.client.get(f'{URL}{self.conversation.id}/').data
        self.assertEqual([m['kind'] for m in detail['messages']], ['text', 'text', 'voice'])
        self.assertIsNone(detail['messages'][0]['audio'])
        last = self.client.get(URL).data['results'][0]['last_message']
        self.assertEqual((last['is_voice'], last['duration_ms']), (True, 9000))


# 3. Guardrails ----------------------------------------------------------------------------

class VoiceGuardrailTests(VoiceTestCase):
    def test_needs_login(self):
        response = self.client.post(f'{URL}{self.conversation.id}/voice/',
                                    {'audio': upload(m4a())}, format='multipart')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_only_verified_phones(self):
        self.both_texted()
        self.buyer.phone_verified = False
        self.buyer.save()
        response = self.send_voice(self.buyer)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data['code'], 'phone_not_verified')

    def test_voice_works_straight_away_for_both_people(self):
        # Only the buyer's first text so far: both can already send voice messages.
        Message.objects.create(conversation=self.conversation, sender=self.buyer, text='Salam')
        self.assertEqual(self.send_voice(self.seller).status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.send_voice(self.buyer).status_code, status.HTTP_201_CREATED)
        voice = self.client.get(f'{URL}{self.conversation.id}/').data['voice']
        self.assertEqual(voice, {'limit': 10, 'left_today': 9})

    def test_max_10_a_day_per_conversation(self):
        self.both_texted()
        for n in range(10):
            self.assertEqual(self.send_voice(self.buyer).status_code, 201, n)
        response = self.send_voice(self.buyer)
        self.assertEqual(response.status_code, status.HTTP_429_TOO_MANY_REQUESTS)
        self.assertEqual((response.data['code'], response.data['limit']), ('voice_daily_limit', 10))
        # The other person has their own limit.
        self.assertEqual(self.send_voice(self.seller).status_code, 201)

    def test_new_accounts_max_3_a_day(self):
        newcomer = self.make_user('0770000003', 'Sara')  # joined today
        conversation = Conversation.objects.create(listing=self.listing, buyer=newcomer,
                                                   seller=self.seller)
        self.both_texted(conversation)
        for n in range(3):
            self.assertEqual(self.send_voice(newcomer, conversation=conversation).status_code,
                             201, n)
        response = self.send_voice(newcomer, conversation=conversation)
        self.assertEqual((response.status_code, response.data['limit']), (429, 3))
        self.client.force_authenticate(newcomer)
        voice = self.client.get(f'{URL}{conversation.id}/').data['voice']
        self.assertEqual(voice, {'limit': 3, 'left_today': 0})

    def test_limit_is_per_conversation_and_per_24_hours(self):
        self.both_texted()
        for _ in range(10):
            self.send_voice(self.buyer)
        # Another conversation has its own count.
        other_listing = Listing.objects.create(
            seller=self.seller, title='Caftan', price_dzd=1, category=self.listing.category,
            condition=Listing.Condition.GOOD, wilaya=Wilaya.ALGER)
        other = Conversation.objects.create(listing=other_listing, buyer=self.buyer,
                                            seller=self.seller)
        self.both_texted(other)
        self.assertEqual(self.send_voice(self.buyer, conversation=other).status_code, 201)
        # 25 hours later, the first conversation is open again.
        Message.objects.filter(conversation=self.conversation).update(
            sent_at=timezone.now() - timedelta(hours=25))
        self.assertEqual(self.send_voice(self.buyer).status_code, 201)

    def test_blocked_conversation(self):
        self.both_texted()
        Block.objects.create(blocker=self.seller, blocked=self.buyer)
        response = self.send_voice(self.buyer)
        self.assertEqual((response.status_code, response.data['code']), (403, 'blocked'))

    def test_only_people_in_the_conversation(self):
        self.both_texted()
        outsider = self.make_user('0770000004', 'Karim')
        self.assertEqual(self.send_voice(outsider).status_code, status.HTTP_404_NOT_FOUND)


# 4. Reports ---------------------------------------------------------------------------------

class VoiceReportTests(VoiceTestCase):
    def test_report_a_voice_message_and_listen_in_the_admin(self):
        self.both_texted()
        voice_id = self.send_voice(self.seller, m4a(6)).data['id']
        self.client.force_authenticate(self.buyer)
        response = self.client.post('/api/reports/', {'target_type': 'message',
                                                      'target_id': voice_id,
                                                      'reason': 'scam'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        report = Report.objects.get()

        admin = User.objects.create_superuser(phone='0799999999', password='Souqna-2026!',
                                              display_name='Admin')
        browser = Client()
        browser.force_login(admin)
        page = browser.get(f'/admin/moderation/report/{report.id}/change/')
        self.assertContains(page, 'Voice message')
        self.assertContains(page, f'<audio controls preload="none" src="/media/{Message.objects.get(pk=voice_id).audio.name}"')
        listing_page = browser.get('/admin/messaging/message/')
        self.assertContains(listing_page, '<audio controls')
