"""Extrait les taux d'apparition d'Animal Crossing: New Leaf (EUR, 1.0) depuis code.bin (ExeFS .code, non compressé).
Usage : python parse_nl.py acnl_code.bin sortie.json
Tables (adresses mémoire, code.bin chargé en 0x00100000) :
  insectes ville      0x0090EF44 : 12 mois x 6 créneaux x 33 x (u16 espèce, u16 cumul /1000)  (fonction 0x007A7578)
  poissons rivière    0x009033B8 : 14 périodes x 3 créneaux x 25 x (u16, u16 cumul /100)   (fonction 0x00699548, eau != mer)
  poissons mer        0x00904420 : 14 périodes x 3 créneaux x 24 x (u16, u16 cumul /100)
  créatures marines   0x009053E0 : 14 périodes x 3 créneaux x 22 x (u16, u16 cumul /100)   (fonction 0x00699960)
"""
import sys, json, struct, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from nl_noms import INS, FISH, SEA
d = open(sys.argv[1], "rb").read(); B = 0x100000

PERIODES = ["janvier","fevrier","mars","avril","mai","juin","juillet","aout 1-15","aout 16-31",
            "septembre 1-15","septembre 16-30","octobre","novembre","decembre"]
MOIS = ["janvier","fevrier","mars","avril","mai","juin","juillet","aout","septembre","octobre","novembre","decembre"]
CRENEAUX_3 = ["4h-9h et 16h-21h", "9h-16h", "21h-4h"]
CRENEAUX_6 = ["23h-4h", "4h-8h", "8h-16h", "16h-17h", "17h-19h", "19h-23h"]

def nom_poisson(i):
    if i < 72: return FISH[i]
    if i in (72, 73, 74): return f"Dechet ({i})"
    return f"Inconnu #{i}"
def nom_creature(i):
    if 76 <= i < 106: return SEA[i - 76]
    return f"Inconnu #{i}"
def nom_insecte(i):
    if i < 72: return INS[i]
    if i == 81: return "Aucun insecte"
    return f"Inconnu #{i}"

def lire(base, n_entrees, adresse_periode, adresse_creneau, total, nommer):
    o = base - B + adresse_periode + adresse_creneau
    prev, table = 0, []
    for k in range(n_entrees):
        i, c = struct.unpack_from("<HH", d, o + 4 * k)
        if (i, c) == (0, 0): break
        table.append({"id": i, "espece": nommer(i), "pourcent": round(100 * (c - prev) / total, 2)})
        prev = c
    assert prev == total, (hex(base), adresse_periode, adresse_creneau, prev)
    return table

out = {"jeu": "Animal Crossing: New Leaf (3DS, EUR, version 1.0)",
       "source": "code.bin (ExeFS) ; tables 0x0090EF44 (insectes), 0x009033B8 (rivière), 0x00904420 (mer), 0x009053E0 (créatures marines)",
       "notes": [
         "Poissons et créatures marines : poids sur 100, chaque créneau totalise 100.",
         "Insectes : poids sur 1000 (convertis en %), chaque créneau totalise 1000 ; 'Aucun insecte' (id 81) = part sans apparition.",
         "Août et septembre changent de table le 16 (poissons et créatures marines).",
         "Ids 72-74 en pêche = déchets ; id 107 (mer et plongée) et id 72 côté insectes (5 % de décembre à février) : non identifiés.",
         "Tables de la ville uniquement (pas l'île de Tortimer ni les tours).",
         "Le cœlacanthe est dans la table mer ; la condition pluie/neige est appliquée ailleurs dans le code (non vérifiée)."],
       "poissons": [], "creatures_marines": [], "insectes": []}
for p in range(14):
    for s in range(3):
        out["poissons"].append({"periode": PERIODES[p], "creneau": CRENEAUX_3[s], "eau": "riviere",
                                "table": lire(0x9033B8, 25, p * 300, s * 100, 100, nom_poisson)})
        out["poissons"].append({"periode": PERIODES[p], "creneau": CRENEAUX_3[s], "eau": "mer",
                                "table": lire(0x904420, 24, p * 288, s * 96, 100, nom_poisson)})
        out["creatures_marines"].append({"periode": PERIODES[p], "creneau": CRENEAUX_3[s],
                                         "table": lire(0x9053E0, 22, p * 264, s * 88, 100, nom_creature)})
for m in range(12):
    for s in range(6):
        t = lire(0x90EF44, 33, m * 792, s * 132, 1000, nom_insecte)
        rien = sum(e["pourcent"] for e in t if e["id"] == 81)
        out["insectes"].append({"mois": MOIS[m], "creneau": CRENEAUX_6[s],
                                "table": [e for e in t if e["id"] != 81], "pourcent_rien": round(rien, 2)})
json.dump(out, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
f = {e["espece"] for l in out["poissons"] for e in l["table"]}
c = {e["espece"] for l in out["creatures_marines"] for e in l["table"]}
i = {e["espece"] for l in out["insectes"] for e in l["table"]}
print("poissons:", len([x for x in f if x in FISH]), "/72 ; creatures:", len([x for x in c if x in SEA]), "/30 ; insectes:", len([x for x in i if x in INS]), "/72")
print("absents poissons:", [x for x in FISH if x not in f])
print("absents creatures:", [x for x in SEA if x not in c])
print("absents insectes:", [x for x in INS if x not in i])
print("inconnus:", sorted({x for x in f | c | i if x.startswith("Inconnu")}))
