/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource Sàrl
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { decryptKey, readPrivateKey, createMessage, sign as _sign } from 'openpgp';
import { createReadStream, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { info } from 'fancy-log';
import { globbySync } from 'globby';
import { Readable } from 'node:stream';

export default async function signVsix(opts = {}, specificFiles = null) {
  info('Starting task "sign"');
  const files = specificFiles || globbySync(join('*{.vsix,-cyclonedx.json}'));

  for (const file of files) {
    const fileReadStream = Readable.toWeb(createReadStream(`./${file}`));
    const signature = await sign(fileReadStream, opts.privateKeyArmored, opts.passphrase);
    writeFileSync(`./${file}.asc`, signature.toString(), 'ascii');
    info(`Signature for ${file} generated`);
  }
};

async function sign(content, privateKeyArmored, passphrase) {
  const privateKey = await decryptKey({
    privateKey: await readPrivateKey({ armoredKey: privateKeyArmored }),
    passphrase
  });
  const message = await createMessage({ binary: content });
  return _sign({
    message,
    signingKeys: privateKey,
    detached: true
  });
}
