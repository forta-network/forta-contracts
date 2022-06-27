import { StakeThreshold } from "../../generated/schema";

export function fetchStakeThreshold(id: string): StakeThreshold {
  let stakeThreshold = new StakeThreshold(id);
  stakeThreshold.save();
  return stakeThreshold;
}
