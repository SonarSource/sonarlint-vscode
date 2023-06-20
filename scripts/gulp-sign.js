/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2023 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

const openpgp = require('openpgp');
const through = require('through2');
const Vinyl = require('vinyl');
const Stream = require('stream');
const fs = require('fs');

exports.getSignature = (opts = {}) => {
    return through.obj(getTransform(opts, false));
};

exports.addSignature = (opts = {}) => {
    return through.obj(getTransform(opts, true));
};

function getTransform(opts, keep) {
    return function transform(file, _encoding, callback) {
        if (file.isNull()) {
            this.push(file);
            return callback();
        }

        let stream = new Stream.PassThrough();

        if (file.isBuffer() && !file.pipe) {
            stream.end(file.contents);
        } else {
            stream = file;
        }

        sign(stream, opts.privateKeyArmored, opts.passphrase).then(signature => {
            this.push(new Vinyl({
                cwd: file.cwd,
                base: file.base,
                path: file.path + '.asc',
                contents: signature
            }));
            if(keep) {
                this.push(file);
            }
            callback();
        });
    };
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
