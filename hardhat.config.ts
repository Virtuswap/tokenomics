import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";

const config: HardhatUserConfig = {
    defaultNetwork: 'hardhat',
    networks: {
        hardhat: {
            chainId: 31337,
        },
    },
    solidity: {
        version: "0.8.13",
        settings: {
            optimizer: {
                enabled: true,
            }
        }
    },
    namedAccounts: {
        deployer: {
            default: 0,
        }
    },
};

export default config;
