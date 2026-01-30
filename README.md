# 🗺️ GeoPredict

**Privacy-preserving map-based prediction markets on Aleo**

Predict outcomes for real estate, events, and environmental markets tied to locations worldwide — with your positions kept completely private.

![GeoPredict](https://img.shields.io/badge/Aleo-Privacy%20Buildathon-blue)

## ✨ Features

- **Map-based discovery** — Browse prediction markets by location on an interactive world map
- **Private betting** — Your positions are stored as encrypted records only you can see
- **Selective disclosure** — Winners can prove they won without revealing bet size or market
- **Multiple categories** — Real estate prices, local events, environmental predictions

## 🔐 Privacy Model

| Data | Visibility | Storage |
|------|------------|---------|
| Market questions & odds | Public | On-chain mapping |
| Total yes/no volume | Public | On-chain mapping |
| Your bet positions | **Private** | Encrypted records |
| Your bet amounts | **Private** | Encrypted records |
| Winner proofs | Selective | Shareable proof hash |

**How it works:**
1. When you place a bet, a private `Bet` record is created that only you can decrypt
2. The market's aggregate totals update publicly (so odds are visible)
3. When you claim winnings, a `WinProof` record is generated with a hash you can share
4. Anyone can verify your proof hash without learning which market or how much you bet

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Frontend                        │
│  ┌─────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Mapbox  │  │ Market Panel│  │ Wallet Adapter          │ │
│  │ GL JS   │  │ + Bet Modal │  │ (Leo Wallet)            │ │
│  └────┬────┘  └──────┬──────┘  └───────────┬─────────────┘ │
└───────┼──────────────┼─────────────────────┼───────────────┘
        │              │                     │
        │              │    ┌────────────────┘
        │              │    │
┌───────┼──────────────┼────┼─────────────────────────────────┐
│       │     Aleo Network │                                  │
│       │              │    │                                 │
│  ┌────▼────┐    ┌────▼────▼────┐    ┌───────────────────┐  │
│  │ Public  │    │   Leo        │    │ Private Records   │  │
│  │ Mapping │◄───┤   Contract   ├───►│ (Bet, WinProof)   │  │
│  │ (totals)│    │              │    │                   │  │
│  └─────────┘    └──────────────┘    └───────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ or Bun
- [Leo Wallet](https://leo.app/) browser extension
- Mapbox account (free tier)

### Installation

```bash
# Clone the repo
git clone https://github.com/yourusername/geopredict
cd geopredict

# Install dependencies
bun install

# Set up environment
cp .env.example .env.local
# Add your NEXT_PUBLIC_MAPBOX_TOKEN

# Run development server
bun dev
```

Open [http://localhost:3000](http://localhost:3000)

### Leo Contract

```bash
cd geopredict_contract

# Build
leo build

# Test locally
leo run place_bet 1field 1u8 100u64
```

## 📁 Project Structure

```
geopredict/
├── src/
│   ├── app/
│   │   ├── page.tsx          # Main page with map
│   │   └── layout.tsx        # Root layout
│   ├── components/
│   │   ├── Map.tsx           # Mapbox integration
│   │   ├── MarketPanel.tsx   # Market details sidebar
│   │   ├── BetModal.tsx      # Betting interface
│   │   ├── ClaimModal.tsx    # Claim winnings
│   │   ├── VerifyProof.tsx   # Proof verification
│   │   ├── ConnectButton.tsx # Wallet connection
│   │   └── WalletProvider.tsx
│   └── lib/
│       └── markets.ts        # Types and mock data
├── geopredict_contract/
│   └── src/
│       └── main.leo          # Aleo smart contract
└── README.md
```

## 📜 Smart Contract

The Leo contract (`geopredict_contract.aleo`) implements:

**Records (Private):**
- `Bet` — stores owner, market_id, position, amount
- `WinProof` — stores owner, amount_won, proof_hash

**Mappings (Public):**
- `market_totals` — market_id → {total_yes, total_no, outcome}

**Transitions:**
- `place_bet(market_id, position, amount)` → Bet record
- `resolve_market(market_id, outcome)` → updates mapping
- `claim_winnings(bet, outcome)` → WinProof record

## 🎯 Product-Market Fit

**Target Users:**
- Real estate investors wanting to hedge local market exposure
- Event speculators (concerts, festivals, sports)
- Climate/environmental risk traders

**Why Privacy Matters:**
- Prevents front-running and position manipulation
- Protects trading strategies from competitors
- Enables institutional participation without exposure

## 🛣️ Roadmap

**Wave 1 (Current):**
- [x] Interactive map with market markers
- [x] Private betting via Leo contract
- [x] Winner proof generation
- [x] Proof verification

**Wave 2:**
- [ ] Oracle integration for market resolution
- [ ] Real-time market data feeds
- [ ] Mobile-responsive design

**Wave 3+:**
- [ ] Auto-generated markets from news APIs
- [ ] Location privacy (hide which markets you're interested in)
- [ ] Mainnet deployment

## 🔗 Links

- [Aleo Developer Docs](https://developer.aleo.org)
- [Leo Language](https://docs.leo-lang.org)
- [Leo Wallet](https://leo.app)

## 👥 Team

Built for the Aleo Privacy Buildathon 2026

---

**GeoPredict** — Predict the world. Privately.
