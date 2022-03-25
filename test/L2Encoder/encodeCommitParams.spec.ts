import { ethers } from "hardhat"
import chai, { expect } from "chai"
import chaiAsPromised from "chai-as-promised"
import { L2Encoder, L2Encoder__factory } from "../../types"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { LONG_BURN, SHORT_MINT } from "../constants"

chai.use(chaiAsPromised)

const amountCommitted = 10000

const encodedBits = 128 + 8 * 3
const encodedBytes = encodedBits / 8
const encodedHexCharacters = encodedBytes * 2
const hexChars32Bytes = 64
const paddingRequired = hexChars32Bytes - encodedHexCharacters

describe("L2Encoder - encodeCommitParams", () => {
    let signers: SignerWithAddress[]
    let l2Encoder: L2Encoder
    beforeEach(async () => {
        // Deploy the contracts
        signers = await ethers.getSigners()

        const l2EncoderFactory = (await ethers.getContractFactory(
            "L2Encoder",
            signers[0]
        )) as L2Encoder__factory

        l2Encoder = await l2EncoderFactory.deploy()
        await l2Encoder.deployed()
    })

    context("All 0s edge case", async () => {
        it("Encodes the values", async () => {
            const amount = 0
            const commitType = 0
            const fromAggregateBalance = false
            const payForClaim = false
            let expectedResult = ethers.utils.solidityPack(
                ["bool", "bool", "uint8", "uint128"],
                [payForClaim, fromAggregateBalance, commitType, amount]
            )
            // Pad with 0s
            expectedResult =
                "0x" + "0".repeat(paddingRequired) + expectedResult.slice(2)
            const result = await l2Encoder.encodeCommitParams(
                amount,
                commitType,
                fromAggregateBalance,
                payForClaim
            )
            expect(result).to.equal(expectedResult)
        })
    })
    context("Standard input", async () => {
        context("Case 1", async () => {
            it("Encodes the values", async () => {
                const amount = amountCommitted
                const commitType = LONG_BURN
                const fromAggregateBalance = true
                const payForClaim = true
                let expectedResult = ethers.utils.solidityPack(
                    ["bool", "bool", "uint8", "uint128"],
                    [payForClaim, fromAggregateBalance, commitType, amount]
                )
                // Pad with 0s
                expectedResult =
                    "0x" + "0".repeat(paddingRequired) + expectedResult.slice(2)
                const result = await l2Encoder.encodeCommitParams(
                    amount,
                    commitType,
                    fromAggregateBalance,
                    payForClaim
                )
                expect(result).to.equal(expectedResult)
            })
        })
        context("Case 2", async () => {
            it("Encodes the values", async () => {
                const amount = amountCommitted
                const commitType = SHORT_MINT
                const fromAggregateBalance = false
                const payForClaim = true
                let expectedResult = ethers.utils.solidityPack(
                    ["bool", "bool", "uint8", "uint128"],
                    [payForClaim, fromAggregateBalance, commitType, amount]
                )
                // Pad with 0s
                expectedResult =
                    "0x" + "0".repeat(paddingRequired) + expectedResult.slice(2)
                const result = await l2Encoder.encodeCommitParams(
                    amount,
                    commitType,
                    fromAggregateBalance,
                    payForClaim
                )
                expect(result).to.equal(expectedResult)
            })
        })
    })
})
