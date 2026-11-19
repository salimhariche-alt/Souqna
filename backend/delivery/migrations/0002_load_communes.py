"""Load Algeria's 1,541 communes (58 wilayas) from delivery/data/communes.json.

Source (see the "source" field of the file): names and official codes from
dzcode-io/leblad (MIT License); the wilaya of each commune since the 2019 reform from
Wikidata (CC0), checked by hand against the official commune counts.
"""

import json
from pathlib import Path

from django.db import migrations

DATA = Path(__file__).resolve().parent.parent / 'data' / 'communes.json'


def load(apps, schema_editor):
    Commune = apps.get_model('delivery', 'Commune')
    rows = json.loads(DATA.read_text(encoding='utf-8'))['communes']
    Commune.objects.bulk_create(
        [Commune(code=code, wilaya=wilaya, name_fr=fr, name_ar=ar) for code, wilaya, fr, ar in rows],
        ignore_conflicts=True,
    )


def unload(apps, schema_editor):
    apps.get_model('delivery', 'Commune').objects.all().delete()


class Migration(migrations.Migration):
    dependencies = [('delivery', '0001_initial')]
    operations = [migrations.RunPython(load, unload)]
