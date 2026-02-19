import credits.aleo;
import geopredict_private_v2.aleo;
program test_geopredict_contract.aleo;

function keep_test_program_valid:
    input r0 as u8.public;
    output r0 as u8.private;

constructor:
    assert.eq edition 0u16;
