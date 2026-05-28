import { bridgeTokenTool } from "./tools/bridge";
import { StellarLiquidityContractTool } from "./tools/contract";
import { StellarDexTool } from "./tools/dex";
import { StellarContractTool } from "./tools/stake";
import { stellarSendPaymentTool, stellarGetBalanceTool, stellarGetAccountInfoTool } from "./tools/stellar";
import { StellarTransactionHistoryTool } from "./tools/transactions";
import type { TransactionRecord, OperationRecord } from "./tools/transactions";
import { 
  AgentClient, 
  AgentConfig,
  LaunchTokenParams,
  LaunchTokenResult,
} from "./agent";
import type {
  StellarAssetInput,
  QuoteSwapParams,
  RouteQuote,
  SwapBestRouteParams,
  SwapBestRouteResult,
} from "./agent";

export { 
  AgentClient,
  AgentConfig,
  LaunchTokenParams,
  LaunchTokenResult,
};

export type {
  StellarAssetInput,
  QuoteSwapParams,
  RouteQuote,
  SwapBestRouteParams,
  SwapBestRouteResult,
  TransactionRecord,
  OperationRecord,
};
export const stellarTools = [
  bridgeTokenTool,
  StellarDexTool,
  StellarLiquidityContractTool,
  StellarContractTool,
  stellarSendPaymentTool,
  stellarGetBalanceTool,
  stellarGetAccountInfoTool,
  StellarTransactionHistoryTool,
];
