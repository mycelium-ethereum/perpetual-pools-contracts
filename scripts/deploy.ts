#!/usr/bin/env node
import {
  deployPoolKeeper,
  deployOracleWrapper,
  deployPoolFactory,
  deployPoolSwapLibrary,
} from "./contracts";
import { parse } from "ts-command-line-args";

interface IDeploymentArgs {
  contracts?: string[];
  all?: boolean;
  factory?: string;
  oracle?: string;
  library?: string;
}
/**
 * Deploys one or more of the project's contracts.
 * Available options:
 * -- contracts with one or more contract names (eg --contracts PoolFactory PoolKeeper). If you are not deploying the oracle, factory, and/or library, you must provide the addresses
 * --factory The address of a deployed factory
 * --oracle The address of a deployed oracle wrapper
 * --library The address of a deployed pool swap library
 * --all Deploy everything fresh. Ignores all other flags.
 */
const deploy = async (): Promise<void> => {
  const argv = parse<IDeploymentArgs>({
    contracts: { type: String, multiple: true, optional: true },
    all: { type: Boolean, multiple: false, optional: true },
    factory: { type: String, multiple: false, optional: true },
    oracle: { type: String, multiple: false, optional: true },
    library: { type: String, multiple: false, optional: true },
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
    console.log(
      "PoolKeeper address is ",
      await deployPoolKeeper(oracle, factory)
    );
    console.log("Deployed all contracts, exiting");
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
        console.log(
          "PoolKeeper address is ",
          await deployPoolKeeper(oracle, factory)
        );
      } else if (argv?.factory) {
        console.log(
          "PoolKeeper address is ",
          await deployPoolKeeper(oracle, argv?.factory)
        );
      }
    } else if (argv?.oracle) {
      if (factory) {
        console.log(
          "PoolKeeper address is ",
          await deployPoolKeeper(argv?.oracle, factory)
        );
      } else if (argv?.factory) {
        console.log(
          "PoolKeeper address is ",
          await deployPoolKeeper(argv?.oracle, argv?.factory)
        );
      }
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
