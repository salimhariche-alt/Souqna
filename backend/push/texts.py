"""The words of push notifications, in each person's language (User.preferred_language).

They never contain the text of a message (alerts pass through Expo and Google): only
who wrote, about which item, and order news.
"""

TEXTS = {
    'fr': {
        'order_created': ('Nouvelle commande !', '« {title} » : confirmez-la dans les 24 h.'),
        'order_confirmed': ('Commande confirmée', '« {title} » : le vendeur a confirmé, le colis part bientôt.'),
        'order_dropped_off': ('Colis envoyé', '« {title} » : le colis a été déposé chez le livreur.'),
        'order_at_relay': ('Votre colis est arrivé', '« {title} » : il vous attend au point de retrait.'),
        'order_delivered_buyer': ('Colis récupéré', '« {title} » : donnez votre avis sur le vendeur.'),
        'order_delivered_seller': ('Vente terminée !', "« {title} » : l'acheteur a récupéré le colis. Donnez votre avis."),
        'order_refused_buyer': ('Colis non récupéré', "« {title} » : les colis non récupérés limitent vos prochaines commandes."),
        'order_refused_seller': ('Colis non récupéré', "« {title} » : l'acheteur n'a pas récupéré le colis. Il vous est retourné."),
        'order_returned': ('Colis retourné', '« {title} » : le colis est revenu, l’article est de nouveau en vente.'),
        'order_cancelled': ('Commande annulée', '« {title} » : la commande a été annulée.'),
        'message': ('{name}', 'Nouveau message à propos de « {title} »'),
        'offer_made': ('{name} fait une offre', '{price} pour « {title} »'),
        'offer_accepted': ('Offre acceptée !', '« {title} » à {price} : achetez dans les 48 h.'),
        'offer_declined': ('Offre refusée', '« {title} » : {name} a refusé votre offre.'),
    },
    'en': {
        'order_created': ('New order!', '"{title}": confirm it within 24 h.'),
        'order_confirmed': ('Order confirmed', '"{title}": the seller confirmed, the parcel will leave soon.'),
        'order_dropped_off': ('Parcel sent', '"{title}": the parcel was dropped off at the courier.'),
        'order_at_relay': ('Your parcel has arrived', '"{title}": it is waiting at the pick-up point.'),
        'order_delivered_buyer': ('Parcel collected', '"{title}": review the seller.'),
        'order_delivered_seller': ('Sale complete!', '"{title}": the buyer collected the parcel. Leave a review.'),
        'order_refused_buyer': ('Parcel not collected', '"{title}": uncollected parcels limit your next orders.'),
        'order_refused_seller': ('Parcel not collected', '"{title}": the buyer did not collect it. It is coming back to you.'),
        'order_returned': ('Parcel returned', '"{title}": the parcel is back, the item is on sale again.'),
        'order_cancelled': ('Order cancelled', '"{title}": the order was cancelled.'),
        'message': ('{name}', 'New message about "{title}"'),
        'offer_made': ('{name} made an offer', '{price} for "{title}"'),
        'offer_accepted': ('Offer accepted!', '"{title}" for {price}: buy within 48 h.'),
        'offer_declined': ('Offer declined', '"{title}": {name} declined your offer.'),
    },
    'ar': {
        'order_created': ('طلب جديد!', '«{title}»: أكّده خلال 24 ساعة.'),
        'order_confirmed': ('تم تأكيد الطلب', '«{title}»: أكّد البائع، سينطلق الطرد قريبًا.'),
        'order_dropped_off': ('تم إرسال الطرد', '«{title}»: سُلّم الطرد لشركة التوصيل.'),
        'order_at_relay': ('وصل طردك', '«{title}»: ينتظرك في نقطة الاستلام.'),
        'order_delivered_buyer': ('تم استلام الطرد', '«{title}»: قيّم البائع.'),
        'order_delivered_seller': ('تمت عملية البيع!', '«{title}»: استلم المشتري الطرد. شارك تقييمك.'),
        'order_refused_buyer': ('لم يُستلم الطرد', '«{title}»: الطرود غير المستلمة تحدّ من طلباتك القادمة.'),
        'order_refused_seller': ('لم يُستلم الطرد', '«{title}»: لم يستلمه المشتري. سيعود إليك.'),
        'order_returned': ('أُعيد الطرد', '«{title}»: عاد الطرد، والمنتج معروض للبيع من جديد.'),
        'order_cancelled': ('أُلغي الطلب', '«{title}»: أُلغي الطلب.'),
        'message': ('{name}', 'رسالة جديدة بخصوص «{title}»'),
        'offer_made': ('{name} يقدّم عرضًا', '{price} لـ «{title}»'),
        'offer_accepted': ('تم قبول العرض!', '«{title}» بـ {price}: اشترِ خلال 48 ساعة.'),
        'offer_declined': ('تم رفض العرض', '«{title}»: رفض {name} عرضك.'),
    },
}

CURRENCY = {'fr': 'DA', 'en': 'DA', 'ar': 'د.ج'}


def price(amount, language):
    """3000 -> "3 000 DA" (non-breaking spaces, like the app)."""
    digits = f'{amount:,}'.replace(',', ' ')
    return f'{digits} {CURRENCY.get(language, "DA")}'


def text(key, language, **values):
    """(title, body) in this language (French if unknown)."""
    title, body = TEXTS.get(language, TEXTS['fr']).get(key) or TEXTS['fr'][key]
    if 'amount' in values:
        values['price'] = price(values.pop('amount'), language)
    return title.format(**values), body.format(**values)
