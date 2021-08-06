import { ADMIN_ROLE, OPERATOR_ROLE, UPDATER_ROLE } from '../test/constants';
import { LeveragedPool__factory, PoolFactory__factory, LeveragedPool, TestToken__factory, TestToken, PoolFactory, PoolKeeper__factory, PoolKeeper} from '../typechain';

const hre = require("hardhat")

async function main() {
    const { deployments, ethers } = hre;
    const [deployer, ...accounts] = await ethers.getSigners();
    await deployments.fixture(["FullDeployTest"])

    /* Get the factory */
    const factory = await deployments.get('PoolFactory')
    const factoryInstance = new ethers.Contract(factory.address, PoolFactory__factory.abi).connect(deployer) as PoolFactory

    const quoteToken = await deployments.get('TestToken')
    let quoteTokenInstance = new ethers.Contract(quoteToken.address, TestToken__factory.abi).connect(deployer) as TestToken

    /* Get deployed pool */
    const createdMarkets = factoryInstance.filters.DeployPool();
    const allEvents = await factoryInstance?.queryFilter(createdMarkets);
    let pool: LeveragedPool = allEvents.map((event: any) => (
        new ethers.Contract(event?.args.pool, LeveragedPool__factory.abi).connect(deployer) as LeveragedPool
    ))[0]

    const shortMint = [0]
    const longMint = [2]

    /* Commit to pool */
    console.log(`Account ${accounts[0].address} committing 100 short`)
    quoteTokenInstance = quoteTokenInstance.connect(accounts[0])
    pool = pool.connect(accounts[0])
    await quoteTokenInstance.approve(pool.address, ethers.utils.parseEther("1000000"))
    await pool.commit(shortMint, ethers.utils.parseEther("100"))

    console.log(`Account ${accounts[1].address} committing 75 long`)
    quoteTokenInstance = quoteTokenInstance.connect(accounts[1])
    pool = pool.connect(accounts[1])
    await quoteTokenInstance.approve(pool.address, ethers.utils.parseEther("1000000"))
    await pool.commit(longMint, ethers.utils.parseEther("75"))

    console.log(`Account ${accounts[2].address} committing 50 long`)
    quoteTokenInstance = quoteTokenInstance.connect(accounts[2])
    pool = pool.connect(accounts[2])
    await quoteTokenInstance.approve(pool.address, ethers.utils.parseEther("1000000"))
    await pool.commit(longMint, ethers.utils.parseEther("50"))

    /* Get pool commits and execute them */
    const createdCommits = pool.filters.CreateCommit();
    const allCommits = await pool?.queryFilter(createdCommits);
    let commitIds = allCommits.map((event) => (event.args.commitID))

    /* Setting keeper */
    // TODO add keeper back and do this with the keeper
    // const keeper = await deployments.get('PoolFactory')
    // const keeperInstance = new ethers.Contract(keeper.address, PoolKeeper__factory.abi).connect(deployer) as PoolKeeper

    const TEN_MINS = 10 * 60;
    console.log("Fast forward 10 mins")
    await ethers.provider.send("evm_increaseTime", [TEN_MINS + 1], { from: deployer.address })
    await ethers.provider.send("evm_mine", [], { from: deployer.address })

    /* Granting access */
    pool = pool.connect(deployer);

    /* Changing price */
    console.log("Changing price")
    await pool.executePriceChange(1, 2)

    console.log("Executing commitments")
    await pool.executeCommitment(commitIds)

    console.log("Fast forward 10 mins")
    await ethers.provider.send("evm_increaseTime", [TEN_MINS + 1], { from: deployer.address })
    await ethers.provider.send("evm_mine", [], { from: deployer.address })

    console.log(`Changing price`)
    await pool.executePriceChange(2, 1)
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
