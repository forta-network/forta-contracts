import { BigInt } from "@graphprotocol/graph-ts";


export function formatSubjectId(subjectId: BigInt, subjectType: i32): string {
    return subjectType === 2 ? subjectId.toBigDecimal().toString() : subjectId.toHexString();
}