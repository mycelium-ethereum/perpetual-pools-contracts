import {
    PoolFactory__factory,
    PoolFactory,
    PoolKeeper__factory,
    PoolKeeper,
} from "../types"
const hre = require("hardhat")

async function main() {
    const { deployments, ethers } = hre
    const [deployer] = await ethers.getSigners()
    await deployments.fixture(["FullDeployTest"])

    const factory = await deployments.get("PoolFactory")
    const keeper = await deployments.get("PoolKeeper")

    /* Get the factory */
    const factoryInstance = new ethers.Contract(
        factory.address,
        PoolFactory__factory.abi
    ).connect(deployer) as PoolFactory

    /* Get the keeper */
    const keeperInstance = new ethers.Contract(
        keeper.address,
        PoolKeeper__factory.abi
    ).connect(deployer) as PoolKeeper

    const pools = []
    const numPools = (await factoryInstance.numPools()).toNumber()

    for (let i = 0; i < numPools; i++) {
        pools.push(await factoryInstance.pools(i))
    }

    const iface = new ethers.utils.Interface(PoolKeeper__factory.abi)
    for (let i = 0; i < pools.length; i++) {
        console.log(
            `pool ${
                pools[i]
            } should be upkept: ${await keeperInstance.isUpkeepRequiredSinglePool(
                pools[i]
            )}`
        )
        console.log(
            `data: ${iface.encodeFunctionData("isUpkeepRequiredSinglePool", [
                pools[i],
            ])}\n`
        )
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
