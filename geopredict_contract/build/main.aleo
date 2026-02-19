import credits.aleo;
program geopredict_private_v2.aleo;

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

mapping admin_set:
    key as u8.public;
    value as address.public;

function place_bet:
    input r0 as credits.aleo/credits.record;
    input r1 as field.public;
    input r2 as u8.private;
    input r3 as u64.private;
    assert.eq r0.owner self.signer;
    is.eq r2 1u8 into r4;
    is.eq r2 2u8 into r5;
    or r4 r5 into r6;
    assert.eq r6 true;
    gt r3 0u64 into r7;
    assert.eq r7 true;
    call credits.aleo/transfer_private_to_public r0 geopredict_private_v2.aleo r3 into r8 r9;
    cast self.signer r1 r2 r3 into r10 as Bet.record;
    async place_bet r1 r2 r3 r9 into r11;
    output r10 as Bet.record;
    output r8 as credits.aleo/credits.record;
    output r11 as geopredict_private_v2.aleo/place_bet.future;

finalize place_bet:
    input r0 as field.public;
    input r1 as u8.public;
    input r2 as u64.public;
    input r3 as credits.aleo/transfer_private_to_public.future;
    await r3;
    cast 0u64 0u64 0u8 into r4 as MarketTotals;
    get.or_use market_totals[r0] r4 into r5;
    assert.eq r5.outcome 0u8;
    is.eq r1 1u8 into r6;
    add r5.total_yes r2 into r7;
    ternary r6 r7 r5.total_yes into r8;
    is.eq r1 2u8 into r9;
    add r5.total_no r2 into r10;
    ternary r9 r10 r5.total_no into r11;
    cast r8 r11 0u8 into r12 as MarketTotals;
    set r12 into market_totals[r0];

function resolve_market:
    input r0 as field.public;
    input r1 as u8.public;
    is.eq r1 1u8 into r2;
    is.eq r1 2u8 into r3;
    or r2 r3 into r4;
    assert.eq r4 true;
    async resolve_market self.caller r0 r1 into r5;
    output r5 as geopredict_private_v2.aleo/resolve_market.future;

finalize resolve_market:
    input r0 as address.public;
    input r1 as field.public;
    input r2 as u8.public;
    get admin_set[0u8] into r3;
    assert.eq r0 r3;
    get market_totals[r1] into r4;
    assert.eq r4.outcome 0u8;
    cast r4.total_yes r4.total_no r2 into r5 as MarketTotals;
    set r5 into market_totals[r1];

function claim_winnings:
    input r0 as Bet.record;
    input r1 as u8.public;
    input r2 as u64.public;
    input r3 as field.private;
    assert.eq self.signer r0.owner;
    is.eq r1 1u8 into r4;
    is.eq r1 2u8 into r5;
    or r4 r5 into r6;
    assert.eq r6 true;
    assert.eq r0.position r1;
    gte r2 r0.amount into r7;
    assert.eq r7 true;
    hash.bhp256 r0.owner into r8 as field;
    add r8 r0.market_id into r9;
    add r9 r3 into r10;
    hash.bhp256 r10 into r11 as field;
    call credits.aleo/transfer_public_to_private r0.owner r2 into r12 r13;
    cast r0.owner r2 r11 into r14 as WinProof.record;
    async claim_winnings r0.market_id r1 r0.amount r2 r13 into r15;
    output r14 as WinProof.record;
    output r12 as credits.aleo/credits.record;
    output r15 as geopredict_private_v2.aleo/claim_winnings.future;

finalize claim_winnings:
    input r0 as field.public;
    input r1 as u8.public;
    input r2 as u64.public;
    input r3 as u64.public;
    input r4 as credits.aleo/transfer_public_to_private.future;
    get market_totals[r0] into r5;
    assert.eq r5.outcome r1;
    is.eq r1 1u8 into r6;
    ternary r6 r5.total_yes r5.total_no into r7;
    ternary r6 r5.total_no r5.total_yes into r8;
    gt r7 0u64 into r9;
    assert.eq r9 true;
    mul r2 r8 into r10;
    div r10 r7 into r11;
    add r2 r11 into r12;
    assert.eq r3 r12;
    await r4;

constructor:
    set program_owner into admin_set[0u8];

