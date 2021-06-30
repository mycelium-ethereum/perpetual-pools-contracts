// eslint-disable-next-line @typescript-eslint/no-var-requires
const hardhat = require("hardhat");
import {
  deployPoolKeeper,
  deployOracleWrapper,
  deployPoolFactory,
  deployPoolSwapLibrary,
  verifyOnEtherscan,
} from "./contract-utils";
import { parse } from "ts-command-line-args";
import { timeout } from "../test/utilities";

interface IDeploymentArgs {
  contracts?: string[];
  all?: boolean;
  factory?: string;
  oracle?: string;
  library?: string;
  verify?: boolean;
}
/**
 * Deploys one or more of the project's contracts.
 * Available options:
 * -- contracts with one or more contract names (eg --contracts PoolFactory PoolKeeper). If you are not deploying the oracle, factory, and/or library, you must provide the addresses
 * --factory The address of a deployed factory
 * --oracle The address of a deployed oracle wrapper
 * --library The address of a deployed pool swap library
 * --all Deploy everything fresh. Ignores contract and address flags (library, oracle, factory).
 * --verify Whether to verify the deployed contract on etherscan or not. This will add
 */
const deploy = async (): Promise<void> => {
  const argv = parse<IDeploymentArgs>({
    contracts: { type: String, multiple: true, optional: true },
    all: { type: Boolean, multiple: false, optional: true },
    factory: { type: String, multiple: false, optional: true },
    oracle: { type: String, multiple: false, optional: true },
    library: { type: String, multiple: false, optional: true },
    verify: { type: Boolean, multiple: false, optional: true },
  });
  const getIsDeploying = (name: string) =>
    argv.contracts?.some(
      (el: string) => el?.toLowerCase() === name.toLowerCase()
    );

  const isDeployingContract = {
    oracleWrapper: getIsDeploying("OracleWrapper"),
    poolKeeper: getIsDeploying("PoolKeeper"),
    poolFactory: getIsDeploying("PoolFactory"),
    poolLibrary: getIsDeploying("PoolSwapLibrary"),
  };

  let oracle: string | undefined = undefined;
  let factory: string | undefined = undefined;
  let library: string | undefined = undefined;
  let poolKeeper: string | undefined = undefined;

  if (argv.all) {
    console.log(`
    Deploying all contracts\n 
    Now deploying PoolSwapLibrary...\n
    `);
    library = await deployPoolSwapLibrary();
    console.log("Library address is: ", library);

    console.log("Now deploying PoolFactory...\n");
    factory = await deployPoolFactory(library);
    console.log("PoolFactory address is ", factory);

    console.log("Now deploying OracleWrapper...\n");
    oracle = await deployOracleWrapper();
    console.log("OracleWrapper address is ", oracle);

    console.log("Now deploying PoolKeeper...\n");
    poolKeeper = await deployPoolKeeper(oracle, factory);
    console.log("PoolKeeper address is ", poolKeeper);

    if (argv.verify) {
      console.log("Verifying contracts on etherscan, this may take a while...");
      await timeout(20000); // Delay for etherscan to catch up and confirm deployment
      await verifyOnEtherscan(library, []);
      await verifyOnEtherscan(oracle, []);
      await verifyOnEtherscan(factory, []);
      await verifyOnEtherscan(poolKeeper, [oracle, factory]);
    }
    console.log("Deployment complete, exiting");
    return;
  }

  if (isDeployingContract.oracleWrapper) {
    console.log("Now deploying OracleWrapper...\n");
    oracle = await deployOracleWrapper();
    console.log("OracleWrapper address is ", oracle);
  }
  if (isDeployingContract.poolLibrary) {
    console.log("Now deploying PoolSwapLibrary...\n");
    library = await deployPoolSwapLibrary();
    console.log("Library address is: ", library);
  }
  if (isDeployingContract.poolFactory) {
    if (!library && !argv.library) {
      throw new Error("Library deployed or address not provided");
    }
    console.log("Now deploying PoolFactory...\n");
    if (library) {
      factory = await deployPoolFactory(library);
    } else if (argv?.library) {
      factory = await deployPoolFactory(argv.library);
    }
    console.log("PoolFactory address is ", factory);
  }
  if (isDeployingContract.poolKeeper) {
    if (!oracle && !argv?.oracle) {
      throw new Error("OracleWrapper not deployed or address not provided");
    }
    if (!factory && !argv.factory) {
      throw new Error("Factory not deployed or address not provided");
    }
    console.log("Now deploying PoolKeeper...\n");
    if (oracle) {
      if (factory) {
        poolKeeper = await deployPoolKeeper(oracle, factory);
        console.log("PoolKeeper address is ", poolKeeper);
      } else if (argv?.factory) {
        factory = argv?.factory;
        poolKeeper = await deployPoolKeeper(oracle, argv?.factory);
        console.log("PoolKeeper address is ", poolKeeper);
      }
    } else if (argv?.oracle) {
      oracle = argv?.oracle;
      if (factory) {
        poolKeeper = await deployPoolKeeper(argv?.oracle, factory);
        console.log("PoolKeeper address is ", poolKeeper);
      } else if (argv?.factory) {
        poolKeeper = await deployPoolKeeper(argv?.oracle, argv?.factory);
        console.log("PoolKeeper address is ", poolKeeper);
      }
    }
    poolKeeper = await deployPoolKeeper(oracle, factory);
    console.log("PoolKeeper address is ", poolKeeper);
  }
  if (argv.verify) {
    await timeout(20000);
    if (isDeployingContract.oracleWrapper && oracle) {
      await verifyOnEtherscan(oracle, []);
    }
    if (isDeployingContract.poolFactory && factory) {
      await verifyOnEtherscan(factory, []);
    }
    if (isDeployingContract.poolKeeper && poolKeeper) {
      await verifyOnEtherscan(poolKeeper, [oracle, factory]);
    }
  }
  console.log(`Deployment complete, exiting...`);
};

deploy()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
