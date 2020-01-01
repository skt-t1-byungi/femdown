// @ts-check
const ytdlRun = require('ytdl-run')

/**
 * @param {string} url
 * @param {string} dest
 */
module.exports = (url, dest) => ytdlRun(['-o', dest, url])
