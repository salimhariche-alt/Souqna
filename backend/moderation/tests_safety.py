"""Tests for Safety step 3: reports, blocks, message warnings and the safety tips.

Run with:  python manage.py test
"""

from django.core.cache import cache
from django.test import Client
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from listings.models import Category, Favorite, Listing
from messaging.models import Conversation, Message
from souqna_api.wilayas import Wilaya

from . import actions
from .checks import message_flags
from .models import Block, FlaggedKeyword, ModerationLog, Report
from .text import find_messaging_app

PASSWORD = 'Sougna-2026!'


class SafetyTestCase(APITestCase):
    def setUp(self):
        cache.clear()  # report throttling counts per test
        self.category = Category.objects.create(name_en='Women', name_fr='Femmes', name_ar='نساء')
        self.seller = self.make_user('0550000001', 'Amina')
        self.buyer = self.make_user('0660000002', 'Yacine')
        self.listing = self.make_listing()

    def make_user(self, phone, name, verified=True):
        return User.objects.create_user(phone=phone, display_name=name, password=PASSWORD,
                                        phone_verified=verified)

    def make_listing(self, seller=None, **kwargs):
        data = dict(seller=seller or self.seller, title='Robe kabyle', description='Belle robe',
                    price_dzd=10000, category=self.category, condition=Listing.Condition.GOOD,
                    wilaya=Wilaya.ALGER)
        data.update(kwargs)
        return Listing.objects.create(**data)

    def report(self, user, target_type, target_id, reason='scam', text=''):
        self.client.force_authenticate(user)
        return self.client.post('/api/reports/', {'target_type': target_type,
                                                  'target_id': target_id, 'reason': reason,
                                                  'text': text}, format='json')

    def reporters(self, count, verified=True):
        return [self.make_user(f'077000{i:04d}', f'Reporter {i}', verified) for i in range(count)]

    def can_see_listing(self, user=None, listing=None):
        listing = listing or self.listing
        if user:
            self.client.force_authenticate(user)
        else:
            self.client.force_authenticate(None)
        return self.client.get(f'/api/listings/{listing.id}/').status_code == 200

    def in_public_list(self, user=None, listing=None):
        self.client.force_authenticate(user)
        ids = [row['id'] for row in self.client.get('/api/listings/').data['results']]
        return (listing or self.listing).id in ids


# 1. Reporting ---------------------------------------------------------------------

class ReportTests(SafetyTestCase):
    def test_report_a_listing(self):
        response = self.report(self.buyer, 'listing', self.listing.id, 'advance_payment',
                               'Il demande un versement CCP avant')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        report = Report.objects.get()
        self.assertEqual((report.reporter, report.listing, report.reported_user, report.reason,
                          report.text, report.status),
                         (self.buyer, self.listing, self.seller, 'advance_payment',
                          'Il demande un versement CCP avant', 'open'))

    def test_report_a_user(self):
        response = self.report(self.buyer, 'user', self.seller.id, 'offensive')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Report.objects.get().reported_user, self.seller)

    def test_report_a_message_i_received(self):
        conversation = Conversation.objects.create(listing=self.listing, buyer=self.buyer,
                                                   seller=self.seller)
        message = Message.objects.create(conversation=conversation, sender=self.seller,
                                         text='Envoie 2000 DA par BaridiMob')
        response = self.report(self.buyer, 'message', message.id, 'scam')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual((Report.objects.get().message, Report.objects.get().reported_user),
                         (message, self.seller))

    def test_cannot_report_my_own_message_or_other_peoples_messages(self):
        conversation = Conversation.objects.create(listing=self.listing, buyer=self.buyer,
                                                   seller=self.seller)
        mine = Message.objects.create(conversation=conversation, sender=self.buyer, text='Salut')
        self.assertEqual(self.report(self.buyer, 'message', mine.id).status_code, 400)
        stranger = self.make_user('0770000999', 'Stranger')
        theirs = Message.objects.create(conversation=conversation, sender=self.seller, text='Hi')
        self.assertEqual(self.report(stranger, 'message', theirs.id).status_code, 400)

    def test_all_five_reasons_are_accepted_and_others_refused(self):
        for i, reason in enumerate(['scam', 'advance_payment', 'fake_item', 'offensive', 'other']):
            listing = self.make_listing(title=f'Item {i}')
            self.assertEqual(self.report(self.buyer, 'listing', listing.id, reason).status_code,
                             201, reason)
        self.assertEqual(self.report(self.buyer, 'user', self.seller.id, 'boring').status_code, 400)

    def test_text_is_optional_but_limited_to_500_characters(self):
        self.assertEqual(self.report(self.buyer, 'listing', self.listing.id, 'other').status_code,
                         201)
        self.assertEqual(self.report(self.buyer, 'user', self.seller.id, 'other',
                                     'x' * 501).status_code, 400)

    def test_only_one_report_per_user_per_item(self):
        self.assertEqual(self.report(self.buyer, 'listing', self.listing.id).status_code, 201)
        again = self.report(self.buyer, 'listing', self.listing.id, 'offensive')
        self.assertEqual(again.status_code, status.HTTP_409_CONFLICT)
        self.assertEqual(again.data['code'], 'already_reported')
        self.assertEqual(Report.objects.count(), 1)
        # Reporting the seller (a different item) is still possible.
        self.assertEqual(self.report(self.buyer, 'user', self.seller.id).status_code, 201)

    def test_cannot_report_myself_or_my_own_listing(self):
        self.assertEqual(self.report(self.seller, 'listing', self.listing.id).status_code, 400)
        self.assertEqual(self.report(self.seller, 'user', self.seller.id).status_code, 400)

    def test_must_be_logged_in(self):
        response = self.client.post('/api/reports/', {'target_type': 'listing',
                                                      'target_id': self.listing.id,
                                                      'reason': 'scam'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_hidden_listing_cannot_be_reported(self):
        self.listing.review_status = Listing.Review.REJECTED
        self.listing.save()
        self.assertEqual(self.report(self.buyer, 'listing', self.listing.id).status_code, 400)


# 2. Hiding after 3 verified reports + admin review ----------------------------------

class AutoHideTests(SafetyTestCase):
    def test_3_verified_reports_hide_a_listing_until_review(self):
        first, second, third = self.reporters(3)
        self.report(first, 'listing', self.listing.id)
        self.report(second, 'listing', self.listing.id)
        self.assertTrue(self.can_see_listing())  # 2 reports: still visible
        self.report(third, 'listing', self.listing.id)
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.review_status, Listing.Review.PENDING)
        self.assertIn('reported', [r['code'] for r in self.listing.flag_reasons])
        self.assertFalse(self.can_see_listing())
        self.assertFalse(self.in_public_list())
        self.assertTrue(self.can_see_listing(self.seller))  # the seller still sees it

    def test_unverified_reporters_dont_hide_anything(self):
        for reporter in self.reporters(5, verified=False):
            self.report(reporter, 'listing', self.listing.id)
        self.assertEqual(Report.objects.count(), 5)  # still recorded for the admin
        self.assertTrue(self.can_see_listing())

    def test_3_verified_reports_hide_a_user_and_all_their_listings(self):
        second = self.make_listing(title='Sac')
        for reporter in self.reporters(3):
            self.report(reporter, 'user', self.seller.id)
        self.seller.refresh_from_db()
        self.assertTrue(self.seller.hidden_by_reports)
        self.assertFalse(self.can_see_listing())
        self.assertFalse(self.can_see_listing(listing=second))
        self.assertTrue(self.can_see_listing(self.seller))

    def test_message_reports_never_hide_automatically(self):
        conversation = Conversation.objects.create(listing=self.listing, buyer=self.buyer,
                                                   seller=self.seller)
        message = Message.objects.create(conversation=conversation, sender=self.seller, text='x')
        self.report(self.buyer, 'message', message.id)
        self.seller.refresh_from_db()
        self.assertFalse(self.seller.hidden_by_reports)

    def hide_listing_by_reports(self):
        for reporter in self.reporters(3):
            self.report(reporter, 'listing', self.listing.id)
        return Report.objects.filter(listing=self.listing).first()

    def test_dismiss_shows_the_listing_again(self):
        admin = User.objects.create_superuser(phone='0799999999', password=PASSWORD,
                                              display_name='Admin')
        report = self.hide_listing_by_reports()
        actions.dismiss_report(report, admin)
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.review_status, Listing.Review.APPROVED)
        self.assertEqual(self.listing.flag_reasons, [])
        self.assertTrue(self.can_see_listing())
        self.assertFalse(Report.objects.filter(status='open').exists())
        # One more report later doesn't hide it again straight away.
        self.report(self.buyer, 'listing', self.listing.id)
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.review_status, Listing.Review.APPROVED)

    def test_dismiss_keeps_listing_in_review_if_the_automatic_checks_also_flagged_it(self):
        admin = User.objects.create_superuser(phone='0799999999', password=PASSWORD,
                                              display_name='Admin')
        report = self.hide_listing_by_reports()
        self.listing.refresh_from_db()  # the seller then adds a phone number: flagged too
        self.listing.flag_reasons.append({'code': 'contact_phone', 'detail': '0555 12 34 56'})
        self.listing.save()
        actions.dismiss_report(report, admin)
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.review_status, Listing.Review.PENDING)
        self.assertEqual([r['code'] for r in self.listing.flag_reasons], ['contact_phone'])

    def test_approve_rejects_the_listing(self):
        admin = User.objects.create_superuser(phone='0799999999', password=PASSWORD,
                                              display_name='Admin')
        report = self.hide_listing_by_reports()
        actions.approve_report(report, admin)
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.review_status, Listing.Review.REJECTED)
        self.assertEqual(set(Report.objects.values_list('status', flat=True)), {'actioned'})
        self.assertTrue(ModerationLog.objects.filter(action='reject_listing').exists())

    def test_approve_a_user_report_suspends_them_and_dismiss_unhides(self):
        admin = User.objects.create_superuser(phone='0799999999', password=PASSWORD,
                                              display_name='Admin')
        for reporter in self.reporters(3):
            self.report(reporter, 'user', self.seller.id)
        actions.dismiss_report(Report.objects.first(), admin)
        self.seller.refresh_from_db()
        self.assertFalse(self.seller.hidden_by_reports)
        self.assertTrue(ModerationLog.objects.filter(action='dismiss_reports').exists())

        self.report(self.buyer, 'user', self.seller.id)
        actions.approve_report(Report.objects.get(status='open'), admin)
        self.seller.refresh_from_db()
        self.assertFalse(self.seller.is_active)

    def test_ban_from_a_report(self):
        admin = User.objects.create_superuser(phone='0799999999', password=PASSWORD,
                                              display_name='Admin')
        report = self.hide_listing_by_reports()
        actions.ban_from_report(report, admin)
        self.seller.refresh_from_db()
        self.assertIsNotNone(self.seller.banned_at)
        self.assertFalse(Report.objects.filter(status='open').exists())

    def test_admin_report_page_and_buttons(self):
        admin = User.objects.create_superuser(phone='0799999999', password=PASSWORD,
                                              display_name='Admin')
        browser = Client()
        browser.force_login(admin)
        report = self.hide_listing_by_reports()

        page = browser.get('/admin/moderation/report/', follow=True)
        self.assertContains(page, 'Robe kabyle')
        detail = browser.get(f'/admin/moderation/report/{report.id}/change/')
        self.assertContains(detail, 'name="_approve"')
        self.assertContains(detail, 'name="_dismiss"')
        self.assertContains(detail, 'name="_ban"')
        self.assertContains(detail, 'hidden automatically')

        browser.post(f'/admin/moderation/report/{report.id}/change/', {'_dismiss': '1'})
        self.listing.refresh_from_db()
        self.assertEqual(self.listing.review_status, Listing.Review.APPROVED)

    def test_admin_ban_button(self):
        admin = User.objects.create_superuser(phone='0799999999', password=PASSWORD,
                                              display_name='Admin')
        browser = Client()
        browser.force_login(admin)
        report = self.hide_listing_by_reports()
        browser.post(f'/admin/moderation/report/{report.id}/change/', {'_ban': '1'})
        self.seller.refresh_from_db()
        self.assertIsNotNone(self.seller.banned_at)

    def test_approving_in_needs_review_also_closes_the_reports(self):
        admin = User.objects.create_superuser(phone='0799999999', password=PASSWORD,
                                              display_name='Admin')
        self.hide_listing_by_reports()
        actions.approve_listing(self.listing, admin)
        self.assertEqual(set(Report.objects.values_list('status', flat=True)), {'dismissed'})


# 3. Blocking ------------------------------------------------------------------------

class BlockTests(SafetyTestCase):
    def block(self, blocker, blocked):
        self.client.force_authenticate(blocker)
        return self.client.post('/api/blocks/', {'user': blocked.id}, format='json')

    def test_block_and_list_and_unblock(self):
        self.assertEqual(self.block(self.buyer, self.seller).status_code, 201)
        self.assertEqual(self.block(self.buyer, self.seller).status_code, 200)  # no duplicate
        listing = self.client.get('/api/blocks/').data
        self.assertEqual([(row['id'], row['display_name']) for row in listing],
                         [(self.seller.id, 'Amina')])
        self.assertEqual(self.client.delete(f'/api/blocks/{self.seller.id}/').status_code, 204)
        self.assertFalse(Block.objects.exists())
        self.assertEqual(self.client.delete(f'/api/blocks/{self.seller.id}/').status_code, 404)

    def test_cannot_block_myself(self):
        self.assertEqual(self.block(self.buyer, self.buyer).status_code, 400)

    def test_blocked_users_dont_see_each_others_listings(self):
        my_listing = self.make_listing(seller=self.buyer, title='Veste')
        self.block(self.buyer, self.seller)
        # I don't see the seller's listing...
        self.assertFalse(self.can_see_listing(self.buyer))
        self.assertFalse(self.in_public_list(self.buyer))
        # ...and the seller (who was blocked) doesn't see mine.
        self.assertFalse(self.can_see_listing(self.seller, my_listing))
        self.assertFalse(self.in_public_list(self.seller, my_listing))
        # Everyone else still sees both.
        self.assertTrue(self.can_see_listing())
        self.assertTrue(self.can_see_listing(listing=my_listing))

    def test_blocked_listing_disappears_from_favorites(self):
        Favorite.objects.create(user=self.buyer, listing=self.listing)
        self.block(self.buyer, self.seller)
        self.assertEqual(self.client.get('/api/favorites/').data['count'], 0)

    def test_blocked_user_cannot_start_a_conversation(self):
        self.block(self.seller, self.buyer)  # the seller blocks the buyer
        self.client.force_authenticate(self.buyer)
        response = self.client.post('/api/conversations/', {'listing': self.listing.id,
                                                            'text': 'Bonjour'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(Conversation.objects.exists())

    def test_no_messages_in_an_existing_conversation_after_a_block(self):
        conversation = Conversation.objects.create(listing=self.listing, buyer=self.buyer,
                                                   seller=self.seller)
        self.block(self.seller, self.buyer)
        for sender in (self.buyer, self.seller):  # neither side can write
            self.client.force_authenticate(sender)
            response = self.client.post(f'/api/conversations/{conversation.id}/messages/',
                                        {'text': 'Allô ?'}, format='json')
            self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
            self.assertEqual(response.data['code'], 'blocked')
        self.assertFalse(Message.objects.exists())

    def test_unblock_allows_messages_again(self):
        conversation = Conversation.objects.create(listing=self.listing, buyer=self.buyer,
                                                   seller=self.seller)
        self.block(self.seller, self.buyer)
        self.client.delete(f'/api/blocks/{self.buyer.id}/')
        self.client.force_authenticate(self.buyer)
        response = self.client.post(f'/api/conversations/{conversation.id}/messages/',
                                    {'text': 'Allô ?'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)


# 4. Message warnings ----------------------------------------------------------------

class MessageWarningTests(SafetyTestCase):
    def send_first(self, text):
        self.client.force_authenticate(self.buyer)
        response = self.client.post('/api/conversations/', {'listing': self.listing.id,
                                                            'text': text}, format='json')
        self.assertIn(response.status_code, (200, 201))
        return response

    def test_finds_whatsapp_and_telegram_in_many_spellings(self):
        for text in ['Contacte-moi sur WhatsApp', 'whats app stp', 'wtsp', 'Watsap',
                     'mon telegram', 'راسلني على الواتساب', 'تيليجرام', 'تلغرام']:
            self.assertIsNotNone(find_messaging_app(text), text)
        for text in ['What is the size?', 'Telegraphe', 'Bonjour, toujours dispo ?']:
            self.assertIsNone(find_messaging_app(text), text)

    def test_checks_phone_link_app_and_payment_words(self):
        FlaggedKeyword.objects.get_or_create(phrase='baridimob', defaults={'language': 'fr'})
        codes = [f['code'] for f in message_flags(
            'Appelle 0555 12 34 56, voir www.arnaque.com, WhatsApp, paiement BaridiMob avant')]
        self.assertEqual(sorted(codes), ['advance_payment', 'contact_link', 'contact_phone',
                                         'messaging_app'])
        self.assertEqual(message_flags('Bonjour, la robe est encore disponible ?'), [])

    def test_message_is_sent_but_marked_and_only_the_receiver_sees_the_warning(self):
        response = self.send_first('Écris-moi sur WhatsApp au 0555 12 34 56')
        message = Message.objects.get()
        self.assertTrue(message.flagged)  # sent (not blocked), but marked
        # The sender sees no warning (so scammers can't learn the rules)...
        self.assertEqual(response.data['messages'][0]['warnings'], [])
        # ...the receiver does.
        self.client.force_authenticate(self.seller)
        received = self.client.get(f"/api/conversations/{response.data['id']}/").data
        self.assertEqual(sorted(received['messages'][0]['warnings']),
                         ['contact_phone', 'messaging_app'])

    def test_normal_message_has_no_warning(self):
        self.send_first('Bonjour, est-ce toujours disponible ?')
        self.assertFalse(Message.objects.get().flagged)

    def test_replies_are_checked_too(self):
        response = self.send_first('Bonjour')
        self.client.force_authenticate(self.seller)
        self.client.post(f"/api/conversations/{response.data['id']}/messages/",
                         {'text': 'Envoie sur t.me/vendeur'}, format='json')
        self.assertTrue(Message.objects.get(sender=self.seller).flagged)

    def test_admin_counts_suspicious_messages_per_user(self):
        self.send_first('WhatsApp 0555123456')
        self.send_first('Encore: WhatsApp?')
        admin = User.objects.create_superuser(phone='0799999999', password=PASSWORD,
                                              display_name='Admin')
        browser = Client()
        browser.force_login(admin)
        page = browser.get('/admin/accounts/user/')
        self.assertContains(page, 'Suspicious messages')
        self.assertContains(page, f'flagged__exact=1&sender__id__exact={self.buyer.id}">2<')
        filtered = browser.get(f'/admin/messaging/message/?flagged__exact=1'
                               f'&sender__id__exact={self.buyer.id}')
        self.assertEqual(filtered.status_code, 200)
        self.assertContains(filtered, 'Mentions another app')


# 5. "Buy safely" tips ---------------------------------------------------------------

class SafetyTipsTests(SafetyTestCase):
    def test_tips_are_shown_once(self):
        self.client.force_authenticate(self.buyer)
        self.assertFalse(self.client.get('/api/auth/me/').data['safety_tips_seen'])
        response = self.client.post('/api/auth/safety-tips/seen/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['user']['safety_tips_seen'])
        self.buyer.refresh_from_db()
        first_time = self.buyer.safety_tips_seen_at
        self.client.post('/api/auth/safety-tips/seen/')
        self.buyer.refresh_from_db()
        self.assertEqual(self.buyer.safety_tips_seen_at, first_time)  # not changed again

    def test_needs_login(self):
        self.assertEqual(self.client.post('/api/auth/safety-tips/seen/').status_code, 401)
