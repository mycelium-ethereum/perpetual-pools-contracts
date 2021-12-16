import { ethers } from "hardhat"
import { LONG_MINT, SHORT_MINT } from "../test/constants"
import {
    LeveragedPool__factory,
    PoolFactory__factory,
    LeveragedPool,
    TestToken__factory,
    TestToken,
    PoolFactory,
    PoolKeeper__factory,
    PoolKeeper,
    ChainlinkOracleWrapper__factory,
    ChainlinkOracleWrapper,
    PoolToken__factory,
    PoolToken,
    PoolCommitter__factory,
    PoolCommitter,
    InvariantCheck__factory,
    InvariantCheck,
} from "../types"

async function main() {
    const [deployer, ...accounts] = await ethers.getSigners()
    
    const poolKeeperAddress: string = "0x03BB868CD49Ee9E069fC4A25bCc7661Ae2459B9E"
    const poolAddress: string = "0xeb8CECfFaf2A45B9b2E60d6B77875A69bb1c4541"
    const sampleCommitter: string = "0x584A4B6C073Af0E98eF944d6A8c6ef459f37B9a0"

    let poolKeeper = new ethers.Contract(
        poolKeeperAddress,
        PoolKeeper__factory.abi
    ).connect(deployer) as PoolKeeper

    let levPool = new ethers.Contract(
        poolAddress,
        LeveragedPool__factory.abi
    ).connect(deployer) as LeveragedPool

    var requireUpkeep = await poolKeeper.checkUpkeepSinglePool(poolAddress)

    console.log(requireUpkeep)

    if(requireUpkeep) {
        levPool.setKeeper(poolKeeper.address)

        const transaction = await poolKeeper.performUpkeepSinglePool(poolAddress)
        console.log(transaction.hash)
        transaction.wait
        console.log("done")
    }
    else{
        console.log("does not require upkeep")
    }

}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })