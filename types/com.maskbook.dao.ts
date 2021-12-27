type Media = Record<'id' | 'website' | 'twitter' | 'discord' | string, string>;

type BNString = string;
type HexAddress = string;
type HexString = string;
/** One based percent rate */
type PercentRate = number;

type VolumeTrack = {
  datetime: number;
  value: BNString;
};

type PeopleTokens = {
  address: HexAddress;
  total_supply: BNString;
};

type Activity = {
  action: 'pay' | 'redeem' | 'withdraw' | 'reserves';
  payload: BNString;
  address: HexAddress;
  timestamp: number;
  message: string;
  media: null | {
    url: string;
    type: 'image' | 'video';
  };
};

type FundingCycle = {
  target: BNString;
  reserved: PercentRate;
  duration: string;
  start: string;
  end: string;
  discount: PercentRate;
  bonding_curve: PercentRate;
  description: string;
};

interface PayEvent {
  amount: BNString;
  beneficiary: HexAddress;
  id: HexString;
  note: string | null;
  timestamp: string;
  txHash: HexString;
}

interface RedeemEvent {
  amount: BNString;
  beneficiary: HexAddress;
  id: HexString;
  returnAmount: BNString;
  timestamp: string;
  txHash: HexString;
}

interface WithdrawEvent {
  beneficiary: HexAddress;
  beneficiaryTransferAmount: BNString;
  caller: HexAddress;
  fundingCycleId: string;
  netTransferAmount: BNString;
  timestamp: string;
  txHash: HexString;
}

type Schema = {
  createdAt: string;
  creator: string;
  currentBalance: BNString;
  handle: HexString;
  id: string;
  totalPaid: BNString;
  totalRedeemed: BNString;
  uri: string;
  name: string;
  description: string;
  logoUri: string;
  infoUri: string;
  twitter: string;
  discord: string;
  payButton: string;
  payDisclosure: string;
  tokens: any[];
  version: number;
  overflow: PercentRate | null;
  fundingCycles: FundingCycle[];
  tokenAddress: HexAddress | null;
  totalSupply: BNString;
  payEvents: PayEvent[];
  redeemEvents: RedeemEvent[];
  withdrawEvents: WithdrawEvent[];
};
