"""Tests for the network settings that let the phone and web app connect.

Run with:  python manage.py test
"""

from django.conf import settings
from django.test import TestCase

LISTINGS = '/api/listings/'


class CorsTests(TestCase):
    """Which web pages (in a browser) may read the API."""

    def allowed_origin(self, origin):
        response = self.client.get(LISTINGS, headers={'Origin': origin})
        self.assertEqual(response.status_code, 200)
        return response.headers.get('Access-Control-Allow-Origin')

    def test_expo_web_on_this_laptop_is_allowed(self):
        for origin in ['http://localhost:8081', 'http://127.0.0.1:8081']:
            self.assertEqual(self.allowed_origin(origin), origin)

    def test_local_network_addresses_are_allowed_while_developing(self):
        for origin in ['http://192.168.1.20:8081', 'http://10.156.159.101:8081',
                       'http://172.20.0.5:8081']:
            self.assertEqual(self.allowed_origin(origin), origin)

    def test_other_websites_are_not_allowed(self):
        for origin in ['https://evil.example', 'http://192.168.1.20.evil.example',
                       'http://172.32.0.1:8081', 'http://8.8.8.8']:
            self.assertIsNone(self.allowed_origin(origin), origin)

    def test_browser_preflight_for_login_with_token_header(self):
        # Browsers ask first ("preflight") before sending an Authorization header.
        response = self.client.options('/api/auth/me/', headers={
            'Origin': 'http://localhost:8081',
            'Access-Control-Request-Method': 'GET',
            'Access-Control-Request-Headers': 'authorization',
        })
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['Access-Control-Allow-Origin'], 'http://localhost:8081')
        self.assertIn('authorization', response.headers['Access-Control-Allow-Headers'])


class AllowedHostsTests(TestCase):
    def test_localhost_and_this_laptops_wifi_address_are_allowed(self):
        self.assertIn('localhost', settings.ALLOWED_HOSTS)
        self.assertIn('127.0.0.1', settings.ALLOWED_HOSTS)
        if getattr(settings, 'LAN_IP', None):
            self.assertIn(settings.LAN_IP, settings.ALLOWED_HOSTS)

    def test_request_to_wifi_address_is_answered(self):
        lan_ip = getattr(settings, 'LAN_IP', None)
        if not lan_ip:
            self.skipTest('No Wi-Fi/LAN address on this computer right now.')
        response = self.client.get(LISTINGS, HTTP_HOST=f'{lan_ip}:8000')
        self.assertEqual(response.status_code, 200)

    def test_unknown_host_is_refused(self):
        response = self.client.get(LISTINGS, HTTP_HOST='evil.example')
        self.assertEqual(response.status_code, 400)
