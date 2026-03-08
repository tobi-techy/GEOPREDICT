# GeoPredict

**Privacy-preserving prediction markets on Aleo** — discover world events on a map, bet privately with zero-knowledge proofs.

## Live on Aleo Testnet

| | |
|---|---|
| Program ID | `geopredict_private_v3.aleo` |
| Deploy TX | [`at1x9uurx3j309g9pal3fgsdqlvtywmlm0wzxupayk9ug2e0ude8gyqmgdmgz`](https://api.explorer.provable.com/v1/testnet/transaction/at1x9uurx3j309g9pal3fgsdqlvtywmlm0wzxupayk9ug2e0ude8gyqmgdmgz) |
| Program URL | [Explorer](https://api.explorer.provable.com/v1/testnet/program/geopredict_private_v3.aleo) |
| Network | Aleo Testnet |
| Wallet | Shield Wallet / Leo Wallet |
| Currency | Native Aleo credits (`credits.aleo`) |

---

## What It Does

GeoPredict aggregates 300+ live prediction markets from Polymarket and Manifold, plots them on a world map, and lets users place **private bets using Aleo's zero-knowledge infrastructure**.

1. **Discover** — Browse markets on an interactive map or grid view
2. **Bet privately** — Your position (Yes/No) and stake amount are private Aleo records
3. **Claim privately** — Winnings are paid out as private credits with unlinkable proof hashes
4. **Verify on-chain** — Every transaction is verifiable on Aleo testnet explorer

---

## Privacy Model

### What's Private (ZK-protected)

- Your bet position (Yes or No)
- Your stake amount
- Your `Bet` record ownership
- Claim nonce (prevents proof hash linkage across claims)

### What's Public (on-chain)

- Market ID (for pool accounting)
- Aggregate pool totals (`total_yes`, `total_no`)
- Market outcome after resolution

This design lets the contract compute parimutuel payouts while keeping individual positions hidden.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ Map View │  │Grid View │  │ BetModal │  │   ClaimModal     │ │
│  │ (Mapbox) │  │          │  │          │  │                  │ │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────────┬─────────┘ │
│       │             │             │                  │           │
│       └─────────────┴─────────────┴──────────────────┘           │
│                              │                                   │
│                    ┌─────────▼─────────┐                         │
│                    │  WalletProvider   │                         │
│                    │ (Shield/Leo SDK)  │                         │
│                    └─────────┬─────────┘                         │
└──────────────────────────────┼───────────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Aleo Testnet   │  │   Polymarket    │  │    Manifold     │
│                 │  │   Gamma API     │  │      API        │
│ geopredict_     │  │                 │  │                 │
│ private_v3.aleo │  │  (market data)  │  │  (market data)  │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### Data Flow

1. **Market ingestion**: API route fetches from Polymarket + Manifold, infers geolocation, deduplicates
2. **Display**: Markets shown with source odds (e.g., "65% Yes on Polymarket")
3. **Betting**: User bets go to Aleo contract — GeoPredict maintains its own on-chain pool
4. **Pool tracking**: After first bet, market becomes "chain-tracked" and shows real on-chain totals
5. **Claiming**: Winners claim from on-chain pool with private payout records

### Key Distinction: Source Odds vs On-Chain Pool

- **Source odds**: Probability from Polymarket/Manifold (informational only)
- **GeoPredict pool**: Actual Aleo credits staked through this app (starts at 0)
- **On-chain totals**: Real `market_totals` mapping values after bets are placed

---

## Smart Contract (`geopredict_private_v3.aleo`)

### `place_bet`
```leo
async transition place_bet(
    stake: credits.aleo/credits,  // private input record
    public market_id: field,
    position: u8,                 // private: 1=Yes, 2=No
    amount: u64,                  // private
) -> (Bet, credits.aleo/credits, Future)
```

### `resolve_market`
```leo
async transition resolve_market(
    public market_id: field,
    public outcome: u8            // 1=Yes won, 2=No won
) -> Future
```
Admin-only (deployer address).

### `claim_winnings`
```leo
async transition claim_winnings(
    bet: Bet,                     // private record
    public outcome: u8,
    public expected_payout: u64,
    claim_nonce: field,           // private, prevents linkage
) -> (WinProof, credits.aleo/credits, Future)
```

### Payout Formula (Parimutuel)
```
loser_share = (stake × loser_pool) / winner_pool
payout = stake + loser_share
```

---

## PMF & GTM

### Product-Market Fit

**Problem**: Prediction markets are powerful information aggregation tools, but existing platforms expose user positions publicly, creating privacy and regulatory concerns.

**Solution**: GeoPredict brings prediction market UX to Aleo's privacy layer:
- Bet without revealing your position to other market participants
- Claim winnings without linking to your betting history
- Geographic discovery makes markets more accessible than list-based UIs

**Target users**:
- Privacy-conscious traders who want prediction market exposure without public position tracking
- Users in jurisdictions where public betting records create legal ambiguity
- Crypto natives who value on-chain privacy as a first principle

### Go-to-Market

1. **Testnet phase** (current): Demonstrate working ZK prediction market on Aleo
2. **Mainnet launch**: Deploy with real credits, focus on high-interest event categories
3. **Market maker incentives**: Bootstrap liquidity with early adopter rewards
4. **Oracle decentralization**: Move from admin resolution to decentralized oracle network

---

## Changelog (Wave 1 → Wave 2)

### Wave 1 Feedback
> "Interesting interface for prediction market, might be able to gain lots of traction in times like this (war), numbers are all currently mocked on website, no actual calculation for winnings"

### Wave 2 Changes

| Change | Description |
|--------|-------------|
| **Real on-chain pools** | GeoPredict pool starts at 0, shows actual on-chain totals after bets |
| **Source odds clarity** | UI now shows "65% Yes on Polymarket" separately from GeoPredict pool |
| **Chain tracking** | Markets become chain-tracked after first bet, fetching real `market_totals` |
| **Parimutuel math** | Payout preview uses real formula: `stake + (stake/winner_pool) × loser_pool` |
| **No demo mode** | All betting/claiming paths execute real Aleo transactions |
| **Shield Wallet** | Updated to `@provablehq/aleo-wallet-adaptor-*` packages |
| **Native credits** | Uses `credits.aleo` instead of custom token |
| **Deployed contract** | `geopredict_private_v3.aleo` live on testnet |

---

## Running Locally

### Prerequisites
- Node.js 20+
- Shield Wallet or Leo Wallet browser extension
- Mapbox token (for map view)

### Setup
```bash
npm install
echo "NEXT_PUBLIC_MAPBOX_TOKEN=your_token" > .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Contract Development
```bash
cd geopredict_contract
leo build
leo test
```

---

## Testing Checklist

- [ ] Connect Shield/Leo wallet
- [ ] Map loads with clustered pins
- [ ] Toggle Map/Grid view
- [ ] Filter by category
- [ ] Open market panel, see source odds
- [ ] Place bet (requires testnet credits)
- [ ] Verify transaction on explorer
- [ ] After bet, market shows on-chain pool totals

---

## Current Limitations

- **Oracle**: Resolution is admin-driven (deployer address), not decentralized
- **Record fragmentation**: Large bets may fail if wallet has many small records
- **Geolocation**: Inferred from market text, some pins are approximate

---

## Project Structure

```
GEOPREDICT/
├── src/
│   ├── app/
│   │   ├── api/live-markets/    # Market ingestion from Polymarket + Manifold
│   │   └── page.tsx             # Main UI
│   ├── components/
│   │   ├── WalletProvider.tsx   # Shield/Leo wallet config
│   │   ├── Map.tsx              # Mapbox with clustering
│   │   ├── MarketPanel.tsx      # Market details + actions
│   │   ├── BetModal.tsx         # Private bet flow
│   │   └── ClaimModal.tsx       # Private claim flow
│   └── lib/
│       ├── markets.ts           # Types, odds math, chain reads
│       ├── aleoRecords.ts       # Wallet record parsing
│       └── token.ts             # Credits conversions
└── geopredict_contract/
    └── src/main.leo             # Aleo program (v3)
```

---

## License

MIT
