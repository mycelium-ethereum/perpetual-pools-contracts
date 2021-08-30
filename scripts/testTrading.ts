import { incrementPrice } from "../test/utilities"
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
} from "../typechain"

const hre = require("hardhat")

async function main() {
    const { deployments, ethers } = hre
    const [deployer, ...accounts] = await ethers.getSigners()
    await deployments.fixture(["FullDeployTest"])

    /* Get the factory */
    const factory = await deployments.get("PoolFactory")
    const factoryInstance = new ethers.Contract(
        factory.address,
        PoolFactory__factory.abi
    ).connect(deployer) as PoolFactory

    /* Get the keeper */
    const keeper = await deployments.get("PoolKeeper")
    const keeperInstance = new ethers.Contract(
        keeper.address,
        PoolKeeper__factory.abi
    ).connect(deployer) as PoolKeeper

    /* Get the Oracle */
    const oracleWrapper = await deployments.get("ChainlinkOracleWrapper")
    const oracleWrapperInstance = new ethers.Contract(
        oracleWrapper.address,
        ChainlinkOracleWrapper__factory.abi
    ).connect(deployer) as ChainlinkOracleWrapper

    /* Get deployed pool */
    const createdMarkets = factoryInstance.filters.DeployPool()
    const allEvents = await factoryInstance?.queryFilter(createdMarkets)
    let pool: LeveragedPool = allEvents.map(
        (event: any) =>
            new ethers.Contract(
                event?.args.pool,
                LeveragedPool__factory.abi
            ).connect(deployer) as LeveragedPool
    )[0]

    const poolCommitter = await pool.poolCommitter()
    let committerInstance = new ethers.Contract(
        poolCommitter,
        PoolCommitter__factory.abi
    ).connect(deployer) as PoolCommitter

    const shortMint = [0]
    const longMint = [2]

    const quoteToken = await pool.quoteToken()
    let quoteTokenInstance = new ethers.Contract(
        quoteToken,
        TestToken__factory.abi
    ).connect(deployer) as TestToken

    const amount = ethers.utils.parseEther("1000")
    await quoteTokenInstance.connect(deployer).transfer(accounts[0].address, amount)
    await quoteTokenInstance.connect(deployer).transfer(accounts[1].address, amount)
    await quoteTokenInstance.connect(deployer).transfer(accounts[2].address, amount)

    const token = await pool.tokens(0)
    const tokenInstance = new ethers.Contract(
        token,
        PoolToken__factory.abi
    ).connect(deployer) as PoolToken

    console.log(`Pool address should own token: ${pool.address}`) // owners are different here
    console.log(
        `Owner for ${await tokenInstance.name()}`,
        await tokenInstance.owner()
    ) // no owner :(

    /* Commit to pool */
    console.log(`Account ${accounts[0].address} committing 100 short`)
    quoteTokenInstance = quoteTokenInstance.connect(accounts[0])
    committerInstance = committerInstance.connect(accounts[0])
    await quoteTokenInstance.approve(
        pool.address,
        ethers.utils.parseEther("1000000")
    )
    await committerInstance.commit(longMint, ethers.utils.parseEther("100"))

    console.log(`Account ${accounts[1].address} committing 75 long`)
    quoteTokenInstance = quoteTokenInstance.connect(accounts[1])
    committerInstance = committerInstance.connect(accounts[1])
    await quoteTokenInstance.approve(
        pool.address,
        ethers.utils.parseEther("1000000")
    )
    await committerInstance.commit(longMint, ethers.utils.parseEther("75"))

    console.log(`Account ${accounts[2].address} committing 50 long`)
    quoteTokenInstance = quoteTokenInstance.connect(accounts[2])
    committerInstance = committerInstance.connect(accounts[2])
    await quoteTokenInstance.approve(
        pool.address,
        ethers.utils.parseEther("1000000")
    )
    await committerInstance.commit(longMint, ethers.utils.parseEther("50"))

    /* Get pool commits and execute them */
    const createdCommits = committerInstance.filters.CreateCommit()
    const allCommits = await pool?.queryFilter(createdCommits)
    let commitIds = allCommits.map((event) => event.args.commitID)

    const updateInterval = 60

    /* Changing price */
    // await oracleWrapperInstance.incrementPrice()

    console.log("Fast forward 10 mins")
    await ethers.provider.send("evm_increaseTime", [updateInterval + 1], {
        from: deployer.address,
    })
    await ethers.provider.send("evm_mine", [], { from: deployer.address })

    /* Granting access */
    pool = pool.connect(deployer)
    console.log("Executing commitments")
    await keeperInstance.performUpkeepSinglePool(pool.address)

    console.log("Fast forward 10 mins")
    await ethers.provider.send("evm_increaseTime", [updateInterval + 1], {
        from: deployer.address,
    })
    await ethers.provider.send("evm_mine", [], { from: deployer.address })

    console.log(`Performing upkeep second round`)
    await keeperInstance.performUpkeepSinglePool(pool.address)
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
