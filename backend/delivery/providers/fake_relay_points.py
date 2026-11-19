"""Test relay points of the FAKE delivery company (not real shops).

Positions are close to each town centre so that "sort by distance" can be tried on a
phone; the names say "Sougna Test Express" so nobody takes them for real places.
Open Saturday to Thursday (closed on Friday), like most Algerian courier offices.
"""

from .base import RelayPoint

SAT_TO_THU = [5, 6, 0, 1, 2, 3]
EVERY_DAY = [0, 1, 2, 3, 4, 5, 6]

# (id, place name, address, wilaya, commune code, latitude, longitude, days, opens, closes)
_POINTS = [
    ('ALG-01', 'Alger Centre - Grande Poste', '5 rue Larbi Ben M\'hidi', 16, 1601, 36.7733, 3.0588, SAT_TO_THU, '08:30', '18:00'),
    ('ALG-02', 'Hussein Dey - Tripoli', '120 rue de Tripoli', 16, 1617, 36.7406, 3.0960, SAT_TO_THU, '09:00', '17:30'),
    ('ALG-03', 'Kouba - Garidi', 'Cité Garidi 1, bloc 12', 16, 1618, 36.7275, 3.0742, SAT_TO_THU, '08:00', '17:00'),
    ('ALG-04', 'Bab Ezzouar - Centre commercial', 'Quartier des affaires, local 4', 16, 1621, 36.7209, 3.1835, EVERY_DAY, '10:00', '21:00'),
    ('ALG-05', 'Chéraga - Centre', '14 boulevard Amirouche', 16, 1652, 36.7678, 2.9592, SAT_TO_THU, '08:30', '18:00'),
    ('ORN-01', 'Oran - Front de mer', '22 boulevard de la Soummam', 31, 3101, 35.6987, -0.6359, SAT_TO_THU, '08:30', '18:00'),
    ('ORN-02', 'Bir El Djir - USTO', 'Cité USTO, local 7', 31, 3103, 35.7210, -0.5890, SAT_TO_THU, '09:00', '18:00'),
    ('ORN-03', 'Es Senia - Centre', '3 rue de l\'Indépendance', 31, 3105, 35.6480, -0.6230, SAT_TO_THU, '08:00', '17:00'),
    ('CST-01', 'Constantine - Coudiat', '9 avenue Aouati Mostefa', 25, 2501, 36.3610, 6.6080, SAT_TO_THU, '08:30', '17:30'),
    ('CST-02', 'El Khroub - Centre', '45 rue du 1er Novembre', 25, 2506, 36.2630, 6.6930, SAT_TO_THU, '08:00', '17:00'),
    ('BLD-01', 'Blida - Centre', '17 boulevard Larbi Tebessi', 9, 901, 36.4700, 2.8280, SAT_TO_THU, '08:30', '17:30'),
    ('SET-01', 'Sétif - Ain Fouara', '30 avenue du 8 Mai 1945', 19, 1901, 36.1900, 5.4100, SAT_TO_THU, '08:30', '18:00'),
    ('TZO-01', 'Tizi Ouzou - Nouvelle ville', 'Nouvelle ville, lot 210', 15, 1501, 36.7110, 4.0460, SAT_TO_THU, '08:00', '17:30'),
    ('BJA-01', 'Béjaïa - Centre', '11 rue de la Liberté', 6, 601, 36.7510, 5.0570, SAT_TO_THU, '08:30', '17:30'),
    ('ANB-01', 'Annaba - Cours de la Révolution', '6 cours de la Révolution', 23, 2301, 36.9000, 7.7550, SAT_TO_THU, '08:30', '18:00'),
    ('BTN-01', 'Batna - Centre', '25 allée Ben Boulaid', 5, 501, 35.5560, 6.1740, SAT_TO_THU, '08:00', '17:00'),
    ('TLM-01', 'Tlemcen - Centre', '8 rue de Mascara', 13, 1301, 34.8820, -1.3150, SAT_TO_THU, '08:30', '17:30'),
    ('OGX-01', 'Ouargla - Centre', 'Avenue Emir Abdelkader', 30, 3001, 31.9490, 5.3250, SAT_TO_THU, '08:00', '16:30'),
    ('GHA-01', 'Ghardaïa - Centre', 'Rue du 1er Novembre', 47, 4701, 32.4900, 3.6740, SAT_TO_THU, '08:00', '16:30'),
]

RELAY_POINTS = [
    RelayPoint(id=f'FAKE-{pid}', name=f'Sougna Test Express - {place}', address=address,
               wilaya=wilaya, commune_code=commune, latitude=lat, longitude=lng,
               open_days=days, opens=opens, closes=closes)
    for pid, place, address, wilaya, commune, lat, lng, days, opens, closes in _POINTS
]
