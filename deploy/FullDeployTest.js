module.exports = async (hre) => {
    const { getNamedAccounts, ethers } = hre
    const { deploy, execute } = deployments
    const { deployer } = await getNamedAccounts()
    const [_deployer, ...accounts] = await ethers.getSigners()

    console.log("Using deployer: " + deployer)

    /* deploy TestOracle */
    const chainlinkOracle = await deploy("TestChainlinkOracle", {
        from: deployer,
        log: true,
    })

    /* deploy testToken */
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
        deployer
    )
    // send 1000 to first 3 accounts
    await execute(
        "TestToken",
        {
            from: deployer,
            log: true,
        },
        "transfer",
        accounts[0].address,
        ethers.utils.parseEther("1000")
    )
    await execute(
        "TestToken",
        {
            from: deployer,
            log: true,
        },
        "transfer",
        accounts[1].address,
        ethers.utils.parseEther("1000")
    )
    await execute(
        "TestToken",
        {
            from: deployer,
            log: true,
        },
        "transfer",
        accounts[2].address,
        ethers.utils.parseEther("1000")
    )

    /* deploy TestOracleWrapper */
    const oracleWrapper = await deploy("TestOracleWrapper", {
        from: deployer,
        log: true,
        args: [chainlinkOracle.address],
    })
    /* deploy TestOracleWrapper for keeper */
    const keeperOracle = await deploy("TestOracleWrapper", {
        from: deployer,
        log: true,
        args: [chainlinkOracle.address],
    })

    /* deploy PoolSwapLibrary */
    const library = await deploy("PoolSwapLibrary", {
        from: deployer,
        log: true,
    })

    /* deploy PoolFactory */
    const factory = await deploy("PoolFactory", {
        from: deployer,
        log: true,
        libraries: { PoolSwapLibrary: library.address },
        // (fee receiver)
        args: [deployer],
    })

    /* deploy PoolFactory */
    const poolCommitterDeployer = await deploy("PoolCommitterDeployer", {
        from: deployer,
        log: true,
        libraries: { PoolSwapLibrary: library.address },
        args: [factory.address],
    })

    /* deploy PoolKeeper */
    const poolKeeper = await deploy("PoolKeeper", {
        from: deployer,
        log: true,
        args: [factory.address],
    })

    /* Set PoolKeeper*/
    await execute(
        "PoolFactory",
        {
            from: deployer,
            log: true,
        },
        "setPoolKeeper",
        poolKeeper.address
    )

    const POOL_CODE = "tETH"

    const updateInterval = 60 // 1 minute
    const frontRunningInterval = 1 // seconds
    const leverage = 1

    /* deploy LeveragePool */
    const deploymentData = {
        poolName: POOL_CODE,
        frontRunningInterval: frontRunningInterval,
        updateInterval: updateInterval,
        leverageAmount: leverage,
        quoteToken: token.address,
        oracleWrapper: oracleWrapper.address,
        keeperOracle: keeperOracle.address,
    }

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

    const receipt = await execute(
        "PoolFactory",
        {
            from: deployer,
            log: true,
        },
        "deployPool",
        deploymentData
    )

    const event = receipt?.events?.find((el) => el.event === "DeployPool")

    console.log(`Deployed PoolFactory: ${factory.address}`)
    console.log(`Deployed LeveragedPool: ${event.args.pool}`)
    console.log(`Deploy PoolKeeper: ${poolKeeper.address}`)
    console.log(`Deployed TestToken: ${token.address}`)
    console.log(`Deployed TestOracle: ${chainlinkOracle.address}`)
    console.log(`Deployed OracleWrapper: ${oracleWrapper.address}`)
}

module.exports.tags = ["FullDeployTest"]
