"""Starter lists for content moderation (editable in the admin: Moderation -> Content terms).

Words that are also normal in a marketplace were left out on purpose (e.g. "كلب" alone,
because people sell dog collars; "sexe", used for clothes: "sexe : garçon"; "ordure", as in
"sac à ordures"), or only added inside a phrase ("يا كلب").
"""

from django.db import migrations

# category -> language -> phrases
TERMS = {
    'insult': {
        'fr': ['connard', 'connasse', 'abruti', 'débile', 'crétin', 'imbécile', 'enculé',
               'ta gueule', 'fils de pute', 'bâtard', 'salaud', 'nique ta mère'],
        'en': ['idiot', 'moron', 'asshole', 'bastard', 'shut up', 'son of a bitch',
               'dumbass', 'fuck you'],
        'ar': ['يا حمار', 'غبي', 'يا كلب', 'ابن الكلب', 'حقير', 'يا حيوان'],
        'darija': ['مكلخ', 'بهيم', 'تفو عليك', 'ولد الحرام'],
        'darija_latin': ['ya hmar', 'ya 7mar', 'ya kelb', 'mkalakh', 'mkelekh', 'bhim',
                         'tfou 3lik', 'weld l97ba', 'wald l7ram'],
    },
    'harassment': {
        'fr': ['sale pute', 'salope', 'pute', 'envoie ta photo', 'envoie moi ta photo',
               "t'es bonne", 'je sais où tu habites'],
        'en': ['slut', 'whore', 'send pics', 'send me pics', 'show me your body',
               'i know where you live'],
        'ar': ['عاهرة', 'شرموطة', 'أرسلي صورتك'],
        'darija': ['قحبة', 'زامل', 'بعثيلي تصويرتك'],
        'darija_latin': ['9a7ba', 'qahba', 'kahba', 'zamel', 'zaml'],
    },
    'sexual': {
        'fr': ['nique', 'niquer', 'baise moi', 'suce moi', 'plan cul', 'porno', 'nudes',
               'photo nue'],
        'en': ['porn', 'blowjob', 'dick pic', 'horny', 'sexting'],
        'ar': ['نيك', 'سكس', 'إباحي', 'صور عارية'],
        'darija': ['زبي', 'نتنايك'],
        'darija_latin': ['nik', 'nikmok', 'zebi', 'tnayek', 'n7wik'],
    },
    'threat': {
        'fr': ['je vais te tuer', 'je vais te buter', "je vais t'égorger", 'je vais te frapper',
               'tu vas mourir', 'je te tue', 'je vais brûler ta maison'],
        'en': ['i will kill you', "i'm going to kill you", 'i will hurt you',
               'i will find you', 'you are dead'],
        'ar': ['سأقتلك', 'سوف أقتلك', 'سأذبحك', 'ستموت', 'سأحرق بيتك'],
        'darija': ['نقتلك', 'نذبحك', 'نحرقلك دارك'],
        'darija_latin': ['n9tlk', 'n9atlek', 'nqatlek', 'ndab7ek', 'ndb7k', 'ghadi n9atlek'],
    },
    'extremism': {
        'fr': ['daech', 'état islamique', 'attentat suicide', 'attentat kamikaze',
               'djihad armé'],
        'en': ['daesh', 'islamic state', 'suicide bombing', 'suicide bomber',
               'join the caliphate', 'behead'],
        'ar': ['داعش', 'الدولة الإسلامية في العراق والشام', 'عملية انتحارية', 'حزام ناسف',
               'تفجير انتحاري'],
        'darija_latin': ['da3ech', 'da3esh'],
    },
}


def add_terms(apps, schema_editor):
    ContentTerm = apps.get_model('moderation', 'ContentTerm')
    for category, languages in TERMS.items():
        for language, phrases in languages.items():
            for phrase in phrases:
                ContentTerm.objects.get_or_create(
                    phrase=phrase, category=category,
                    defaults={'language': language, 'note': 'Starter list'})


def remove_terms(apps, schema_editor):
    apps.get_model('moderation', 'ContentTerm').objects.filter(note='Starter list').delete()


class Migration(migrations.Migration):
    dependencies = [('moderation', '0004_alter_moderationlog_action_contentflag_contentterm')]

    operations = [migrations.RunPython(add_terms, remove_terms)]
