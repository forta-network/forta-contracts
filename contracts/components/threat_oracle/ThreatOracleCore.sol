// SPDX-License-Identifier: UNLICENSED
// See Forta Network License: https://github.com/forta-network/forta-contracts/blob/master/LICENSE.md

pragma solidity ^0.8.9;

import "../BaseComponentUpgradeable.sol";

abstract contract ThreatOracleCore is BaseComponentUpgradeable {
    struct ThreatProperties {
        string category;
        uint8 confidenceScore;
    }

    /// Confidence scores will be between 0-1.00,
    // converted to unsigned integers
    uint8 constant MAX_CONFIDENCE_SCORE = 100;
    
    /// Map of addresses to their corresponding threat properties.
    mapping (address => ThreatProperties) private _addressThreatProperties;

    event AddressRegistered(address indexed _address, string indexed category, uint8 indexed confidenceScore);
    event AddressDeregistered(address indexed _address);

    error UnevenAmounts(uint256 addressesAmount, uint256 categoriesAmount, uint256 confidenceScoresAmount);
    error ConfidenceScoreExceedsMax(uint8 maxLimit, uint8 exceedingScore);

    /**
     * @notice Method to register addresses with their threat properties.
     * @dev Only accessible to the account that has admin access.
     * All three passed arguments must be equal in length.
     * @param addresses Array of addresses to register.
     * @param categories Array of the categories, with each corresponding to an
     * address. E.g. 'exploit'.
     * @param confidenceScores Array of the corresponding address' confidence score
     * that it has been correctly categorized.
     */
    function registerAddresses(
        address[] calldata addresses,
        string[] calldata categories,
        uint8[] calldata confidenceScores
    ) external onlyRole(THREAT_ORACLE_ADMIN_ROLE) {
        uint256 addressesAmount = addresses.length;
        uint256 categoriesAmount = categories.length;
        uint256 confidenceScoresAmount = confidenceScores.length;

        if (
            addressesAmount != categoriesAmount ||
            addressesAmount != confidenceScoresAmount ||
            categoriesAmount != confidenceScoresAmount
        ) {
            revert UnevenAmounts(addressesAmount, categoriesAmount, confidenceScoresAmount);
        }

        for (uint256 i = 0; i < addressesAmount; i++) {
            _registerAddress(addresses[i], categories[i], confidenceScores[i]);
        }
    }

    /**
     * @notice Method to deregister addresses.
     * @dev Only accessible to the account that has admin access.
     * @param addresses Array of addresses to deregister.
     */
    function deregisterAddresses(address[] calldata addresses) external onlyRole(THREAT_ORACLE_ADMIN_ROLE) {
        uint256 addressesAmount = addresses.length;

        for(uint256 i = 0; i < addressesAmount; i++) {
            _deregisterAddress(addresses[i]);
        }
    }

    /**
     * @notice Get threat properties for an address. Properties includes
     * a category (e.g. 'exploit') and confidence score (0-1.0).
     * @param _address Address of interest.
     * @return category of the given address.
     * @return confidenceScore of the given address.
     */
    function getThreatCategoryAndConfidence(address _address) public view returns (string memory category, uint8 confidenceScore) {
        ThreatProperties memory threatProperties = _addressThreatProperties[_address];
        return (threatProperties.category, threatProperties.confidenceScore);
    }

    function _registerAddress(address _address, string calldata category, uint8 confidenceScore) private {
        if(confidenceScore > MAX_CONFIDENCE_SCORE) revert ConfidenceScoreExceedsMax(MAX_CONFIDENCE_SCORE, confidenceScore);

        _addressThreatProperties[_address] = ThreatProperties({ category: category, confidenceScore: confidenceScore });
        emit AddressRegistered(_address, category, confidenceScore);
    }

    function _deregisterAddress(address _address) private {
        delete _addressThreatProperties[_address];
        emit AddressDeregistered(_address);
    }

    /**
     *  50
     * - 1 _addressThreatProperties
     * --------------------------
     *  49 __gap
     */
    uint256[49] private __gap;
}