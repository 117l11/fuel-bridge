use fuel_tx::Input;
use sha2::{Digest, Sha256};
use std::{env, fs, io::Read, path::Path};

const SCRIPT_BUILD_PATH: &str = "contract_message_script.bin";
const SCRIPT_HASH_PATH: &str = "contract_message_script_hash.bin";
const PREDICATE_BUILD_PATH: &str = "contract_message_predicate.bin";
// The precomputed predicate root for chain_id=0
const DEFAULT_PREDICATE_ROOT_PATH: &str = "contract_message_predicate_default_root.bin";
const MINT_SCRIPT_BUILD_PATH: &str = "mint_script.bin";

mod predicate_asm;
mod script_asm;



fn read_bin_file_to_vec(file_path: &str) -> io::Result<Vec<u8>> {
    // Open the file in read-only mode
    let mut file = fs::File::open(file_path)?;

    // Create a buffer to hold the file's contents
    let mut buffer = Vec::new();

    // Read the file's contents into the buffer
    file.read_to_end(&mut buffer)?;

    // Return the buffer
    Ok(buffer)
}




pub fn script_hash() -> [u8; 32] {
    let script = script_asm::bytecode();
    let mut script_hasher = Sha256::new();
    script_hasher.update(script);
    script_hasher.finalize().into()
}

// Gets the root of the message-to-contract predicate
pub fn predicate_root() -> [u8; 32] {
    let predicate = predicate_asm::bytecode();
    let root = Input::predicate_owner(predicate);
    root.into()
}

fn main() {
    let out_dir = env::var_os("CARGO_MANIFEST_DIR").unwrap();
    let out_dir = Path::new(&out_dir).join("out");
    // get predicate and script bytecode
    let script = script_asm::bytecode();
    let predicate = predicate_asm::bytecode();

    let mint_script: Vec<u8> = read_bin_file_to_vec("/workspaces/fuel-bridge/smo/out/release/smo.bin");

    // output to console and build files
    let script_hash = script_hash();
    let predicate_root = predicate_root();

    let script_build_path = out_dir.join(SCRIPT_BUILD_PATH);
    let script_hash_path = out_dir.join(SCRIPT_HASH_PATH);
    let predicate_build_path = out_dir.join(PREDICATE_BUILD_PATH);
    let default_predicate_root_path = out_dir.join(DEFAULT_PREDICATE_ROOT_PATH);
    let mint_script_build_path = out_dir.join(MINT_SCRIPT_BUILD_PATH);

    fs::create_dir_all(out_dir.clone())
        .unwrap_or_else(|_| panic!("Failed to create output directory [{out_dir:?}]."));

    fs::write(script_build_path.clone(), script).unwrap_or_else(|_| {
        panic!("Failed to write to script binary file output [{script_build_path:?}].")
    });

    fs::write(mint_script_build_path.clone(), mint_script).unwrap_or_else(|_| {
        panic!("Failed to write to script binary file output [{mint_script_build_path:?}].")
    });

    fs::write(predicate_build_path.clone(), predicate).unwrap_or_else(|_| {
        panic!("Failed to write to predicate binary file output [{predicate_build_path:?}].")
    });

    fs::write(script_hash_path.clone(), script_hash).unwrap_or_else(|_| {
        panic!("Failed to write to script hash file output [{script_hash_path:?}].")
    });

    fs::write(default_predicate_root_path.clone(), predicate_root).unwrap_or_else(|_| {
        panic!("Failed to write to predicate root file output [{default_predicate_root_path:?}].")
    });

    println!("cargo:rerun-if-changed=*");
}
