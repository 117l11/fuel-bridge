import {
    setupEnvironment,
    xMintERC20TX,
    logETHBalances,
    logTokenBalances,
    getOrDeployECR20Contract,
    mintECR20,
    getOrDeployL2Bridge,
    FUEL_TX_PARAMS,
    getTokenId,
  } from '@fuel-bridge/test-utils'

  import type { TestEnvironment } from '@fuel-bridge/test-utils';

  import * as fs from 'fs';
  import { Address, BN, TransactionStatus ,
    AbstractAddress,
    Contract,
    Script,
    WalletUnlocked as FuelWallet,
    MessageProof,
    Message,
  } from 'fuels';
  

  import { parseEther, ethers, BigNumberish, BytesLike } from 'ethers';





  import { default as smoABI } from '../../../smo/out/release/smo-abi.json';

  const _smoBinaryPath = '/workspaces/fuel-bridge/smo/out/release/smo.bin';

  // Alternatively, if you need to use it as a buffer synchronously
  const smoBinarybuffer = fs.readFileSync(_smoBinaryPath);
  console.log(smoBinarybuffer.toString('hex'));
  


  
  const TOKEN_AMOUNT = '10';
  
  // This script is a demonstration of how ERC-20 tokens are bridged to and from the Fuel chain
  (async function xERC20() {
    // basic setup routine which creates the connections (the "providers") to both chains,
    // funds addresses for us to test with and populates the official contract deployments
    // on the Ethereum chain for interacting with the Fuel chain
    console.log('Setting up environment...');
    const env: TestEnvironment = await setupEnvironment({});
    const ethAcct = env.eth.signers[0];
    const ethAcctAddr = await ethAcct.getAddress();
    const fuelAcct = env.fuel.signers[1];
    const fuelAcctAddr = fuelAcct.address.toHexString();
    const fuelMessagePortal = env.eth.fuelMessagePortal.connect(ethAcct);
    const fuelERC20Gateway = env.eth.fuelERC20Gateway.connect(ethAcct);
    const fuelERC20GatewayAddress = await fuelERC20Gateway.getAddress();


    ////////////////////////////////////
    // Connect/Create Token Contracts //
    ////////////////////////////////////

    await logETHBalances(ethAcct, fuelAcct);
    console.log("Initial assetIssuerId: ", await fuelERC20Gateway.assetIssuerId());

    // load ERC20 contract
    const ethTestToken = await getOrDeployECR20Contract(env);
    const ethTestTokenAddress = (await ethTestToken.getAddress()).toLowerCase();
    console.log("ethTestToken: ", ethTestTokenAddress);

    // load Fuel side fungible token contract.
    const {contract, implementation} = await getOrDeployL2Bridge(
      env,
      env.eth.fuelERC20Gateway,
      FUEL_TX_PARAMS
    );
    
    const fuelBridge = contract;
    const fuelBridgeImpl = implementation;
    const fuelBridgeContractId = fuelBridge.id.toHexString();
    await env.eth.fuelERC20Gateway.setAssetIssuerId(fuelBridgeContractId);
    console.log("New assetIssuerId:", await fuelERC20Gateway.assetIssuerId());

    const fuelTestTokenId = getTokenId(fuelBridge, ethTestTokenAddress);

    // mint tokens as check erc20 starting balances
    await mintECR20(env, ethTestToken, ethAcctAddr, TOKEN_AMOUNT);
    await logTokenBalances(ethTestToken, ethAcct, fuelAcct, fuelTestTokenId);

    // Call Script
    const nnc = await fuelMessagePortal.getNextOutgoingMessageNonce();
    const msg_data = "0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000" + ethTestTokenAddress.slice(2).padStart(64, '0') + "0000000000000000000000000000000000000000000000000000000000000000"  + fuelAcctAddr.slice(2) + "000000000000000000000000000000000000000000000000ffffffffffffffff0000000000000000000000000000000000000000000000000000000000000012"
    console.log(`Nounce: ${nnc}`);
    const erc20DepositMessage : Message = {
      messageId: '0x1234',  // Replace with actual BytesLike value
      sender: Address.fromAddressOrString('0x'+fuelERC20GatewayAddress.slice(2).padStart(64, '0')),  // Replace with actual AbstractAddress
      recipient: Address.fromAddressOrString(fuelBridgeContractId),  // Replace with actual AbstractAddress
      nonce: '0x0'+nnc.toString(16),  // Replace with actual BytesLike value
      amount: new BN(5),  // Replace with actual BN value
      data: msg_data,  // Replace with actual BytesLike value
      daHeight: new BN(10)  // Replace with actual BN value
    };

    console.log("ERC20Deposit Message: ", erc20DepositMessage);

    const scriptTx = await xMintERC20TX(
      fuelAcct,
      erc20DepositMessage,
      FUEL_TX_PARAMS
    );

    console.log("ScriptTXXXX: ", scriptTx);

    const scriptTxResult = await scriptTx.waitForResult();

    if (scriptTxResult.status !== TransactionStatus.success) {
      console.log(scriptTxResult.status);
      console.log(scriptTxResult);
      console.log(scriptTxResult.transaction.inputs);
      console.log(scriptTxResult.transaction.outputs);
      throw new Error("failed to run mint script");
    }
    // check erc20 balances

    console.log("Script Result:", scriptTxResult)
    await logTokenBalances(ethTestToken, ethAcct, fuelAcct, fuelTestTokenId);

  })();
 