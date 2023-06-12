export interface networkConfigItem {
    blockConfirmations?: number,
    vPairFactoryAddress?: string,
}

export interface networkConfigInfo {
    [key: string]: networkConfigItem
}

export const networkConfig: networkConfigInfo = {
  localhost: {},
  hardhat: {},
  mumbai: {
      vPairFactoryAddress: '',
      blockConfirmations: 5,
  },
  polygon: {}
}

export const developmentChains = ['hardhat', 'localhost'];
