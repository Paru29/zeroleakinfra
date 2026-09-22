const bcrypt = require('bcryptjs');

async function test() {
  const password = "kelmeindia";
  const hash = "$2a$10$sVLIrw29Bvr7EHuBYoRdxu1xR9sOHxOC4UO6KavluzTiSs9Uefh7C";
  const match = await bcrypt.compare(password, hash);
  console.log("Match:", match);
}

test();
