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
    log.info(`past passThroughStream`);
    const fileReadStream = fs.createReadStream(`./${file}`);
    log.info(`past fileReadStream`);
    fileReadStream.pipe(passThroughStream);
    log.info(`past fileReadStream`);
    const signature = await sign(passThroughStream, opts.privateKeyArmored, opts.passphrase);
    log.info(`past signature`);
    const signatureString = await streamToString(signature);
    log.info(`past streamToString`);
    fs.writeFileSync(`./${file}.asc`, signatureString);
    log.info(`Signature for ${file} generated`);
  }
};

async function streamToString(stream) {
  return new Promise(function (resolve) {
    log.info(`before  chunks.push(Buffer.from(chunk))`);
    const chunks = [];
    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    log.info(`before  Buffer.concat(chunks).toString('utf-8')`);
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    log.info(`after  Buffer.concat(chunks).toString('utf-8')`);
  });
}

async function sign(content, privateKeyArmored, passphrase) {
  log.info(`before decrypting private key`);
  log.info(`content ${content}`);
  log.info(`privateKeyArmored ${privateKeyArmored}`);
  log.info(`passphrase ${passphrase}`);
  const privateKey = await openpgp.decryptKey({
    privateKey: await openpgp.readPrivateKey({ armoredKey: privateKeyArmored }),
    passphrase
  });
  log.info(`after decrypting private key`);
  const message = await openpgp.createMessage({ binary: content });
  log.info(`before calling penpgp.sign()`);
  return openpgp.sign({
    message,
    signingKeys: privateKey,
    detached: true
  });
}
