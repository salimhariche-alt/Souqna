"""Tests for buyer-seller messaging (/api/conversations/).

Run with:  python manage.py test
"""

from datetime import timedelta

from django.core.cache import cache
from django.test import Client
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from accounts.models import User
from listings.models import Category, Listing, ListingPhoto
from souqna_api.wilayas import Wilaya

from .models import Conversation, Message

URL = '/api/conversations/'


class MessagingTestCase(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.seller = User.objects.create_user(phone='0550000001', display_name='Amina')
        cls.buyer = User.objects.create_user(phone='0660000002', display_name='Yacine')
        cls.buyer2 = User.objects.create_user(phone='0770000003', display_name='Sara')
        cls.outsider = User.objects.create_user(phone='0550000004', display_name='Karim')
        category = Category.objects.create(name_en='Women', name_fr='Femmes', name_ar='نساء')
        cls.listing = Listing.objects.create(
            seller=cls.seller, title='Robe kabyle', price_dzd=8500, category=category,
            condition=Listing.Condition.VERY_GOOD, wilaya=Wilaya.ALGER)
        ListingPhoto.objects.create(listing=cls.listing, position=2, image='listings/b.jpg')
        ListingPhoto.objects.create(listing=cls.listing, position=1, image='listings/a.jpg')
        cls.listing2 = Listing.objects.create(
            seller=cls.seller, title='Caftan', price_dzd=18000, category=category,
            condition=Listing.Condition.GOOD, wilaya=Wilaya.ALGER)

    def as_user(self, user):
        self.client.force_authenticate(user)

    def start(self, listing=None, text='Salam, toujours disponible ?'):
        return self.client.post(URL, {'listing': (listing or self.listing).id, 'text': text},
                                format='json')

    def send(self, conversation_id, text):
        return self.client.post(f'{URL}{conversation_id}/messages/', {'text': text},
                                format='json')

    def make_conversation(self, buyer=None, listing=None):
        """Create a conversation directly in the database (no API)."""
        listing = listing or self.listing
        return Conversation.objects.create(listing=listing, buyer=buyer or self.buyer,
                                           seller=listing.seller)


# Only logged-in users ---------------------------------------------------------

class LoginRequiredTests(MessagingTestCase):
    def test_all_endpoints_need_login(self):
        conversation = self.make_conversation()
        for response in [
            self.client.get(URL),
            self.start(),
            self.client.get(f'{URL}{conversation.id}/'),
            self.send(conversation.id, 'Bonjour'),
        ]:
            self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
            self.assertEqual(response.data['detail'].code, 'not_authenticated')
        self.assertFalse(Message.objects.exists())

    def test_works_with_a_real_login_token(self):
        cache.clear()  # reset the "10 log-in attempts per minute" counter
        self.client.post('/api/auth/signup/', {'phone': '0661112233', 'password': 'Souqna-2026!',
                                               'display_name': 'Nadia', 'wilaya': 31},
                         format='json')
        token = self.client.post('/api/auth/login/', {'phone_or_email': '0661112233',
                                                      'password': 'Souqna-2026!'},
                                 format='json').data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        self.assertEqual(self.start().status_code, status.HTTP_201_CREATED)
        self.assertEqual(self.client.get(URL).status_code, status.HTTP_200_OK)


# 1. Start a conversation ----------------------------------------------------------

class StartConversationTests(MessagingTestCase):
    def test_buyer_starts_conversation_with_first_message(self):
        self.as_user(self.buyer)
        response = self.start(text='Salam, toujours disponible ?')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        conversation = Conversation.objects.get()
        self.assertEqual((conversation.buyer, conversation.seller, conversation.listing),
                         (self.buyer, self.seller, self.listing))
        self.assertEqual(response.data['id'], conversation.id)
        self.assertEqual(response.data['other_person'], {'id': self.seller.id,
                                                         'display_name': 'Amina'})
        self.assertEqual(len(response.data['messages']), 1)
        first = response.data['messages'][0]
        self.assertEqual(first['text'], 'Salam, toujours disponible ?')
        self.assertTrue(first['is_mine'])
        self.assertFalse(first['read'])

    def test_existing_conversation_is_reused(self):
        self.as_user(self.buyer)
        first = self.start(text='Salam')
        second = self.start(text='Vous êtes là ?')
        self.assertEqual(second.status_code, status.HTTP_200_OK)  # 200 = reused, not created
        self.assertEqual(first.data['id'], second.data['id'])
        self.assertEqual(Conversation.objects.count(), 1)
        self.assertEqual([m['text'] for m in second.data['messages']], ['Salam', 'Vous êtes là ?'])

    def test_different_buyers_get_separate_conversations(self):
        self.as_user(self.buyer)
        self.start()
        self.as_user(self.buyer2)
        self.start()
        self.assertEqual(Conversation.objects.count(), 2)

    def test_another_listing_from_same_seller_is_a_new_conversation(self):
        self.as_user(self.buyer)
        self.start(listing=self.listing)
        response = self.start(listing=self.listing2)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Conversation.objects.filter(buyer=self.buyer).count(), 2)

    def test_seller_cannot_start_conversation_about_own_listing(self):
        self.as_user(self.seller)
        response = self.start()
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['listing'][0],
                         "You can't start a conversation about your own listing.")
        self.assertFalse(Conversation.objects.exists())

    def test_unknown_or_missing_listing(self):
        self.as_user(self.buyer)
        response = self.client.post(URL, {'listing': 99999, 'text': 'Salam'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['listing'][0], "This listing doesn't exist.")
        response = self.client.post(URL, {'text': 'Salam'}, format='json')
        self.assertEqual(response.data['listing'][0], 'Choose the listing you want to ask about.')


# Message rules: not empty, max 1,000 characters --------------------------------------

class MessageTextRulesTests(MessagingTestCase):
    def setUp(self):
        self.as_user(self.buyer)
        self.conversation = self.make_conversation()

    def test_empty_message_rejected_when_starting(self):
        for text in ['', '    ', '\n\n']:
            response = self.start(text=text)
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, repr(text))
            self.assertEqual(response.data['text'][0], "Message can't be empty.")
        response = self.client.post(URL, {'listing': self.listing.id}, format='json')
        self.assertEqual(response.data['text'][0], "Message can't be empty.")
        self.assertFalse(Message.objects.exists())

    def test_empty_message_rejected_when_sending(self):
        response = self.send(self.conversation.id, '   ')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data['text'][0], "Message can't be empty.")
        self.assertFalse(Message.objects.exists())

    def test_1000_characters_allowed(self):
        self.assertEqual(self.send(self.conversation.id, 'a' * 1000).status_code,
                         status.HTTP_201_CREATED)

    def test_1001_characters_rejected(self):
        for response in [self.send(self.conversation.id, 'a' * 1001),
                         self.start(text='a' * 1001)]:
            self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
            self.assertEqual(response.data['text'][0],
                             'Messages can be at most 1,000 characters.')
        self.assertFalse(Message.objects.exists())

    def test_spaces_around_message_are_trimmed(self):
        response = self.send(self.conversation.id, '   Salam   ')
        self.assertEqual(response.data['text'], 'Salam')


# 2. List my conversations --------------------------------------------------------------

class ListConversationsTests(MessagingTestCase):
    def test_list_shows_conversations_as_buyer_and_as_seller_only(self):
        mine_as_buyer = self.make_conversation(buyer=self.buyer)
        other_listing = Listing.objects.create(
            seller=self.buyer, title='Montre', price_dzd=8000, category=self.listing.category,
            condition=Listing.Condition.GOOD, wilaya=Wilaya.ORAN)
        mine_as_seller = self.make_conversation(buyer=self.buyer2, listing=other_listing)
        not_mine = self.make_conversation(buyer=self.buyer2)

        self.as_user(self.buyer)
        response = self.client.get(URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        ids = {row['id'] for row in response.data['results']}
        self.assertEqual(ids, {mine_as_buyer.id, mine_as_seller.id})
        self.assertNotIn(not_mine.id, ids)

    def test_row_shows_listing_other_person_last_message_and_unread(self):
        conversation = self.make_conversation()
        Message.objects.create(conversation=conversation, sender=self.buyer, text='Salam')
        Message.objects.create(conversation=conversation, sender=self.seller, text='Oui ?')
        Message.objects.create(conversation=conversation, sender=self.seller, text='Elle est dispo')

        self.as_user(self.buyer)
        row = self.client.get(URL).data['results'][0]
        self.assertEqual(row['listing']['title'], 'Robe kabyle')
        self.assertEqual(row['listing']['price_dzd'], 8500)
        self.assertTrue(row['listing']['cover_photo'].endswith('/media/listings/a.jpg'))
        self.assertEqual(row['other_person']['display_name'], 'Amina')
        self.assertEqual(row['last_message']['text'], 'Elle est dispo')
        self.assertFalse(row['last_message']['is_mine'])
        self.assertEqual(row['unread_count'], 2)  # the seller's 2 messages

        self.as_user(self.seller)
        row = self.client.get(URL).data['results'][0]
        self.assertEqual(row['other_person']['display_name'], 'Yacine')
        self.assertTrue(row['last_message']['is_mine'])
        self.assertEqual(row['unread_count'], 1)  # the buyer's 1 message

    def test_newest_activity_first(self):
        older = self.make_conversation(buyer=self.buyer, listing=self.listing)
        newer = self.make_conversation(buyer=self.buyer, listing=self.listing2)
        old_msg = Message.objects.create(conversation=older, sender=self.buyer, text='1')
        new_msg = Message.objects.create(conversation=newer, sender=self.buyer, text='2')
        Message.objects.filter(pk=old_msg.pk).update(sent_at=timezone.now() - timedelta(hours=2))
        Message.objects.filter(pk=new_msg.pk).update(sent_at=timezone.now() - timedelta(hours=1))

        self.as_user(self.buyer)
        self.assertEqual([r['id'] for r in self.client.get(URL).data['results']],
                         [newer.id, older.id])

        # A new message in the older conversation moves it back to the top.
        self.send(older.id, 'Je relance')
        self.assertEqual([r['id'] for r in self.client.get(URL).data['results']],
                         [older.id, newer.id])

    def test_empty_list(self):
        self.as_user(self.outsider)
        self.assertEqual(self.client.get(URL).data['count'], 0)

    def test_find_my_conversation_about_one_listing(self):
        about_robe = self.make_conversation(buyer=self.buyer, listing=self.listing)
        self.make_conversation(buyer=self.buyer, listing=self.listing2)
        self.make_conversation(buyer=self.buyer2, listing=self.listing)  # someone else's

        self.as_user(self.buyer)
        response = self.client.get(f'{URL}?listing={self.listing.id}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([row['id'] for row in response.data['results']], [about_robe.id])

        # The seller sees every buyer's conversation about their listing.
        self.as_user(self.seller)
        self.assertEqual(self.client.get(f'{URL}?listing={self.listing.id}').data['count'], 2)

        # Nobody else finds anything, and nonsense values just give an empty list.
        self.as_user(self.outsider)
        self.assertEqual(self.client.get(f'{URL}?listing={self.listing.id}').data['count'], 0)
        self.as_user(self.buyer)
        self.assertEqual(self.client.get(f'{URL}?listing=abc').data['count'], 0)
        self.assertEqual(self.client.get(f'{URL}?listing=99999').data['count'], 0)


# 3. Open a conversation --------------------------------------------------------------

class OpenConversationTests(MessagingTestCase):
    def setUp(self):
        self.conversation = self.make_conversation()
        now = timezone.now()
        for minutes, sender, text in [(30, self.buyer, 'Salam'),
                                      (20, self.seller, 'Bonjour'),
                                      (10, self.buyer, 'Prix final ?')]:
            message = Message.objects.create(conversation=self.conversation, sender=sender,
                                             text=text)
            Message.objects.filter(pk=message.pk).update(sent_at=now - timedelta(minutes=minutes))

    def test_messages_oldest_first(self):
        self.as_user(self.seller)
        response = self.client.get(f'{URL}{self.conversation.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual([m['text'] for m in response.data['messages']],
                         ['Salam', 'Bonjour', 'Prix final ?'])
        self.assertEqual(response.data['listing']['title'], 'Robe kabyle')
        self.assertEqual(response.data['buyer']['display_name'], 'Yacine')

    def test_opening_marks_only_the_other_persons_messages_as_read(self):
        self.as_user(self.seller)
        response = self.client.get(f'{URL}{self.conversation.id}/')
        by_text = {m['text']: m for m in response.data['messages']}
        self.assertTrue(by_text['Salam']['read'])         # buyer's -> now read
        self.assertTrue(by_text['Prix final ?']['read'])  # buyer's -> now read
        self.assertFalse(by_text['Bonjour']['read'])      # seller's own -> unchanged
        self.assertEqual(Message.objects.filter(read=True, sender=self.buyer).count(), 2)
        self.assertEqual(Message.objects.filter(read=False, sender=self.seller).count(), 1)

        # The seller's unread count in the list is now 0.
        self.assertEqual(self.client.get(URL).data['results'][0]['unread_count'], 0)

    def test_outsider_cannot_open_it(self):
        self.as_user(self.outsider)
        response = self.client.get(f'{URL}{self.conversation.id}/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(Message.objects.filter(read=True).exists())  # nothing marked read

    def test_unknown_conversation(self):
        self.as_user(self.buyer)
        self.assertEqual(self.client.get(f'{URL}99999/').status_code, status.HTTP_404_NOT_FOUND)


# 4. Send a message ----------------------------------------------------------------------

class SendMessageTests(MessagingTestCase):
    def setUp(self):
        self.conversation = self.make_conversation()

    def test_buyer_and_seller_can_both_send(self):
        self.as_user(self.buyer)
        response = self.send(self.conversation.id, 'Salam')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['sender'], {'id': self.buyer.id, 'display_name': 'Yacine'})
        self.assertTrue(response.data['is_mine'])
        self.assertFalse(response.data['read'])

        self.as_user(self.seller)
        self.assertEqual(self.send(self.conversation.id, 'Wa alaykum salam').status_code,
                         status.HTTP_201_CREATED)
        self.assertEqual(self.conversation.messages.count(), 2)

    def test_outsider_cannot_send(self):
        self.as_user(self.outsider)
        response = self.send(self.conversation.id, 'Spam')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(Message.objects.exists())

    def test_sender_cannot_be_faked(self):
        self.as_user(self.buyer)
        response = self.client.post(f'{URL}{self.conversation.id}/messages/',
                                    {'text': 'Hi', 'sender': self.seller.id, 'read': True},
                                    format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        message = Message.objects.get()
        self.assertEqual(message.sender, self.buyer)
        self.assertFalse(message.read)


# Admin ------------------------------------------------------------------------------------

class AdminTests(MessagingTestCase):
    def test_conversations_and_messages_in_admin(self):
        conversation = self.make_conversation()
        Message.objects.create(conversation=conversation, sender=self.buyer, text='Salam')
        admin = User.objects.create_superuser(phone='0799999999', password='Admin-pass-2026',
                                              display_name='Admin')
        client = Client()
        client.force_login(admin)
        for url in ['/admin/messaging/conversation/',
                    f'/admin/messaging/conversation/{conversation.id}/change/',
                    '/admin/messaging/conversation/?o=6',  # sort by last activity
                    '/admin/messaging/message/',
                    '/admin/messaging/message/?q=salam']:
            self.assertEqual(client.get(url).status_code, 200, url)
