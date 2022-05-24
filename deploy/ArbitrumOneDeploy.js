module.exports = async (hre) => {
    const { getNamedAccounts, ethers } = hre
    const { deploy, execute } = deployments
    const { deployer } = await getNamedAccounts()
    const accounts = await ethers.getSigners()

    const BTC_POOL_CODE = "BTC/USD+USDC"
    const ETH_POOL_CODE = "ETH/USD+USDC"

    const DEPLOY_POOL_GAS_LIMIT = 10000000

    const POOL_DEFAULT_MINTING_FEE = ethers.utils.parseEther("0.01")
    const POOL_DEFAULT_BURNING_FEE = ethers.utils.parseEther("0")
    const POOL_DEFAULT_FRONT_RUNNING_INTERVAL = 60 * 60 * 8 // 8 hours
    const POOL_DEFAULT_UPDATE_INTERVAL = 60 * 60 // 1 hour
    const POOL_DEFAULT_CHANGE_INTERVAL = "0"

    const THREE_LEVERAGE = 3

    const SMA_DEFAULT_PERIODS = 8
    const SMA_DEFAULT_UPDATE_INTERVAL = 60 * 60 // 1 hour

    const USDC_ADDRESS = "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8"
    const DEV_MULTISIG_ADDRESS = "0x0f79e82aE88E1318B8cfC8b4A205fE2F982B928A"

    const arbitrumRinkEthUsdOracle = {
        address: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612",
    }
    const arbitrumRinkBtcUsdOracle = {
        address: "0x6ce185860a4963106506C203335A2910413708e9",
    }

    // base btc usd oracle wrapper
    const btcOracleWrapper = await deploy("BtcUsdOracleWrapper", {
        from: deployer,
        log: true,
        contract: "ChainlinkOracleWrapper",
        args: [arbitrumRinkBtcUsdOracle.address, deployer],
    })

    // base eth usd oracle wrapper
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

    // deploy L2Encoder
    const l2Encoder = await deploy("L2Encoder", {
        from: deployer,
        log: true,
    })

    // deploy PoolFactory
    const factory = await deploy("PoolFactory", {
        from: deployer,
        log: true,
        libraries: { PoolSwapLibrary: library.address },
        gasLimit: 100000000,
        // (fee receiver, governance)
        args: [DEV_MULTISIG_ADDRESS, deployer],
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
        gasLimit: 100000000,
        libraries: { PoolSwapLibrary: library.address },
        args: [poolKeeper.address],
    })

    // set keeper rewards
    await execute(
        "PoolKeeper",
        {
            from: deployer,
            gasLimit: 100000000,
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
            gasLimit: 100000000,
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
            gasLimit: 100000000,
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
            gasLimit: 100000000,
            log: true,
        },
        "setFee",
        fee
    )

    await execute(
        "PoolFactory",
        {
            from: deployer,
            gasLimit: 100000000,
            log: true,
        },
        "setInvariantCheck",
        invariantCheck.address
    )

    // deploy ETH SMA Oracle
    const ethSmaOracleWrapper = await deploy("EthUsdSMAOracle", {
        from: deployer,
        log: true,
        gasLimit: 1000000000,
        contract: "SMAOracle",
        args: [
            ethOracleWrapper.address, //Oracle Address
            SMA_DEFAULT_PERIODS, // number of periods
            SMA_DEFAULT_UPDATE_INTERVAL, // Update interval
            deployer, // deployer address
            deployer,
            deployer
        ],
    })

    // Poll so there is an initial price
    await execute(
        "EthUsdSMAOracle",
        {
            from: deployer,
            gasLimit: 100000000,
            log: true,
        },
        "poll"
    )

    // set the SMA poolkeeper to the actual pool keeper after the initial poll
    await execute(
        "EthUsdSMAOracle",
        {
            from: deployer,
            gasLimit: 100000000,
            log: true,
        },
        "setPoolKeeper",
        poolKeeper.address
    )


    const btcSmaOracleWrapper = await deploy("BtcUsdSMAOracle", {
        from: deployer,
        log: true,
        gasLimit: 1000000000,
        contract: "SMAOracle",
        args: [
            btcOracleWrapper.address, //Oracle Address
            SMA_DEFAULT_PERIODS, // number of periods
            SMA_DEFAULT_UPDATE_INTERVAL, // Update interval
            deployer, // deployer address
            deployer,
            deployer
        ],
    })

    // Poll so there is an initial price
    await execute(
        "BtcUsdSMAOracle",
        {
            from: deployer,
            gasLimit: 100000000,
            log: true,
        },
        "poll"
    )

    // set the SMA poolkeeper to the actual pool keeper after the initial poll
    await execute(
        "BtcUsdSMAOracle",
        {
            from: deployer,
            gasLimit: 100000000,
            log: true,
        },
        "setPoolKeeper",
        poolKeeper.address
    )


    // deploy pools

    // ETH-USD 3x
    const ethUsd3 = {
        poolName: ETH_POOL_CODE,
        frontRunningInterval: POOL_DEFAULT_FRONT_RUNNING_INTERVAL,
        updateInterval: POOL_DEFAULT_UPDATE_INTERVAL,
        leverageAmount: THREE_LEVERAGE,
        settlementToken: USDC_ADDRESS,
        oracleWrapper: ethSmaOracleWrapper.address,
        settlementEthOracle: ethOracleWrapper.address,
        feeController: deployer,
        mintingFee: POOL_DEFAULT_MINTING_FEE,
        burningFee: POOL_DEFAULT_BURNING_FEE,
        changeInterval: POOL_DEFAULT_CHANGE_INTERVAL,
    }

    // BTC-USD 3x
    const btcUsd3 = {
        poolName: BTC_POOL_CODE,
        frontRunningInterval: POOL_DEFAULT_FRONT_RUNNING_INTERVAL,
        updateInterval: POOL_DEFAULT_UPDATE_INTERVAL,
        leverageAmount: THREE_LEVERAGE,
        settlementToken: USDC_ADDRESS,
        oracleWrapper: btcSmaOracleWrapper.address,
        settlementEthOracle: ethOracleWrapper.address,
        feeController: deployer,
        mintingFee: POOL_DEFAULT_MINTING_FEE,
        burningFee: POOL_DEFAULT_BURNING_FEE,
        changeInterval: POOL_DEFAULT_CHANGE_INTERVAL,
    }

    const deploymentData = [
        ethUsd3,
        btcUsd3
    ]

    console.log(`Deployed TestToken: ${USDC_ADDRESS}`)
    console.log(`Deployed PoolFactory: ${factory.address}`)
    console.log(`Deployed PoolSwapLibrary: ${library.address}`)
    console.log(`Deployed CalldataLogic: ${calldataLogic.address}`)
    console.log(`Deployed L2Encoder: ${l2Encoder.address}`)
    console.log(`Deployed PoolKeeper: ${poolKeeper.address}`)

    for (var i = 0; i < deploymentData.length; i++) {
        let receipt = await execute(
            "PoolFactory",
            {
                from: deployer,
                log: true,
                gasLimit: DEPLOY_POOL_GAS_LIMIT,
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

module.exports.tags = ["ArbitrumOneDeploy"]