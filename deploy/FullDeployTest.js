module.exports = async (hre) => {
    const { getNamedAccounts, ethers } = hre
    const { deploy, execute } = deployments
    const { deployer } = await getNamedAccounts()
    const accounts = await ethers.getSigners()

    /* deploy TestOracle */
    const chainlinkOracle = await deploy("DerivativeOracle", {
        contract: "TestChainlinkOracle",
        from: deployer,
        log: true,
    })

    const settlementEthOracle = await deploy("SettlementEthOracle", {
        contract: "TestChainlinkOracle",
        from: deployer,
        log: true,
    })

    await execute(
        "SettlementEthOracle",
        {
            from: deployer,
            log: true,
        },
        "setPrice",
        3000 * 10 ** 8
    )

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
        accounts[0].address
    )

    /* deploy ChainlinkOracleWrapper */
    const oracleWrapper = await deploy("ChainlinkOracleWrapper", {
        from: deployer,
        log: true,
        args: [chainlinkOracle.address],
    })
    /* deploy ChainlinkOracleWrapper for keeper */
    const keeperOracle = await deploy("ChainlinkOracleWrapper", {
        from: deployer,
        log: true,
        args: [settlementEthOracle.address],
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
        // (fee receiver, pool Keeper, auto Claim)
        args: [accounts[0].address, factory.address, factory.address],
    })

    // /* deploy PoolKeeper */
    // const poolKeeper = await deploy("PoolKeeper", {
    //     from: deployer,
    //     log: true,
    //     libraries: { PoolSwapLibrary: library.address },
    //     args: [factory.address],
    // })

    /* Set PoolKeeper*/
    // await execute(
    //     "PoolFactory",
    //     {
    //         from: deployer,
    //         log: true,
    //     },
    //     "setPoolKeeper",
    //     poolKeeper.address
    // )

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

    const POOL_CODE = "tETH"

    const updateInterval = 3600 // 1 hour
    const frontRunningInterval = 60 // seconds
    const leverage = 1

    /* deploy LeveragePool */
    const deploymentData = {
        poolName: POOL_CODE,
        frontRunningInterval: frontRunningInterval,
        updateInterval: updateInterval,
        leverageAmount: leverage,
        quoteToken: token.address,
        oracleWrapper: oracleWrapper.address,
        settlementEthOracle: keeperOracle.address,
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
    // console.log(`Deploy PoolKeeper: ${poolKeeper.address}`)
    console.log(`Deployed TestToken: ${token.address}`)
    console.log(`Deployed TestOracle: ${chainlinkOracle.address}`)
    console.log(`Deployed OracleWrapper: ${oracleWrapper.address}`)
}

module.exports.tags = ["FullDeployTest"]
