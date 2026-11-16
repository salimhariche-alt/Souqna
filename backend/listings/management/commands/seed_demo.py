"""Load the main categories and 30 fake listings for local testing.

Usage:
    python manage.py seed_demo          # safe to run again: no duplicates
    python manage.py seed_demo --reset  # delete the demo listings and recreate them
"""

import random
from datetime import timedelta
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from PIL import Image, ImageDraw, ImageFont

from listings.models import Category, Listing, ListingPhoto
from souqna_api.wilayas import Wilaya

# (English, French, Arabic)
MAIN_CATEGORIES = [
    ('Women', 'Femmes', 'نساء'),
    ('Men', 'Hommes', 'رجال'),
    ('Kids', 'Enfants', 'أطفال'),
    ('Home', 'Maison', 'المنزل'),
    ('Electronics', 'Électronique', 'إلكترونيات'),
]

# Demo sellers all use phone numbers 055000000X so they are easy to spot and reset.
DEMO_PHONE_PREFIX = '055000000'
DEMO_SELLERS = [
    ('Amina B.', Wilaya.ALGER, 'fr'),
    ('Yacine K.', Wilaya.ORAN, 'ar'),
    ('Sara M.', Wilaya.CONSTANTINE, 'fr'),
    ('Karim D.', Wilaya.SETIF, 'ar'),
    ('Lina H.', Wilaya.TIZI_OUZOU, 'fr'),
    ('Nassim R.', Wilaya.BLIDA, 'en'),
]

C = Listing.Condition
S = Listing.Status

# (category, title, description, price_dzd, size, brand, condition, status)
DEMO_LISTINGS = [
    # Women
    ('Women', 'Robe kabyle traditionnelle',
     'Robe kabyle faite main, couleurs vives, portée une seule fois pour un mariage.',
     8500, 'M', '', C.VERY_GOOD, S.ACTIVE),
    ('Women', 'Caftan algérois brodé',
     'Caftan en velours bordeaux avec broderie dorée (fetla). Très bon état.',
     18000, 'L', '', C.VERY_GOOD, S.ACTIVE),
    ('Women', 'Sac à main Zara noir',
     'Sac à main en simili cuir, plusieurs poches. Quelques traces légères.',
     3500, '', 'Zara', C.GOOD, S.ACTIVE),
    ('Women', 'Baskets Nike Air Force 1',
     'Blanches, pointure 38, nettoyées et prêtes à porter.',
     9000, '38', 'Nike', C.GOOD, S.RESERVED),
    ('Women', 'حجاب حرير جديد',
     'حجاب حرير ناعم، لون بيج، جديد مع الملصق.',
     1200, '', '', C.NEW_WITH_TAGS, S.ACTIVE),
    ('Women', 'Manteau Mango beige',
     'Manteau long en laine mélangée, idéal pour l\'hiver.',
     6500, 'S', 'Mango', C.VERY_GOOD, S.ACTIVE),
    ('Women', 'Jean Pull&Bear taille haute',
     'Jean bleu clair coupe mom, taille 36.',
     2200, '36', 'Pull&Bear', C.GOOD, S.SOLD),
    # Men
    ('Men', "Maillot Équipe d'Algérie domicile",
     'Maillot officiel des Verts, jamais porté, avec étiquette.',
     7500, 'L', 'Adidas', C.NEW_WITH_TAGS, S.ACTIVE),
    ('Men', 'Veste en cuir homme',
     'Veste en cuir véritable marron, coupe motard.',
     9500, 'XL', '', C.GOOD, S.ACTIVE),
    ('Men', 'Survêtement Nike Tech Fleece',
     'Ensemble gris complet (veste + pantalon), taille M.',
     14000, 'M', 'Nike', C.VERY_GOOD, S.ACTIVE),
    ('Men', 'قندورة رجالية',
     'قندورة بيضاء للصيف، قماش خفيف، لم تُلبس.',
     4500, 'L', '', C.NEW_WITHOUT_TAGS, S.ACTIVE),
    ('Men', 'Chaussures Adidas Samba',
     'Noires, pointure 43, portées quelques fois.',
     11000, '43', 'Adidas', C.VERY_GOOD, S.RESERVED),
    ('Men', 'Montre Casio G-Shock',
     'Montre résistante à l\'eau, bracelet en bon état, avec boîte.',
     8000, '', 'Casio', C.GOOD, S.ACTIVE),
    ('Men', 'Chemise Lacoste blanche',
     'Chemise manches longues, taille M, très peu portée.',
     5500, 'M', 'Lacoste', C.VERY_GOOD, S.SOLD),
    # Kids
    ('Kids', 'Poussette Chicco',
     'Poussette pliable avec habillage pluie. Roues en bon état.',
     15000, '', 'Chicco', C.GOOD, S.ACTIVE),
    ('Kids', 'Lot de vêtements bébé 6-12 mois',
     '15 pièces : bodies, pyjamas et pantalons. Propres et en bon état.',
     3000, '6-12 mois', '', C.GOOD, S.ACTIVE),
    ('Kids', 'محفظة مدرسية',
     'محفظة مدرسية بعجلات، جديدة، مناسبة للابتدائي.',
     2500, '', '', C.NEW_WITH_TAGS, S.ACTIVE),
    ('Kids', 'Vélo enfant 16 pouces',
     'Vélo rouge avec petites roues amovibles, pour 4-7 ans.',
     7000, '16"', '', C.GOOD, S.RESERVED),
    ('Kids', 'Tenue de fête fille',
     "Robe de fête pour l'Aïd, taille 8 ans, portée une fois.",
     3200, '8 ans', '', C.NEW_WITHOUT_TAGS, S.ACTIVE),
    ('Kids', 'Lego Classic 500 pièces',
     'Boîte complète avec notice.',
     4500, '', 'LEGO', C.VERY_GOOD, S.ACTIVE),
    # Home
    ('Home', 'Service à café en cuivre',
     'Plateau, cafetière et 6 tasses en cuivre ciselé.',
     6000, '', '', C.GOOD, S.ACTIVE),
    ('Home', 'Tapis berbère fait main',
     'Tapis en laine, motifs traditionnels, 120 x 180 cm.',
     25000, '120x180 cm', '', C.VERY_GOOD, S.ACTIVE),
    ('Home', 'طاجين فخار',
     'طاجين من الفخار التقليدي، جديد، مناسب للطهي.',
     1500, '', '', C.NEW_WITHOUT_TAGS, S.SOLD),
    ('Home', 'Couscoussier inox 8 L',
     'Couscoussier en inox, jamais utilisé, encore dans son emballage.',
     4000, '8 L', '', C.NEW_WITH_TAGS, S.ACTIVE),
    ('Home', 'Rideaux occultants (2 pièces)',
     'Rideaux gris anthracite, 140 x 260 cm chacun.',
     3500, '140x260 cm', '', C.VERY_GOOD, S.ACTIVE),
    # Electronics
    ('Electronics', 'iPhone 13 128 Go',
     'Batterie 86 %, aucune rayure, avec boîte et câble.',
     68000, '128 Go', 'Apple', C.VERY_GOOD, S.ACTIVE),
    ('Electronics', 'Samsung Galaxy A54',
     '8/256 Go, petite rayure au dos, chargeur inclus.',
     42000, '256 Go', 'Samsung', C.GOOD, S.ACTIVE),
    ('Electronics', 'PS5 avec 2 manettes',
     'Version lecteur disque, 2 manettes et 3 jeux offerts.',
     120000, '', 'Sony', C.VERY_GOOD, S.RESERVED),
    ('Electronics', 'Laptop HP EliteBook 840 G6',
     'Core i5, 16 Go RAM, SSD 256 Go. Idéal pour les études.',
     65000, '14"', 'HP', C.GOOD, S.ACTIVE),
    ('Electronics', 'AirPods Pro 2',
     'Neufs, sous blister, jamais ouverts.',
     32000, '', 'Apple', C.NEW_WITH_TAGS, S.SOLD),
]

PHOTO_COLOURS = ['#E07A5F', '#3D405B', '#81B29A', '#F2CC8F', '#6D597A', '#457B9D']


def placeholder_photo(label, colour, number):
    """Make a simple 800x800 JPEG with the listing name, so photos are visible in admin."""
    img = Image.new('RGB', (800, 800), colour)
    draw = ImageDraw.Draw(img)
    try:
        font = ImageFont.load_default(size=48)
    except TypeError:  # very old Pillow without sized default font
        font = ImageFont.load_default()
    text = f'{label}\nphoto {number}'
    draw.multiline_text((400, 400), text, fill='white', font=font, anchor='mm', align='center')
    buffer = BytesIO()
    img.save(buffer, format='JPEG', quality=80)
    return ContentFile(buffer.getvalue())


class Command(BaseCommand):
    help = 'Load the main categories and 30 fake listings for local testing.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--reset', action='store_true',
            help='Delete the existing demo listings (and their photos) and recreate them.',
        )

    @transaction.atomic
    def handle(self, *args, reset=False, **options):
        rng = random.Random(42)  # same "random" data every time

        categories = self.load_categories()
        sellers = self.load_sellers()

        demo_listings = Listing.objects.filter(seller__in=sellers)
        if reset:
            for photo in ListingPhoto.objects.filter(listing__in=demo_listings):
                photo.image.delete(save=False)
            deleted = demo_listings.count()
            demo_listings.delete()
            self.stdout.write(f'Deleted {deleted} demo listings.')
        elif demo_listings.exists():
            self.stdout.write(self.style.WARNING(
                f'{demo_listings.count()} demo listings already exist - skipping. '
                'Use --reset to recreate them.'
            ))
            return

        now = timezone.now()
        for i, (cat, title, desc, price, size, brand, condition, status) in enumerate(DEMO_LISTINGS):
            seller = sellers[i % len(sellers)]
            listing = Listing.objects.create(
                seller=seller, title=title, description=desc, price_dzd=price,
                category=categories[cat], size=size, brand=brand,
                condition=condition, status=status, wilaya=seller.wilaya,
            )
            # Spread listings over the last 30 days (auto_now_add ignores values on create).
            created = now - timedelta(days=rng.randint(0, 29), hours=rng.randint(0, 23),
                                      minutes=rng.randint(0, 59))
            Listing.objects.filter(pk=listing.pk).update(created_at=created)

            colour = PHOTO_COLOURS[i % len(PHOTO_COLOURS)]
            for position in range(1, rng.randint(1, 3) + 1):
                photo = ListingPhoto(listing=listing, position=position)
                photo.image.save(f'demo_{listing.pk}_{position}.jpg',
                                 placeholder_photo(cat, colour, position), save=True)

        self.stdout.write(self.style.SUCCESS(
            f'Created {len(DEMO_LISTINGS)} demo listings with photos '
            f'from {len(sellers)} demo sellers.'
        ))

    def load_categories(self):
        categories = {}
        for name_en, name_fr, name_ar in MAIN_CATEGORIES:
            category, created = Category.objects.update_or_create(
                name_en=name_en, parent=None,
                defaults={'name_fr': name_fr, 'name_ar': name_ar},
            )
            categories[name_en] = category
        self.stdout.write(f'Categories ready: {", ".join(categories)}.')
        return categories

    def load_sellers(self):
        User = get_user_model()
        sellers = []
        for n, (name, wilaya, lang) in enumerate(DEMO_SELLERS, start=1):
            user, created = User.objects.get_or_create(
                phone=f'{DEMO_PHONE_PREFIX}{n}',
                defaults={'display_name': name, 'wilaya': wilaya, 'preferred_language': lang},
            )
            if created:
                user.set_unusable_password()  # demo accounts cannot log in
            if not user.phone_verified:
                # Demo sellers count as verified, so the trust badge has something to show.
                user.phone_verified = True
                user.phone_verified_at = user.date_joined
            user.save()
            sellers.append(user)
        self.stdout.write(f'Demo sellers ready: {len(sellers)}.')
        return sellers
