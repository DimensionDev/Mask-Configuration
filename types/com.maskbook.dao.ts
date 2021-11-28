type Media = Record<"id" | "website" | "twitter" | "discord" | string, string>;

type BNString = string;
type HexAddress = string
/** One based percent rate */
type PercentRate = number

type VolumeTrack = {
  datetime: number;
  value: BNString;
};

type PeopleTokens ={
  address: HexAddress;
  total_supply: BNString;
}

type Activity = {
  action: "pay" | "redeem" | "withdraw" | "reserves",
  payload: BNString;
  address: HexAddress;
  timestamp: number;
  message: string;
  media: null | {
    url: string;
    type: "imaeg" | "video"
  }
}

type FundingCycle= {
  current: {
    target: BNString;
    reserved: PercentRate;
    duration: null | number;
    discount: PercentRate;
    $people: BNString,
    bonding_curve: PercentRate;
    address: HexAddress;
    description: string;
    available: BNString;
    withdrawn: BNString;
    reserved_$people: {
      address: string;
      rate: PercentRate
    }
  },
  list_ids: string[]
}

type Schema = {
  name: string;
  logo: string;
  media: Media;
  description: string;
  valume: BNString;
  in_juicebox: BNString;
  in_wallet: BNString;
  volume_track: VolumeTrack;
  $people_tokens: PeopleTokens,
  activities: Activity[];
  funding_cycle: 
}[];

