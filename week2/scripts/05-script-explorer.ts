import { ccc } from "@ckb-ccc/core";

const client = new ccc.ClientPublicTestnet();

// Reuse the same testnet lock script that the Week 1 exercises explored,
// so the cells inspected here will be familiar.
const sampleLock: ccc.ScriptLike = {
  codeHash:
    process.env.CKB_EXERCISE_CODE_HASH ??
    "0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8",
  hashType: (process.env.CKB_EXERCISE_HASH_TYPE ?? "type") as
    | "data"
    | "data1"
    | "data2"
    | "type",
  args:
    process.env.CKB_EXERCISE_ARGS ??
    "0xe2fa82e70b062c8644b80ad7ecf6e015e5f352f6",
};
const maxCells = Number(process.env.CKB_EXERCISE_MAX_CELLS ?? "5");

function describeScript(label: string, script: ccc.ScriptLike | null | undefined) {
  if (!script) {
    console.log(`  ${label}: (none)`);
    return;
  }

  console.log(`  ${label}:`);
  console.log(`    code_hash: ${script.codeHash}`);
  console.log(`    hash_type: ${script.hashType}`);
  console.log(`    args:      ${script.args}`);
}

function scriptIdentity(script: ccc.ScriptLike): string {
  return `${script.codeHash}|${script.hashType}|${script.args}`;
}

async function main() {
  const tip = await client.getTip();
  console.log(`Connected to CKB testnet at block #${tip}\n`);

  // Step 1: encode the lock script as a testnet address. Going
  // script -> address is the direction worth showing; address -> script
  // is what wallets do when they receive a paste from a user.
  const script = ccc.Script.from(sampleLock);
  const address = ccc.Address.fromScript(script, client);
  console.log("Sample lock script");
  describeScript("Lock", script);
  console.log(`  testnet address: ${address.toString()}\n`);

  // Step 2: look up the standard secp256k1 deployment so we can confirm
  // the lock script above is the system SECP256K1-BLAKE160 script.
  const secp = await client.getKnownScript(ccc.KnownScript.Secp256k1Blake160);
  console.log("Known script: SECP256K1-BLAKE160");
  console.log(`  code_hash: ${secp.codeHash}`);
  console.log(`  hash_type: ${secp.hashType}`);
  console.log(
    `  cell deps: ${secp.cellDeps.length} (the SDK attaches these automatically)`,
  );
  console.log(
    `  match:     ${secp.codeHash === script.codeHash && secp.hashType === script.hashType}`,
  );
  console.log("");

  // Step 3: fetch a few cells and inspect their scripts. Note that the
  // type script slot is usually empty on plain CKB cells.
  const lockGroups = new Map<string, number>();
  const typeGroups = new Map<string, number>();
  let index = 0;

  for await (const cell of client.findCellsByLock(script)) {
    index += 1;

    console.log(`Cell ${index}`);
    console.log(`  out_point: ${cell.outPoint.txHash}:${cell.outPoint.index}`);
    console.log(`  capacity:  ${cell.cellOutput.capacity} shannons`);
    describeScript("lock", cell.cellOutput.lock);
    describeScript("type", cell.cellOutput.type);
    console.log("");

    const lockKey = scriptIdentity(cell.cellOutput.lock);
    lockGroups.set(lockKey, (lockGroups.get(lockKey) ?? 0) + 1);
    if (cell.cellOutput.type) {
      const typeKey = scriptIdentity(cell.cellOutput.type);
      typeGroups.set(typeKey, (typeGroups.get(typeKey) ?? 0) + 1);
    }

    if (index >= maxCells) {
      break;
    }
  }

  if (index === 0) {
    console.log("No live cells were found for the sample address.");
    return;
  }

  // Step 4: show what "script groups" mean for these cells. CKB groups
  // cells by the full (code_hash, hash_type, args) tuple and runs each
  // script once per group, not once per cell.
  console.log("Script groups across the cells above");
  console.log(`  unique lock scripts: ${lockGroups.size}`);
  for (const [key, count] of lockGroups) {
    console.log(`    ${count}x ${key}`);
  }
  console.log(`  unique type scripts: ${typeGroups.size}`);
  for (const [key, count] of typeGroups) {
    console.log(`    ${count}x ${key}`);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("05-script-explorer failed.");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
