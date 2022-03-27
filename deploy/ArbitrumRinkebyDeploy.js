module.exports = async (hre) => {
    const { getNamedAccounts, ethers } = hre
    const { deploy, execute } = deployments
    const { deployer } = await getNamedAccounts()
    const accounts = await ethers.getSigners()

    const arbitrumRinkEthUsdOracle = {
        address: "0x5f0423B1a6935dc5596e7A24d98532b67A0AeFd8",
    }
    const arbitrumRinkBtcUsdOracle = {
        address: "0x0c9973e7a27d00e656B9f153348dA46CaD70d03d",
    }

    /* deploy testToken */
    const token = await deploy("TestToken", {
        args: ["Test Tracer USDC", "TUSDC"],
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
    const oracleWrapper = await deploy("BtcUsdOracleWrapper", {
        from: deployer,
        log: true,
        contract: "ChainlinkOracleWrapper",
        args: [arbitrumRinkBtcUsdOracle.address, deployer],
    })

    // deploy ChainlinkOracleWrapper for keeper
    const keeperOracle = await deploy("ETHChainlinkOracleWrapper", {
        from: deployer,
        log: true,
        contract: "ChainlinkOracleWrapper",
        args: [arbitrumRinkEthUsdOracle.address, deployer],
    })

    // deploy SMA PriceObserver
    const priceObserver = await deploy("EthUsdPriceObserver", {
        from: deployer,
        log: true,
        contract: "PriceObserver",
    })

    // deploy SMA Oracle
    // Note: if SMA oracle is not 24 periods you can't deploy oracle and pool in one go. Will need to wait until SMA oracle has enough periods before deploying pool.
    const smaOracleWrapper = await deploy("EthUsdPriceSMAOracle", {
        from: deployer,
        log: true,
        contract: "SMAOracle",
        args: [
            keeperOracle.address, //Oracle Address
            8, //Spot decimals
            priceObserver.address, //Observer address
            24, // number of periods
            3600, // Update interval
            deployer, // deployer address
        ],
    })

    // Set Writer on Price Observer to SMA Oracle
    await execute(
        "EthUsdPriceObserver",
        {
            from: deployer,
            log: true,
        },
        "setWriter",
        smaOracleWrapper.address
    )

    // Poll so there is an initial price
    await execute(
        "EthUsdPriceSMAOracle",
        {
            from: deployer,
            log: true,
        },
        "poll"
    )

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
        args: [deployer],
    })

    // deploy InvariantCheck
    const invariantCheck = await deploy("InvariantCheck", {
        from: deployer,
        log: true,
        args: [factory.address],
    })

    // deploy Autoclaim
    const autoClaim = await deploy("AutoClaim", {
        from: deployer,
        log: true,
        args: [factory.address],
    })

    // deploy PoolKeeper
    const poolKeeper = await deploy("PoolKeeper", {
        from: deployer,
        log: true,
        args: [factory.address],
    })

    // deploy KeeperRewards
    const keeperReward = await deploy("KeeperRewards", {
        from: deployer,
        log: true,
        libraries: { PoolSwapLibrary: library.address },
        args: [poolKeeper.address],
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

    // Set Autoclaim
    await execute(
        "PoolFactory",
        {
            from: deployer,
            log: true,
        },
        "setAutoClaim",
        autoClaim.address
    )

    console.log("Setting factory fee")
    const fee = ethers.utils.parseEther("0.01")
    await execute(
        "PoolFactory",
        {
            from: deployer,
            log: true,
        },
        "setFee",
        fee
    )

    const BTC_POOL_CODE = "BTC/USD"
    const ETH_POOL_CODE = "ETH/USD"

    const updateInterval = 3600 // 60 mins
    const frontRunningInterval = 300 // 5 mins
    const oneLeverage = 1
    const threeLeverage = 3
    // deploy LeveragePool
    // BTC-USD 1x
    const deploymentData1 = {
        poolName: BTC_POOL_CODE,
        frontRunningInterval: frontRunningInterval,
        updateInterval: updateInterval,
        leverageAmount: oneLeverage,
        quoteToken: token.address,
        oracleWrapper: oracleWrapper.address,
        settlementEthOracle: keeperOracle.address,
        invariantCheckContract: invariantCheck.address,
    }

    // BTC-USD 3x
    const deploymentData2 = {
        poolName: BTC_POOL_CODE,
        frontRunningInterval: frontRunningInterval,
        updateInterval: updateInterval,
        leverageAmount: threeLeverage,
        quoteToken: token.address,
        oracleWrapper: oracleWrapper.address,
        settlementEthOracle: keeperOracle.address,
        invariantCheckContract: invariantCheck.address,
    }

    // ETH-USD 1x
    const deploymentData3 = {
        poolName: ETH_POOL_CODE,
        frontRunningInterval: frontRunningInterval,
        updateInterval: updateInterval,
        leverageAmount: oneLeverage,
        quoteToken: token.address,
        oracleWrapper: keeperOracle.address,
        settlementEthOracle: keeperOracle.address,
        invariantCheckContract: invariantCheck.address,
    }

    // ETH-USD 3x
    const deploymentData4 = {
        poolName: ETH_POOL_CODE,
        frontRunningInterval: frontRunningInterval,
        updateInterval: updateInterval,
        leverageAmount: threeLeverage,
        quoteToken: token.address,
        oracleWrapper: keeperOracle.address,
        settlementEthOracle: keeperOracle.address,
        invariantCheckContract: invariantCheck.address,
    }

    // Eth-USD 3x SMA Oracle
    const deploymentData5 = {
        poolName: ETH_POOL_CODE,
        frontRunningInterval: frontRunningInterval,
        updateInterval: updateInterval,
        leverageAmount: threeLeverage,
        quoteToken: token.address,
        oracleWrapper: smaOracleWrapper.address,
        settlementEthOracle: keeperOracle.address,
        invariantCheckContract: invariantCheck.address,
    }

    const deploymentData = [
        deploymentData1,
        deploymentData2,
        deploymentData3,
        deploymentData4,
        deploymentData5,
    ]

    // console.log(`Deploy PoolKeeper: ${poolKeeper.address}`)
    for (var i = 0; i < deploymentData.length; i++) {
        let receipt = await execute(
            "PoolFactory",
            {
                from: deployer,
                log: true,
            },
            "deployPool",
            deploymentData[i]
        )
        const event = receipt.events.find((el) => el.event === "DeployPool")

        console.log(`Deployed PoolFactory: ${factory.address}`)
        console.log(`Deployed LeveragedPool: ${event.args.pool}`)
        console.log(`Deployed PoolCommitter: ${event.args.poolCommitter}`)
        console.log(`Deploy PoolKeeper: ${poolKeeper.address}`)
        console.log(`Deployed TestToken: ${token.address}`)
        console.log(`Deployed OracleWrapper: ${oracleWrapper.address}`)
    }

    // Commented out because if fails if already verified. Need to only do it once or modify to not failed if already verified
    // await hre.run("verify:verify", {
    //     address: oracleWrapper.address,
    //     constructorArguments: [arbitrumRinkBtcUsdOracle.address, deployer],
    // })
    // await hre.run("verify:verify", {
    //     address: keeperOracle.address,
    //     constructorArguments: [arbitrumRinkEthUsdOracle.address, deployer],
    // })
    // await hre.run("verify:verify", {
    //     address: poolKeeper.address,
    //     constructorArguments: [factory.address],
    // })
}

module.exports.tags = ["ArbRinkebyDeploy"]
