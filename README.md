# GeoPredict

GeoPredict is a **privacy-preserving, map-first prediction market** built on **Aleo testnet**.
It combines live world-event market ingestion (Polymarket + Manifold), geospatial discovery, and private bet/claim execution via Aleo records.

- Frontend: Next.js + React + Tailwind + Mapbox GL
- Wallet: Shield/Leo wallet adaptor
- Contract: Leo (`geopredict_private_v3.aleo`)
- Network: Aleo testnet (Provable Explorer API)

## Live Program Metadata

- Program ID: `geopredict_private_v3.aleo`
- Deployment transaction: `at1x9uurx3j309g9pal3fgsdqlvtywmlm0wzxupayk9ug2e0ude8gyqmgdmgz`
- Explorer program URL: [https://api.explorer.provable.com/v1/testnet/program/geopredict_private_v3.aleo](https://api.explorer.provable.com/v1/testnet/program/geopredict_private_v3.aleo)
- Explorer transaction URL: [https://api.explorer.provable.com/v1/testnet/transaction/at1x9uurx3j309g9pal3fgsdqlvtywmlm0wzxupayk9ug2e0ude8gyqmgdmgz](https://api.explorer.provable.com/v1/testnet/transaction/at1x9uurx3j309g9pal3fgsdqlvtywmlm0wzxupayk9ug2e0ude8gyqmgdmgz)

## What the App Does

GeoPredict lets users:

1. Discover many live, location-inferred prediction markets on a world map.
2. Switch between **Map view** (default) and **Grid view**.
3. Filter markets by category in both views.
4. Place private Yes/No bets with Aleo wallet records.
5. Claim winnings privately after resolution.
6. Verify claim transactions on-chain.

## Key Product Features

- **No demo betting mode**: all betting/claiming actions use wallet transactions.
- **Default map UX** with clustering to reduce pin crowding.
- **Grid fallback UX** for fast scanning of many markets.
- **Category filtering** (`event`, `sports`, `crypto`, `environmental`, `real_estate`, `music`).
- **Live market ingestion** from public APIs every minute (server revalidation).
- **30s pool refresh loop** for chain-tracked totals in UI.
- **Parimutuel payout previews** before bet and claim.
- **Private-fee toggle** (with public-fee fallback and transparent user notice).

## Architecture Overview

### 1) Frontend (Next.js)

Main UI lives in `/src/app/page.tsx`:

- Header: wallet connect, program/deploy links, view toggle.
- Category chips: filter visible markets.
- Content:
  - `map` mode: interactive map pins and clusters.
  - `grid` mode: card list.
- Right-side fixed market panel for market actions.

Primary components:

- `/src/components/Map.tsx`: Mapbox map, clustering, popup summaries.
- `/src/components/MarketPanel.tsx`: fixed side panel with market details, odds, pool depth, actions.
- `/src/components/BetModal.tsx`: private bet execution flow.
- `/src/components/ClaimModal.tsx`: private claim execution flow.
- `/src/components/VerifyProof.tsx`: on-chain claim transition verification by tx id.
- `/src/components/WalletProvider.tsx`: Shield wallet provider + network/program wiring.

### 2) Live Market Data API

`/src/app/api/live-markets/route.ts`:

- Pulls from:
  - Polymarket Gamma API
  - Manifold API
- Normalizes binary markets and filters unresolved + future-dated markets.
- Infers location using country/capital token matching plus deterministic jitter.
- Deduplicates by normalized question text.
- Ranks by liquidity/volume score.
- Returns up to 300 markets.

### 3) Aleo Contract

`/geopredict_contract/src/main.leo` program: `geopredict_private_v3.aleo`

- `place_bet`: consumes private credits record, escrows to public pool, emits private `Bet` record.
- `resolve_market`: admin-only market resolution.
- `claim_winnings`: consumes winning `Bet` record, verifies payout, mints private payout record and `WinProof`.
- Mapping `market_totals`: stores aggregate public pool totals and outcome.

### 4) Wallet + Records

- Uses `@provablehq/aleo-wallet-adaptor-*` with Shield adapter.
- Reads wallet records with `requestRecords`.
- Selects records via parsers in `/src/lib/aleoRecords.ts`.

## Privacy Model

### Private on Aleo

- User bet position (`position`) in `place_bet` transition input.
- User stake amount (`amount`) in `place_bet` transition input.
- Bet ownership and bet record contents.
- Claim nonce used to randomize proof hash linkage.

### Public on Aleo

- Market id (`market_id`) for pool accounting.
- Aggregate pool totals per market (`total_yes`, `total_no`).
- Market outcome after admin resolution.

### Anti-linkability improvement

`claim_winnings` includes `claim_nonce: field` and computes:

- `proof_hash = hash(owner_commitment + market_id + claim_nonce)`

This avoids deterministic proof hash reuse patterns across claims.

## Smart Contract Interface (v3)

### `place_bet`

```leo
async transition place_bet(
    stake: credits.aleo/credits,
    public market_id: field,
    position: u8,
    amount: u64,
) -> (Bet, credits.aleo/credits, Future)
```

Behavior:

- Validates signer owns `stake` record.
- Validates `position` is `1` (Yes) or `2` (No).
- Transfers `amount` from private credits record to program public balance.
- Returns private `Bet` record.
- Finalize updates mapping totals.

### `resolve_market`

```leo
async transition resolve_market(public market_id: field, public outcome: u8) -> Future
```

Behavior:

- Admin-only (program owner set in constructor).
- Sets final outcome (`1` Yes, `2` No).

### `claim_winnings`

```leo
async transition claim_winnings(
    bet: Bet,
    public outcome: u8,
    public expected_payout: u64,
    claim_nonce: field,
) -> (WinProof, credits.aleo/credits, Future)
```

Behavior:

- Verifies claimant owns bet and bet position matches resolved outcome.
- Derives payout from mapping totals in finalize.
- Asserts `expected_payout` equals derived parimutuel payout.
- Transfers payout from public pool to private credits.

## Payout Formula

Parimutuel payout:

```text
loser_share = (bet_amount * loser_pool) / winner_pool
payout      = bet_amount + loser_share
```

UI uses this for:

- Bet preview (`BetModal`)
- Claim preview (`ClaimModal`)
- Estimated profit and trade impact display

## Running Locally

### Prerequisites

- Node.js 20+
- npm
- Leo wallet extension (for real bet/claim interactions)
- Mapbox token

### Install and start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment variables

Create `.env.local`:

```bash
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_public_token
```

Notes:

- Map view requires `NEXT_PUBLIC_MAPBOX_TOKEN`.
- If missing, UI shows a map configuration error and still supports non-map portions of the app.

## Contract Development (Leo)

From `/geopredict_contract`:

```bash
leo build
leo test
```

Current program config (`/geopredict_contract/program.json`):

- Program: `geopredict_private_v3.aleo`
- Leo: `3.4.0`
- Dependency: `credits.aleo` (network)

## Deploy or Upgrade on Aleo Testnet

Set contract env (`/geopredict_contract/.env`):

```bash
PRIVATE_KEY=APrivateKey1...
NETWORK=testnet
ENDPOINT=https://api.explorer.provable.com/v1
```

Deploy new namespace:

```bash
leo deploy --broadcast --network testnet --endpoint https://api.explorer.provable.com/v1 --priority-fees 200000
```

Upgrade existing namespace:

```bash
leo upgrade --broadcast --network testnet --endpoint https://api.explorer.provable.com/v1 --priority-fees 200000
```

Important Aleo rule:

- `upgrade` requires function signatures to remain compatible.
- If you changed transition input types (for example `place_bet`), a new program id/namespace is required.

## Frontend Program Wiring

These files must point to the deployed program:

- `/src/components/WalletProvider.tsx` (`PROGRAM_ID`)
- `/src/lib/markets.ts` (`DEPLOYED_PROGRAM`, `DEPLOY_TX_ID`)

## User Flows

### Place Bet

1. User opens market panel and chooses Yes/No.
2. App parses amount to microcredits.
3. App requests wallet `credits.aleo` records.
4. If no suitable private record exists, app attempts `transfer_public_to_private` conversion.
5. App calls `place_bet` with:
   - private stake record
   - public market id
   - private position
   - private amount
6. UI confirms transaction and updates local stake view.

### Claim Winnings

1. User opens claim modal on resolved market.
2. App fetches winner bet record from wallet.
3. App computes expected payout from market totals.
4. App generates random private `claim_nonce`.
5. App calls `claim_winnings`.
6. UI shows transaction id and success state.

### Verify Claim

1. User pastes tx id in Verify widget.
2. App fetches transaction from explorer API.
3. App verifies transition matches:
   - program: `geopredict_private_v3.aleo`
   - function: `claim_winnings`

## Privacy vs Metadata Tradeoff

Each transaction supports fee mode choice:

- `privateFee = true` (stronger metadata privacy when fee record exists)
- fallback to public fee if private fee record is unavailable

UI explicitly surfaces fallback so user understands privacy level used for that tx.

## Troubleshooting

### "No credits records available"

Cause:

- Wallet has no spendable private credits records for required stake/fee.

What to do:

1. Fund wallet public balance on testnet.
2. Create private credits record (`transfer_public_to_private`).
3. Retry with smaller amount if record fragmentation prevents exact selection.

### "expects 3 inputs, but 4 were provided"

Cause:

- Frontend/contract program id mismatch (old deployed program ABI vs new client inputs).

Fix:

1. Confirm deployed program id and ABI.
2. Update `PROGRAM_ID` and `DEPLOYED_PROGRAM` in frontend.
3. Restart app and retry.

### Map pins look crowded

Current behavior:

- Clustering enabled in `Map.tsx`.
- High-confidence geolocated points are preferred when many markets are available.

## Testing Checklist

### Frontend checks

- `npm run lint`
- `npm run build`

### Contract checks

- `cd geopredict_contract && leo build`
- `cd geopredict_contract && leo test`

### Manual E2E checks

1. Connect Leo wallet.
2. Confirm map loads and cluster expansion works.
3. Toggle Map/Grid view.
4. Filter categories and verify both views update.
5. Place bet on unresolved market.
6. Verify transaction appears on explorer.
7. Resolve market (admin path) and claim winnings.
8. Verify claim tx using Verify widget.

## Current Limitations

- External source market totals are not automatically reconciled with on-chain mapping totals unless market is chain-tracked.
- Resolution/oracle governance is currently admin-driven, not decentralized.
- Record selection can fail with fragmented wallet records; wallet-side record consolidation UX is still basic.
- Map geolocation uses text inference and jitter, so some pins are approximate.

## Project Structure

```text
GEOPREDICT/
  src/
    app/
      api/live-markets/route.ts   # Live market ingestion + normalization
      page.tsx                    # Main UI shell, view/filter state
    components/
      WalletProvider.tsx          # Aleo wallet + program config
      Map.tsx                     # Mapbox map with clustering
      MarketPanel.tsx             # Fixed right-side market panel
      BetModal.tsx                # Private betting flow
      ClaimModal.tsx              # Private claim flow
      VerifyProof.tsx             # On-chain claim verification widget
    lib/
      markets.ts                  # Types, odds math, chain mapping reads
      aleoRecords.ts              # Wallet record parsing/selection
      token.ts                    # Credits unit conversions
  geopredict_contract/
    src/main.leo                  # Aleo program logic (v3)
    tests/test_geopredict_contract.leo
```

## Roadmap Direction

- Better oracle/resolution mechanism for practical production use.
- First-class chain tracking sync for all imported live markets.
- Improved record management UX (split/merge/consolidate hints).
- Stronger privacy defaults for fee handling and metadata minimization.

## License

MIT
