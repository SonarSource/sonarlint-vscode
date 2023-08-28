/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { decryptKey, readPrivateKey, createMessage, sign as _sign } from 'openpgp';
import { PassThrough } from 'stream';
import { createReadStream, writeFileSync } from 'fs';
import { join } from 'path';
import { info } from 'fancy-log';
import { globbySync } from 'globby';

export default async function signVsix(opts = {}) {
  info('Starting task "sign"');
  const files = globbySync(join('*{.vsix,-cyclonedx.json}'));

  for (const file of files) {
    const passThroughStream = new PassThrough();
    const fileReadStream = createReadStream(`./${file}`);
    fileReadStream.pipe(passThroughStream);
    const signature = await sign(passThroughStream, opts.privateKeyArmored, opts.passphrase);
    const signatureString = await streamToString(signature);
    writeFileSync(`./${file}.asc`, signatureString);
    info(`Signature for ${file} generated`);
  }
};

async function streamToString(stream) {
  return new Promise(function (resolve) {
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
  });
}

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
