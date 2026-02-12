program geopredict_contract.aleo;

record Bet:
    owner as address.private;
    market_id as field.private;
    position as u8.private;
    amount as u64.private;

record WinProof:
    owner as address.private;
    amount_won as u64.private;
    proof_hash as field.private;

struct MarketTotals:
    total_yes as u64;
    total_no as u64;
    outcome as u8;

mapping market_totals:
    key as field.public;
    value as MarketTotals.public;

function place_bet:
    input r0 as field.public;
    input r1 as u8.private;
    input r2 as u64.private;
    is.eq r1 1u8 into r3;
    is.eq r1 2u8 into r4;
    or r3 r4 into r5;
    assert.eq r5 true;
    gt r2 0u64 into r6;
    assert.eq r6 true;
    cast self.signer r0 r1 r2 into r7 as Bet.record;
    async place_bet r0 r1 r2 into r8;
    output r7 as Bet.record;
    output r8 as geopredict_contract.aleo/place_bet.future;

finalize place_bet:
    input r0 as field.public;
    input r1 as u8.public;
    input r2 as u64.public;
    cast 0u64 0u64 0u8 into r3 as MarketTotals;
    get.or_use market_totals[r0] r3 into r4;
    assert.eq r4.outcome 0u8;
    is.eq r1 1u8 into r5;
    add r4.total_yes r2 into r6;
    ternary r5 r6 r4.total_yes into r7;
    is.eq r1 2u8 into r8;
    add r4.total_no r2 into r9;
    ternary r8 r9 r4.total_no into r10;
    cast r7 r10 0u8 into r11 as MarketTotals;
    set r11 into market_totals[r0];

function resolve_market:
    input r0 as field.public;
    input r1 as u8.public;
    is.eq r1 1u8 into r2;
    is.eq r1 2u8 into r3;
    or r2 r3 into r4;
    assert.eq r4 true;
    async resolve_market r0 r1 into r5;
    output r5 as geopredict_contract.aleo/resolve_market.future;

finalize resolve_market:
    input r0 as field.public;
    input r1 as u8.public;
    get market_totals[r0] into r2;
    assert.eq r2.outcome 0u8;
    cast r2.total_yes r2.total_no r1 into r3 as MarketTotals;
    set r3 into market_totals[r0];

function claim_winnings:
    input r0 as Bet.record;
    input r1 as u8.public;
    input r2 as u64.public;
    input r3 as u64.public;
    assert.eq r0.position r1;
    gt r2 0u64 into r4;
    assert.eq r4 true;
    mul r0.amount r3 into r5;
    div r5 r2 into r6;
    add r0.amount r6 into r7;
    hash.bhp256 r0.owner into r8 as field;
    cast r0.owner r7 r8 into r9 as WinProof.record;
    async claim_winnings r8 into r10;
    output r9 as WinProof.record;
    output r10 as geopredict_contract.aleo/claim_winnings.future;

finalize claim_winnings:
    input r0 as field.public;
    is.neq r0 0field into r1;
    assert.eq r1 true;
