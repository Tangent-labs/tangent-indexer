# Task Plan

## Goal

Ajouter des notifications Telegram dédiées aux événements de dépôt, retrait et remboursement sur les marchés, avec un template par type d'événement et le nom lisible du marché, sur un canal distinct, à partir de la branche de base `feat/indexer-execution-traces`.

## Observed context

- La branche de base demandée est `feat/indexer-execution-traces`; elle et la branche courante `feat/alert-market-action` pointent exactement sur `704fd05` (0 commit d'écart lors de la vérification du 2026-05-27).
- Cette base contient déjà `origin/main` à `9caad0d` (`Merge pull request #105`, 2026-05-25) et se trouve 10 commits devant, 0 commit derrière cette référence.
- La PR #106 (`fbe70c3`, 2026-05-25) a modifié `src/scripts/core/index_block.ts`; la PR #105 n'a modifié aucun fichier directement visé par cette fonctionnalité. Dans l'état courant, l'insertion des événements utilisateur reste dans le callback `prismaClient.$transaction(...)`.
- Les commits apportés par `feat/indexer-execution-traces` depuis `origin/main` ne changent le point d'intégration prévu que marginalement : `index_block.ts` n'a que des changements d'ordre d'import/espacement, et `UserMarketService.ts` ignore désormais les logs de marchés inconnus.
- `src/services/TelegramNotificationServices.ts` encapsule déjà l'envoi Telegram avec `{ botToken, chatId }`, utilise MarkdownV2 et retourne `false` lorsque les identifiants sont absents ou que l'appel Telegram échoue.
- `.env.example` contient `TELEGRAM_BOT_TOKEN` et `TELEGRAM_CHAT_ID`, mais pas de chat ID dédié aux actions marché.
- `src/services/events/UserMarketService.ts` exporte `SortedEvents`; `sortUserMarketLogs()` produit les groupes d'événements et `replaceRightDates()` conserve cette structure avant `insertEvents()`.
- Les événements qui portent un mouvement de collatéral entrant sont `Deposit`, `ZapDeposit`, `DepositAndBorrow` et `ZapDepositAndBorrow`, avec `staked_amount`.
- Les événements qui portent un mouvement de collatéral sortant sont `Withdraw`, `RepayAndWithdraw` et `ZapRepayAndWithdraw`, avec `withdrawn_amount`.
- `Repay` et `ZapRepay` portent `repaid_amount`, sans `withdrawn_amount`; ils représentent un remboursement et non un retrait de collatéral.
- `RepayAndWithdraw` et `ZapRepayAndWithdraw` portent à la fois `repaid_amount` et `withdrawn_amount`; leur notification doit donc afficher les deux mouvements.
- `MarketCreationService.getMarketsAddressesAndMap()` récupère déjà tous les enregistrements `usg_markets` par `MarketContractsRepository.getContracts()` afin de construire le mapping adresse vers `market_id`.
- Le modèle `global.usg_markets` contient `contract_name`, et la détection de création de marché l'alimente depuis le nom on-chain; ce champ est la source existante adaptée pour afficher le nom du marché dans les notifications.
- Le dépôt contient déjà une convention de test de service avec un notifier injecté et mocké, notamment dans `src/tests/Services/IndexerHealthAlertService.test.ts`.
- Les scripts de validation disponibles sont `lint`, `lint:tsc`, `build` et `test` via Vitest.

## Assumptions

- Le canal dédié réutilise `TELEGRAM_BOT_TOKEN` et reçoit son identifiant via une nouvelle variable `TELEGRAM_MARKET_ACTIVITY_CHAT_ID`.
- Le périmètre de notification couvre les neuf événements d'action utilisateur demandés : `Deposit`, `ZapDeposit`, `DepositAndBorrow`, `ZapDepositAndBorrow`, `Withdraw`, `Repay`, `ZapRepay`, `RepayAndWithdraw` et `ZapRepayAndWithdraw`.
- Chaque type d'événement reçoit un template dédié et le nom de l'événement apparaît explicitement dans le message.
- Le nom de marché affiché utilise `usg_markets.contract_name`, transmis depuis le chargement de marchés déjà effectué dans l'indexeur.
- Une notification individuelle par événement est acceptable pour la première version.
- Une notification Telegram est best-effort : son échec ne doit pas annuler un bloc déjà indexé ni transformer un commit DB réussi en échec à rejouer.
- Faute de métadonnée de décimales ou de symbole disponible dans les événements transmis au service, le message affiche le montant brut de collatéral, ou une valeur humanisée seulement si la règle de décimales est confirmée avant implémentation.

## Proposed implementation

1. Ajouter `TELEGRAM_MARKET_ACTIVITY_CHAT_ID` à `.env.example` à côté des variables Telegram existantes.
2. Étendre la valeur retournée par `MarketCreationService.getMarketsAddressesAndMap()` avec un mapping `market_id -> contract_name`, construit depuis les mêmes résultats `usg_markets` déjà lus pour récupérer les adresses, afin de ne pas introduire une seconde requête DB.
3. Créer `MarketActivityNotificationService`, injectant une instance de `TelegramNotifierService` et exposant une méthode recevant `SortedEvents` ainsi que le mapping des noms de marchés.
4. Dans ce service, définir un template dédié par événement :
   - `Deposit` et `ZapDeposit` : nom d'événement, nom/ID du marché, utilisateur, `staked_amount`, hash de transaction.
   - `DepositAndBorrow` et `ZapDepositAndBorrow` : nom d'événement, nom/ID du marché, utilisateur, `staked_amount`, `borrow_amount`, hash de transaction.
   - `Withdraw` : nom d'événement, nom/ID du marché, utilisateur, `withdrawn_amount`, hash de transaction.
   - `Repay` et `ZapRepay` : nom d'événement, nom/ID du marché, utilisateur, `repaid_amount`, hash de transaction.
   - `RepayAndWithdraw` et `ZapRepayAndWithdraw` : nom d'événement, nom/ID du marché, utilisateur, `repaid_amount`, `withdrawn_amount`, hash de transaction.
5. Inclure les neuf groupes correspondants de `SortedEvents` et ne pas notifier les autres actions existantes (`Borrow`, `Leverage`, liquidations, migrations), sauf extension explicite ultérieure.
6. Utiliser l'échappement existant de `TelegramNotifierService` en envoyant du texte non préformaté, sauf si un format MarkdownV2 enrichi devient un besoin explicite.
7. Dans `setUpIndexerBlockServices()` de `index_block.ts`, instancier un second notifier avec le même bot token et `TELEGRAM_MARKET_ACTIVITY_CHAT_ID`, puis construire et retourner le nouveau service.
8. Dans `main()`, conserver hors du callback transactionnel les événements hydratés et le mapping des noms destinés à la notification; ne déclencher l'envoi qu'après résolution réussie de `$transaction`.
9. Encadrer l'appel post-commit de façon best-effort afin qu'une panne Telegram ou un problème de formatage ne marque pas l'indexation DB déjà validée comme échouée.
10. Ajouter des tests unitaires du nouveau service : template et nom du marché pour chacun des neuf types, absence d'envoi lorsque ces listes sont vides et comportement de fallback si un nom est introuvable.

## Expected file changes

| File                                                           | Action | Reason                                                                                                           |
| -------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------- |
| `.env.example`                                                 | modify | Déclarer le chat Telegram dédié aux actions de marché.                                                           |
| `src/services/MarketActivityNotificationService.ts`            | create | Isoler la sélection des événements et le formatage/envoi des notifications.                                      |
| `src/services/events/MarketCreationService.ts`                 | modify | Exposer le nom du marché depuis les enregistrements déjà récupérés avec leurs identifiants.                      |
| `src/scripts/core/index_block.ts`                              | modify | Construire le service, conserver le mapping des noms et déclencher les notifications uniquement après le commit. |
| `src/tests/Services/MarketActivityNotificationService.test.ts` | create | Couvrir les neuf templates, le nom du marché, le fallback et les listes vides.                                   |

## Validation plan

- `npm run lint:tsc`
- `npm run lint`
- `npx vitest run src/tests/Services/MarketActivityNotificationService.test.ts src/tests/Services/UserMarketService.test.ts src/tests/Services/MarketCreationService.test.ts`
- `npm run build`
- Vérification manuelle avec `TELEGRAM_MARKET_ACTIVITY_CHAT_ID` configuré : indexer des blocs contenant au moins un dépôt, un retrait et un remboursement, puis confirmer le nom de l'événement et le nom du marché dans les messages reçus après insertion DB.

## Risks / open questions

- **Affichage du montant :** quelle source fournit les décimales et le symbole du collatéral par `market_id` ? Sans réponse, appliquer l'option sûre d'affichage en unités brutes.
- **Nom absent :** préciser le fallback d'affichage si un événement référence un `market_id` sans `contract_name` dans le mapping, par exemple `Market #<id>`.
- **Volume Telegram :** un message par événement peut atteindre les limites Telegram lors d'un bloc chargé; confirmer si un regroupement par bloc est nécessaire.
- **Message et liens :** un lien explorateur requiert le réseau cible ou une correspondance fiable depuis `CHAIN_ID`; ne pas l'ajouter implicitement.
- **Résilience post-commit :** l'envoi hors transaction est nécessaire, mais son traitement d'erreur doit explicitement empêcher un retry d'indexation d'un bloc déjà commité.

## Persistence

Plan revalidé sur la base `feat/indexer-execution-traces` et mis à jour le 2026-05-27 dans le fichier existant `./local/tasks/alert-market-action.md` afin de ne pas créer de doublon pour la même tâche.
