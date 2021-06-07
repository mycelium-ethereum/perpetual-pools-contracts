import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {
  ERC20,
  LeveragedPool,
  PoolSwapLibrary,
  TestToken,
} from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { POOL_CODE } from "../constants";
import {
  getEventArgs,
  deployPoolAndTokenContracts,
  generateRandomAddress,
  getRandomInt,
  timeout,
} from "../utilities";

import { BytesLike, ContractReceipt } from "ethers";

chai.use(chaiAsPromised);
const { expect } = chai;

describe("LeveragedPool - executePriceUpdate", () => {
  describe("Base cases", () => {
    before(async () => {});
    it("should set the last update timestamp", async () => {});
    it("should set the last underlying price", async () => {});
    it("should update the short pair balance", async () => {});
    it("should update the long pair balance", async () => {});
    it("should send the fund movement fee to the fee holder", async () => {});
  });
  describe("Revert cases", () => {
    beforeEach(async () => {});
    it("should revert if the update is too soon from the previous one", async () => {});
    it("should revert if the losing pool balance is zero", async () => {});
  });
});
