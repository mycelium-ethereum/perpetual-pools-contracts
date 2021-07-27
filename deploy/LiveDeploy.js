module.exports = async (hre) => {
    const { deployments, getNamedAccounts, ethers } = hre
    const { deploy, execute } = deployments
    const { deployer } = await getNamedAccounts()
    const signers = await ethers.getSigners()

    console.log("Using deployer: " + deployer)
    
    /* deploy PoolSwapLibrary */
    let poolSwapLibrary = await deploy("PoolSwapLibrary", {
        from: deployer,
        log: true
    });

    /* deploy PoolFactory */
    let poolFactory = await deploy("PoolFactory", {
        from: deployer,
        log: true,
        libraries: {
            PoolSwapLibrary: poolSwapLibrary.address,
        }
    });

    /* deploy OracleWrapper */
    let oracleWrapper = await deploy("OracleWrapper", {
        from: deployer,
        log: true,
        libraries: {
            PoolSwapLibrary: poolSwapLibrary.address,
        }
    });
    
    /* deploy PoolKeeper */
    let poolKeeper = await deploy("PoolKeeper", {
        from: deployer,
        log: true,
        args: [
            oracleWrapper.address,
            poolFactory.address
        ],
        libraries: {
            PoolSwapLibrary: poolSwapLibrary.address,
        }
    });

    /* TODO: call for pool deployment */
    /* TODO: oracle setup */
}

module.exports.tags = ["LiveDeploy"]
