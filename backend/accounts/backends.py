from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend

from .models import normalize_email_address, normalize_phone


class PhoneOrEmailBackend(ModelBackend):
    """Log in with a phone number or an email, plus password.

    Used by the API login and by the Django admin login page.
    """

    def authenticate(self, request, username=None, password=None, **kwargs):
        User = get_user_model()
        if username is None:
            username = kwargs.get(User.USERNAME_FIELD)
        if not username or password is None:
            return None

        if '@' in username:
            lookup = {'email': normalize_email_address(username)}
        else:
            lookup = {'phone': normalize_phone(username)}

        try:
            user = User._default_manager.get(**lookup)
        except User.DoesNotExist:
            # Hash anyway so a wrong login takes the same time whether or not the
            # account exists (makes it harder to guess who has an account).
            User().set_password(password)
            return None

        if user.check_password(password) and self.user_can_authenticate(user):
            return user
        return None
