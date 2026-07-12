// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "../libraries/LibLifecycleStorage.sol";
import "../libraries/LibAccessControl.sol";
import "../libraries/LifecycleEvents.sol";

contract LifecycleAttestation {
    function attestHTA(uint256 tokenId, uint8 verdict, bytes32 reportHash) external {
        LibAccessControl.checkRole(LibAccessControl.HTA_ASSESSOR_ROLE);
        require(reportHash != bytes32(0), "Report hash required");
        LibLifecycleStorage.Layout storage l = LibLifecycleStorage.layout();
        LibLifecycleStorage.ModelCard storage card = l.modelCards[tokenId];
        require(card.isActive, "Model card not active");
        require(card.status == LibLifecycleStorage.Status.Published, "Card not published");
        emit LifecycleEvents.HTAAttested(tokenId, msg.sender, verdict, reportHash, block.timestamp);
    }

    function attestCertification(
        uint256 tokenId,
        bytes32 imageDigest,
        bytes32 certHash,
        uint8 verdict
    ) external {
        LibAccessControl.checkRole(LibAccessControl.CERTIFIER_ROLE);
        require(certHash != bytes32(0), "Cert hash required");
        require(imageDigest != bytes32(0), "Image digest required");
        LibLifecycleStorage.Layout storage l = LibLifecycleStorage.layout();
        LibLifecycleStorage.ModelCard storage card = l.modelCards[tokenId];
        require(card.isActive, "Model card not active");
        emit LifecycleEvents.CertificationAttested(
            tokenId, msg.sender, imageDigest, certHash, verdict, block.timestamp);
    }
}
