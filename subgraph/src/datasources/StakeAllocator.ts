
import { Address, BigInt } from "@graphprotocol/graph-ts";
import { AllocatedStake as AllocatedStakeEvent, UnallocatedStake as UnallocatedStakeEvent, StakeAllocator } from "../../generated/StakeAllocator/StakeAllocator"
import { ScannerPool } from "../../generated/schema";


function updateScannerPoolStakes(subject: BigInt, contractAddress: Address): void {
    const scannerPool = ScannerPool.load(subject.toHexString());
    const stakeAllocatorContract = StakeAllocator.bind(contractAddress);

    if(scannerPool) {
        scannerPool.stakeAllocated = stakeAllocatorContract.allocatedStakeFor(2,subject)
        scannerPool.stakeOwned = (scannerPool.stakeAllocated as BigInt).plus(stakeAllocatorContract.unallocatedStakeFor(2,subject))
        scannerPool.stakeDelegated = stakeAllocatorContract.allocatedDelegatorsStakePerManaged(2,subject);
        scannerPool.stakeOwnedAllocated = stakeAllocatorContract.allocatedOwnStakePerManaged(2,subject);
        scannerPool.save()
    }
}


export function handleAllocatedStake(event: AllocatedStakeEvent): void {
    const subjectType = event.params.subjectType;
    const subjectId = event.params.subject.toHexString();

    if(subjectType === 2) {
        const scannerPool = ScannerPool.load(subjectId);
        if(scannerPool) {
          updateScannerPoolStakes(event.params.subject, event.address)
        }
    }
}

export function handleUnAllocatedStake(event: UnallocatedStakeEvent): void {
    const subjectType = event.params.subjectType;
    const subjectId = event.params.subject.toHexString();

    if(subjectType === 2) {
        const scannerPool = ScannerPool.load(subjectId);
        if(scannerPool) {
            updateScannerPoolStakes(event.params.subject, event.address)
        }
    }
}