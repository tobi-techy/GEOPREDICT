// The 'test_geopredict_contract' test program.
import geopredict_contract.aleo;
program test_geopredict_contract.aleo {
    @test
    script test_it() {
        let result: u32 = geopredict_contract.aleo/main(1u32, 2u32);
        assert_eq(result, 3u32);
    }

    @test
    @should_fail
    transition do_nothing() {
        let result: u32 = geopredict_contract.aleo/main(2u32, 3u32);
        assert_eq(result, 3u32);
    }

    @noupgrade
    async constructor() {}
}
