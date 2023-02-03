
import { Address, BigInt, log } from "@graphprotocol/graph-ts";
import { AllocatedStake as AllocatedStakeEvent, UnallocatedStake as UnallocatedStakeEvent, StakeAllocator } from "../../generated/StakeAllocator/StakeAllocator"
import { ScannerPool } from "../../generated/schema";


function updateScannerPoolStakes(subject: BigInt, contractAddress: Address, scannerPool: ScannerPool): void {
    const stakeAllocatorContract = StakeAllocator.bind(contractAddress);
    const delegatedStakeResult = stakeAllocatorContract.try_allocatedDelegatorsStakePerManaged(2,subject);
    const ownedStakeResult = stakeAllocatorContract.try_allocatedOwnStakePerManaged(2,subject);

    if(!delegatedStakeResult.reverted) scannerPool.stakeDelegated = delegatedStakeResult.value
    if(!ownedStakeResult.reverted) scannerPool.stakeOwnedAllocated = ownedStakeResult.value
    scannerPool.stakeAllocated = stakeAllocatorContract.allocatedStakeFor(2,subject)
    scannerPool.stakeOwned = (scannerPool.stakeAllocated as BigInt).plus(stakeAllocatorContract.unallocatedStakeFor(2,subject))
    scannerPool.save();
}


export function handleAllocatedStake(event: AllocatedStakeEvent): void {
    const subjectType = event.params.subjectType;
    const subjectId = event.params.subject.toHexString();

    if(subjectType === 2) {
        const scannerPool = ScannerPool.load(subjectId);
        if(scannerPool) {
          updateScannerPoolStakes(event.params.subject, event.address, scannerPool)
        }
    }
}

export function handleUnAllocatedStake(event: UnallocatedStakeEvent): void {
    const subjectType = event.params.subjectType;
    const subjectId = event.params.subject.toHexString();

    if(subjectType === 2) {
        const scannerPool = ScannerPool.load(subjectId);
        if(scannerPool) {
            updateScannerPoolStakes(event.params.subject, event.address, scannerPool)
        }
    }
}