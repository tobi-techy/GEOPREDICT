# GeoPredict

Privacy-preserving map-native prediction markets on Aleo.

## What was fixed for this recovery pass

- Wallet connection now uses **TestnetBeta** consistently (provider + tx builder), with clear connect states.
- Added Leo extension detection + install CTA.
- Wallet-only flow: all bets and claims require a connected Leo wallet.
- Added explicit token config (`CRED`, decimals=6) with consistent formatting/parsing.
- Added winnings math preview (parimutuel payout) before placing a bet.
- Added liquidity/trading baseline: implied odds from yes/no pools, pool depth, and slippage/impact preview.
- Reduced privacy leaks in claim/finalize UX: no market/bet record details shown in public verification UI.
- Updated Leo contract payout logic from fixed 2x to parimutuel formula.
- Replaced broken Leo tests with payout math sanity tests.

---

## Quick start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Environment

- `NEXT_PUBLIC_MAPBOX_TOKEN` is required for the map.

---

## How to test wallet connect

1. Open app header.
2. If Leo extension is missing, click **Install Leo Wallet**.
3. Click **Connect Leo Wallet**.
4. Approve in Leo wallet popup.
5. You should see:
   - account short address
   - active network label (`TestnetBeta`)
6. Connect Leo wallet before placing bets or claims.

---

## Winnings math + liquidity model

### Payout model (parimutuel)

For a winning bet:

`payout = stake + (stake / winner_pool_after_trade) * loser_pool`

Where:
- `winner_pool_after_trade = winner_pool_before + your_stake`
- `loser_pool` is the opposite side pool

This is shown in bet modal as:
- estimated payout
- estimated profit
- formula text

### Liquidity / trading baseline

- Implied odds are calculated from current yes/no pool ratio.
- Bet modal computes before/after odds for your entered stake.
- Slippage/impact is shown as absolute odds move (% points).
- Pool depth is displayed in market panel and modal.

---

## Privacy guarantees and what is revealed

Private:
- user position (yes/no)
- user amount
- raw bet record

Public:
- aggregate market yes/no totals
- outcome after market resolution
- opaque claim attestation ID for verification

This pass avoids rendering market-specific claim details in public verify/claim UI.

---

## Known limitations

- Wallet extension is required (no demo fallback mode).
- Wallet integration is focused on Leo extension; no multi-wallet fallback yet.
- Claim and bet flows now fetch wallet records and submit real plaintext record inputs (no placeholder strings).
- Liquidity model is AMM-like UI simulation; no on-chain matching engine yet.
- Oracle/resolution governance is still minimal and not production hardened.

---

## 3-minute judge test flow

1. `npm install && npm run dev`
2. Open app and click a market marker.
3. Verify pool depth + implied odds are visible.
4. Click **Predict Yes/No** and enter amount.
5. Confirm payout formula, estimated payout, and slippage preview appear.
6. Connect wallet and confirm a real Testnet transaction.
7. Open resolved market, click **Claim Winnings**, verify privacy note + opaque attestation ID.
8. Use **Verify Proof** and paste the claim transaction ID (`at...`).

---

## Contract notes

Contract path: `geopredict_contract/src/main.leo`
Program ID: `geopredict_private_v2.aleo`
Deployment tx: `at1m2zlpc96dnfelf9tk5swq8ugwzvjw6wgknlxwgsdkdvt20p675xqfcrnmf`

Key updates:
- `place_bet` consumes a private `credits.aleo` record and escrows stake into program public balance.
- `claim_winnings` computes parimutuel payout and transfers public escrow back into a private credits record.
- `proof_hash` now mixes owner commitment with market/side context to reduce cross-market linkability.
