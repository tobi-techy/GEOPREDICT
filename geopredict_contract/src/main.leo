import credits.aleo;

program geopredict_private_v2.aleo {
    struct MarketTotals {
        total_yes: u64,
        total_no: u64,
        outcome: u8,
    }

    record Bet {
        owner: address,
        market_id: field,
        position: u8,
        amount: u64,
    }

    record WinProof {
        owner: address,
        amount_won: u64,
        proof_hash: field,
    }

    mapping market_totals: field => MarketTotals;
    mapping admin_set: u8 => address;

    @custom
    async constructor() {
        Mapping::set(admin_set, 0u8, self.program_owner);
    }

    async transition place_bet(
        stake: credits.aleo/credits,
        public market_id: field,
        public position: u8,
        public amount: u64,
    ) -> (Bet, credits.aleo/credits, Future) {
        assert_eq(stake.owner, self.signer);
        assert(position == 1u8 || position == 2u8);
        assert(amount > 0u64);

        let escrow_transfer: (credits.aleo/credits, Future) =
            credits.aleo/transfer_private_to_public(stake, self.address, amount);

        let bet: Bet = Bet {
            owner: self.signer,
            market_id: market_id,
            position: position,
            amount: amount,
        };

        return (bet, escrow_transfer.0, finalize_place_bet(market_id, position, amount, escrow_transfer.1));
    }

    async function finalize_place_bet(market_id: field, position: u8, amount: u64, escrow_future: Future) {
        escrow_future.await();

        let current: MarketTotals = Mapping::get_or_use(
            market_totals,
            market_id,
            MarketTotals { total_yes: 0u64, total_no: 0u64, outcome: 0u8 }
        );
        assert_eq(current.outcome, 0u8);

        let new_totals: MarketTotals = MarketTotals {
            total_yes: position == 1u8 ? current.total_yes + amount : current.total_yes,
            total_no: position == 2u8 ? current.total_no + amount : current.total_no,
            outcome: 0u8,
        };

        Mapping::set(market_totals, market_id, new_totals);
    }

    async transition resolve_market(public market_id: field, public outcome: u8) -> Future {
        assert(outcome == 1u8 || outcome == 2u8);
        return finalize_resolve_market(self.caller, market_id, outcome);
    }

    async function finalize_resolve_market(caller: address, market_id: field, outcome: u8) {
        let admin: address = Mapping::get(admin_set, 0u8);
        assert_eq(caller, admin);

        let current: MarketTotals = Mapping::get(market_totals, market_id);
        assert_eq(current.outcome, 0u8);

        let resolved: MarketTotals = MarketTotals {
            total_yes: current.total_yes,
            total_no: current.total_no,
            outcome: outcome,
        };

        Mapping::set(market_totals, market_id, resolved);
    }

    async transition claim_winnings(
        bet: Bet,
        public outcome: u8,
        public winner_pool: u64,
        public loser_pool: u64,
    ) -> (WinProof, credits.aleo/credits, Future) {
        assert_eq(self.signer, bet.owner);
        assert(outcome == 1u8 || outcome == 2u8);
        assert_eq(bet.position, outcome);
        assert(winner_pool > 0u64);

        let loser_share: u64 = (bet.amount * loser_pool) / winner_pool;
        let amount_won: u64 = bet.amount + loser_share;

        let owner_commitment: field = BHP256::hash_to_field(bet.owner);
        let side_nonce: field = bet.position == 1u8 ? 1field : 2field;
        let proof_hash: field = BHP256::hash_to_field(owner_commitment + bet.market_id + side_nonce);

        let payout_transfer: (credits.aleo/credits, Future) =
            credits.aleo/transfer_public_to_private(bet.owner, amount_won);

        let proof: WinProof = WinProof {
            owner: bet.owner,
            amount_won: amount_won,
            proof_hash: proof_hash,
        };

        return (
            proof,
            payout_transfer.0,
            finalize_claim(bet.market_id, outcome, winner_pool, loser_pool, payout_transfer.1)
        );
    }

    async function finalize_claim(
        market_id: field,
        outcome: u8,
        winner_pool: u64,
        loser_pool: u64,
        payout_future: Future,
    ) {
        let totals: MarketTotals = Mapping::get(market_totals, market_id);
        assert_eq(totals.outcome, outcome);

        let expected_winner: u64 = outcome == 1u8 ? totals.total_yes : totals.total_no;
        let expected_loser: u64 = outcome == 1u8 ? totals.total_no : totals.total_yes;
        assert_eq(winner_pool, expected_winner);
        assert_eq(loser_pool, expected_loser);

        payout_future.await();
    }
}
