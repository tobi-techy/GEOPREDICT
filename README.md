# GeoPredict

**Privacy-native prediction markets powered by FHE** — discover world events on a map, bet confidentially with encrypted on-chain positions that even the contract can't see in plaintext.

## Live on Testnet

| | |
|---|---|
| Networks | Sepolia, Arbitrum Sepolia, Base Sepolia |
| Encryption | Fhenix FHE (Fully Homomorphic Encryption) |
| Auth | Privy (Google, Email, Wallet) |
| Markets | 300+ aggregated from Polymarket & Manifold |

---

## What It Does

GeoPredict aggregates 300+ live prediction markets from Polymarket and Manifold, plots them on an interactive world map, and lets users place **confidential bets using Fhenix's FHE-powered smart contracts**. Positions and stake amounts are encrypted on-chain — the contract computes parimutuel payouts on data it can never see in plaintext.

1. **Discover** — Browse markets on an interactive map or grid view
2. **Bet confidentially** — Your position (Yes/No) and stake amount are encrypted on-chain using FHE
3. **Encrypted payouts** — Parimutuel math computed on encrypted state, decryptable only by the winner
4. **Verify on-chain** — Every transaction is verifiable on block explorers across supported testnets

---

## The Problem

Traditional prediction markets expose every position publicly on-chain. This creates hard limits:

- **MEV extraction** — Front-runners see incoming bets and sandwich them ($500M+ annual MEV losses in DeFi)
- **Strategy leakage** — Large traders can't take positions without signaling intent to the entire market
- **Institutional exclusion** — Compliance teams won't approve participation on fully transparent rails

Existing privacy approaches (mixers, ZK proofs) either break composability or only prove correctness — they can't compute on hidden data.

**FHE changes this.** The contract computes payouts on encrypted bets without ever seeing them in plaintext. Privacy becomes programmable, not just provable.

---

## Privacy Model

### What's Encrypted (FHE-protected)

- Your bet position (Yes or No) — `euint8`
- Your stake amount — `euint64`
- Payout computation on encrypted values
- Decryption restricted to bet owner via Fhenix permits

### What's Public (on-chain)

- Market ID (for pool accounting)
- Aggregate pool totals (`total_yes`, `total_no`) for price discovery
- Market outcome after resolution

This design enables parimutuel payout computation while keeping individual positions confidential.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       Frontend (Next.js)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌───────────────┐   │
│  │ Map View │  │Grid View │  │  Trading │  │  Price Chart  │   │
│  │ (Mapbox) │  │          │  │  Panel   │  │  Order Book   │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └───────┬───────┘   │
│       └─────────────┴─────────────┴─────────────────┘           │
│                              │                                  │
│              ┌───────────────┼───────────────┐                  │
│              │               │               │                  │
│     ┌────────▼──────┐ ┌─────▼──────┐ ┌──────▼──────┐           │
│     │    Privy      │ │ Cofhe SDK  │ │ Cofhe React │           │
│     │ (Google/Email │ │ (encrypt/  │ │   hooks     │           │
│     │  /Wallet)     │ │  decrypt)  │ │             │           │
│     └───────────────┘ └────────────┘ └─────────────┘           │
└──────────────────────────────┼──────────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  Fhenix (FHE)   │  │   Polymarket    │  │    Manifold     │
│                 │  │   Gamma API     │  │      API        │
│  Sepolia /      │  │                 │  │                 │
│  Arb Sepolia /  │  │  (market data)  │  │  (market data)  │
│  Base Sepolia   │  │                 │  │                 │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

### Data Flow

1. **Market ingestion** — API route fetches from Polymarket + Manifold, infers geolocation, deduplicates
2. **Display** — Markets shown with source odds on map and grid views with trading UI
3. **Betting** — User encrypts position + amount client-side via Cofhe SDK, submits to FHE contract
4. **Encrypted computation** — Contract updates encrypted state, computes payouts on encrypted values
5. **Claiming** — Winners decrypt payout using Fhenix permits, receive funds

---

## Smart Contract (Solidity + Fhenix)

### `placeBet`
```solidity
function placeBet(
    uint256 marketId,
    inEuint8 encryptedPosition,  // FHE-encrypted: 1=Yes, 2=No
    inEuint64 encryptedAmount    // FHE-encrypted stake
) external payable
```

### `resolveMarket`
```solidity
function resolveMarket(
    uint256 marketId,
    uint8 outcome               // 1=Yes won, 2=No won
) external onlyOwner
```

### `claimWinnings`
```solidity
function claimWinnings(
    uint256 betId
) external
// Decrypts payout using FHE, transfers to winner
```

### Payout Formula (Parimutuel)
```
loser_share = (stake × loser_pool) / winner_pool
payout = stake + loser_share
```
Computed on encrypted values — the contract never sees individual stakes in plaintext.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Encryption | Fhenix FHE — encrypted types (`euint8`, `euint64`) and on-chain computation |
| Client SDK | Cofhe SDK + React hooks (`useEncrypt`, `useWrite`, `useDecrypt`) |
| Contracts | Solidity with Fhenix library on Sepolia / Arbitrum Sepolia / Base Sepolia |
| Auth | Privy — Google, email, wallet login + embedded wallet creation |
| Frontend | Next.js + Tailwind CSS |
| Map | Mapbox GL JS with clustering |
| Charts | lightweight-charts (TradingView-style) |
| Market Data | Polymarket Gamma API + Manifold API |

---

## Running Locally

### Prerequisites
- Node.js 20+ / Bun
- Mapbox token (for map view)
- Privy App ID (from [dashboard.privy.io](https://dashboard.privy.io))

### Setup
```bash
bun install
cp .env.example .env
# Add your keys to .env:
#   NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token
#   NEXT_PUBLIC_PRIVY_APP_ID=your_privy_app_id
bun run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Why FHE Over ZK

| | ZK Proofs | FHE (Fhenix) |
|---|---|---|
| What it does | Proves a computation was done correctly on hidden data | Computes on encrypted data without ever decrypting |
| Privacy model | Prover knows the data, verifier doesn't | Nobody sees the data — not even the contract |
| Composability | Limited — each proof is standalone | Full — encrypted state is programmable |
| Use case fit | "I bet correctly" | "Compute my payout without seeing my bet" |

For prediction markets, FHE is the right primitive because the contract needs to **compute** on positions (calculate payouts), not just **verify** them.

---

## Project Structure

```
GEOPREDICT/
├── src/
│   ├── app/
│   │   ├── api/live-markets/    # Market ingestion from Polymarket + Manifold
│   │   └── page.tsx             # Main UI
│   ├── components/
│   │   ├── PrivyProvider.tsx    # Privy auth config (Google/email/wallet)
│   │   ├── ConnectButton.tsx    # Privy login/logout
│   │   ├── Map.tsx              # Mapbox with clustering
│   │   ├── MarketPanel.tsx      # Market details + trading interface
│   │   ├── PriceChart.tsx       # TradingView-style chart
│   │   ├── OrderBook.tsx        # Yes/No depth visualization
│   │   ├── BetModal.tsx         # Encrypted bet flow
│   │   └── ClaimModal.tsx       # Encrypted claim flow
│   └── lib/
│       └── markets.ts           # Types, odds math
└── contracts/                   # Fhenix FHE smart contracts (Solidity)
```

---

## Buildathon Track

**Confidential DeFi** — Private positions, sealed-bid mechanics, MEV-protected execution.

GeoPredict demonstrates that FHE enables a category of DeFi applications that transparent chains and ZK proofs alone cannot support: markets where the contract computes payouts on encrypted bets without any party — including the contract itself — ever seeing individual positions in plaintext.

---

## License

MIT
