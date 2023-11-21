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
    /// converted to unsigned integers
    uint8 constant MAX_CONFIDENCE_SCORE = 100;
    
    /// Map of accounts to their corresponding threat properties.
    mapping (address => ThreatProperties) private _accountThreatProperties;

    event AccountRegistered(address indexed account, string indexed category, uint8 indexed confidenceScore);
    event AccountDeregistered(address indexed account);

    error UnevenAmounts(uint256 accountsAmount, uint256 categoriesAmount, uint256 confidenceScoresAmount);
    error ConfidenceScoreExceedsMax(uint8 maxLimit, uint8 exceedingScore);

    /**
     * @notice Method to register accounts with their threat properties.
     * @dev Only accessible to the account that has admin access.
     * All three passed arguments must be equal in length.
     * @param accounts Array of addresses to register.
     * @param categories Array of the categories, with each corresponding to an
     * account. E.g. 'exploit'.
     * @param confidenceScores Array of the corresponding account's confidence score
     * that it has been correctly categorized.
     */
    function registerAccounts(
        address[] calldata accounts,
        string[] calldata categories,
        uint8[] calldata confidenceScores
    ) external onlyRole(THREAT_ORACLE_ADMIN_ROLE) {
        uint256 accountsAmount = accounts.length;
        uint256 categoriesAmount = categories.length;
        uint256 confidenceScoresAmount = confidenceScores.length;

        if (
            accountsAmount != categoriesAmount ||
            accountsAmount != confidenceScoresAmount ||
            categoriesAmount != confidenceScoresAmount
        ) {
            revert UnevenAmounts(accountsAmount, categoriesAmount, confidenceScoresAmount);
        }

        for (uint256 i = 0; i < accountsAmount;) {
            _registerAccount(accounts[i], categories[i], confidenceScores[i]);

            unchecked {
                ++i;
            }
        }
    }

    /**
     * @notice Method to deregister accounts.
     * @dev Only accessible to the account that has admin access.
     * @param accounts Array of addresses to deregister.
     */
    function deregisterAccounts(address[] calldata accounts) external onlyRole(THREAT_ORACLE_ADMIN_ROLE) {
        uint256 accountsAmount = accounts.length;

        for(uint256 i = 0; i < accountsAmount; i++) {
            _deregisterAccount(accounts[i]);
        }
    }

    /**
     * @notice Get threat properties for an account. Properties include
     * a category (e.g. 'exploit') and confidence score (0-100).
     * @param account Address of interest.
     * @return category of the given address.
     * @return confidenceScore of the given address.
     */
    function getThreatProperties(address account) public view returns (string memory category, uint8 confidenceScore) {
        ThreatProperties memory threatProperties = _accountThreatProperties[account];
        return (threatProperties.category, threatProperties.confidenceScore);
    }

    function _registerAccount(address account, string calldata category, uint8 confidenceScore) private {
        if(confidenceScore > MAX_CONFIDENCE_SCORE) revert ConfidenceScoreExceedsMax(MAX_CONFIDENCE_SCORE, confidenceScore);

        _accountThreatProperties[account] = ThreatProperties({ category: category, confidenceScore: confidenceScore });
        emit AccountRegistered(account, category, confidenceScore);
    }

    function _deregisterAccount(address account) private {
        delete _accountThreatProperties[account];
        emit AccountDeregistered(account);
    }

    /**
     *  50
     * - 1 _accountThreatProperties
     * --------------------------
     *  49 __gap
     */
    uint256[49] private __gap;
}