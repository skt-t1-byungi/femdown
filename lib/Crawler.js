// @ts-check
const puppeteer = require('puppeteer-core')
const findChrome = require('chrome-finder')
const phin = require('phin')
const xtend = require('xtend')
const pCancelSaga = require('@byungi/p-cancel-saga').default
const cheerio = require('cheerio')

module.exports = class Crawler {
    static async login () {
        const browser = await puppeteer.launch({ executablePath: findChrome(), headless: false })
        const page = await browser.newPage()
        try {
            await page.goto('https://frontendmasters.com/login/', { waitUntil: 'networkidle2' })

            const pUserInput = pCancelSaga(function * () {
                while (true) {
                    yield page.waitForNavigation({ timeout: 0, waitUntil: 'networkidle2' })

                    const url = page.url()
                    if (!url.match(/^https:\/\/(www\.)?frontendmasters\.com/)) throw new Error('Left site.')
                    if (url.match(/login\/?$/)) continue

                    /** @type {import('puppeteer-core').Cookie[]} */
                    // @ts-ignore
                    const cookies = yield page.cookies()
                    if (cookies.every(c => !c.name.includes('wordpress_logged_in'))) throw new Error('Left login page.')

                    return // => login succeed!
                }
            })
            browser.once('disconnected', () => pUserInput.cancel())
            page.once('close', () => pUserInput.cancel())

            await pUserInput
            const cookiesStr = (await page.cookies()).map(({ name, value }) => name + '=' + value).join(';')

            return new Crawler({ cookiesStr })
        } finally {
            browser.close()
        }
    }

    /**
     * @param {{cookiesStr: string}} sess
     */
    constructor (sess) {
        this._sess = sess
    }

    /**
     * @param {any} opts
     */
    async _request (opts) {
        const resp = await phin(xtend({
            headers: {
                cookie: this._sess.cookiesStr,
                referer: 'https://frontendmasters.com/'
            }
        }, opts))
        return resp.body
    }

    async getCourseIds () {
        const $ = cheerio.load(await this._request({ url: 'https://frontendmasters.com/courses/', parse: 'none' }))
        return $('.MediaItem').toArray().map(el => $(el).attr('id'))
    }

    /**
     * @param {string} courseId
     * @returns {Promise<{src: string, slug: string, index: number, vtt: string|null}[]>}
     */
    async getLessonInfos (courseId) {
        const url = `https://api.frontendmasters.com/v1/kabuki/courses/${courseId}`
        const { lessonData, datePublished, hasWebVTT } = await this._request({ url, parse: 'json' })
        return Object.values(lessonData)
            .sort((a, b) => a.index - b.index)
            .map(({ sourceBase, slug, index }) => ({
                src: sourceBase,
                slug,
                index,
                vtt: hasWebVTT
                    ? `https://static.frontendmasters.com/assets/courses/${datePublished}-${courseId}/${index}-${slug}.vtt`
                    : null
            }))
    }

    /**
     * @param {string} src
     * @param {{resolution?: 360|720|1080, format?: 'mp4'|'webm'}} [opts={resolution:720, format: 'mp4'}]
     */
    async getLessonVideoUrl (src, opts = {}) {
        const json = await this._request({
            url: `${src}/source?r=${opts.resolution || 720}&f=${opts.format || 'mp4'}`,
            parse: 'json'
        })
        if (json.message) throw new Error(json.message)
        return json.url
    }
}
