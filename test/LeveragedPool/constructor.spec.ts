import { ethers } from "hardhat";
import chai from "chai";
import chaiAsPromised from "chai-as-promised";
import { LeveragedPool__factory, LeveragedPool } from "../../typechain";

chai.use(chaiAsPromised);
const { expect } = chai;
