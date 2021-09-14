module.exports = async (hre) => {
    const { getNamedAccounts, ethers } = hre
    const { deploy, execute } = deployments
    const { deployer } = await getNamedAccounts()
    const accounts = await ethers.getSigners()

    // used for both keepers and the eth market
    const RinkebyEthUsdOracle = {"address": "0x5f0423B1a6935dc5596e7A24d98532b67A0AeFd8"}
    const RinkebyBtcUsdOracle = {"address": "0x0c9973e7a27d00e656B9f153348dA46CaD70d03d"}
    const MainnetEthUsdOracle = {"address": "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612"}
    const MainnetBtcUsdOracle = {"address": "0x6ce185860a4963106506C203335A2910413708e9"}
    const multisigAddress = "0x3817E346A0eD30349a853bA422A21DB5d5FE0804"

    /* deploy testToken */
    /*
    const token = await deploy("TestToken", {
        args: ["Test Token", "TST"],
        from: deployer,
        log: true,
        contract: "TestToken",
    })

    // mint some dollar bills
    await execute(
        "TestToken",
        {
            from: deployer,
            log: true,
        },
        "mint",
        ethers.utils.parseEther("10000000"), // 10 mil supply
        accounts[0].address
    )

    // deploy ChainlinkOracleWrapper
    const oracleWrapper = await deploy("ChainlinkOracleWrapper", {
        from: deployer,
        log: true,
        args: [BtcUsdOracle.address],
    })
    */

    // deploy ChainlinkOracleWrapper for keeper
    const keeperOracle = await deploy("ChainlinkOracleWrapper", {
        from: deployer,
        log: true,
        args: [EthUsdOracle.address],
    })

    // deploy PoolSwapLibrary
    const library = await deploy("PoolSwapLibrary", {
        from: deployer,
        log: true,
    })

    // deploy PoolFactory
    const factory = await deploy("PoolFactory", {
        from: deployer,
        log: true,
        libraries: { PoolSwapLibrary: library.address },
        // (fee receiver)
        args: [accounts[0].address],
    })

    // deploy PoolFactory
    const poolCommitterDeployer = await deploy("PoolCommitterDeployer", {
        from: deployer,
        log: true,
        libraries: { PoolSwapLibrary: library.address },
        args: [factory.address],
    })

    // deploy PoolKeeper
    const poolKeeper = await deploy("PoolKeeper", {
        from: deployer,
        log: true,
        libraries: { PoolSwapLibrary: library.address },
        args: [factory.address],
    })

    // Set PoolKeeper
    await execute(
        "PoolFactory",
        {
            from: deployer,
            log: true,
        },
        "setPoolKeeper",
        poolKeeper.address
    )

    console.log("Setting factory fee")
    const fee = "0x00000000000000000000000000000000"
    await execute(
        "PoolFactory",
        {
            from: deployer,
            log: true,
        },
        "setFee",
        fee
    )

    console.log(
        "Setting factory committer deployer",
        poolCommitterDeployer.address
    )
    await execute(
        "PoolFactory",
        {
            from: deployer,
            log: true,
        },
        "setPoolCommitterDeployer",
        poolCommitterDeployer.address
    )

    const POOL_CODE = "BTC-USD"

    const updateInterval = 320 // 5 minute
    const frontRunningInterval = 60 // seconds
    const leverage = 1
    const minimumCommitSize = ethers.utils.parseEther("50")
    const maximumCommitQueueLength = 300

    // deploy LeveragePool
    const deploymentData = {
        poolName: POOL_CODE,
        frontRunningInterval: frontRunningInterval,
        updateInterval: updateInterval,
        leverageAmount: leverage,
        quoteToken: token.address,
        oracleWrapper: oracleWrapper.address,
        settlementEthOracle: keeperOracle.address,
        minimumCommitSize: minimumCommitSize,
        maximumCommitQueueLength: maximumCommitQueueLength,
    }

    const receipt = await execute(
        "PoolFactory",
        {
            from: deployer,
            log: true,
        },
        "deployPool",
        deploymentData
    )

    const event = receipt.events.find((el) => el.event === "DeployPool")

    console.log(`Deployed PoolFactory: ${factory.address}`)
    console.log(`Deployed LeveragedPool: ${event.args.pool}`)
    console.log(`Deploy PoolKeeper: ${poolKeeper.address}`)
    console.log(`Deployed TestToken: ${token.address}`)
    console.log(`Deployed OracleWrapper: ${oracleWrapper.address}`)
}

module.exports.tags = ["ArbDeploy"]
