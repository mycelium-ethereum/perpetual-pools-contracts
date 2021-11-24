import { ethers } from "hardhat"
import chai from "chai"
import chaiAsPromised from "chai-as-promised"
import {
    LeveragedPool,
    PoolFactory,
    TestToken,
    PoolKeeper,
    ChainlinkOracleWrapper,
    PoolToken__factory,
    TestToken__factory,
    TestClones,
    TestClones__factory,
} from "../../types"
import { POOL_CODE, POOL_CODE_2 } from "../constants"
import {
    deployPoolAndTokenContracts,
    generateRandomAddress,
    getEventArgs,
} from "../utilities"
import { Signer } from "ethers"
import LeveragedPoolInterface from "../../artifacts/contracts/implementation/LeveragedPool.sol/LeveragedPool.json"
import { deflateRaw } from "zlib"

const updateInterval = 100
const frontRunningInterval = 20
const fee = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5]
const leverage = 1
const feeAddress = generateRandomAddress()

chai.use(chaiAsPromised)
const { expect } = chai
describe("PoolFactory.deployPool", () => {
    let factory: PoolFactory
    let poolKeeper: PoolKeeper
    let oracleWrapper: ChainlinkOracleWrapper
    let settlementEthOracle: ChainlinkOracleWrapper
    let pool: LeveragedPool
    let token: TestToken
    let signers: Signer[]
    let nonDAO: Signer

    before(async () => {
        signers = await ethers.getSigners()
        nonDAO = signers[1]

        const contracts = await deployPoolAndTokenContracts(
            POOL_CODE,
            frontRunningInterval,
            updateInterval,
            leverage,
            feeAddress,
            fee
        )
        factory = contracts.factory
        poolKeeper = contracts.poolKeeper
        oracleWrapper = contracts.oracleWrapper
        settlementEthOracle = contracts.settlementEthOracle
        pool = contracts.pool
        token = contracts.token
    })

    context(
        "When not called by the owner of the oracle wrapper and with valid parameters",
        async () => {
            it("Reverts", async () => {
                const deploymentParameters = {
                    poolName: POOL_CODE,
                    frontRunningInterval: 5,
                    updateInterval: 10,
                    fee: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5],
                    leverageAmount: 5,
                    quoteToken: token.address,
                    oracleWrapper: oracleWrapper.address,
                    settlementEthOracle: settlementEthOracle.address,
                }

                await expect(
                    factory.connect(nonDAO).deployPool(deploymentParameters)
                ).to.be.rejectedWith("Deployer must be oracle wrapper owner")
            })
        }
    )

    context("When called by the DAO and with valid parameters", async () => {
        it("should deploy a minimal clone", async () => {
            expect(await pool.poolName()).to.eq(`${leverage}-${POOL_CODE}`)
        })
        it("should initialize the clone", async () => {
            const initialization = {
                _owner: generateRandomAddress(),
                _keeper: generateRandomAddress(),
                _oracleWrapper: generateRandomAddress(),
                _settlementEthOracle: generateRandomAddress(),
                _longToken: generateRandomAddress(),
                _shortToken: generateRandomAddress(),
                _poolCommitter: generateRandomAddress(),
                _poolName: POOL_CODE,
                _frontRunningInterval: 3,
                _updateInterval: 5,
                _fee: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 5],
                _leverageAmount: 5,
                _feeAddress: generateRandomAddress(),
                _secondaryFeeAddress: ethers.constants.AddressZero,
                _quoteToken: token.address,
                _secondaryFeeSplitPercent: 10,
            }
            await expect(pool.initialize(initialization)).to.be.rejectedWith(
                Error
            )
        })
        it("should not allow multiple clones to exist with the same leverageAmount, quoteToken, oracleWrapper", async () => {
            const deploymentData = {
                poolName: POOL_CODE_2,
                frontRunningInterval: 3,
                updateInterval: 5,
                leverageAmount: 5,
                quoteToken: token.address,
                oracleWrapper: oracleWrapper.address,
                settlementEthOracle: settlementEthOracle.address,
            }
            await expect(factory.deployPool(deploymentData)).to.not.reverted
            deploymentData.updateInterval = 60
            deploymentData.frontRunningInterval = 30
            await expect(factory.deployPool(deploymentData)).to.revertedWith(
                "ERC1167: create2 failed"
            )
        })
        it("pool should own tokens", async () => {
            const longToken = await pool.tokens(0)
            const shortToken = await pool.tokens(1)
            let tokenInstance = new ethers.Contract(
                longToken,
                PoolToken__factory.abi
            ).connect((await ethers.getSigners())[0])
            expect(await tokenInstance.owner()).to.eq(pool.address)

            tokenInstance = tokenInstance.attach(shortToken)
            expect(await tokenInstance.owner()).to.eq(pool.address)
        })

        it("should use the default keeper", async () => {
            const deploymentData = {
                poolName: POOL_CODE_2,
                frontRunningInterval: 2,
                updateInterval: 5,
                leverageAmount: 3,
                quoteToken: token.address,
                oracleWrapper: oracleWrapper.address,
                settlementEthOracle: settlementEthOracle.address,
            }
            const secondPool = getEventArgs(
                await (await factory.deployPool(deploymentData)).wait(),
                "DeployPool"
            )
            const pool2 = new ethers.Contract(
                secondPool?.pool,
                LeveragedPoolInterface.abi,
                (await ethers.getSigners())[0]
            ) as LeveragedPool
            expect(await pool2.keeper()).to.eq(poolKeeper.address)
        })
    })

    context("Deployment parameter checks", async () => {
        it("should reject leverages less than 1", async () => {
            const deploymentData = {
                poolName: POOL_CODE_2,
                frontRunningInterval: 5,
                updateInterval: 3,
                leverageAmount: 0,
                quoteToken: token.address,
                oracleWrapper: oracleWrapper.address,
                settlementEthOracle: settlementEthOracle.address,
            }

            await expect(factory.deployPool(deploymentData)).to.be.revertedWith(
                "PoolKeeper: leveraged amount invalid"
            )
        })
        it("should reject leverages greater than the MAX_LEVERAGE amount", async () => {
            const deploymentData = {
                poolName: POOL_CODE_2,
                frontRunningInterval: 5,
                updateInterval: 3,
                leverageAmount: 100, // default max leverage is 10
                quoteToken: generateRandomAddress(),
                oracleWrapper: oracleWrapper.address,
                settlementEthOracle: settlementEthOracle.address,
            }

            await expect(factory.deployPool(deploymentData)).to.be.revertedWith(
                "PoolKeeper: leveraged amount invalid"
            )
        })
        it("should reject tokens with more than 18 decimals", async () => {
            const testToken = (await ethers.getContractFactory(
                "TestToken",
                signers[0]
            )) as TestToken__factory
            const token = await testToken.deploy("TEST TOKEN", "TST1")
            await token.deployed()

            await token.setDecimals(19)
            const deploymentData = {
                poolName: POOL_CODE_2,
                frontRunningInterval: 5,
                updateInterval: 3,
                leverageAmount: 1,
                quoteToken: token.address,
                oracleWrapper: oracleWrapper.address,
                settlementEthOracle: settlementEthOracle.address,
            }

            await expect(factory.deployPool(deploymentData)).to.be.revertedWith(
                "Decimal precision too high"
            )
        })
    })
    context("Clone deterministic checks", async () => {
        let cloneLibrary: TestClones

        before(async () => {
            signers = await ethers.getSigners()
            const cloneLibraryFactory = (await ethers.getContractFactory(
                "TestClones",
                signers[0]
            )) as TestClones__factory
            cloneLibrary = await cloneLibraryFactory.deploy()
            await cloneLibrary.deployed()
        })

        it("should deploy deterministically", async () => {
            let encoder = new ethers.utils.AbiCoder()
            let abiEncoded = encoder.encode(
                ["uint16", "address", "address"],
                [leverage, token.address, oracleWrapper.address]
            )
            let uniqueIdHash = ethers.utils.keccak256(abiEncoded)
            let predictedPoolAddress =
                await cloneLibrary.predictDeterministicAddress(
                    await factory.poolBaseAddress(),
                    uniqueIdHash,
                    factory.address
                )

            expect(predictedPoolAddress).to.eq(pool.address)
        })

        it("should not equal if leverage is different", async () => {
            let encoder = new ethers.utils.AbiCoder()
            let abiEncoded = encoder.encode(
                ["uint16", "address", "address"],
                [2, token.address, oracleWrapper.address]
            )
            let uniqueIdHash = ethers.utils.keccak256(abiEncoded)
            let predictedPoolAddress =
                await cloneLibrary.predictDeterministicAddress(
                    await factory.poolBaseAddress(),
                    uniqueIdHash,
                    factory.address
                )

            expect(predictedPoolAddress).to.not.eq(pool.address)
        })
    })

    context("When secondary fee split is changed", async () => {
        beforeEach(async () => {
            await factory.setSecondaryFeeSplitPercent(20)
        })

        it("secondary fee split equals 20 on factory", async () => {
            const feesplit = await factory.secondaryFeeSplitPercent()
            expect(feesplit.toNumber()).to.eq(20)
        })

        it("secondary fee split equals 20 on deployed pool", async () => {
            const deploymentData = {
                poolName: POOL_CODE_2,
                frontRunningInterval: 3,
                updateInterval: 5,
                leverageAmount: 4,
                quoteToken: token.address,
                oracleWrapper: oracleWrapper.address,
                settlementEthOracle: settlementEthOracle.address,
            }
            
            const poolNumber = (await factory.numPools()).toNumber()
            await factory.deployPool(deploymentData)
            const oldPoolAddress = await factory.pools(0)
            const oldPool = await ethers.getContractAt("LeveragedPool", oldPoolAddress) as LeveragedPool
            const newPoolAddress = await factory.pools(poolNumber)
            const newPool = await ethers.getContractAt("LeveragedPool", newPoolAddress) as LeveragedPool
            
            const oldFeeSplit = (await oldPool.secondaryFeeSplitPercent()).toNumber()
            const newFeeSplit = (await newPool.secondaryFeeSplitPercent()).toNumber()
            expect(oldFeeSplit).to.eq(10)
            expect(newFeeSplit).to.eq(20)
        })
    })

    context("When secondary fee split is changed too high", async () => {
        it("change fee split to 100 should revert error", async () => {
            await expect(factory.setSecondaryFeeSplitPercent(100)).to.not.reverted
        })
        it("change fee split to > 100 should revert error", async () => {
            await expect(factory.setSecondaryFeeSplitPercent(200)).to.revertedWith("Secondary fee split cannot exceed 100%")
        })
    })
})
