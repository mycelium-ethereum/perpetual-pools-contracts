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
    argv?.contracts?.some(
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

  if (argv?.all) {
    console.log(`
    Deploying all contracts\n 
    Now deploying PoolSwapLibrary...\n
    `);
    library = await deployPoolSwapLibrary();
    console.log("Library address is: ", library);

    console.log("\nNow deploying PoolFactory...\n");
    factory = await deployPoolFactory(library);
    console.log("PoolFactory address is:\t", factory);

    console.log("\nNow deploying OracleWrapper...\n");
    oracle = await deployOracleWrapper();
    console.log("\nOracleWrapper address is:\n", oracle);

    console.log("\nNow deploying PoolKeeper...\n");
    poolKeeper = await deployPoolKeeper(oracle, factory);
    console.log("\nPoolKeeper address is:\t", poolKeeper);
  } else {
    if (isDeployingContract.oracleWrapper) {
      console.log("Now deploying OracleWrapper...\n");
      oracle = await deployOracleWrapper();
      console.log("OracleWrapper address is:\t", oracle);
    }
    if (isDeployingContract.poolLibrary) {
      console.log("\nNow deploying PoolSwapLibrary...\n");
      library = await deployPoolSwapLibrary();
      console.log("Library address is:\t", library);
    }
    if (isDeployingContract.poolFactory) {
      if (!library && !argv?.library) {
        throw new Error("Library deployed or address not provided");
      }
      console.log("\nNow deploying PoolFactory...\n");
      if (library) {
        factory = await deployPoolFactory(library);
      } else if (argv?.library) {
        factory = await deployPoolFactory(argv?.library);
      }
      console.log("PoolFactory address is:\t", factory);
    }
    if (isDeployingContract.poolKeeper) {
      if (!oracle && !argv?.oracle) {
        throw new Error("OracleWrapper not deployed or address not provided");
      }
      if (!factory && !argv?.factory) {
        throw new Error("Factory not deployed or address not provided");
      }
      console.log("\nNow deploying PoolKeeper...\n");
      if (oracle) {
        if (factory) {
          poolKeeper = await deployPoolKeeper(oracle, factory);
        } else if (argv?.factory) {
          factory = argv?.factory;
          poolKeeper = await deployPoolKeeper(oracle, argv?.factory);
        }
      } else if (argv?.oracle) {
        oracle = argv?.oracle;
        if (factory) {
          poolKeeper = await deployPoolKeeper(oracle, factory);
        } else if (argv?.factory) {
          factory = argv?.factory;
          poolKeeper = await deployPoolKeeper(oracle, argv?.factory);
        }
      }
      console.log("PoolKeeper address is:\t", poolKeeper);
    }
  }

  if (argv?.verify) {
    console.log("Verifying deployed contracts...");
    await timeout(30000); // Delay so etherscan can catch up and confirm deployment
    if ((isDeployingContract.oracleWrapper || argv?.all) && oracle) {
      await verifyOnEtherscan(oracle, []);
    }
    if ((isDeployingContract.poolFactory || argv?.all) && factory) {
      if (!library && !argv?.library) {
        throw new Error("Library not deployed, or address not provided");
      }
      if (!library) {
        library = argv?.library;
      }
      await verifyOnEtherscan(factory, [], {
        PoolSwapLibrary: library,
      });
    }
    if ((isDeployingContract.poolKeeper || argv?.all) && poolKeeper) {
      await verifyOnEtherscan(poolKeeper, [oracle, factory]);
    }
    if ((isDeployingContract.poolLibrary || argv?.all) && library) {
      await verifyOnEtherscan(library, []);
    }
    console.log("Verification complete\n");
  }
  console.log(`Deployment complete, exiting...`);
};

deploy()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
