"""Tests for content moderation (Safety step 4): categories, severities, tricks,
strikes, listings, display names and the admin queue.

Run with:  python manage.py test
"""

import shutil
import tempfile
from datetime import timedelta

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from listings.models import Category, Listing
from messaging.models import Conversation, Message
from messaging.tests_voice import m4a
from souqna_api.wilayas import Wilaya

from . import actions
from .alerts import MemoryAlertBackend
from .content import scan, worst
from .models import ContentFlag, ContentTerm, ModerationLog

TEMP_MEDIA = tempfile.mkdtemp(prefix='souqna-test-content-')
URL = '/api/conversations/'
PASSWORD = 'Souqna-2026!'


def category_of(text):
    match = worst(text)
    return match.category if match else None


# 1. Matching: categories, languages and tricks ------------------------------------------

class MatchingTests(APITestCase):
    """The starter lists are loaded by the migration, so they exist in tests too."""

    def assertCategory(self, texts, category):
        for text in texts:
            self.assertEqual(category_of(text), category, text)

    def test_insults(self):
        self.assertCategory(['Tu es un connard', 'you moron', 'يا حمار', 'nta bhim',
                             'تفو عليك', 'ya 7mar'], 'insult')

    def test_harassment(self):
        self.assertCategory(['espèce de salope', 'send me pics', '9a7ba', 'يا قحبة',
                             'je sais où tu habites'], 'harassment')

    def test_sexual(self):
        self.assertCategory(['envoie des nudes', 'zebi', 'plan cul ce soir ?', 'سكس'], 'sexual')

    def test_threats(self):
        self.assertCategory(['Je vais te tuer', 'n9atlek', 'سأقتلك', 'I will kill you'],
                            'threat')

    def test_extremism(self):
        self.assertCategory(['vive daech', 'داعش', 'suicide bombing', 'da3ech'], 'extremism')

    def test_tricks_capitals_accents_repeats(self):
        self.assertCategory(['CONNARD', 'Crétin', 'cretin', 'connnnnaaaard', 'IDIOOOOT'],
                            'insult')

    def test_tricks_spaces_and_dots_between_letters(self):
        self.assertCategory(['c o n n a r d', 'c.o.n.n.a.r.d', 'c-o-n-n-a-r-d', 'con.nard',
                             'espece de c o n n a s s e'], 'insult')

    def test_tricks_numbers_for_letters(self):
        self.assertCategory(['c0nn4rd', '1d10t', 'm0r0n'], 'insult')
        self.assertCategory(['s4l0pe', 'sal0pe', '$alope'], 'harassment')

    def test_darija_digits_are_letters(self):
        # "9" = ق and "7" = ح in Darija: not turned into letters for these words.
        self.assertCategory(['9A7BA', '9a77ba', 'q a h b a'], 'harassment')
        self.assertCategory(['ghadi n9atlek'], 'threat')

    def test_arabic_tricks(self):
        self.assertCategory(['سَأَقْتُلُكَ'], 'threat')        # vowel marks
        self.assertCategory(['داعــــش', 'د ا ع ش'], 'extremism')  # stretched / spaced letters
        self.assertCategory(['وداعش'], 'extremism')            # with a prefix

    def test_no_false_positives_on_normal_marketplace_text(self):
        for text in ['Billets de concert', 'Nike Air Max taille 42', 'Je suis à Alger',
                     'électronique', 'جهاز الكترونيك', 'sac à ordures', 'sexe : garçon',
                     'طوق كلب', "j'habite à Oran", 'Isis', 'très bonne qualité',
                     'Réputé et solide', 'technique unique', 'pompe à vélo', 'Prix: 1500 DA',
                     'Bonne journée, la robe est-elle disponible ?', 'Classe et confortable']:
            self.assertEqual(scan(text), [], text)

    def test_most_severe_category_first(self):
        matches = scan('connard, je vais te tuer')
        self.assertEqual([m.category for m in matches], ['threat', 'insult'])

    def test_admin_added_words_and_inactive_words(self):
        term = ContentTerm.objects.create(phrase='tchipa', category='insult', language='darija_latin')
        self.assertEqual(category_of('nta tchipa'), 'insult')
        term.active = False
        term.save()
        self.assertIsNone(category_of('nta tchipa'))


# 2. Messages: the three severities ---------------------------------------------------

@override_settings(MEDIA_ROOT=TEMP_MEDIA,
                   MODERATION_ALERT_BACKEND='moderation.alerts.MemoryAlertBackend')
class ContentTestCase(APITestCase):
    @classmethod
    def tearDownClass(cls):
        super().tearDownClass()
        shutil.rmtree(TEMP_MEDIA, ignore_errors=True)

    def setUp(self):
        cache.clear()
        MemoryAlertBackend.outbox.clear()
        old = timezone.now() - timedelta(days=60)
        self.seller = self.make_user('0550000001', 'Amina', old)
        self.buyer = self.make_user('0660000002', 'Yacine', old)
        self.category = Category.objects.create(name_en='Women', name_fr='Femmes', name_ar='نساء')
        self.listing = Listing.objects.create(
            seller=self.seller, title='Robe kabyle', price_dzd=8500, category=self.category,
            condition=Listing.Condition.GOOD, wilaya=Wilaya.ALGER)
        self.conversation = Conversation.objects.create(listing=self.listing, buyer=self.buyer,
                                                        seller=self.seller)
        Message.objects.create(conversation=self.conversation, sender=self.buyer, text='Salam')

    def make_user(self, phone, name, joined=None):
        user = User.objects.create_user(phone=phone, display_name=name, password=PASSWORD,
                                        phone_verified=True)
        if joined:
            User.objects.filter(pk=user.pk).update(date_joined=joined)
            user.refresh_from_db()
        return user

    def send(self, text, user=None, confirm=False):
        self.client.force_authenticate(user or self.seller)
        body = {'text': text}
        if confirm:
            body['confirm_offensive'] = True
        return self.client.post(f'{URL}{self.conversation.id}/messages/', body, format='json')

    def give_strikes(self, user, count, days_ago=0):
        for _ in range(count):
            flag = ContentFlag.objects.create(
                source='message', category='insult', severity='warn', strike=True, user=user,
                user_label=str(user), content='x', matched=['x'])
            if days_ago:
                ContentFlag.objects.filter(pk=flag.pk).update(
                    created_at=timezone.now() - timedelta(days=days_ago))


class MessageSeverityTests(ContentTestCase):
    def test_clean_message_goes_through(self):
        self.assertEqual(self.send('Oui, toujours disponible.').status_code, 201)
        self.assertFalse(ContentFlag.objects.exists())

    def test_insult_warns_first_then_sends_with_a_strike(self):
        response = self.send('Tu es un connard')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(response.data['code'], 'may_be_offensive')
        self.assertFalse(Message.objects.filter(text__icontains='connard').exists())
        self.assertFalse(ContentFlag.objects.exists())

        response = self.send('Tu es un connard', confirm=True)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        flag = ContentFlag.objects.get()
        self.assertEqual((flag.category, flag.severity, flag.strike, flag.urgent),
                         ('insult', 'warn', True, False))
        self.assertEqual(flag.message.text, 'Tu es un connard')
        # Delivered normally (not hidden).
        self.client.force_authenticate(self.buyer)
        last = self.client.get(f'{URL}{self.conversation.id}/').data['messages'][-1]
        self.assertFalse(last['hidden'])

    def test_harassment_and_sexual_are_delivered_hidden_for_the_receiver(self):
        for text, category in (('espèce de salope', 'harassment'), ('envoie des nudes', 'sexual')):
            response = self.send(text)
            self.assertEqual(response.status_code, 201, text)
            self.assertFalse(response.data['hidden'])  # the sender sees it normally
            self.assertEqual(ContentFlag.objects.filter(category=category).count(), 1)
        self.client.force_authenticate(self.buyer)
        detail = self.client.get(f'{URL}{self.conversation.id}/').data
        self.assertEqual([m['hidden'] for m in detail['messages']], [False, True, True])
        # Not shown in the receiver's list of conversations either.
        last = self.client.get(URL).data['results'][0]['last_message']
        self.assertEqual((last['hidden'], last['text']), (True, ''))
        flag = ContentFlag.objects.first()
        self.assertEqual((flag.status, flag.strike), ('pending', True))

    def test_threat_is_not_delivered_urgent_and_alerted(self):
        response = self.send('Je vais te tuer')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data['code'], 'message_blocked')
        self.assertEqual(response.data['detail'], "Your message couldn't be sent.")
        self.assertFalse(Message.objects.filter(text__icontains='tuer').exists())
        flag = ContentFlag.objects.get()
        self.assertEqual((flag.urgent, flag.source, flag.category, flag.content),
                         (True, 'blocked_message', 'threat', 'Je vais te tuer'))
        self.assertEqual(flag.context[-1]['text'], 'Salam')  # the conversation around it
        self.assertEqual(len(MemoryAlertBackend.outbox), 1)
        self.assertIn('Threat', MemoryAlertBackend.outbox[0][0])

    def test_extremism_is_not_delivered_even_when_starting_a_conversation(self):
        other_listing = Listing.objects.create(
            seller=self.seller, title='Caftan', price_dzd=1, category=self.category,
            condition=Listing.Condition.GOOD, wilaya=Wilaya.ALGER)
        self.client.force_authenticate(self.buyer)
        response = self.client.post(URL, {'listing': other_listing.id, 'text': 'vive daech'},
                                    format='json')
        self.assertEqual((response.status_code, response.data['code']), (403, 'message_blocked'))
        self.assertFalse(Conversation.objects.filter(listing=other_listing).exists())
        self.assertTrue(ContentFlag.objects.get().urgent)
        self.assertEqual(len(MemoryAlertBackend.outbox), 1)

    def test_starting_a_conversation_with_an_insult_asks_first(self):
        other_listing = Listing.objects.create(
            seller=self.seller, title='Caftan', price_dzd=1, category=self.category,
            condition=Listing.Condition.GOOD, wilaya=Wilaya.ALGER)
        self.client.force_authenticate(self.buyer)
        body = {'listing': other_listing.id, 'text': 'prix de crétin'}
        self.assertEqual(self.client.post(URL, body, format='json').status_code, 409)
        response = self.client.post(URL, {**body, 'confirm_offensive': True}, format='json')
        self.assertEqual(response.status_code, 201)


# 3. Strikes ---------------------------------------------------------------------------

class StrikeTests(ContentTestCase):
    def test_3_strikes_block_messages_and_voice_for_7_days(self):
        self.give_strikes(self.seller, 2)
        self.assertEqual(self.send('connard', confirm=True).status_code, 201)  # 3rd strike
        self.seller.refresh_from_db()
        until = self.seller.messaging_blocked_until
        self.assertAlmostEqual((until - timezone.now()).total_seconds(), 7 * 86400, delta=60)
        response = self.send('Bonjour')
        self.assertEqual((response.status_code, response.data['code']), (403, 'messaging_blocked'))
        voice = self.client.post(f'{URL}{self.conversation.id}/voice/',
                                 {'audio': SimpleUploadedFile('v.m4a', m4a(3))},
                                 format='multipart')
        self.assertEqual(voice.data['code'], 'messaging_blocked')
        self.assertTrue(ModerationLog.objects.filter(action='auto_block_messages').exists())
        detail = self.client.get(f'{URL}{self.conversation.id}/').data
        self.assertIsNotNone(detail['restrictions']['messaging_blocked_until'])

    def test_more_strikes_after_that_suspend_but_never_ban(self):
        self.give_strikes(self.seller, 3)
        self.seller.messaging_blocked_until = timezone.now() - timedelta(minutes=1)  # block over
        self.seller.save()
        self.assertEqual(self.send('connard', confirm=True).status_code, 201)  # 4th strike
        self.seller.refresh_from_db()
        self.assertFalse(self.seller.is_active)
        self.assertIsNone(self.seller.banned_at)
        self.assertTrue(ModerationLog.objects.filter(action='auto_suspend').exists())

    def test_strikes_older_than_30_days_dont_count(self):
        self.give_strikes(self.seller, 3, days_ago=31)
        self.assertEqual(self.send('connard', confirm=True).status_code, 201)
        self.seller.refresh_from_db()
        self.assertIsNone(self.seller.messaging_blocked_until)

    def test_any_recent_strike_turns_off_voice_messages(self):
        voice = lambda: self.client.post(f'{URL}{self.conversation.id}/voice/',  # noqa: E731
                                         {'audio': SimpleUploadedFile('v.m4a', m4a(3))},
                                         format='multipart')
        self.client.force_authenticate(self.seller)
        self.assertEqual(voice().status_code, 201)
        self.send('connard', confirm=True)
        response = voice()
        self.assertEqual((response.status_code, response.data['code']), (403, 'voice_strike'))
        detail = self.client.get(f'{URL}{self.conversation.id}/').data
        self.assertTrue(detail['restrictions']['voice_blocked'])
        # The admin dismisses it as a mistake: voice works again.
        admin = User.objects.create_superuser(phone='0799999999', password=PASSWORD,
                                              display_name='Admin')
        actions.dismiss_flag(ContentFlag.objects.get(), admin)
        self.assertEqual(voice().status_code, 201)

    def test_dismissing_removes_the_strike_lifts_the_block_and_unhides(self):
        admin = User.objects.create_superuser(phone='0799999999', password=PASSWORD,
                                              display_name='Admin')
        self.give_strikes(self.seller, 2)
        self.send('espèce de salope')  # 3rd strike: hidden message + messages blocked
        self.seller.refresh_from_db()
        self.assertIsNotNone(self.seller.messaging_blocked_until)
        flag = ContentFlag.objects.get(category='harassment')
        actions.dismiss_flag(flag, admin)
        flag.refresh_from_db()
        self.seller.refresh_from_db()
        self.assertEqual((flag.status, flag.strike), ('dismissed', False))
        self.assertIsNone(self.seller.messaging_blocked_until)
        self.assertEqual(flag.message.hidden_reason, '')
        self.assertTrue(ModerationLog.objects.filter(action='dismiss_flag').exists())


# 4. Listings and display names ----------------------------------------------------------

class ListingAndNameTests(ContentTestCase):
    def post_listing(self, **overrides):
        self.client.force_authenticate(self.seller)
        body = {'title': 'Robe', 'description': 'Belle robe', 'price_dzd': 3000,
                'category': self.category.id, 'condition': 'good', 'wilaya': 16, **overrides}
        return self.client.post('/api/listings/', body, format='json')

    def test_offensive_listing_goes_to_needs_review(self):
        response = self.post_listing(description='envoie des nudes')
        listing = Listing.objects.get(pk=response.data['id'])
        self.assertEqual(listing.review_status, Listing.Review.PENDING)
        self.assertIn('offensive_sexual', [r['code'] for r in listing.flag_reasons])
        flag = ContentFlag.objects.get(listing=listing)
        self.assertEqual((flag.source, flag.strike), ('listing', False))  # not a strike yet

    def test_confirming_a_listing_flag_rejects_it_and_counts_a_strike(self):
        admin = User.objects.create_superuser(phone='0799999999', password=PASSWORD,
                                              display_name='Admin')
        listing = Listing.objects.get(pk=self.post_listing(title='Robe pour connard').data['id'])
        actions.confirm_flag(ContentFlag.objects.get(listing=listing), admin)
        listing.refresh_from_db()
        self.assertEqual(listing.review_status, Listing.Review.REJECTED)
        self.assertTrue(ContentFlag.objects.get(listing=listing).strike)

    def test_dismissing_a_listing_flag_puts_it_back_online(self):
        admin = User.objects.create_superuser(phone='0799999999', password=PASSWORD,
                                              display_name='Admin')
        listing = Listing.objects.get(pk=self.post_listing(title='Robe pour connard').data['id'])
        actions.dismiss_flag(ContentFlag.objects.get(listing=listing), admin)
        listing.refresh_from_db()
        self.assertEqual(listing.review_status, Listing.Review.APPROVED)

    def test_threat_in_a_listing_is_urgent(self):
        self.post_listing(description='je vais te tuer')
        self.assertTrue(ContentFlag.objects.get().urgent)
        self.assertEqual(len(MemoryAlertBackend.outbox), 1)

    def test_offensive_display_names_are_refused_politely(self):
        signup = self.client.post('/api/auth/signup/', {
            'phone': '0770000123', 'password': PASSWORD, 'display_name': 'Le C0nnard',
            'wilaya': 16}, format='json')
        self.assertEqual(signup.status_code, 400)
        self.assertEqual(signup.data['display_name'][0],
                         "This name isn't allowed. Please choose another one.")
        ok = self.client.post('/api/auth/signup/', {
            'phone': '0770000124', 'password': PASSWORD, 'display_name': 'Nadia B.',
            'wilaya': 16}, format='json')
        self.assertEqual(ok.status_code, 201)
        self.client.force_authenticate(self.buyer)
        response = self.client.patch('/api/auth/me/', {'display_name': 'zebi'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(self.client.patch('/api/auth/me/', {'display_name': 'Yacine K.'},
                                           format='json').status_code, 200)


# 5. Admin queue and evidence ---------------------------------------------------------------

class AdminQueueTests(ContentTestCase):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_superuser(phone='0799999999', password=PASSWORD,
                                                   display_name='Admin')
        self.browser = Client()
        self.browser.force_login(self.admin)

    def test_urgent_first_with_context_history_and_buttons(self):
        self.send('connard', confirm=True)
        self.send('je vais te tuer')
        page = self.browser.get('/admin/moderation/contentflag/')
        content = page.content.decode()
        self.assertLess(content.index('URGENT'), content.index('connard'))
        threat = ContentFlag.objects.get(urgent=True)
        detail = self.browser.get(f'/admin/moderation/contentflag/{threat.id}/change/')
        for expected in ('je vais te tuer', 'Salam', 'name="_dismiss"', 'name="_confirm"',
                         'name="_suspend"', 'name="_ban"', 'Insult'):  # 'Insult' = history
            self.assertContains(detail, expected)

    def test_buttons(self):
        self.send('connard', confirm=True)
        flag = ContentFlag.objects.get()
        self.browser.post(f'/admin/moderation/contentflag/{flag.id}/change/', {'_confirm': '1'})
        flag.refresh_from_db()
        self.assertEqual(flag.status, 'confirmed')
        self.browser.post(f'/admin/moderation/contentflag/{flag.id}/change/', {'_suspend': '1'})
        self.seller.refresh_from_db()
        self.assertFalse(self.seller.is_active)
        self.browser.post(f'/admin/moderation/contentflag/{flag.id}/change/', {'_ban': '1'})
        self.seller.refresh_from_db()
        self.assertIsNotNone(self.seller.banned_at)
        self.assertEqual(set(ModerationLog.objects.values_list('action', flat=True)),
                         {'confirm_flag', 'suspend_user', 'ban_user'})

    def test_evidence_is_kept_after_the_account_is_deleted(self):
        self.send('je vais te tuer')
        flag = ContentFlag.objects.get()
        self.seller.delete()
        flag.refresh_from_db()
        self.assertIsNone(flag.user)
        self.assertEqual(flag.content, 'je vais te tuer')
        self.assertIn('Amina', flag.user_label)
        self.assertEqual(flag.user_phone, '0550000001')
        page = self.browser.get(f'/admin/moderation/contentflag/{flag.id}/change/')
        self.assertContains(page, 'account deleted')

    def test_word_list_and_test_tool(self):
        page = self.browser.get('/admin/moderation/contentterm/')
        self.assertContains(page, 'Test a text')
        result = self.browser.post('/admin/moderation/contentterm/test/', {'text': 'c.o.n.n.a.r.d'})
        self.assertContains(result, 'Insult')
        self.assertContains(result, 'connard')
        clean = self.browser.post('/admin/moderation/contentterm/test/', {'text': 'Bonjour'})
        self.assertContains(clean, 'Nothing found')

    def test_other_admin_pages_open(self):
        for url in ('/admin/accounts/user/', '/admin/moderation/moderationlog/'):
            self.assertEqual(self.browser.get(url).status_code, 200, url)
