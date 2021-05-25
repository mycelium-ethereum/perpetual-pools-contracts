import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import {
  TestPoolFactory__factory,
  LeveragedPool,
  TestPoolFactory,
} from "../../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import {
  ADMIN_ROLE,
  FEE_HOLDER_ROLE,
  POOL_CODE,
  POOL_CODE_2,
  UPDATER_ROLE,
} from "../constants";
import { generateRandomAddress, getRandomInt } from "../utilities";
import { Event } from "@ethersproject/contracts";

import { abi as Pool } from "../../artifacts/contracts/implementation/LeveragedPool.sol/LeveragedPool.json";

chai.use(chaiAsPromised);
const { expect } = chai;

describe("LeveragedPool - commit", () => {
  describe("Commit creation", () => {
    before(async () => {});
    it("should create a commit entry", async () => {});

    it("should allocate a unique ID for each request", async () => {});

    it("should set a timestamp for each commit", async () => {});

    it("should set the amount committed", async () => {});

    it("should set the user's maximum imbalance tolerance", async () => {});

    it("should set the commit's owner", async () => {});

    it("should set the commit type", async () => {});

    it("should emit an event with details of the commit", async () => {});
  });

  describe("Shadow balance updating", () => {
    it("should update the shadow long balance for long mint commits", async () => {});

    it("should update the shadow long balance for long burn commits", async () => {});

    it("should update the shadow short balance for short mint commits", async () => {});

    it("should update the shadow short balance for short burn commits", async () => {});
  });
});
