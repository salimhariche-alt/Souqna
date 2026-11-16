from rest_framework.exceptions import APIException


class DetailedAPIException(APIException):
    """An API error whose details are sent exactly as given.

    DRF normally turns every value of an error into text ("10" instead of 10), which
    would break the app's countdowns and limits. This keeps numbers as numbers, e.g.
    {"detail": "...", "code": "daily_limit", "limit": 10}.
    """

    def __init__(self, data: dict):
        self.detail = data
