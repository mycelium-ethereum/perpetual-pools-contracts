const { OPERATOR_ROLE, POOL_CODE } = require("../test/constants");
const { generateRandomAddress } = require("../test/utilities");

module.exports = async (hre) => {
    const { getNamedAccounts, ethers } = hre
    const { deploy, execute } = deployments
    const { deployer } = await getNamedAccounts()
    const signers = await ethers.getSigners()

    console.log("Using deployer: " + deployer)

    /* deploy TestOracle */
    const chainlinkOracle = await deploy("TestChainlinkOracle", {
        from: deployer,
        log: true
    })

    /* deploy TestOracleWrapper */
    const oracleWrapper = await deploy("TestOracleWrapper",
        {
            from: deployer,
            log: true,
            args: [chainlinkOracle.address]
        }
    )

    /* deploy PoolSwapLibrary */
    const library = await deploy("PoolSwapLibrary", {
        from: deployer,
        log: true
    })

    /* deploy PoolFactory */
    const factory = await deploy("PoolFactory", {
        from: deployer,
        log: true,
        libraries: { PoolSwapLibrary: library.address },
    })

    /* deploy PoolKeeper */
    const poolKeeper = await deploy("PoolKeeper", 
        {
            from: deployer,
            log: true,
            args: [factory.address]
        }
    )

    /* Grant roles to oracleWrapper */
    await execute(
        "TestOracleWrapper",
        {
            from: deployer,
            log: true,
        },
        "grantRole",
        ethers.utils.keccak256(ethers.utils.toUtf8Bytes(OPERATOR_ROLE)),
        poolKeeper.address
    )

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

    /* deploy LeveragePool */
    const deploymentData = {
        owner: poolKeeper.address,
        poolCode: POOL_CODE,
        frontRunningInterval: 5,
        updateInterval: 10,
        fee: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5],
        leverageAmount: 5,
        feeAddress: generateRandomAddress(),
        quoteToken: generateRandomAddress(),
        oracleWrapper: oracleWrapper.address,
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
    const event = receipt?.events?.find((el) => el.event === "DeployPool")

    console.log(`Deployed PoolFactory: ${factory.address}`)
    console.log(`Deployed LeveragedPool: ${event.address}`)
    console.log(`Deploy Poolkeeper: ${poolKeeper.address}`)
    console.log(`Deployed TestOracle: ${chainlinkOracle.address}`)
    console.log(`Deployed OracleWrapper: ${oracleWrapper.address}`)
}

module.exports.tags = ["FullDeployTest"]
