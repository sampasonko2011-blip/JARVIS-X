# PRONOTE réel — guide du pont iPad Air 5

**État : implémenté dans la branche P3, pas encore déployé ni relié au compte PRONOTE.**
Ce guide devient exécutable après revue/merge, application de la migration et déploiement autorisé de la fonction Edge. Aucun de ces actes de production n'est effectué par les commits de cette branche.

## Ce que fait le pont

- Reçoit un export iCalendar (text/calendar) ou un document JSON pronote.snapshot.v1.
- Authentifie les uploads avec un jeton JARVIS-X opaque, limité à cette fonction, stocké côté serveur sous forme de SHA-256, révocable et expirant après 90 jours.
- Vérifie le format, les dates, les doublons, la taille (2 Mo max), le nombre d'événements (2 000 max) et l'identité PRONOTE de la source.
- Conserve le dernier snapshot de chaque compte dans pronote_ipad_snapshots; RLS autorise uniquement son propriétaire à lire ses propres données.
- Détecte un snapshot identique et ne le réécrit pas ; refuse aussi qu'un snapshot JSON horodaté plus ancien remplace un snapshot horodaté plus récent. Renvoie fresh ou stale selon l'âge de generatedAt (seuil initial : 24 h). Pour un ICS sans date source fiable, freshness reste unknown et le contrôle anti-rejeu ne peut pas déduire l'âge réel du fichier.
- N'enregistre aucun mot de passe PRONOTE, QR code, cookie Safari ou jeton en clair en base.

**Limite de données :** un export iCalendar PRONOTE est généralement un calendrier d'événements. Il ne garantit pas l'export des devoirs, notes ou évaluations. Le pont ne peut afficher que les champs réellement présents dans l'export choisi. Ne pas déclarer la preuve « vrais devoirs/évaluations reçus » si ces données ne figurent pas dans la source officielle.

## Avant de commencer

1. Vérifier que la PR P3 a été revue et fusionnée.
2. Faire appliquer la migration 20261125120000_pronote_ipad_bridge.sql dans le projet Supabase ciblé.
3. Configurer les secrets Edge côté serveur : SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, et SUPABASE_ANON_KEY ou SUPABASE_PUBLISHABLE_KEYS. Ne jamais les mettre dans le dépôt, dans Raccourcis ou dans un message.
4. Déployer uniquement la fonction pronote-ipad-bridge après autorisation explicite et vérifier son health check :
   GET https://xfewajxkqntflfntisut.supabase.co/functions/v1/pronote-ipad-bridge/health
5. Vérifier le retour ok: true. Cela prouve uniquement que la fonction répond, pas qu'un compte PRONOTE est connecté.

## 1 — Créer le jeton d'ingestion

1. Ouvrir le HQ JARVIS-X sur le domaine officiel et se connecter avec le compte existant via le lien de connexion sécurisé.
2. Dans Task workspace → PRONOTE × Football calendar → PRONOTE iPad bridge, sélectionner **Créer / renouveler le jeton iPad**.
3. Le serveur révoque l'ancien jeton actif puis crée un jeton aléatoire de 256 bits, valable 90 jours.
4. Copier le jeton affiché une seule fois dans l'app **Mots de passe** d'Apple, sous un enregistrement nommé JARVIS-X PRONOTE Bridge. Le jeton ne donne accès qu'à l'ingestion PRONOTE, pas au compte PRONOTE ni à la mémoire HQ.
5. Ne pas l'envoyer dans ChatGPT, un DM, un fichier du dépôt, une URL, une capture d'écran ou un journal.
6. Conserver le token_id côté session HQ pour pouvoir révoquer le jeton. Le jeton en clair n'est pas conservé par l'interface après fermeture ou actualisation.

Si le panneau ne peut pas créer le jeton (authentification, fonction ou migration absente), **arrêter ici**. Ne pas fabriquer de jeton ni copier un secret Supabase à la place.

## 2 — Exporter les données depuis PRONOTE

1. Ouvrir PRONOTE ou l'ENT avec ta session habituelle.
2. Utiliser uniquement l'option officielle d'export/partage proposée par l'établissement.
3. Pour un premier test, exporter le calendrier au format .ics et l'enregistrer dans Fichiers → iCloud Drive → Raccourcis → PRONOTE.
4. Si l'ENT propose un export structuré distinct des devoirs/évaluations, vérifier le format et les champs avant de le convertir en pronote.snapshot.v1. Ne pas utiliser d'API privée, extraire les cookies Safari ou contourner une authentification.
5. Vérifier le contenu du fichier avant l'envoi. Un ICS peut ne contenir que les cours et événements.

## 3 — Créer le Raccourci Apple

Les noms exacts des actions peuvent varier selon la version d'iPadOS. Faire d'abord le test manuel, iPad déverrouillé.

1. Ouvrir **Raccourcis** → **+** et nommer le raccourci JARVIS-X — PRONOTE Sync.
2. Ajouter **Sélectionner un fichier** pour le test manuel, puis sélectionner l'export PRONOTE dans Fichiers.
3. Ajouter **Obtenir le contenu de l'URL** et configurer :
   - URL : https://xfewajxkqntflfntisut.supabase.co/functions/v1/pronote-ipad-bridge
   - Méthode : POST
   - En-tête Authorization : Bearer suivi du jeton JARVIS-X stocké dans Mots de passe
   - En-tête Content-Type : text/calendar pour un fichier ICS, ou application/json pour un snapshot JSON
   - Corps de la requête : le fichier sélectionné, sans le transformer en texte si Raccourcis peut envoyer le contenu du fichier directement
4. Pour le jeton, utiliser l'action **Rechercher un mot de passe / Find Password** si elle est disponible sur ta version d'iPadOS et si elle permet de récupérer l'entrée JARVIS-X PRONOTE Bridge dans l'en-tête. Ne pas écrire le jeton en dur dans une action Texte. Si cette action n'est pas disponible, ne pas poursuivre l'automatisation avec un secret en clair : garder l'upload manuel ou attendre une méthode de stockage sûre.
5. Ajouter une notification du résultat HTTP. Un 201 signifie nouveau snapshot enregistré ; un 200 avec duplicate: true signifie que le même snapshot existait déjà. Un 401 indique un jeton invalide, expiré ou révoqué.
6. Exécuter une première fois manuellement et vérifier le résultat dans HQ.

## 4 — Automatisation et écran verrouillé

1. Après réussite du test manuel, créer dans Raccourcis une **Automatisation personnelle → Heure de la journée**.
2. Choisir une heure adaptée, sélectionner JARVIS-X — PRONOTE Sync, désactiver **Demander avant d'exécuter** si l'option est proposée.
3. Faire un essai avec l'iPad déverrouillé, puis un essai séparé écran verrouillé.
4. Noter l'heure, le résultat de l'automatisation et le received_at retourné par le serveur.

**Ne présume pas que l'écran verrouillé fonctionne.** iPadOS peut bloquer une action qui exige une interaction, le déverrouillage ou l'accès à un fichier non disponible localement. Si l'action échoue, la preuve de synchronisation écran verrouillé est **NON VALIDÉE**. L'automatisation envoie le fichier déjà exporté ; elle ne prouve pas que PRONOTE a actualisé le fichier tout seul.

## 5 — Les trois preuves physiques

| Preuve | Test | Critère de validation |
|---|---|---|
| Écran verrouillé | Automatisation programmée, iPad verrouillé, fichier source disponible | Réponse serveur et heure de réception concordantes, sans interaction |
| Données réelles dans Workspace | Export officiel choisi par l'utilisateur, upload puis lecture du snapshot connecté | Événements attendus visibles et champs comparés à la source ; devoirs/évaluations uniquement s'ils sont réellement exportés |
| Expiration / fraîcheur | Révoquer le jeton, refaire un upload, puis envoyer un snapshot JSON dont generatedAt date de plus de 24 h | Jeton révoqué → HTTP 401 ; export de plus de 24 h → stale ; un échec ne doit jamais être affiché comme succès |

La CI, un snapshot synthétique ou une réponse HTTP isolée ne remplacent aucune de ces preuves.

## Révocation et incidents

- Depuis le panneau PRONOTE iPad bridge, sélectionner **Révoquer le jeton actif**.
- La révocation doit renvoyer revoked: true. L'ancien jeton doit ensuite obtenir HTTP 401.
- En cas de fuite présumée, révoquer immédiatement et créer un nouveau jeton depuis une session HQ authentifiée.
- Ne jamais envoyer le mot de passe PRONOTE, un QR code, un cookie, un token ou des données nominatives ici.

## Contrat technique

- Endpoint : POST /functions/v1/pronote-ipad-bridge
- Création du jeton : POST /functions/v1/pronote-ipad-bridge/token avec une session Supabase authentifiée.
- Révocation : POST /functions/v1/pronote-ipad-bridge/token/revoke avec { "token_id": "..." } et une session Supabase authentifiée.
- Formats : text/calendar et application/json (pronote.snapshot.v1).
- Stockage : un snapshot courant par utilisateur, lecture protégée par RLS.
- Aucun write vers le calendrier personnel, aucune connexion automatique à PRONOTE, aucun scraping Safari.
