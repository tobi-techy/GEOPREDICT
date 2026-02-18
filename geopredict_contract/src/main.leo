program geopredict_contract.aleo {
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

    async transition place_bet(public market_id: field, position: u8, amount: u64) -> (Bet, Future) {
        assert(position == 1u8 || position == 2u8);
        assert(amount > 0u64);

        let bet: Bet = Bet {
            owner: self.signer,
            market_id: market_id,
            position: position,
            amount: amount,
        };

        return (bet, finalize_place_bet(market_id, position, amount));
    }

    async function finalize_place_bet(market_id: field, position: u8, amount: u64) {
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
    ) -> (WinProof, Future) {
        assert_eq(bet.position, outcome);
        assert(winner_pool > 0u64);

        let loser_share: u64 = (bet.amount * loser_pool) / winner_pool;
        let amount_won: u64 = bet.amount + loser_share;

        let proof_hash: field = BHP256::hash_to_field(bet.owner);

        let proof: WinProof = WinProof {
            owner: bet.owner,
            amount_won: amount_won,
            proof_hash: proof_hash,
        };

        return (proof, finalize_claim(bet.market_id, outcome, winner_pool, loser_pool, proof_hash));
    }

    async function finalize_claim(
        market_id: field,
        outcome: u8,
        winner_pool: u64,
        loser_pool: u64,
        proof_hash: field,
    ) {
        assert(proof_hash != 0field);

        let totals: MarketTotals = Mapping::get(market_totals, market_id);
        assert_eq(totals.outcome, outcome);

        let expected_winner: u64 = outcome == 1u8 ? totals.total_yes : totals.total_no;
        let expected_loser: u64 = outcome == 1u8 ? totals.total_no : totals.total_yes;
        assert_eq(winner_pool, expected_winner);
        assert_eq(loser_pool, expected_loser);
    }
}
