
import { Address, BigInt, log } from "@graphprotocol/graph-ts";
import { AllocatedStake as AllocatedStakeEvent, UnallocatedStake as UnallocatedStakeEvent, StakeAllocator } from "../../generated/StakeAllocator/StakeAllocator"
import { ScannerPool } from "../../generated/schema";

function formatSubjectId(subjectId: BigInt, subjectType: i32): string {
    return (subjectType === 2 || subjectType == 3) ? subjectId.toBigDecimal().toString() : subjectId.toHexString();
}

function updateScannerPoolStakes(subject: BigInt, contractAddress: Address, scannerPool: ScannerPool): void {
    const stakeAllocatorContract = StakeAllocator.bind(contractAddress);

    scannerPool.stakeOwnedAllocated = stakeAllocatorContract.allocatedStakeFor(2,subject);
    scannerPool.stakeAllocated = scannerPool.stakeOwnedAllocated.plus(stakeAllocatorContract.allocatedStakeFor(3,subject))
    scannerPool.stakeOwned = scannerPool.stakeOwnedAllocated.plus(stakeAllocatorContract.unallocatedStakeFor(2,subject))
    scannerPool.stakeDelegated = stakeAllocatorContract.allocatedStakeFor(3,subject).plus(stakeAllocatorContract.unallocatedStakeFor(3,subject));

    scannerPool.save();
}


export function handleAllocatedStake(event: AllocatedStakeEvent): void {
    const subjectType = event.params.subjectType;
    const subjectId = formatSubjectId(event.params.subject, event.params.subjectType);

    if (subjectType === 2 || subjectType === 3) {
        const scannerPool = ScannerPool.load(subjectId);
        if(scannerPool) {
          updateScannerPoolStakes(event.params.subject, event.address, scannerPool)
        }
    }
}

export function handleUnAllocatedStake(event: UnallocatedStakeEvent): void {
    const subjectType = event.params.subjectType;
    const subjectId = formatSubjectId(event.params.subject, event.params.subjectType);

    if(subjectType === 2 || subjectType === 3) {
        const scannerPool = ScannerPool.load(subjectId);
        if(scannerPool) {
            updateScannerPoolStakes(event.params.subject, event.address, scannerPool)
        }
    }
}