import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import PoolToken from "../../artifacts/contracts/implementation/PoolToken.sol/PoolToken.json"
import LeveragedPool from "../../artifacts/contracts/implementation/LeveragedPool.sol/LeveragedPool.json"
import {
    PoolFactory,
    PoolFactory__factory,
    PoolSwapLibrary__factory,
} from "../../types"
import { generateRandomAddress } from "../utilities"

chai.use(chaiAsPromised)
const { expect } = chai
describe("PoolFactory - Basic functions", () => {
    let factory: PoolFactory
    before(async () => {
        const signers = await ethers.getSigners()

        const libraryFactory = (await ethers.getContractFactory(
            "PoolSwapLibrary",
            signers[0]
        )) as PoolSwapLibrary__factory
        const library = await libraryFactory.deploy()
        await library.deployed()

        const PoolFactory = (await ethers.getContractFactory("PoolFactory", {
            signer: signers[0],
            libraries: { PoolSwapLibrary: library.address },
        })) as PoolFactory__factory
        let feeAddress = await generateRandomAddress()
        factory = await (await PoolFactory.deploy(feeAddress)).deployed()
    })

    it("should deploy a base pool contract to clone from", async () => {
        expect(await factory.poolBase()).to.not.eq(ethers.constants.AddressZero)
    })
    it("should deploy a base pair token to clone from", async () => {
        expect(await factory.pairTokenBase()).to.not.eq(
            ethers.constants.AddressZero
        )
    })
    it("should initialize the base pool", async () => {
        const pool = new ethers.Contract(
            await factory.poolBase(),
            PoolToken.abi,
            (await ethers.getSigners())[0]
        )

        await expect(pool.initialize()).to.be.rejectedWith(Error)
    })
    it("should initialize the base token", async () => {
        const pair = new ethers.Contract(
            await factory.pairTokenBase(),
            LeveragedPool.abi,
            (await ethers.getSigners())[0]
        )
        await expect(pair.initialize()).to.be.rejectedWith(Error)
    })
    it("should not let the yearly fee be greater than 10%", async () => {
        await expect(
            factory.setFee(ethers.utils.parseEther("0.5"))
        ).to.be.revertedWith("Fee cannot be >10%")
    })
    it("should let the yearly fee be less than 10%", async () => {
        await expect(factory.setFee(ethers.utils.parseEther("0.1")))
    })
})
