    script;

    use std::inputs::input_message_data;

    abi MessageReceiver {
        #[payable]
        #[storage(read, write)]
        fn process_message(msg_idx: u64);
    }

    fn main(){
        //call erc20bridge.process_message
        let msg_idx = 0;
        let erc20bridge_receiver_id = b256::from(input_message_data(msg_idx,msg_idx));
        let erc20bridge_receiver = abi(MessageReceiver, erc20bridge_receiver_id);
        erc20bridge_receiver.process_message(msg_idx);
    }