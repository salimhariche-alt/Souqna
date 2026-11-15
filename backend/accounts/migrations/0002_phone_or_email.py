"""Let users sign up with a phone number OR an email (both unique).

Existing users have email '' (empty text). Unique emails would treat those as
duplicates, so we first turn '' into NULL (no value), then add the unique rule.
"""

import django.core.validators
from django.db import migrations, models


def empty_to_null(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    User.objects.filter(email='').update(email=None)
    User.objects.filter(phone='').update(phone=None)
    for user in User.objects.exclude(email=None):
        lowered = user.email.strip().lower()
        if lowered != user.email:
            User.objects.filter(pk=user.pk).update(email=lowered)


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        # 1. Allow NULL (no value) in both fields.
        migrations.AlterField(
            model_name='user',
            name='email',
            field=models.EmailField(blank=True, max_length=254, null=True),
        ),
        migrations.AlterField(
            model_name='user',
            name='phone',
            field=models.CharField(
                blank=True, max_length=10, null=True, unique=True,
                validators=[django.core.validators.RegexValidator(
                    message='Enter a valid Algerian mobile number: 10 digits starting with '
                            '05, 06 or 07.',
                    regex='^0[567]\\d{8}$',
                )],
            ),
        ),
        # 2. Turn existing empty values into NULL.
        migrations.RunPython(empty_to_null, migrations.RunPython.noop),
        # 3. Now emails can be unique, and every user needs a phone or an email.
        migrations.AlterField(
            model_name='user',
            name='email',
            field=models.EmailField(blank=True, max_length=254, null=True, unique=True),
        ),
        migrations.AddConstraint(
            model_name='user',
            constraint=models.CheckConstraint(
                condition=models.Q(('phone__isnull', False), ('email__isnull', False),
                                   _connector='OR'),
                name='user_has_phone_or_email',
            ),
        ),
    ]
