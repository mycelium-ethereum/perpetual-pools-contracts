import { ethers } from "hardhat"
import chai, { expect } from "chai"
import chaiAsPromised from "chai-as-promised"
import { L2Encoder, L2Encoder__factory } from "../../types"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { LONG_BURN, SHORT_MINT } from "../constants"
import { generateRandomAddress } from "../utilities"

chai.use(chaiAsPromised)

const amountCommitted = 10000

const encodedBits = 128 + 8 * 3
const encodedBytes = encodedBits / 8
const encodedHexCharacters = encodedBytes * 2
const hexChars32Bytes = 64
const paddingRequired = hexChars32Bytes - encodedHexCharacters

describe("L2Encoder - encodePerformUpkeepParams", () => {
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
            let addresses = []
            let typesArray = []
            const numberOfAddresses = 10
            for (let i = 0; i < numberOfAddresses; i++) {
                addresses.push(ethers.constants.AddressZero)
                typesArray.push("address")
            }
            let expectedResult = ethers.utils.solidityPack(
                typesArray,
                addresses
            )
            const result = await l2Encoder.encodePerformUpkeepParams(addresses)
            expect(result).to.equal(expectedResult)
        })
    })
    context("Standard input", async () => {
        it("packs addresses", async () => {
            let addresses = []
            let typesArray = []
            const numberOfAddresses = 10
            for (let i = 0; i < numberOfAddresses; i++) {
                addresses.push(generateRandomAddress())
                typesArray.push("address")
            }
            let expectedResult = ethers.utils.solidityPack(
                typesArray,
                addresses
            )
            const result = await l2Encoder.encodePerformUpkeepParams(addresses)
            expect(result).to.equal(expectedResult)
        })
    })
})
