"""How push notifications leave the server (settings.PUSH_BACKEND).

- ConsoleBackend (default, laptop): prints them in the Django terminal.
- MemoryBackend (tests): keeps them in MemoryBackend.outbox.
- ExpoBackend (live server): sends them through Expo's push service, which passes
  them to Google (Android) / Apple (iPhone). Optional EXPO_PUSH_ACCESS_TOKEN in .env.
"""

import json
import logging
import urllib.error
import urllib.request

from django.conf import settings

log = logging.getLogger(__name__)

EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'


class ConsoleBackend:
    def send(self, messages):
        """messages: [{"to", "title", "body", "data"}]. Returns the tokens that are gone."""
        for message in messages:
            print(f'[push] to {message["to"][:30]}...: {message["title"]} - {message["body"]} '
                  f'{message.get("data", {})}')
        return []


class MemoryBackend:
    outbox: list = []

    def send(self, messages):
        MemoryBackend.outbox.extend(messages)
        return []


class ExpoBackend:
    def send(self, messages):
        gone = []
        for start in range(0, len(messages), 100):  # Expo takes at most 100 at a time
            chunk = messages[start:start + 100]
            body = json.dumps([{**m, 'sound': 'default', 'channelId': 'default'} for m in chunk])
            request = urllib.request.Request(EXPO_PUSH_URL, data=body.encode(), method='POST',
                                             headers={'Content-Type': 'application/json',
                                                      'Accept': 'application/json'})
            token = getattr(settings, 'EXPO_PUSH_ACCESS_TOKEN', '')
            if token:
                request.add_header('Authorization', f'Bearer {token}')
            try:
                with urllib.request.urlopen(request, timeout=8) as response:
                    tickets = json.loads(response.read()).get('data', [])
            except (urllib.error.URLError, TimeoutError, ValueError) as error:
                log.warning('Push notifications not sent: %s', error)
                continue
            for message, ticket in zip(chunk, tickets):
                if ticket.get('details', {}).get('error') == 'DeviceNotRegistered':
                    gone.append(message['to'])
        return gone
