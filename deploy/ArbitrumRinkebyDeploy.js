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
        args: ["Perpetual USD", "PPUSD"],
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
        accounts[0].address,
        ethers.utils.parseEther("100000000") // 100 mil supply
    )

    //
    const btcOracleWrapper = await deploy("BtcUsdOracleWrapper", {
        from: deployer,
        log: true,
        contract: "ChainlinkOracleWrapper",
        args: [arbitrumRinkBtcUsdOracle.address, deployer],
    })

    // deploy ChainlinkOracleWrapper for keeper
    const ethOracleWrapper = await deploy("EthUsdOracleWrapper", {
        from: deployer,
        log: true,
        contract: "ChainlinkOracleWrapper",
        args: [arbitrumRinkEthUsdOracle.address, deployer],
    })

    // deploy PoolSwapLibrary
    const library = await deploy("PoolSwapLibrary", {
        from: deployer,
        log: true,
    })

    // deploy CalldataLogic
    const calldataLogic = await deploy("CalldataLogic", {
        from: deployer,
        log: true,
    })

    // deploy PoolFactory
    const factory = await deploy("PoolFactory", {
        from: deployer,
        log: true,
        libraries: { PoolSwapLibrary: library.address },
        // (fee receiver)
        args: [deployer, deployer],
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
        libraries: { PoolSwapLibrary: library.address },
        args: [factory.address],
    })

    // deploy keeper rewards
    const keeperRewards = await deploy("KeeperRewards", {
        from: deployer,
        log: true,
        libraries: { CalldataLogic: calldataLogic.address },
        args: [poolKeeper.address],
    })

    // set keeper rewards
    await execute(
        "PoolKeeper",
        {
            from: deployer,
            log: true,
        },
        "setKeeperRewards",
        keeperRewards.address
    )

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

    await execute(
        "PoolFactory",
        {
            from: deployer,
            log: true,
        },
        "setInvariantCheck",
        invariantCheck.address
    )

    const BTC_POOL_CODE = "BTC/USD"
    const ETH_POOL_CODE = "ETH/USD"

    const mintingFee = ethers.utils.parseEther("0.015")
    const burningFee = ethers.utils.parseEther("0.015")
    // const updateInterval = 3600 // 60 mins
    // const frontRunningInterval = 300 // 5 mins
    const updateInterval = 300 // 5 mins
    const frontRunningInterval = 2400 // 30 seconds
    const oneLeverage = 1
    const threeLeverage = 3

    // deploy ETH SMA Oracle
    const ethSmaOracleWrapper = await deploy("EthUsdSMAOracle", {
        from: deployer,
        log: true,
        contract: "SMAOracle",
        args: [
            ethOracleWrapper.address, //Oracle Address
            24, // number of periods
            300, // Update interval
            deployer, // deployer address
        ],
    })

    // Poll so there is an initial price
    await execute(
        "EthUsdSMAOracle",
        {
            from: deployer,
            log: true,
        },
        "poll"
    )

    // deploy BTC SMA Oracle
    // Note: if SMA oracle is not 24 periods you can't deploy oracle and pool in one go. Will need to wait until SMA oracle has enough periods before deploying pool.
    const btcSmaOracleWrapper = await deploy("BtcUsdSMAOracle", {
        from: deployer,
        log: true,
        contract: "SMAOracle",
        args: [
            btcOracleWrapper.address, //Oracle Address
            24, // number of periods
            300, // Update interval
            deployer, // deployer address
        ],
    })

    // Poll so there is an initial price
    await execute(
        "BtcUsdSMAOracle",
        {
            from: deployer,
            log: true,
        },
        "poll"
    )

    // deploy pools

    // ETH-USD 1x
    const deploymentData1 = {
        poolName: ETH_POOL_CODE,
        frontRunningInterval: frontRunningInterval,
        updateInterval: updateInterval,
        leverageAmount: oneLeverage,
        settlementToken: token.address,
        oracleWrapper: ethSmaOracleWrapper.address,
        settlementEthOracle: ethOracleWrapper.address,
        feeController: deployer,
        mintingFee,
        burningFee,
        changeInterval: "0",
    }

    // ETH-USD 3x
    const deploymentData2 = {
        poolName: ETH_POOL_CODE,
        frontRunningInterval: frontRunningInterval,
        updateInterval: updateInterval,
        leverageAmount: threeLeverage,
        settlementToken: token.address,
        oracleWrapper: ethSmaOracleWrapper.address,
        settlementEthOracle: ethOracleWrapper.address,
        feeController: deployer,
        mintingFee,
        burningFee,
        changeInterval: "0",
    }

    // BTC-USD 1x
    const deploymentData3 = {
        poolName: BTC_POOL_CODE,
        frontRunningInterval: frontRunningInterval,
        updateInterval: updateInterval,
        leverageAmount: oneLeverage,
        settlementToken: token.address,
        oracleWrapper: btcSmaOracleWrapper.address,
        settlementEthOracle: ethOracleWrapper.address,
        feeController: deployer,
        mintingFee,
        burningFee,
        changeInterval: "0",
    }

    // BTC-USD 3x
    const deploymentData4 = {
        poolName: BTC_POOL_CODE,
        frontRunningInterval: frontRunningInterval,
        updateInterval: updateInterval,
        leverageAmount: threeLeverage,
        settlementToken: token.address,
        oracleWrapper: btcSmaOracleWrapper.address,
        settlementEthOracle: ethOracleWrapper.address,
        feeController: deployer,
        mintingFee,
        burningFee,
        changeInterval: "0",
    }

    const deploymentData = [
        deploymentData1,
        deploymentData2,
        deploymentData3,
        deploymentData4,
    ]

    console.log(`Deployed PoolFactory: ${factory.address}`)
    console.log(`Deployed PoolSwapLibrary: ${library.address}`)
    console.log(`Deploy PoolKeeper: ${poolKeeper.address}`)
    console.log(`Deployed TestToken: ${token.address}`)
    // console.log(`Deployed OracleWrapper: ${oracleWrapper.address}`)
    // console.log(`Deploy PoolKeeper: ${poolKeeper.address}`)
    for (var i = 0; i < deploymentData.length; i++) {
        let receipt = await execute(
            "PoolFactory",
            {
                from: deployer,
                log: true,
                gasLimit: 10000000,
            },
            "deployPool",
            deploymentData[i]
        )
        const event = receipt.events.find((el) => el.event === "DeployPool")

        console.log(`Deployed LeveragedPool: ${event.args.pool}`)
        console.log(`Deployed PoolCommitter: ${event.args.poolCommitter}`)
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
