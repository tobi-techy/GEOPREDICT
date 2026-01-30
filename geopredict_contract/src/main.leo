// GeoPredict: Privacy-preserving prediction market on Aleo
// Bets are private (records), market totals are public (mappings)
// Winners can generate proofs without revealing bet details

program geopredict_contract.aleo {
    // Public market data stored on-chain
    struct MarketTotals {
        total_yes: u64,
        total_no: u64,
        outcome: u8,      // 0 = unresolved, 1 = yes won, 2 = no won
    }

    // Private bet record - only owner can see
    record Bet {
        owner: address,
        market_id: field,
        position: u8,     // 1 = yes, 2 = no
        amount: u64,
    }

    // Winner proof record - proves you won without revealing details
    record WinProof {
        owner: address,
        amount_won: u64,
        proof_hash: field,
    }

    // Public mapping: market_id => totals
    mapping market_totals: field => MarketTotals;

    // Place a private bet on a market
    async transition place_bet(
        public market_id: field,
        position: u8,
        amount: u64,
    ) -> (Bet, Future) {
        // Validate position (1 = yes, 2 = no)
        assert(position == 1u8 || position == 2u8);
        assert(amount > 0u64);

        // Create private bet record
        let bet: Bet = Bet {
            owner: self.caller,
            market_id: market_id,
            position: position,
            amount: amount,
        };

        return (bet, finalize_place_bet(market_id, position, amount));
    }

    async function finalize_place_bet(
        market_id: field,
        position: u8,
        amount: u64,
    ) {
        // Get current totals or initialize
        let current: MarketTotals = Mapping::get_or_use(
            market_totals,
            market_id,
            MarketTotals { total_yes: 0u64, total_no: 0u64, outcome: 0u8 }
        );

        // Market must be unresolved
        assert_eq(current.outcome, 0u8);

        // Update totals based on position
        let new_totals: MarketTotals = MarketTotals {
            total_yes: position == 1u8 ? current.total_yes + amount : current.total_yes,
            total_no: position == 2u8 ? current.total_no + amount : current.total_no,
            outcome: 0u8,
        };

        Mapping::set(market_totals, market_id, new_totals);
    }

    // Resolve a market (would be called by oracle/admin in production)
    async transition resolve_market(
        public market_id: field,
        public outcome: u8,
    ) -> Future {
        // Outcome must be 1 (yes) or 2 (no)
        assert(outcome == 1u8 || outcome == 2u8);
        return finalize_resolve_market(market_id, outcome);
    }

    async function finalize_resolve_market(
        market_id: field,
        outcome: u8,
    ) {
        let current: MarketTotals = Mapping::get(market_totals, market_id);
        
        // Must be unresolved
        assert_eq(current.outcome, 0u8);

        let resolved: MarketTotals = MarketTotals {
            total_yes: current.total_yes,
            total_no: current.total_no,
            outcome: outcome,
        };

        Mapping::set(market_totals, market_id, resolved);
    }

    // Claim winnings - consumes bet, returns WinProof
    async transition claim_winnings(
        bet: Bet,
        public outcome: u8,
    ) -> (WinProof, Future) {
        // Bet position must match outcome
        assert_eq(bet.position, outcome);

        // Calculate winnings (simplified: 2x for winners)
        let amount_won: u64 = bet.amount * 2u64;

        // Generate proof hash from bet details (hides which market)
        let proof_hash: field = BHP256::hash_to_field(bet);

        let proof: WinProof = WinProof {
            owner: bet.owner,
            amount_won: amount_won,
            proof_hash: proof_hash,
        };

        return (proof, finalize_claim(bet.market_id, outcome));
    }

    async function finalize_claim(
        market_id: field,
        outcome: u8,
    ) {
        // Verify market is resolved with matching outcome
        let totals: MarketTotals = Mapping::get(market_totals, market_id);
        assert_eq(totals.outcome, outcome);
    }
}
