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
} from "../types"

import { getEventArgs } from "../test/utilities"

async function main() {
    const [deployer, ...accounts] = await ethers.getSigners()
    
    const sampleCommitter: string = "0x584A4B6C073Af0E98eF944d6A8c6ef459f37B9a0"
    const quoteToken: string = "0x7a51a215B131f03087EE855aEd982877E9a43144"
    const levergedPoolAddress: string = "0xeb8CECfFaf2A45B9b2E60d6B77875A69bb1c4541"

    let poolCommitter = new ethers.Contract(
        sampleCommitter,
        PoolCommitter__factory.abi
    ).connect(deployer) as PoolCommitter

    let token = new ethers.Contract(
        quoteToken,
        TestToken__factory.abi
    ).connect(deployer) as TestToken

    await (await token.approve(levergedPoolAddress, ethers.utils.parseEther('20000'))).wait()

    let longReceipt = await (await poolCommitter.commit(LONG_MINT, ethers.utils.parseEther('10000'), false, false)).wait()
    let shortReceipt = await (await poolCommitter.commit(SHORT_MINT, ethers.utils.parseEther('10000'), false, false)).wait()

    console.log(getEventArgs(longReceipt, "CreateCommit"))
    console.log(getEventArgs(shortReceipt, "CreateCommit"))
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })