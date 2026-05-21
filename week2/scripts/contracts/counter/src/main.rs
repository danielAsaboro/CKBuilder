
#![no_std]
#![no_main]

// Reference implementation of the counter type script from Lesson 10.
//
// A counter cell stores an 8-byte little-endian u64 in its data. The type
// script enforces three transitions:
//
//   - Creation    (group_inputs = 0, group_outputs >= 1): every output must
//                  contain the value 0.
//   - Update      (group_inputs = 1, group_outputs = 1): output counter must
//                  equal input counter + 1.
//   - Destruction (group_inputs >= 1, group_outputs = 0): always allowed.

use ckb_std::ckb_constants::Source;
use ckb_std::entry;
use ckb_std::error::SysError;
use ckb_std::high_level::load_cell_data;

entry!(main);

const COUNTER_DATA_LEN: usize = 8;

const ERROR_INVALID_DATA_LENGTH: i8 = 5;
const ERROR_COUNTER_NOT_ZERO_ON_CREATION: i8 = 6;
const ERROR_INVALID_CELL_COUNT: i8 = 7;
const ERROR_COUNTER_NOT_INCREMENTED: i8 = 8;

fn count_cells_in_group(source: Source) -> usize {
    let mut count = 0usize;
    loop {
        match load_cell_data(count, source) {
            Ok(_) => count += 1,
            Err(SysError::IndexOutOfBound) => break,
            Err(_) => break,
        }
    }
    count
}

fn parse_counter(data: &[u8]) -> Result<u64, i8> {
    if data.len() != COUNTER_DATA_LEN {
        return Err(ERROR_INVALID_DATA_LENGTH);
    }
    let mut bytes = [0u8; COUNTER_DATA_LEN];
    bytes.copy_from_slice(data);
    Ok(u64::from_le_bytes(bytes))
}

fn main() -> i8 {
    let input_count = count_cells_in_group(Source::GroupInput);
    let output_count = count_cells_in_group(Source::GroupOutput);

    match (input_count, output_count) {
        // Creation: no inputs in this group, all outputs must start at 0.
        (0, _) => {
            for i in 0..output_count {
                let data = match load_cell_data(i, Source::GroupOutput) {
                    Ok(d) => d,
                    Err(_) => return ERROR_INVALID_DATA_LENGTH,
                };
                let value = match parse_counter(&data) {
                    Ok(v) => v,
                    Err(code) => return code,
                };
                if value != 0 {
                    return ERROR_COUNTER_NOT_ZERO_ON_CREATION;
                }
            }
            0
        }

        // Destruction: inputs exist, no outputs in this group.
        (_, 0) => 0,

        // Update: exactly one input and one output, output = input + 1.
        (1, 1) => {
            let input = match load_cell_data(0, Source::GroupInput) {
                Ok(d) => d,
                Err(_) => return ERROR_INVALID_DATA_LENGTH,
            };
            let output = match load_cell_data(0, Source::GroupOutput) {
                Ok(d) => d,
                Err(_) => return ERROR_INVALID_DATA_LENGTH,
            };
            let input_val = match parse_counter(&input) {
                Ok(v) => v,
                Err(code) => return code,
            };
            let output_val = match parse_counter(&output) {
                Ok(v) => v,
                Err(code) => return code,
            };
            if output_val != input_val.saturating_add(1) {
                return ERROR_COUNTER_NOT_INCREMENTED;
            }
            0
        }

        // Anything else is a malformed update (e.g. merging two counters).
        _ => ERROR_INVALID_CELL_COUNT,
    }
}
