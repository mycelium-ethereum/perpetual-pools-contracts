module.exports = async (hre) => {
    const { getNamedAccounts, ethers } = hre
    const { deploy, execute } = deployments
    const { deployer } = await getNamedAccounts()
    const accounts = await ethers.getSigners()

    // used for both keepers and the eth market
    const RinkebyEthUsdOracle = {
        address: "0x5f0423B1a6935dc5596e7A24d98532b67A0AeFd8",
    }
    const RinkebyBtcUsdOracle = {
        address: "0x0c9973e7a27d00e656B9f153348dA46CaD70d03d",
    }
    const MainnetEthUsdOracle = {
        address: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612",
    }
    const MainnetBtcUsdOracle = {
        address: "0x6ce185860a4963106506C203335A2910413708e9",
    }
    const multisigAddress = "0x0f79e82aE88E1318B8cfC8b4A205fE2F982B928A"

    const token = { address: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8" }

    /* deploy testToken */
    /*
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

    */

    // deploy ChainlinkOracleWrapper
    const oracleWrapper = await deploy("BTCChainlinkOracleWrapper", {
        from: deployer,
        log: true,
        contract: "ChainlinkOracleWrapper",
        args: [MainnetBtcUsdOracle.address],
    })

    // const oracleWrapper = { address: "0x57A81f7B72D2703ae7c533F3FB1CdEFa6B8f25F7" }
    // const keeperOracle = { address: "0x4e8E88BD60027aC138323d86d3F9e6b2E035b435"}

    // deploy ChainlinkOracleWrapper for keeper
    const keeperOracle = await deploy("ETHChainlinkOracleWrapper", {
        from: deployer,
        log: true,
        contract: "ChainlinkOracleWrapper",
        args: [MainnetEthUsdOracle.address],
    })

    /* Commented out, because we want to wait till multisig governs pools before doing it for the rest of them
    await execute(
        "BTCChainlinkOracleWrapper",
        {
            from: deployer,
            log: true,
        },
        "transferOwnership",
        multisigAddress
    )
    await execute(
        "ETHChainlinkOracleWrapper",
        {
            from: deployer,
            log: true,
        },
        "transferOwnership",
        multisigAddress
    )
    */

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
        args: [multisigAddress],
    })

    // deploy PoolCommitterDeployer
    // const poolCommitterDeployer = { address: "0xF8FfbE626dB009343ECC69FBCEF0B095007BEF31" }
    // const poolKeeper = { address: "0xf42bb5605277Ffc81fbDb938580bdA86AB7cbbde" }
    // const factory = { address: "0xAAc9f23D2d4AB7D1E28cd8C9e37C8e1Cb4BA9D96" }
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

    /*
    await execute(
        "PoolKeeper",
        {
            from: deployer,
            log: true,
        },
        "transferOwnership",
        multisigAddress
    )
    */

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
    const fee = ethers.utils.parseEther("0.000001142")
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

    const BTC_POOL_CODE = "BTC/USD"
    const ETH_POOL_CODE = "ETH/USD"

    const updateInterval = 3600 // 60 mins
    const frontRunningInterval = 300 // 5 mins
    const oneLeverage = 1
    const threeLeverage = 3
    // USDC precision is 6 decimals
    const minimumCommitSize = 1000 * 10 ** 6
    const maximumCommitQueueLength = 100
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
        minimumCommitSize: minimumCommitSize,
        maximumCommitQueueLength: maximumCommitQueueLength,
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
        minimumCommitSize: minimumCommitSize,
        maximumCommitQueueLength: maximumCommitQueueLength,
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
        minimumCommitSize: minimumCommitSize,
        maximumCommitQueueLength: maximumCommitQueueLength,
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
        minimumCommitSize: minimumCommitSize,
        maximumCommitQueueLength: maximumCommitQueueLength,
    }

    const deploymentData = [
        deploymentData1,
        deploymentData2,
        deploymentData3,
        deploymentData4,
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
        console.log(`Deploy PoolKeeper: ${poolKeeper.address}`)
        console.log(`Deployed TestToken: ${token.address}`)
        console.log(`Deployed OracleWrapper: ${oracleWrapper.address}`)
    }

    /* Commented out, because we want to wait till multisig governs pools before doing it for the rest of them
    await execute(
        "PoolFactory",
        {
            from: deployer,
            log: true,
        },
        "transferOwnership",
        multisigAddress
    )
    */

    await hre.run("verify:verify", {
        address: oracleWrapper.address,
        constructorArguments: [MainnetBtcUsdOracle.address],
    })
    await hre.run("verify:verify", {
        address: keeperOracle.address,
        constructorArguments: [MainnetEthUsdOracle.address],
    })
    await hre.run("verify:verify", {
        address: poolCommitterDeployer.address,
        constructorArguments: [factory.address],
    })
    await hre.run("verify:verify", {
        address: poolKeeper.address,
        constructorArguments: [factory.address],
    })
}

module.exports.tags = ["ArbDeploy"]
