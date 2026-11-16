"""Starter list of suspicious words (editable in the admin), and fingerprints for
photos that were uploaded before fingerprints existed."""

from django.db import migrations

# (phrase, language, note)
STARTER_KEYWORDS = [
    # French
    ('versement', 'fr', 'Asks to send money'),
    ('avance', 'fr', 'Payment in advance'),
    ("paiement d'avance", 'fr', 'Payment in advance'),
    ("payer d'avance", 'fr', 'Payment in advance'),
    ('acompte', 'fr', 'Deposit before seeing the item'),
    ('virement', 'fr', 'Bank transfer'),
    ('mandat', 'fr', 'Money order'),
    ('ccp', 'fr', 'Postal account transfer'),
    ('baridimob', 'fr', 'Mobile postal payment'),
    ('baridi mob', 'fr', 'Mobile postal payment'),
    ('western union', 'fr', 'Money transfer service'),
    # Arabic
    ('تحويل', 'ar', 'Transfer (money)'),
    ('دفع مسبق', 'ar', 'Payment in advance'),
    ('الدفع مسبقا', 'ar', 'Payment in advance'),
    ('دفع مقدم', 'ar', 'Payment in advance'),
    ('عربون', 'ar', 'Deposit'),
    ('حوالة', 'ar', 'Money order / transfer'),
    ('بريدي موب', 'ar', 'Mobile postal payment'),
    # English
    ('advance payment', 'en', 'Payment in advance'),
    ('pay in advance', 'en', 'Payment in advance'),
    ('deposit', 'en', 'Deposit before seeing the item'),
    ('wire transfer', 'en', 'Bank transfer'),
    ('bank transfer', 'en', 'Bank transfer'),
    ('moneygram', 'en', 'Money transfer service'),
    # Algerian Darija (written in Latin letters)
    ('khlass 9bel', 'darija', '"Pay before"'),
    ('khalas 9bel', 'darija', '"Pay before"'),
    ('khales 9bel', 'darija', '"Pay before"'),
    ('khlas qbel', 'darija', '"Pay before"'),
    ('dfa3 9bel', 'darija', '"Pay before"'),
    ('3arboun', 'darija', 'Deposit'),
    ('flexy', 'darija', 'Mobile credit transfer'),
    ('versi', 'darija', '"Send (money)"'),
]


def add_keywords(apps, schema_editor):
    FlaggedKeyword = apps.get_model('moderation', 'FlaggedKeyword')
    for phrase, language, note in STARTER_KEYWORDS:
        FlaggedKeyword.objects.get_or_create(phrase=phrase,
                                             defaults={'language': language, 'note': note})


def fingerprint_existing_photos(apps, schema_editor):
    from moderation.images import fingerprint

    ListingPhoto = apps.get_model('listings', 'ListingPhoto')
    for photo in ListingPhoto.objects.filter(fingerprint=''):
        try:
            with photo.image.open('rb') as file:
                photo.fingerprint = fingerprint(file)
        except Exception:
            continue  # missing or unreadable file: leave it empty
        photo.save(update_fields=['fingerprint'])


class Migration(migrations.Migration):

    dependencies = [
        ('moderation', '0001_initial'),
        ('listings', '0002_listing_flag_reasons_listing_flagged_at_and_more'),
    ]

    operations = [
        migrations.RunPython(add_keywords, migrations.RunPython.noop),
        migrations.RunPython(fingerprint_existing_photos, migrations.RunPython.noop),
    ]
