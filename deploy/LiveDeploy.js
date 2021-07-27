const keeperJSON = require("../artifacts/contracts/implementation/PoolKeeper.sol/PoolKeeper.json");
const oracleJSON = require("../artifacts/contracts/implementation/OracleWrapper.sol/OracleWrapper.json");

const { 
    ORACLE, 
    MARKET_CODE,
    POOL_CODE,
    OPERATOR_ROLE
} = require("../test/constants");

const { 
    generateRandomAddress
} = require("../test/utilities");

module.exports = async (hre) => {
    const { deployments, getNamedAccounts, ethers } = hre
    const { deploy, execute } = deployments

    const [deployer, ...accounts] = await ethers.getSigners()

    console.log("Using deployer: " + deployer)

    /* deploy PoolSwapLibrary */
    let poolSwapLibrary = await deploy("PoolSwapLibrary", {
        from: deployer.address,
        log: true,
    })

    /* deploy PoolFactory */
    let poolFactory = await deploy("PoolFactory", {
        from: deployer.address,
        log: true,
        libraries: {
            PoolSwapLibrary: poolSwapLibrary.address,
        },
    })

    /* deploy OracleWrapper */
    let oracleWrapper = await deploy("OracleWrapper", {
        from: deployer.address,
        log: true,
        libraries: {
            PoolSwapLibrary: poolSwapLibrary.address,
        },
    })

    /* deploy PoolKeeper */
    let poolKeeper = await deploy("PoolKeeper", {
        from: deployer.address,
        log: true,
        args: [oracleWrapper.address, poolFactory.address],
        libraries: {
            PoolSwapLibrary: poolSwapLibrary.address,
        },
    })

    let oracleWrapperInstance = new ethers.Contract(
        oracleWrapper.address,
        oracleJSON.abi
    ).connect(deployer)

    let poolKeeperInstance = new ethers.Contract(
        poolKeeper.address,
        keeperJSON.abi
    ).connect(deployer)

    await oracleWrapperInstance.grantRole(
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes(OPERATOR_ROLE)),
        poolKeeper.address
    )

    await poolKeeperInstance.createMarket(MARKET_CODE, ORACLE)

    await poolKeeperInstance.createPool(
        MARKET_CODE, // string memory _marketCode,
        POOL_CODE, // string memory _poolCode,
        5, // uint32 _updateInterval,
        2, // uint32 _frontRunningInterval,
        "0x00000000000000000000000000000000", // bytes16 _fee,
        5, // uint16 _leverageAmount,
        generateRandomAddress(), // address _feeAddress,
        generateRandomAddress() // address _quoteToken
    )
}

module.exports.tags = ["LiveDeploy"]
