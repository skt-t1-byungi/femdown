// @ts-check
const test = require('ava').serial
const Crawler = require('../lib/Crawler')
const flatCache = require('flat-cache')
const url = require('url')
const path = require('path')
const fs = require('fs')

const CACHE_FILE = path.join(__dirname, '.cache')

/** @type {Crawler} */
let crawler

test.before(async t => {
    const { mtimeMs } = fs.statSync(CACHE_FILE)
    const TIME_1H = 60 * 60 * 1000
    if (Date.now() - mtimeMs < TIME_1H) fs.unlinkSync(CACHE_FILE)
    const cache = flatCache.createFromFile(CACHE_FILE)
    const sess = cache.getKey('sess')
    if (sess) {
        crawler = new Crawler(sess)
    } else {
        crawler = await Crawler.login()
        cache.setKey('sess', crawler._sess)
        cache.save()
    }
})

test('getCourseIds', async t => {
    const ids = await crawler.getCourseIds()
    t.true(['react', 'vue', 'intermediate-gatsby'].every(s => ids.includes(s)))
})

test('getLessonInfos', async t => {
    const infos = await crawler.getLessonInfos('client-graphql-react')
    t.is(infos.length, 27)
    t.is(infos[0].slug, 'introduction')
})

test('getLessonVideoUrl', async t => {
    const videoUrl = await crawler.getLessonVideoUrl('https://api.frontendmasters.com/v1/kabuki/video/vCrTmVpgni')
    t.notThrows(() => new url.URL(videoUrl))
})
