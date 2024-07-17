/// @dev The Fuel testing utils.
/// A set of useful helper methods for the integration test environment.

import type {
  Message,
  WalletUnlocked as FuelWallet,
  TransactionResponse,
  Provider,
  ScriptTransactionRequestLike,
  BytesLike,
} from 'fuels';
import {
  ZeroBytes32,
  ScriptTransactionRequest,
  arrayify,
  InputType,
  hexlify,
  OutputType,
  Predicate,
  bn,
} from 'fuels';
import * as fs from 'fs';

import { default as smoABI } from '../../../../../smo/out/release/smo-abi.json';

import { debug } from '../logs';

import { resourcesToInputs } from './transaction';



const _erc20mintscriptBinaryPath = '/workspaces/fuel-bridge/smo/out/release/smo.bin';

// Alternatively, if you need to use it as a buffer synchronously
const erc20mintscriptBinarybuffer = fs.readFileSync(_erc20mintscriptBinaryPath);
console.log(new Uint8Array(erc20mintscriptBinarybuffer));
  


type RelayMessageOptions = Pick<
  ScriptTransactionRequestLike,
  'gasLimit' | 'maturity' | 'maxFee'
> & {
  contractIds?: BytesLike[];
};

type CommonMessageDetails = {
  name: string;
  // predicateRoot: string;
  // predicate: string;
  script: Uint8Array;
  buildTx: (
    relayer: FuelWallet,
    message: Message,
    details: CommonMessageDetails,
    opts?: RelayMessageOptions
  ) => Promise<ScriptTransactionRequest>;
};



// Details for relaying common messages with certain predicate roots
function xMintERC20TXMessageEncode(provider: Provider) {
  // Create a predicate for common messages
  // const predicate = new Predicate({
  //   bytecode: contractMessagePredicate,
  //   provider,
  // });

  const assetId = provider.getBaseAssetId();

  // Details for relaying common messages with certain predicate roots
  const relayableMessages: CommonMessageDetails[] = [
    {
      name: 'depositMessage To Contract v1.3',
      // predicateRoot: predicate.address.toHexString(),
      // predicate: contractMessagePredicate,
      script: new Uint8Array(erc20mintscriptBinarybuffer),
      buildTx: async (
        relayer: FuelWallet,
        message: Message,
        details: CommonMessageDetails,
        opts?: RelayMessageOptions
      ): Promise<ScriptTransactionRequest> => {
        console.log('sript.predone');
        const script = arrayify(details.script);
        console.log('script.done');
        // const predicateBytecode = arrayify(details.predicate);
        // get resources to fund the transaction
        // const resources = await relayer.getResourcesToSpend([
        //   {
        //     amount: bn.parseUnits('5'),
        //     assetId,
        //   },
        // ]);
        // convert resources to inputs
        // const spendableInputs = resourcesToInputs(resources);

        // get contract id could turn this to script data X]
        // const data = arrayify(message.data);
        // if (data.length < 32)
        //   throw new Error('cannot find contract ID in message data');
        // const contractId = hexlify(data.slice(0, 32));

        // build the transaction
        const transaction = new ScriptTransactionRequest({
          script,
          // abis: smoABI,
        });

        console.log("one");
        transaction.inputs.push({
          type: InputType.Message,
          amount: message.amount,
          sender: message.sender.toHexString(), //gatewaybridge
          recipient: message.recipient.toHexString(),
          witnessIndex: 0,
          data: message.data, //deposistMessage
          nonce: message.nonce,
          predicate: arrayify(new Uint8Array(0)),
        });
        console.log("two");
        // transaction.inputs.push({
        //   type: InputType.Contract,
        //   txPointer: ZeroBytes32,
        //   contractId,
        // });

        // for (const additionalContractId of opts.contractIds || []) {
        //   transaction.inputs.push({
        //     type: InputType.Contract,
        //     txPointer: ZeroBytes32,
        //     contractId: additionalContractId,
        //   });
        // }

        // transaction.inputs.push(...spendableInputs);

        // transaction.outputs.push({
        //   type: OutputType.Contract,
        //   inputIndex: 1,
        // });

        // for (const [index] of (opts.contractIds || []).entries()) {
        //   transaction.outputs.push({
        //     type: OutputType.Contract,
        //     inputIndex: 2 + index,
        //   });
        // }

        // transaction.outputs.push({
        //   type: OutputType.Change,
        //   to: relayer.address.toB256(),
        //   assetId,
        // });
        // transaction.outputs.push({
        //   type: OutputType.Variable,
        // });
        transaction.witnesses.push(ZeroBytes32);
        console.log("three");

        transaction.gasLimit = bn(1_000_000);
        console.log("four");

        transaction.maxFee = bn(1);
        console.log("five");

        debug(
          '-------------------------------------------------------------------'
        );
        debug(transaction.inputs);
        debug(
          '-------------------------------------------------------------------'
        );
        debug(transaction.outputs);
        debug(
          '-------------------------------------------------------------------'
        );

        return transaction;
      },
    },
  ];

  return relayableMessages;
}

// Relay commonly used messages with predicates spendable by anyone
export async function xMintERC20TX(
  relayer: FuelWallet,
  message: Message,
  opts?: RelayMessageOptions
): Promise<TransactionResponse> {
  // find the relay details for the specified message
  let messageRelayDetails: CommonMessageDetails = null;
  // const predicateRoot = message.recipient.toHexString();

  for (const details of xMintERC20TXMessageEncode(relayer.provider)) {
    if (details.script) {
      messageRelayDetails = details;
      break;
    }
  }

  console.log("messageRelayer: ", messageRelayDetails);
  // if (messageRelayDetails == null)
  //   throw new Error('message is not a common relayable message');

  // build and send transaction
  // TODO pass our own message 
  const transaction = await messageRelayDetails.buildTx(
    relayer,
    message,
    messageRelayDetails,
    opts || {}
  );

  console.log("transaction!!!", transaction);
  const estimated_tx = await relayer.provider.estimatePredicates(transaction);
  console.log("estimtesstx!!!", estimated_tx);
  relayer.signTransaction(estimated_tx);

  return relayer.sendTransaction(estimated_tx);
}
