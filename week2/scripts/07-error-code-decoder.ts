// Lesson 9 in code form. A CKB script communicates its result through a
// single i8 exit code. Negative codes come from CKB-VM itself, positive
// codes are defined by your script. The CKB node wraps a script failure in
// its own error code (-302 TransactionFailedToVerify) and prints the script
// exit code as part of the error message.
//
// This exercise has no network calls. It is a small library of tables plus
// a parser, so you can practise reading error responses the way you will
// have to when debugging a real transaction.

type ErrorEntry = {
  code: number;
  name: string;
  description: string;
  commonCauses: string[];
};

const VM_ERRORS: ErrorEntry[] = [
  {
    code: -1,
    name: "INDEX_OUT_OF_BOUND",
    description: "Syscall tried to access a non-existent index.",
    commonCauses: [
      "Loading a witness at an index where no witness was provided.",
      "Off-by-one in a loop over inputs or outputs.",
    ],
  },
  {
    code: -2,
    name: "ITEM_MISSING",
    description: "A requested field is absent.",
    commonCauses: [
      "Loading the type script of a cell that has no type script.",
    ],
  },
  {
    code: -3,
    name: "SLICE_OUT_OF_BOUND",
    description: "A partial load tried to read beyond the available data.",
    commonCauses: ["offset + length exceeds the data size."],
  },
  {
    code: -4,
    name: "WRONG_FORMAT",
    description: "Data is not in the expected Molecule format.",
    commonCauses: ["Witness bytes are not a valid WitnessArgs Molecule encoding."],
  },
  {
    code: -5,
    name: "UNKNOWN_SYSCALL",
    description: "Unrecognised syscall number.",
    commonCauses: [
      "Script compiled against a newer ckb-std using a syscall that the deployed VM does not support.",
    ],
  },
  {
    code: -6,
    name: "UNALIGNED_SYSCALL",
    description: "Memory addresses were not aligned as required.",
    commonCauses: ["Low-level memory manipulation without correct alignment."],
  },
  {
    code: -7,
    name: "MAX_VMS_SPAWNED",
    description: "Too many child VMs spawned.",
    commonCauses: ["Recursive spawning with no termination condition."],
  },
  {
    code: -8,
    name: "MAX_FDS_CREATED",
    description: "Too many pipe file descriptors.",
    commonCauses: ["Creating inter-VM pipes without closing them."],
  },
];

const NODE_ERRORS: ErrorEntry[] = [
  {
    code: -301,
    name: "TransactionFailedToResolve",
    description: "An input cell or cell_dep OutPoint does not exist or is spent.",
    commonCauses: [
      "Pointing at a dead cell.",
      "A cell dep that has been consumed.",
    ],
  },
  {
    code: -302,
    name: "TransactionFailedToVerify",
    description: "A script returned a non-zero exit code.",
    commonCauses: [
      "The actual script error is in the message body (look for `script exit code: N`).",
    ],
  },
  {
    code: -303,
    name: "PoolRejectedDuplicatedTransaction",
    description: "A transaction with the same hash is already in the pool.",
    commonCauses: ["Resubmitting an already-broadcast transaction."],
  },
  {
    code: -304,
    name: "PoolIsFull",
    description: "The transaction pool is at capacity.",
    commonCauses: ["Fee too low. Increase the fee rate."],
  },
  {
    code: -311,
    name: "PoolRejectedMalformedTransaction",
    description: "The transaction structure is invalid.",
    commonCauses: ["Witness count does not match input count.", "Missing cell deps."],
  },
  {
    code: -312,
    name: "PoolRejectedDuplicatedOutputs",
    description: "Creates cells that conflict with existing unique cells.",
    commonCauses: ["Trying to mint two cells with the same unique type script."],
  },
];

// Script-level error codes from the Lesson 8 hash lock and the Lesson 10
// counter type script. These are arbitrary - each script defines its own.
const HASH_LOCK_ERRORS: ErrorEntry[] = [
  {
    code: 5,
    name: "ERROR_INVALID_ARGS_LENGTH",
    description: "Script args is not exactly 32 bytes.",
    commonCauses: ["Wrong args were attached when the cell was created."],
  },
  {
    code: 6,
    name: "ERROR_NO_WITNESS",
    description: "No witness was provided at the expected index.",
    commonCauses: ["Witness index mismatch.", "Forgot to attach the preimage."],
  },
  {
    code: 7,
    name: "ERROR_EMPTY_PREIMAGE",
    description: "The witness is present but contains zero bytes.",
    commonCauses: ["Off-chain code wrote an empty buffer instead of the preimage."],
  },
  {
    code: 8,
    name: "ERROR_HASH_MISMATCH",
    description: "blake2b_256(preimage) does not equal the script args.",
    commonCauses: [
      "Wrong preimage.",
      "Off-chain blake2b used a different personalisation than ckb-default-hash.",
    ],
  },
];

const COUNTER_ERRORS: ErrorEntry[] = [
  {
    code: 5,
    name: "ERROR_INVALID_DATA_LENGTH",
    description: "Counter cell data is not exactly 8 bytes.",
    commonCauses: ["Wrong outputsData written for a counter cell."],
  },
  {
    code: 6,
    name: "ERROR_COUNTER_NOT_ZERO_ON_CREATION",
    description: "Counter was created with a non-zero value.",
    commonCauses: ["Forgot to encode 0 in the initial outputsData."],
  },
  {
    code: 7,
    name: "ERROR_INVALID_CELL_COUNT",
    description: "Update saw more than one input or more than one output in the group.",
    commonCauses: ["Tried to merge two counter cells in a single tx."],
  },
  {
    code: 8,
    name: "ERROR_COUNTER_NOT_INCREMENTED",
    description: "Output counter is not exactly input + 1.",
    commonCauses: [
      "Off-chain code wrote input + 2 or input + 0.",
      "Wrong byte order in encoding.",
    ],
  },
];

function findEntry(code: number, table: ErrorEntry[]): ErrorEntry | undefined {
  return table.find((e) => e.code === code);
}

function printEntry(entry: ErrorEntry) {
  console.log(`  ${entry.code}  ${entry.name}`);
  console.log(`    ${entry.description}`);
  for (const cause of entry.commonCauses) {
    console.log(`    - ${cause}`);
  }
}

function decodeNodeError(message: string): void {
  console.log(`Decoding: ${message}`);

  const nodeMatch = message.match(/(?:^|[\s(])(-3\d{2})\b/);
  if (nodeMatch) {
    const code = Number(nodeMatch[1]);
    const entry = findEntry(code, NODE_ERRORS);
    if (entry) {
      console.log("  Node-level:");
      printEntry(entry);
    }
  }

  const exitMatch = message.match(/script exit code:\s*(-?\d+)/i);
  if (exitMatch) {
    const code = Number(exitMatch[1]);
    console.log(`  Script exit code: ${code}`);

    if (code < 0) {
      const vmEntry = findEntry(code, VM_ERRORS);
      if (vmEntry) {
        console.log("    Matches a CKB-VM error:");
        printEntry(vmEntry);
      } else {
        console.log("    No CKB-VM mapping. Check ckb_std::error::SysError.");
      }
    } else if (code > 0) {
      console.log("    Positive code = script-defined. Candidates:");
      const hashMatch = findEntry(code, HASH_LOCK_ERRORS);
      const counterMatch = findEntry(code, COUNTER_ERRORS);
      if (hashMatch) {
        console.log("    - Hash lock interpretation:");
        printEntry(hashMatch);
      }
      if (counterMatch) {
        console.log("    - Counter interpretation:");
        printEntry(counterMatch);
      }
      if (!hashMatch && !counterMatch) {
        console.log("    No match in the bundled tables. Check your script's constants.");
      }
    }
  }
  console.log("");
}

function main() {
  console.log("CKB error code reference\n");

  console.log("CKB-VM error codes (negative)");
  for (const entry of VM_ERRORS) {
    printEntry(entry);
  }
  console.log("");

  console.log("CKB node error codes");
  for (const entry of NODE_ERRORS) {
    printEntry(entry);
  }
  console.log("");

  console.log("Hash-lock script error codes (Lesson 8)");
  for (const entry of HASH_LOCK_ERRORS) {
    printEntry(entry);
  }
  console.log("");

  console.log("Counter type-script error codes (Lesson 10)");
  for (const entry of COUNTER_ERRORS) {
    printEntry(entry);
  }
  console.log("");

  console.log("Worked examples\n");

  decodeNodeError(
    "TransactionFailedToVerify: Verification failed Script(TransactionScriptError { source: Inputs[0].Lock, cause: script exit code: 8 })",
  );

  decodeNodeError(
    "TransactionFailedToVerify: Verification failed Script(TransactionScriptError { source: Outputs[0].Type, cause: script exit code: 6 })",
  );

  decodeNodeError(
    "TransactionFailedToVerify: Verification failed Script(TransactionScriptError { source: Inputs[0].Lock, cause: script exit code: -1 })",
  );

  decodeNodeError(
    "TransactionFailedToResolve: Unable to resolve OutPoint 0xabc...:0 (-301)",
  );
}

try {
  main();
  process.exit(0);
} catch (error) {
  console.error("07-error-code-decoder failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
