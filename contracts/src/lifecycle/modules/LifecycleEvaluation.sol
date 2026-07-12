// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "../libraries/LibLifecycleStorage.sol";
import "../libraries/LibAccessControl.sol";
import "../libraries/LifecycleEvents.sol";

contract LifecycleEvaluation {
    function attestEvaluationVerdict(
        uint256 tokenId,
        bytes32 verdictDigest,
        bytes32 modelDigest,
        uint8 overall
    ) external {
        LibAccessControl.checkRole(LibAccessControl.EVALUATOR_ROLE);
        require(verdictDigest != bytes32(0), "Verdict digest required");
        require(modelDigest != bytes32(0), "Model digest required");
        LibLifecycleStorage.Layout storage l = LibLifecycleStorage.layout();
        LibLifecycleStorage.ModelCard storage card = l.modelCards[tokenId];
        require(card.isActive, "Model card not active");
        emit LifecycleEvents.EvaluationVerdictAttested(
            tokenId, msg.sender, verdictDigest, modelDigest, overall, block.timestamp);
    }
}
