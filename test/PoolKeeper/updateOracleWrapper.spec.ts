import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    PoolKeeper__factory,
    PoolKeeper,
    PoolSwapLibrary__factory,
    PoolFactory__factory,
} from "../../typechain"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { OPERATOR_ROLE, ADMIN_ROLE } from "../constants"
import { generateRandomAddress } from "../utilities"

chai.use(chaiAsPromised)
const { expect } = chai

describe("PoolKeeper - updateOracleWrapper", () => {
    let poolKeeper: PoolKeeper
    let signers: SignerWithAddress[]
    const oracleWrapper = generateRandomAddress()
    beforeEach(async () => {
        // Deploy the contracts
        signers = await ethers.getSigners()

        const libraryFactory = (await ethers.getContractFactory(
            "PoolSwapLibrary",
            signers[0]
        )) as PoolSwapLibrary__factory
        const library = await libraryFactory.deploy()
        await library.deployed()
        const poolKeeperFactory = (await ethers.getContractFactory(
            "PoolKeeper",
            {
                signer: signers[0],
            }
        )) as PoolKeeper__factory
        const PoolFactory = (await ethers.getContractFactory("PoolFactory", {
            signer: signers[0],
            libraries: { PoolSwapLibrary: library.address },
        })) as PoolFactory__factory
        const factory = await (await PoolFactory.deploy()).deployed()
        poolKeeper = await poolKeeperFactory.deploy(
            oracleWrapper,
            factory.address
        )
        await poolKeeper.deployed()

        // Sanity check the deployment
        expect(
            await poolKeeper.hasRole(
                ethers.utils.keccak256(ethers.utils.toUtf8Bytes(ADMIN_ROLE)),
                signers[0].address
            )
        ).to.eq(true)
    })

    it("should allow an authorized user to update the oracle wrapper", async () => {
        expect(await poolKeeper.oracleWrapper()).to.eq(oracleWrapper)
        const address = generateRandomAddress()
        await poolKeeper.updateOracleWrapper(address)
        expect(await poolKeeper.oracleWrapper()).to.eq(address)
    })
    it("should prevent an unauthorized user from updating the oracle wrapper", async () => {
        expect(await poolKeeper.oracleWrapper()).to.eq(oracleWrapper)
        const address = generateRandomAddress()
        await expect(
            poolKeeper.connect(signers[1]).updateOracleWrapper(address)
        ).to.be.rejectedWith(Error)
    })
    it("should prevent setting an oracle to the null address", async () => {
        await expect(
            poolKeeper.updateOracleWrapper(ethers.constants.AddressZero)
        ).to.be.rejectedWith(Error)
    })
})
