import { ccc } from "@ckb-ccc/core";

// This exercise builds the off-chain pieces of the hash lock pattern from
// Lesson 8 without requiring a compiled Rust binary on disk. It computes
// the script args (a CKB-personalised blake2b hash of the preimage), builds
// a ccc.Script object for the hash lock, and prints a dry-run lock-tx and
// unlock-tx so the structure is concrete.
//
// To actually broadcast either transaction you need a real deployment of
// the hash-lock binary on the testnet. Set CKB_HASH_LOCK_CODE_HASH and
// CKB_HASH_LOCK_HASH_TYPE in your environment in that case.

const client = new ccc.ClientPublicTestnet();

const preimage = process.env.CKB_HASH_LOCK_PREIMAGE ?? "my-secret-value";
const codeHash =
  process.env.CKB_HASH_LOCK_CODE_HASH ??
  // Placeholder: a deployed hash-lock has its own on-chain code hash.
  "0x0000000000000000000000000000000000000000000000000000000000000000";
const hashType = (process.env.CKB_HASH_LOCK_HASH_TYPE ?? "data1") as
  | "data"
  | "data1"
  | "data2"
  | "type";

function toHex(bytes: Uint8Array): string {
  let out = "0x";
  for (const b of bytes) {
    out += b.toString(16).padStart(2, "0");
  }
  return out;
}

function main() {
  const preimageBytes = new TextEncoder().encode(preimage);
  const preimageHex = toHex(preimageBytes);

  // ccc.hashCkb computes blake2b-256 with the "ckb-default-hash"
  // personalisation. That same personalisation is what ckb_std.blake2b uses
  // on-chain, so the hash here matches what the Rust hash-lock will compute.
  const argsHash = ccc.hashCkb(preimageBytes);

  console.log("Hash lock script construction");
  console.log(`  preimage (utf8): "${preimage}"`);
  console.log(`  preimage (hex):  ${preimageHex} (${preimageBytes.length} bytes)`);
  console.log(`  args = blake2b_256(preimage): ${argsHash}\n`);

  const hashLock = ccc.Script.from({
    codeHash,
    hashType,
    args: argsHash,
  });

  console.log("Hash lock script object");
  console.log(`  code_hash: ${hashLock.codeHash}`);
  console.log(`  hash_type: ${hashLock.hashType}`);
  console.log(`  args:      ${hashLock.args}\n`);

  // Dry-run: build a transaction that locks 200 CKB behind this script.
  // We do not call completeFeeBy here because that would require a signer
  // and an actual sender lock; the goal of this exercise is to make the
  // structure visible, not to broadcast.
  const lockTx = ccc.Transaction.from({
    outputs: [
      {
        capacity: 200n * 100_000_000n,
        lock: hashLock,
      },
    ],
    outputsData: ["0x"],
  });

  console.log("Locking transaction (dry run)");
  console.log(`  outputs:        ${lockTx.outputs.length}`);
  console.log(`  output[0].lock: ${scriptIdentity(lockTx.outputs[0].lock)}`);
  console.log(`  output[0].cap:  ${lockTx.outputs[0].capacity} shannons (200 CKB)`);
  console.log("");

  // Dry-run: build an unlock transaction. The preimage goes into the
  // witness at the same index as the input cell being spent.
  const unlockTx = ccc.Transaction.from({
    inputs: [
      {
        previousOutput: {
          // Placeholder out point - replace with a live cell when broadcasting.
          txHash:
            "0x0000000000000000000000000000000000000000000000000000000000000000",
          index: 0,
        },
      },
    ],
    outputs: [
      {
        capacity: 199n * 100_000_000n,
        // The recipient's lock script goes here in a real unlock.
        lock: hashLock,
      },
    ],
    outputsData: ["0x"],
    witnesses: [preimageHex],
  });

  console.log("Unlocking transaction (dry run)");
  console.log(`  inputs:     ${unlockTx.inputs.length}`);
  console.log(`  witnesses:  ${unlockTx.witnesses.length}`);
  console.log(`  witness[0]: ${unlockTx.witnesses[0]}  <- the preimage`);
  console.log(`  recipient lock: ${scriptIdentity(unlockTx.outputs[0].lock)}`);
  console.log("");

  console.log("Notes");
  console.log(
    "  - In production the witness uses the WitnessArgs Molecule struct, not raw bytes.",
  );
  console.log(
    "  - Set CKB_HASH_LOCK_CODE_HASH / CKB_HASH_LOCK_HASH_TYPE to a real deployment to broadcast.",
  );

  // Touch the client so the import has a non-trivial purpose even when we
  // never make a network call. This keeps the exercise consistent with the
  // other Week 2 scripts.
  void client;
}

function scriptIdentity(script: ccc.ScriptLike): string {
  return `${script.codeHash}|${script.hashType}|${script.args}`;
}

try {
  main();
  process.exit(0);
} catch (error) {
  console.error("06-hash-lock-builder failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
