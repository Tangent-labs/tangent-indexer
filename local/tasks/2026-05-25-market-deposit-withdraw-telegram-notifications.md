# Task Plan

## Goal

Ajouter un service de notification Telegram dédié aux événements de dépôt et retrait sur les marchés, utilisant le même bot token mais un channel ID différent de celui déjà configuré.

---

## Observed context

- `TelegramNotifierService` (`src/services/TelegramNotificationServices.ts`) est la classe de base. Elle prend `{ botToken, chatId }` dans son constructeur — il suffit d'instancier une deuxième instance avec un `chatId` différent.
- Le canal actuel est configuré via `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` dans `.env`.
- `UserMarketService.sortUserMarketLogs()` retourne `sortedAndParsedEvents` (type `SortedEvents`) qui contient déjà tous les événements parsés groupés par type avant insertion en base.
- `UserMarketService.insertEvents()` insère ces événements en base — c'est juste après cet appel dans `index_block.ts:135` que la notification doit être envoyée.
- Les événements de dépôt : `Deposit`, `ZapDeposit`, `DepositAndBorrow`, `ZapDepositAndBorrow`.
- Les événements de retrait : `Withdraw`, `RepayAndWithdraw`, `ZapRepayAndWithdraw`, `ZapRepay`, `Repay`.
- Chaque événement parsé contient : `market_id`, `account`, `block_id`, `tx_hash`, et un montant (`staked_amount` / `withdrawn_amount` / `repaid_amount` selon le type).
- Les messages Telegram utilisent MarkdownV2 et la méthode `escapeMarkdownV2` est disponible dans le service.
- `TELEGRAM_BOT_TOKEN` et `TELEGRAM_CHAT_ID` sont déjà dans `.env.example`.

---

## Assumptions

- Le nouveau channel recevra une notification par événement individuel (pas de batching/résumé).
- Les montants sont stockés en unités on-chain (big integers) — on les affichera divisés par `1e18` (assumption standard ERC20 18 décimales). **Open question :** certains marchés utilisent des tokens avec une autre précision (ex. USDC = 6 dec) — à confirmer.
- On affiche le `market_id` (entier) dans les messages. Un nom humain lisible nécessiterait une jointure DB — laisser en open question pour une itération ultérieure.
- On ne notifie pas si la liste d'événements est vide (pas de bruit).
- Les notifications sont envoyées **après** le commit de la transaction DB (hors de la `$transaction`) pour éviter de bloquer le commit ou d'envoyer un message si le commit échoue.

---

## Proposed implementation

### 1. Nouveau service : `MarketActivityNotificationService`

Créer `src/services/MarketActivityNotificationService.ts`.

Ce service :

- Reçoit une instance de `TelegramNotifierService` (instanciée avec le channel dédié).
- Expose une méthode `notifySortedEvents(sortedEvents: SortedEvents): Promise<void>`.
- Itère sur les types d'événements deposit/withdraw et envoie un message formaté pour chacun.

Format message (MarkdownV2) :

```
📥 *Deposit* — Market #42
👤 `0x1234...abcd`
💰 12.5 ETH
🔗 tx: `0xabcd...1234`
```

```
📤 *Withdraw* — Market #42
👤 `0x1234...abcd`
💰 5.0 ETH
🔗 tx: `0xabcd...1234`
```

### 2. Nouvelle variable d'environnement

Ajouter `TELEGRAM_MARKET_ACTIVITY_CHAT_ID=xxx` dans `.env.example`.

### 3. Intégration dans `index_block.ts`

Dans `setUpIndexerBlockServices()` :

```typescript
const marketActivityTelegram = new TelegramNotifierService({
  botToken: process.env.TELEGRAM_BOT_TOKEN!,
  chatId: process.env.TELEGRAM_MARKET_ACTIVITY_CHAT_ID!,
})
const marketActivityNotificationService = new MarketActivityNotificationService(marketActivityTelegram)
```

Dans `main()`, après le `$transaction` (ligne ~149), appeler :

```typescript
await marketActivityNotificationService.notifySortedEvents(hydratedWithCorrectDates.sortedParsedEvents)
```

> Important : l'appel doit être **hors** du bloc `prismaClient.$transaction(...)` pour éviter de bloquer le commit.

> Important : `hydratedWithCorrectDates.sortedParsedEvents` est actuellement dans le scope de la lambda de transaction. Il faut le sortir en variable de scope supérieur.

### 4. Guard sur la variable d'env

Si `TELEGRAM_MARKET_ACTIVITY_CHAT_ID` n'est pas définie, `TelegramNotifierService.sendMessage()` retourne déjà `false` sans erreur — le comportement de fallback est déjà géré.

---

## Expected file changes

| File                                                | Action     | Reason                                                                                     |
| --------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------ |
| `src/services/MarketActivityNotificationService.ts` | **create** | Nouveau service encapsulant la logique de formatage et d'envoi des notifs deposit/withdraw |
| `src/scripts/core/index_block.ts`                   | **modify** | Instancier le service et appeler `notifySortedEvents()` après le commit de transaction     |
| `.env.example`                                      | **modify** | Ajouter `TELEGRAM_MARKET_ACTIVITY_CHAT_ID=xxx`                                             |

---

## Validation plan

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Test unitaire existant UserMarketService (non-regression)
npm test -- --testPathPattern=UserMarketService

# Test manuel : exécuter index_block avec TELEGRAM_MARKET_ACTIVITY_CHAT_ID configuré
# et vérifier la réception du message dans le canal Telegram dédié
```

---

## Risks / open questions

1. **Précision des tokens** : certains marchés utilisent des tokens à 6 décimales (ex. USDC). Afficher `amount / 1e18` sera incorrect pour ces marchés. Solution possible : lire la décimale depuis la DB ou `ERC20Repository` — non scopé pour cette itération, on affiche l'amount brut ou on note « unités on-chain ».

2. **Volume de messages** : si un bloc contient beaucoup d'événements, de nombreux messages seront envoyés en séquence. Telegram limite à ~30 messages/seconde par bot. Si le volume est trop élevé, il faudra un mécanisme de batching (ex. un message résumant N événements). À surveiller en production.

3. **Scope de `sortedParsedEvents` dans `index_block.ts`** : la variable est actuellement déclarée dans le scope de la lambda `$transaction`. Il faut la déclarer à l'extérieur du bloc transaction et la remplir à l'intérieur pour pouvoir l'utiliser après le commit.

4. **Nom humain des marchés** : le `market_id` est un entier opaque. Un mapping vers un nom lisible (ex. "ETH/USG") nécessite une requête DB ou un fichier de config. Non scopé pour cette itération.

5. **Lien Etherscan** : on peut inclure un lien `https://etherscan.io/tx/{txHash}` dans le message, mais il faut s'assurer que le `chainId` correspond (mainnet vs testnet). Le `CHAIN_ID` est disponible dans l'env — à prendre en compte.
