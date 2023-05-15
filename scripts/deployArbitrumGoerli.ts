import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { ethers } from "hardhat"
import { arbitrumMainnet, arbitrumRinkeby, NetworkAddresses } from "./addresses"

const hre = require("hardhat")

async function main() {
    const { deployments, ethers } = hre
    const [deployer] = await ethers.getSigners()

    await deployments.fixture(["ArbGoerliDeploy"]);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
