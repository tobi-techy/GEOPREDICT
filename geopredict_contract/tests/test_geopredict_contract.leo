import geopredict_private_v3.aleo;
program test_geopredict_contract.aleo {
    transition keep_test_program_valid(public x: u8) -> u8 {
        return x;
    }

    @test
    script payout_formula_sanity() {
        let winner_pool: u64 = 1000u64;
        let loser_pool: u64 = 400u64;
        let stake: u64 = 100u64;
        let payout: u64 = stake + ((stake * loser_pool) / winner_pool);
        assert_eq(payout, 140u64);
    }

    @test
    script zero_loser_pool_returns_stake() {
        let winner_pool: u64 = 500u64;
        let loser_pool: u64 = 0u64;
        let stake: u64 = 25u64;
        let payout: u64 = stake + ((stake * loser_pool) / winner_pool);
        assert_eq(payout, 25u64);
    }

    @noupgrade
    async constructor() {}
}
