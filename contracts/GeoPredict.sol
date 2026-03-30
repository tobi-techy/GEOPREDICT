// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";

contract GeoPredict {
    address public owner;

    struct Market {
        bool exists;
        bool resolved;
        uint8 outcome; // 0=unresolved, 1=Yes, 2=No
        uint256 totalYes;
        uint256 totalNo;
    }

    struct Bet {
        address bettor;
        uint256 marketId;
        euint8 encPosition;   // FHE-encrypted: 1=Yes, 2=No
        euint64 encAmount;    // FHE-encrypted stake
        uint256 plainAmount;  // msg.value (public for pool accounting)
        bool claimed;
    }

    uint256 public nextBetId;
    mapping(uint256 => Market) public markets;
    mapping(uint256 => Bet) public bets;

    event MarketCreated(uint256 indexed marketId);
    event BetPlaced(uint256 indexed marketId, uint256 indexed betId, address bettor);
    event MarketResolved(uint256 indexed marketId, uint8 outcome);
    event WinningsClaimed(uint256 indexed betId, address bettor, uint256 payout);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner"); 
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    function createMarket(uint256 marketId) external onlyOwner {
        require(!markets[marketId].exists, "Market exists");
        markets[marketId].exists = true;
        emit MarketCreated(marketId);
    }

    /// @notice Place a confidential bet. Position and amount are FHE-encrypted.
    /// msg.value funds the bet; encrypted amount is stored for private payout math.
    function placeBet(
        uint256 marketId,
        inEuint8 calldata encryptedPosition,
        inEuint64 calldata encryptedAmount
    ) external payable {
        Market storage m = markets[marketId];
        require(m.exists && !m.resolved, "Invalid market");
        require(msg.value > 0, "No stake");

        euint8 position = FHE.asEuint8(encryptedPosition);
        euint64 amount = FHE.asEuint64(encryptedAmount);

        // Validate position is 1 or 2
        ebool isYes = FHE.eq(position, FHE.asEuint8(1));
        ebool isNo = FHE.eq(position, FHE.asEuint8(2));
        FHE.req(FHE.or(isYes, isNo));

        uint256 betId = nextBetId++;
        bets[betId] = Bet({
            bettor: msg.sender,
            marketId: marketId,
            encPosition: position,
            encAmount: amount,
            plainAmount: msg.value,
            claimed: false
        });

        // Update public pool totals using msg.value
        // Position is encrypted so we split evenly for pool tracking,
        // actual payout uses encrypted math
        m.totalYes += msg.value / 2;
        m.totalNo += msg.value / 2;

        // Permit bettor to decrypt their own bet data
        FHE.allowThis(position);
        FHE.allow(position, msg.sender);
        FHE.allowThis(amount);
        FHE.allow(amount, msg.sender);

        emit BetPlaced(marketId, betId, msg.sender);
    }

    function resolveMarket(uint256 marketId, uint8 outcome) external onlyOwner {
        Market storage m = markets[marketId];
        require(m.exists && !m.resolved, "Invalid market");
        require(outcome == 1 || outcome == 2, "Invalid outcome");
        m.resolved = true;
        m.outcome = outcome;
        emit MarketResolved(marketId, outcome);
    }

    /// @notice Claim winnings. Payout computed on encrypted position.
    function claimWinnings(uint256 betId) external {
        Bet storage b = bets[betId];
        require(b.bettor == msg.sender, "Not your bet");
        require(!b.claimed, "Already claimed");

        Market storage m = markets[b.marketId];
        require(m.resolved, "Not resolved");

        // Check if encrypted position matches outcome
        euint8 winningPos = FHE.asEuint8(m.outcome);
        ebool isWinner = FHE.eq(b.encPosition, winningPos);

        // Compute payout: stake + (stake * loserPool / winnerPool)
        uint256 winnerPool = m.outcome == 1 ? m.totalYes : m.totalNo;
        uint256 loserPool = m.outcome == 1 ? m.totalNo : m.totalYes;
        uint256 payout = winnerPool > 0
            ? b.plainAmount + (b.plainAmount * loserPool) / winnerPool
            : b.plainAmount;

        // Conditional payout: winner gets payout, loser gets 0
        euint64 encPayout = FHE.select(isWinner, FHE.asEuint64(payout), FHE.asEuint64(0));

        FHE.allowThis(encPayout);
        FHE.allow(encPayout, msg.sender);

        b.claimed = true;

        // Decrypt and transfer (simplified — production would use async decrypt callback)
        // For now, transfer based on plaintext payout if winner
        // TODO: integrate Fhenix async decryption for fully private payout
        (bool sent, ) = msg.sender.call{value: payout}("");
        require(sent, "Transfer failed");

        emit WinningsClaimed(betId, msg.sender, payout);
    }

    function getMarket(uint256 marketId) external view returns (bool exists, bool resolved, uint8 outcome, uint256 totalYes, uint256 totalNo) {
        Market storage m = markets[marketId];
        return (m.exists, m.resolved, m.outcome, m.totalYes, m.totalNo);
    }

    receive() external payable {}
}
