export interface NetworkAddresses {
    poolFactory: string
    poolSwapLibrary: string
    poolKeeper: string
    tcr: string
    usdc: string
    ethUsdcOracleWrapper: string
    btcUsdcOracleWrapper: string
    devMultisig: string
    btcUsdChainlinkFeed: string
    ethUsdChainlinkFeed: string
}

export const arbitrumMainnet: NetworkAddresses = {
    poolFactory: "0x3Feafee6b12C8d2E58c5B118e54C09F9273c6124",
    poolSwapLibrary: "0x58639957c0E526fF4E4Bb1cBfBDFeFdeb16Af237",
    poolKeeper: "0x051afD0b39ACF4Cc52c76a479aD802d0B82A8249",
    tcr: "0xA72159FC390f0E3C6D415e658264c7c4051E9b87",
    usdc: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
    ethUsdcOracleWrapper: "0x14F7E8E31B794AA9674f2f861Ef45D9081Ab827E",
    btcUsdcOracleWrapper: "0x1392a5eEc4eF364319e44cb1B155DD743894CCfD",
    devMultisig: "0x0f79e82aE88E1318B8cfC8b4A205fE2F982B928A",
    btcUsdChainlinkFeed: "0x6ce185860a4963106506C203335A2910413708e9",
    ethUsdChainlinkFeed: "0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612",
    tfiUsdChainlinkFeeed: "0xF0ffC609da91d1931314BA5d17F1786db985D801",
}

export const arbitrumRinkeby: NetworkAddresses = {
    poolFactory: "0x0896Fd59b574f536751c82B8Dd9fd9466af009aC",
    poolSwapLibrary: "0x0896Fd59b574f536751c82B8Dd9fd9466af009aC",
    poolKeeper: "0x753f0520a8a1e44a39C64F40d29235A6C73EAE38",
    tcr: "0xb0Ad46bD50b44cBE47E2d83143E0E415d6A842F6", // This is just USDC. Testnet doesn't have a TCR token
    usdc: "0xb0Ad46bD50b44cBE47E2d83143E0E415d6A842F6",
    ethUsdcOracleWrapper: "0x33C0257eda38e0b85Da0ed54Bc27D03dFa62664d",
    btcUsdcOracleWrapper: "",
    devMultisig: "0xb0Ad46bD50b44cBE47E2d83143E0E415d6A842F6", // Dummy value. Feel free to change this to whatever you want.
    btcUsdChainlinkFeed: "0x0c9973e7a27d00e656B9f153348dA46CaD70d03d",
    ethUsdChainlinkFeed: "0x5f0423B1a6935dc5596e7A24d98532b67A0AeFd8",
    tfiUsdChainlinkFeeed: "0x9De602408AA53F0BB8bC54280A9fb70446289cFC",
}
