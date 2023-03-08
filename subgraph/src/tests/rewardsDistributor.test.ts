import { Address } from "@graphprotocol/graph-ts";
import { describe, test } from "matchstick-as";


// Address of rewards distributor
let contractAddress = Address.fromString(
    "0xd2863157539b1D11F39ce23fC4834B62082F6874"
  );

describe('Rewards distributor', () => {
    test('should handle a reward event for a node owner and add it to correct scannerPool entity', () => {
        // Given
            // Mock a nodePool and reward event
        // When
            // A reward event with subject type 2 (owner)
        // Expect
            // The correct reward event added to scannerPool entity
    }) 

    test('should handle a reward event for a delegator and add it to correct scannerPool entity', () => {
         // Given
            // Mock a nodePool and reward event
        // When
            // A reward event with subject type 3 (delegator)
        // Expect
            // The correct reward event added to scannerPool entity
    }) 
})