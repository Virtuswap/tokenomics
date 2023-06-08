import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@nomiclabs/hardhat-etherscan';
import 'hardhat-deploy';
import 'dotenv/config';

const { POLYGON_MUMBAI_RPC_PROVIDER, POLYGON_MUMBAI_PRIVATE_KEY, POLYGONSCAN_API_KEY, POLYGON_PRIVATE_KEY, POLYGON_RPC_PROVIDER } = process.env;

const config: HardhatUserConfig = {
    defaultNetwork: 'hardhat',
    networks: {
        hardhat: {
            chainId: 31337,
        },
        mumbai: {
            chainId: 80001,
            url: POLYGON_MUMBAI_RPC_PROVIDER !== undefined ? `${POLYGON_MUMBAI_RPC_PROVIDER}` : '',
            accounts: POLYGON_MUMBAI_PRIVATE_KEY !== undefined ? [`${POLYGON_MUMBAI_PRIVATE_KEY}`] : [],
        },
        polygon: {
            url: POLYGON_RPC_PROVIDER !== undefined ? `${POLYGON_RPC_PROVIDER}` : '',
            accounts: POLYGON_PRIVATE_KEY !== undefined ? [`${POLYGON_PRIVATE_KEY}`] : [],
        },
    },
    etherscan: {
        apiKey: {
            polygonMumbai: POLYGONSCAN_API_KEY !== undefined ? `${POLYGONSCAN_API_KEY}` : '',
            polygon: POLYGONSCAN_API_KEY !== undefined ? `${POLYGONSCAN_API_KEY}` : '',
        },
    },
    solidity: {
        version: '0.8.18',
        settings: {
            optimizer: {
                enabled: true,
            },
        },
    },
    namedAccounts: {
        deployer: {
            default: 0,
        },
    },
};

export default config;
