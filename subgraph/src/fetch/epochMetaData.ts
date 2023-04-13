import { EpochMetaData } from "../../generated/schema";
import { fetchAccount } from "./account";
import { Address } from "@graphprotocol/graph-ts";

export function fetchEpochMetaData(): EpochMetaData {
    // Use zero index as singleton
    // If it doesn't exist Create it
}