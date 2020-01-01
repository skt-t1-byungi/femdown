// @ts-check
const phin = require('phin')
const fs = require('fs')

/**
 * @param {string} url
 * @param {import("fs").PathLike} dest
 */
module.exports = (url, dest) => new Promise((resolve, reject) => {
    phin({ url, stream: true, followRedirects: true }).then(resp => {
        resp.stream.pipe(fs.createWriteStream(dest))
            .on('finish', resolve)
            .on('error', reject)
    })
})
