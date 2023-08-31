/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

const openpgp = require('openpgp');
const Stream = require('stream');
const fs = require('fs');
const path = require('path');
const log = require('fancy-log');

module.exports = async function signVsix(opts = {}) {
  const { globbySync } = await import('globby');
  const files = globbySync(path.join('*{.vsix,-cyclonedx.json}'));

  for (const file of files) {
    log.info(`Starting 'sign' for ${file}`);
    const passThroughStream = new Stream.PassThrough();
    const fileReadStream = fs.createReadStream(`./${file}`);
    fileReadStream.pipe(passThroughStream);
    const signature = await sign(passThroughStream, opts.privateKeyArmored, opts.passphrase);
    const signatureString = await streamToString(signature);
    fs.writeFileSync(`./${file}.asc`, signatureString);
    log.info(`Signature for ${file} generated`);
  }
};

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf-8');
}

async function sign(content, privateKeyArmored, passphrase) {
  const privateKey = await openpgp.decryptKey({
    privateKey: await openpgp.readPrivateKey({ armoredKey: privateKeyArmored }),
    passphrase
  });
  const message = await openpgp.createMessage({ binary: content });
  return openpgp.sign({
    message,
    signingKeys: privateKey,
    detached: true
  });
}
