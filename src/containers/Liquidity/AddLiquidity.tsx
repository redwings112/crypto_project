import { Box, Flex, Input, SimpleGrid } from "@chakra-ui/react";
import { Currency, Token } from "@pancakeswap/sdk";
import ButtonConnectWallet from "@src/components/ButtonConnectWallet";
import { SwitchIcon, WalletIcon } from "@src/components/Icon";
import SelectTokens from "@src/components/SelectToken";
import { Typography } from "@src/components/Typography";
import contracts from "@src/constants/contracts";
import { useAllTokens, useCurrency } from "@src/hooks/Tokens";
import { useToast } from "@src/hooks/useToast";
import { Field } from "@src/redux/slices/mint/actions";
import IPancakeRouter02ABI from "@src/configs/abis/IPancakeRouter02.json";
import erc20ABI from "@src/configs/abis/erc20.json";

import {
  useDerivedMintInfo,
  useMintActionHandlers,
  useMintState,
} from "@src/redux/slices/mint/hooks";
import { getContract } from "@src/utils/contractHelper";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { calculateSlippageAmount } from "@src/utils/exchange";
import useTransactionDeadline from "@src/hooks/swap/useTransactionDeadline";
import {
  useGasPrice,
  useUserSlippageTolerance,
} from "@src/redux/slices/user/hooks";
import { calculateGasMargin } from "@src/utils/calculateGasMargin";
import { useSigner } from "wagmi";
import { useWeb3React } from "@src/hooks/useWeb3React";
import useSWR from "swr";
import BigNumber from "bignumber.js";
import { BigNumber as BigNumberEther } from "@ethersproject/bignumber";

import { MAX_INT } from "@src/constants";
import { ButtonComponent } from "../PoolPage";
import { useCurrencyBalance } from "@src/hooks/wallet";
import { maxAmountSpend } from "@src/utils/getmaxAmountSpend";
import { AddIcon } from "@chakra-ui/icons";
import Image from "next/image";
import useNativeCurrency from "@src/hooks/useNativeCurrency";
const AddLiquidity: React.FC = () => {
  const allTokens = useAllTokens();
  const { toastError, toastSuccess, toastProcessingTx } = useToast();
  const { data: signer } = useSigner();
  const { account, chainId } = useWeb3React();
  const [isApprovedTokenA, setIsApprovedTokenA] = useState(false);
  const [isApprovedTokenB, setIsApprovedTokenB] = useState(false);
  const [isPendingApprover, setIsPendingApprover] = useState(false);
  const [isPendingAddLiquidity, setIsPendingAddLiquidity] = useState(false);
  const filteredTokens: Token[] = useMemo(() => {
    return Object.values(allTokens);
  }, [allTokens]);

  const defaultTokenA = filteredTokens.find(
    (e) => e?.symbol?.toLowerCase() === "usdt"
  );
  const defaultTokenB = filteredTokens.find(
    (e) => e?.symbol?.toLowerCase() === "mkt"
  );
  const native = useNativeCurrency();
  const [currency, setCurrency] = React.useState<{
    currencyA: Currency;
    currencyB: Currency;
  }>({
    currencyA: native || filteredTokens[0],
    currencyB: defaultTokenB || filteredTokens[1],
  });
  const currencyA = currency?.currencyA;
  const currencyB = currency?.currencyB;

  const contractTokenA = useMemo(() => {
    return getContract(
      currencyA.isToken
        ? currencyA.address
        : "0x55d398326f99059ff775485246999027b3197955",
      erc20ABI,
      chainId,
      signer
    );
  }, [chainId, currencyA, signer]) as any;

  const contractTokenB = useMemo(() => {
    return getContract(
      currencyB.isToken
        ? currencyB.address
        : "0xf542ac438cf8cd4477a1fc7ab88adda5426d55ed",
      erc20ABI,
      chainId,
      signer
    );
  }, [chainId, currencyB, signer]) as any;

  const { data: allowanceTokenA } = useSWR(
    [`allowance-${currencyA?.symbol}`, account],
    async () => {
      const res = await contractTokenA.allowance(
        account,
        contracts.routerPancake[chainId]
      );
      return res;
    }
  );

  const { data: allowanceTokenB } = useSWR(
    [`allowance-${currencyB?.symbol}`, account],
    async () => {
      const res = await contractTokenB.allowance(
        account,
        contracts.routerPancake[chainId]
      );
      return res;
    }
  );

  useEffect(() => {
    setIsApprovedTokenA(
      currencyA.isNative
        ? true
        : new BigNumber(allowanceTokenA?._hex).isGreaterThan(0)
    );
    setIsApprovedTokenB(
      currencyB.isNative
        ? true
        : new BigNumber(allowanceTokenB?._hex).isGreaterThan(0)
    );
  }, [
    allowanceTokenB?._hex,
    allowanceTokenA?._hex,
    currencyA.isNative,
    currencyB.isNative,
  ]);
  const gasPrice = useGasPrice();

  const handleApprove = useCallback(async () => {
    try {
      setIsPendingApprover(true);
      const tx = await (!isApprovedTokenA
        ? contractTokenA
        : contractTokenB
      ).approve(contracts.routerPancake[chainId], MAX_INT.toString());

      await tx.wait();
      !isApprovedTokenA ? setIsApprovedTokenA(true) : setIsApprovedTokenB(true);
      setIsPendingApprover(false);
    } catch (error) {
      setIsPendingApprover(false);
    }
  }, [chainId, contractTokenA, contractTokenB, isApprovedTokenA]);

  const [{ attemptingTxn, liquidityErrorMessage, txHash }, setLiquidityState] =
    useState<{
      attemptingTxn: boolean;
      liquidityErrorMessage: string | undefined;
      txHash: string | undefined;
    }>({
      attemptingTxn: false,
      liquidityErrorMessage: undefined,
      txHash: undefined,
    });

  const onSelectInput = (e: Currency) => {
    if (e?.symbol.toLowerCase() === currencyB.symbol?.toLowerCase()) {
      setCurrency({
        currencyB: currencyA,
        currencyA: e,
      });
    } else {
      setCurrency({
        ...currency,
        currencyA: e,
      });
    }
  };

  const onSelectOutput = (e: Currency) => {
    if (e?.symbol.toLowerCase() === currencyA.symbol?.toLowerCase()) {
      setCurrency({
        currencyB: e,
        currencyA: currencyB,
      });
    } else {
      setCurrency({
        ...currency,
        currencyB: e,
      });
    }
  };

  const {
    dependentField,
    currencies,
    pair,
    pairState,
    currencyBalances,
    parsedAmounts: mintParsedAmounts,
    price,
    noLiquidity,
    liquidityMinted,
    poolTokenPercentage,
    error,
    addError,
  } = useDerivedMintInfo(
    currency.currencyA ?? undefined,
    currency.currencyB ?? undefined
  );
  const { onFieldAInput, onFieldBInput } = useMintActionHandlers(noLiquidity);
  const { independentField, typedValue, otherTypedValue } = useMintState();

  const balanceCurrencyA = maxAmountSpend(
    currencyA,
    useCurrencyBalance(account, currencyA)?.toSignificant(6).toString() || "0"
  );
  const balanceCurrencyB = maxAmountSpend(
    currencyB,
    useCurrencyBalance(account, currencyB)?.toSignificant(6).toString() || "0"
  );

  const onChangeInput = (e: { target: { value: any } }) => {
    const value = e.target.value;
    onFieldAInput(value);
  };

  const onChangeOutInput = (e: { target: { value: any } }) => {
    const value = e.target.value;
    onFieldBInput(value);
  };

  const parsedAmounts = mintParsedAmounts;

  // get formatted amounts
  const formattedAmounts = useMemo(
    () => ({
      [independentField]: typedValue,
      [dependentField]: noLiquidity
        ? otherTypedValue
        : parsedAmounts[dependentField]?.toSignificant(6) ?? "",
    }),
    [
      dependentField,
      independentField,
      noLiquidity,
      otherTypedValue,
      parsedAmounts,
      typedValue,
    ]
  );

  const routerContract = useMemo(() => {
    return getContract(
      contracts.routerPancake[chainId],
      IPancakeRouter02ABI,
      chainId,
      signer
    );
  }, [chainId, signer]) as any;

  const deadline = useTransactionDeadline(); // custom from users settings
  const [allowedSlippage] = useUserSlippageTolerance();

  async function onAdd() {
    if (!chainId || !account || !routerContract) return;

    const {
      [Field.CURRENCY_A]: parsedAmountA,
      [Field.CURRENCY_B]: parsedAmountB,
    } = mintParsedAmounts;
    if (
      !parsedAmountA ||
      !parsedAmountB ||
      !currencyA ||
      !currencyB ||
      !deadline
    ) {
      return;
    }

    const amountsMin = {
      [Field.CURRENCY_A]: calculateSlippageAmount(
        parsedAmountA,
        allowedSlippage
      )[0],
      [Field.CURRENCY_B]: calculateSlippageAmount(
        parsedAmountB,
        allowedSlippage
      )[0],
    };
    let estimate;
    let method: (...args: any) => any;
    let args: Array<string | string[] | number>;
    let value: BigNumberEther | null;
    if (currencyA?.isNative || currencyB?.isNative) {
      const tokenBIsNative = currencyB?.isNative;
      estimate = routerContract.estimateGas.addLiquidityETH;
      method = routerContract.addLiquidityETH;
      args = [
        (tokenBIsNative ? currencyA : currencyB)?.wrapped?.address ?? "", // token
        (tokenBIsNative ? parsedAmountA : parsedAmountB).quotient.toString(), // token desired
        amountsMin[
          tokenBIsNative ? Field.CURRENCY_A : Field.CURRENCY_B
        ].toString(), // token min
        amountsMin[
          tokenBIsNative ? Field.CURRENCY_B : Field.CURRENCY_A
        ].toString(), // eth min
        account,
        deadline.toHexString(),
      ];
      value = BigNumberEther.from(
        (tokenBIsNative ? parsedAmountB : parsedAmountA).quotient.toString()
      );
    } else {
      estimate = routerContract.estimateGas.addLiquidity;
      method = routerContract.addLiquidity;
      args = [
        currencyA?.wrapped?.address ?? "",
        currencyB?.wrapped?.address ?? "",
        parsedAmountA.quotient.toString(),
        parsedAmountB.quotient.toString(),
        amountsMin[Field.CURRENCY_A].toString(),
        amountsMin[Field.CURRENCY_B].toString(),
        account,
        deadline.toHexString(),
      ];
      value = null;
    }

    setLiquidityState({
      attemptingTxn: true,
      liquidityErrorMessage: undefined,
      txHash: undefined,
    });
    setIsPendingAddLiquidity(true);

    await estimate(...args, value ? { value } : {})
      .then((estimatedGasLimit: any) =>
        method(...args, {
          ...(value ? { value } : {}),
          gasLimit: calculateGasMargin(estimatedGasLimit),
          gasPrice,
        }).then(async (response: any) => {
          setLiquidityState({
            attemptingTxn: false,
            liquidityErrorMessage: undefined,
            txHash: response.hash,
          });

          const result = await response.wait(1);
          if (result) {
            setIsPendingAddLiquidity(false);

            toastSuccess("Add Liquidity Successful", response?.hash);
            onFieldAInput("");
            onFieldBInput("");
          }

          return result;
        })
      )
      .catch((err: any) => {
        setIsPendingAddLiquidity(false);
        if (err && err.code !== 4001) {
          console.error(`Add Liquidity failed`, err, args, value);
          toastError("Add Liquidity failed");
        }
        return false;
      });
  }

  const errInput = useMemo(() => {
    if (
      formattedAmounts[Field.CURRENCY_A] === "" ||
      formattedAmounts[Field.CURRENCY_B] === "" ||
      Number(formattedAmounts[Field.CURRENCY_A]) === 0 ||
      Number(formattedAmounts[Field.CURRENCY_B]) === 0
    ) {
      return "Enter an amount";
    }

    if (
      Number(formattedAmounts[Field.CURRENCY_A]) > Number(balanceCurrencyA) ||
      Number(formattedAmounts[Field.CURRENCY_B]) > Number(balanceCurrencyB)
    ) {
      return "Insufficient balance";
    }
  }, [balanceCurrencyA, balanceCurrencyB, formattedAmounts]);

  return (
    <Flex
      mt="112px"
      className="max-w-[1200px] w-full mx-auto min-h-[100vh] item-center"
    >
      <Flex
        borderRadius={"12px"}
        className="bg-secondary "
        flexDirection={"column"}
        h="fit-content"
        px="16px"
        w="100%"
        maxWidth="480px"
        mx="auto"
      >
        <Typography
          textAlign={"center"}
          type="headline5"
          py="16px"
          className="text-primary"
        >
          Add Liquidity
        </Typography>

        <Flex flexDirection="column">
          <Flex
            borderTopRadius={"12px"}
            p="24px 16px 16px 16px"
            className="bg-default"
            flexDirection={"column"}
            position={"relative"}
          >
            <Flex align={"center"} justifyContent={"space-between"}>
              <SelectTokens
                onSelectToken={onSelectInput}
                currency={currency.currencyA}
              />
              <Typography type="headline3" w="70%" className="text-secondary">
                <Input
                  sx={{ direction: "rtl", fontSize: "28px" }}
                  variant="unstyled"
                  placeholder="0.0"
                  value={formattedAmounts[Field.CURRENCY_A]}
                  onChange={onChangeInput}
                  color="text.primary"
                  textAlign={"right"}
                />
              </Typography>
            </Flex>
            <Flex justifyContent={"space-between"} align={"center"} mt="9px">
              <Flex align={"center"}>
                <WalletIcon boxSize={"20px"} />{" "}
                <Typography
                  type="caption1-r"
                  className="text-primary ml-2 mr-2"
                >
                  {balanceCurrencyA ? balanceCurrencyA : "0.0"}{" "}
                </Typography>
                <Typography
                  cursor={"pointer"}
                  onClick={() => onFieldAInput(balanceCurrencyA || "0")}
                  type="paragraph2"
                  className="text-brand"
                >
                  MAX{" "}
                </Typography>
              </Flex>
            </Flex>

            <Box
              sx={{
                bottom: "-18px",
                left: "46%",
                position: "absolute",
                backgroundColor: "#232325",
                borderRadius: "50%",
                width: "32px",
                height: "32px",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <AddIcon boxSize={"20px"} color={"#778092"} />
            </Box>
          </Flex>
          <Flex
            borderBottomRadius={"12px"}
            p="24px 16px 16px 16px"
            className="bg-default"
            flexDirection={"column"}
            mt="4px"
          >
            <Flex align={"center"} justifyContent={"space-between"}>
              <SelectTokens
                onSelectToken={onSelectOutput}
                currency={currency.currencyB}
              />
              <Typography type="headline3" w="70%" className="text-secondary">
                <Input
                  sx={{ direction: "rtl", fontSize: "28px" }}
                  variant="unstyled"
                  placeholder="0.0"
                  value={formattedAmounts[Field.CURRENCY_B]}
                  onChange={onChangeOutInput}
                  textAlign={"right"}
                  color="text.primary"
                />
              </Typography>
            </Flex>
            <Flex justifyContent={"space-between"} align={"center"} mt="9px">
              <Flex align={"center"}>
                <WalletIcon boxSize={"20px"} />{" "}
                <Typography
                  type="caption1-r"
                  className="text-primary ml-2 mr-2"
                >
                  {balanceCurrencyB ? balanceCurrencyB : "0.0"}{" "}
                </Typography>
                <Typography
                  cursor={"pointer"}
                  onClick={() => onFieldBInput(balanceCurrencyB || "0")}
                  type="paragraph2"
                  className="text-brand"
                >
                  MAX{" "}
                </Typography>
              </Flex>
            </Flex>
          </Flex>
        </Flex>
        <Typography mb="8px" type="body1" color="text.primary" mt="24px">
          Prices and pool share
        </Typography>
        <Flex
          border="1px solid"
          borderColor="#3E454B"
          borderRadius={"8px"}
          py="12px"
          px="16px"
        >
          <SimpleGrid columns={3} spacing={2} w="100%">
            <Box>
              <Typography
                textAlign={"center"}
                type="body1"
                color="text.primary"
              >
                {price ? price?.toSignificant(6) : "0"}
              </Typography>
              <Typography
                mt="4px"
                textAlign={"center"}
                type="body1"
                color="text.secondary"
              >
                {currencyA?.symbol} per {currencyB.symbol}
              </Typography>
            </Box>
            <Box>
              <Typography
                textAlign={"center"}
                type="body1"
                color="text.primary"
              >
                {price ? price?.invert()?.toSignificant(6) : "0"}
              </Typography>
              <Typography
                mt="4px"
                textAlign={"center"}
                type="body1"
                color="text.secondary"
              >
                {currencyB?.symbol} per {currencyA.symbol}
              </Typography>
            </Box>
            <Box>
              <Typography
                textAlign={"center"}
                type="body1"
                color="text.primary"
              >
                {(noLiquidity ? 100 : poolTokenPercentage?.toSignificant(4)) ||
                  "0.00"}
                %
              </Typography>
              <Typography
                mt="4px"
                textAlign={"center"}
                type="body1"
                color="text.secondary"
              >
                Share of Pool
              </Typography>
            </Box>
          </SimpleGrid>
        </Flex>
        <Flex my="24px">
          {(!isApprovedTokenA || !isApprovedTokenB) && account ? (
            <ButtonComponent
              h="48px"
              onClick={handleApprove}
              w="100%"
              isLoading={isPendingApprover}
              loadingText={`Approve ${
                !isApprovedTokenA ? currencyA.symbol : currencyB.symbol
              }...`}
              title={`Approve ${
                !isApprovedTokenA ? currencyA.symbol : currencyB.symbol
              }`}
            />
          ) : (
            <ButtonConnectWallet h="48px" w="100%">
              <ButtonComponent
                onClick={onAdd}
                isDisabled={!!errInput}
                marginTop={"0px"}
                h="48px"
                w="100%"
                loadingText="Summary..."
                isLoading={isPendingAddLiquidity}
                title={errInput || "Summary"}
              />
            </ButtonConnectWallet>
          )}
        </Flex>
      </Flex>
    </Flex>
  );
};

export default AddLiquidity;
