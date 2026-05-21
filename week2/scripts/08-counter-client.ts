import { ccc } from "@ckb-ccc/core";

// Off-chain helpers for the counter type script from Lesson 10. The
// on-chain script (see ./contracts/counter) enforces three rules:
//
//   1. Creation:    inputs = 0, outputs >= 1   -> every output starts at 0.
//   2. Update:      inputs = 1, outputs = 1   -> output = input + 1.
//   3. Destruction: inputs >= 1, outputs = 0  -> always allowed.
//
// This exercise wires the encoding rules to ccc transaction builders so
// you can see what each scenario looks like before deploying anything.

const client = new ccc.ClientPublicTestnet();

const COUNTER_CAPACITY = 142n * 100_000_000n; // generous, well above the minimum

const counterTypeCodeHash =
  process.env.CKB_COUNTER_TYPE_CODE_HASH ??
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const counterTypeHashType = (process.env.CKB_COUNTER_TYPE_HASH_TYPE ?? "data1") as
  | "data"
  | "data1"
  | "data2"
  | "type";

// Placeholder owner lock - any cell needs *some* lock script, even when
// the type script is the interesting part.
const placeholderLock = ccc.Script.from({
  codeHash:
    "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
  hashType: "type",
  args: "0x0000000000000000000000000000000000000000",
});

function counterToHex(value: bigint): string {
  if (value < 0n || value > 0xffffffffffffffffn) {
    throw new Error(`Counter value out of u64 range: ${value}`);
  }
  const buffer = new ArrayBuffer(8);
  new DataView(buffer).setBigUint64(0, value, true); // little-endian
  let out = "0x";
  for (const byte of new Uint8Array(buffer)) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

function hexToCounter(hex: string): bigint {
  if (!hex.startsWith("0x") || hex.length !== 18) {
    throw new Error(`Counter data must be 8 bytes / 0x + 16 hex chars, got: ${hex}`);
  }
  const bytes = new Uint8Array(8);
  for (let i = 0; i < 8; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(2 + i * 2, 4 + i * 2), 16);
  }
  return new DataView(bytes.buffer).getBigUint64(0, true);
}

function counterTypeScript(args: string): ccc.Script {
  return ccc.Script.from({
    codeHash: counterTypeCodeHash,
    hashType: counterTypeHashType,
    args,
  });
}

function printTx(label: string, tx: ccc.Transaction) {
  console.log(label);
  console.log(`  inputs:  ${tx.inputs.length}`);
  console.log(`  outputs: ${tx.outputs.length}`);
  tx.outputs.forEach((output, i) => {
    const data = tx.outputsData[i] ?? "0x";
    console.log(`    output[${i}]: capacity=${output.capacity} shannons`);
    console.log(`                data=${data}`);
    if (data.length === 18) {
      console.log(`                decoded counter=${hexToCounter(data)}`);
    }
    console.log(
      `                type=${output.type ? scriptIdentity(output.type) : "(none)"}`,
    );
  });
  console.log("");
}

function scriptIdentity(script: ccc.ScriptLike): string {
  return `${script.codeHash}|${script.hashType}|${script.args}`;
}

function roundTripChecks() {
  console.log("Encoding round-trips (u64 little-endian)");
  for (const value of [0n, 1n, 42n, 1000n, 0xffffffffffffffffn]) {
    const hex = counterToHex(value);
    const back = hexToCounter(hex);
    const ok = back === value;
    console.log(`  ${value.toString().padStart(20)} -> ${hex} -> ${back}  ${ok ? "ok" : "MISMATCH"}`);
    if (!ok) {
      throw new Error("Round-trip failed");
    }
  }
  console.log("");
}

function main() {
  roundTripChecks();

  // Each counter cell needs a unique type script args so it has its own
  // identity. In practice this would be a unique seed (input out_point or
  // similar) so that two creators cannot create the "same" counter.
  const counterArgs = "0x" + "ab".repeat(16);
  const typeScript = counterTypeScript(counterArgs);

  console.log("Counter type script");
  console.log(`  code_hash: ${typeScript.codeHash}`);
  console.log(`  hash_type: ${typeScript.hashType}`);
  console.log(`  args:      ${typeScript.args}\n`);

  // Scenario 1: creation. No inputs in this group, one output starting at 0.
  const creationTx = ccc.Transaction.from({
    outputs: [
      {
        capacity: COUNTER_CAPACITY,
        lock: placeholderLock,
        type: typeScript,
      },
    ],
    outputsData: [counterToHex(0n)],
  });
  printTx("Scenario 1 - creation (counter = 0)", creationTx);

  // Scenario 2: update. One input cell at value N, one output cell at N + 1.
  const currentValue = 7n;
  const incrementTx = ccc.Transaction.from({
    inputs: [
      {
        previousOutput: {
          txHash:
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          index: 0,
        },
      },
    ],
    outputs: [
      {
        capacity: COUNTER_CAPACITY,
        lock: placeholderLock,
        type: typeScript,
      },
    ],
    outputsData: [counterToHex(currentValue + 1n)],
  });
  printTx(`Scenario 2 - increment (${currentValue} -> ${currentValue + 1n})`, incrementTx);

  // Scenario 3: destruction. One input cell, no output cell with this type
  // script. The capacity gets recycled into a plain CKB output.
  const destructionTx = ccc.Transaction.from({
    inputs: [
      {
        previousOutput: {
          txHash:
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          index: 0,
        },
      },
    ],
    outputs: [
      {
        // No type script on the recipient cell, just a plain lock.
        capacity: COUNTER_CAPACITY - 1_000_000n, // leave room for fee
        lock: placeholderLock,
      },
    ],
    outputsData: ["0x"],
  });
  printTx("Scenario 3 - destruction (counter consumed, capacity returned)", destructionTx);

  console.log("Common bugs the script catches");
  console.log("  - outputsData length != 8     -> exit 5 (ERROR_INVALID_DATA_LENGTH)");
  console.log("  - creation with data != 0     -> exit 6 (ERROR_COUNTER_NOT_ZERO_ON_CREATION)");
  console.log("  - merging two counters in 1 tx -> exit 7 (ERROR_INVALID_CELL_COUNT)");
  console.log("  - off-chain wrote N+2 instead of N+1 -> exit 8 (ERROR_COUNTER_NOT_INCREMENTED)");

  void client;
}

try {
  main();
  process.exit(0);
} catch (error) {
  console.error("08-counter-client failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
