import type { BigNumber } from "@ethersproject/bignumber";
import { AppState } from "@src/redux/store";
import { useMemo } from "react";
import { useSelector } from "react-redux";
import useCurrentBlockTimestamp from "../useCurrentBlockTimestamp";


// combines the block timestamp with the user setting to give the deadline that should be used for any submitted transaction
export default function useTransactionDeadline(): BigNumber | undefined {
  const ttl = useSelector<AppState, number>((state) => state.user.userDeadline);
  const blockTimestamp = useCurrentBlockTimestamp();
  return useMemo(() => {
    if (blockTimestamp && ttl) return blockTimestamp.add(ttl);
    return undefined;
  }, [blockTimestamp, ttl]);
}
