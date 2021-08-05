const hre = require("hardhat")

async function main() {
    const { deployments } = hre
    await deployments.fixture(["FullDeployTest"])

    /* TODO add some test trades in here */
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
