enum DataProvider {
  COIN_GECKO,
  COIN_MARKET_CAP,
}

type EnumRecord<T extends number, U> = {
  [K in T]: U;
}

type Schema = EnumRecord<
  DataProvider,
  {
    cash_tag_name: string;
    provider_id: string;
    contract_address?: string;
  }[]
>
