#![no_std]
#![no_main]

// Reference implementation of the hash lock script from Lesson 8.
//
// The script stores blake2b_256(preimage) in its args. To spend a cell
// locked by this script the witness at index 0 (Source::GroupInput) must
// contain the preimage. The script hashes the witness and compares it to
// args. Any other case returns a non-zero exit code.

extern crate alloc;

use alloc::vec::Vec;
use ckb_std::ckb_constants::Source;
use ckb_std::ckb_types::prelude::*;
use ckb_std::default_alloc;
use ckb_std::entry;
use ckb_std::high_level::{load_script, load_witness};

default_alloc!();
entry!(main);

const BLAKE2B_256_HASH_LEN: usize = 32;

const ERROR_INVALID_ARGS_LENGTH: i8 = 5;
const ERROR_NO_WITNESS: i8 = 6;
const ERROR_EMPTY_PREIMAGE: i8 = 7;
const ERROR_HASH_MISMATCH: i8 = 8;

fn blake2b_256(data: &[u8]) -> [u8; BLAKE2B_256_HASH_LEN] {
    // ckb_std exposes a blake2b builder preconfigured with the
    // "ckb-default-hash" personalisation. Using a different blake2b crate
    // here would silently break compatibility with the off-chain hash.
    let mut hasher = ckb_std::blake2b::new_blake2b();
    hasher.update(data);
    let mut out = [0u8; BLAKE2B_256_HASH_LEN];
    hasher.finalize(&mut out);
    out
}

fn main() -> i8 {
    let script = match load_script() {
        Ok(script) => script,
        Err(_) => return 1,
    };

    let expected_hash: Vec<u8> = script.args().unpack();
    if expected_hash.len() != BLAKE2B_256_HASH_LEN {
        return ERROR_INVALID_ARGS_LENGTH;
    }

    let witness = match load_witness(0, Source::GroupInput) {
        Ok(witness) => witness,
        Err(_) => return ERROR_NO_WITNESS,
    };

    let preimage: &[u8] = &witness;
    if preimage.is_empty() {
        return ERROR_EMPTY_PREIMAGE;
    }

    let computed = blake2b_256(preimage);
    if computed[..] != expected_hash[..] {
        return ERROR_HASH_MISMATCH;
    }

    0
}
