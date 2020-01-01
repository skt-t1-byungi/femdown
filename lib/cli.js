#!/usr/bin/env node
// @ts-check
const meow = require('meow')
const kax = require('kax').default
const prompts = require('prompts')
const isValidPath = require('is-valid-path')
const path = require('path')
const fs = require('fs')
const { Crawler, downFile, downVideo } = require('.')
const pLimit = require('p-limit').default
const of = require('@byungi/p-await-of').of

const cli = meow(`
    Usage
      $ femdown <?courseUrl>

    Options
      --format, -f  mp4|webm
      --resolution, -r  row|medium|high
      --dir, -d  directory

    Examples
      $ femdown
      $ femdown https://frontendmasters.com/courses/intermediate-gatsby/
      $ femdown -a -f webm -r high
`, {
    flags: {
        all: {
            type: 'boolean',
            alias: 'a'
        },
        format: {
            type: 'string',
            alias: 'f',
            default: 'mp4'
        },
        resolution: {
            type: 'string',
            alias: 'r',
            default: 'medium'
        }
    }
})

main().catch(err => panic(String(err)))

const COURSE_ID_RE = /\/?([a-z\\-]+)\/?$/

async function main () {
    const { flags, input } = cli

    const isAll = flags.all || (input.length === 0 && await askOrExit({
        type: 'confirm',
        message: 'Do you want to download all courses?'
    }))
    if (!isAll && input.length === 0) {
        input.push(await askOrExit({
            type: 'text',
            message: 'Enter course ID.',
            validate: str => !!str.mach(COURSE_ID_RE)
        }))
    }
    if (!isAll && input.some(s => !s.match(COURSE_ID_RE))) panic('Course id is invalid!')

    const format = ['mp4', 'webm'].includes(flags.format) ? flags.format : await askOrExit({
        type: 'select',
        message: 'Select a video format.',
        choices: [
            { title: 'mp4', value: 'mp4' },
            { title: 'webm', value: 'webm' }
        ],
        initial: 0
    })
    const resolution = { row: 360, medium: 720, high: 1080 }[flags.resolution] || await askOrExit({
        type: 'select',
        message: 'Select a video resolution.',
        choices: [
            { title: 'low', value: 360 },
            { title: 'medium', value: 720 },
            { title: 'high', value: 1080 }
        ],
        initial: 1
    })
    const rootDir = path.resolve(await askOrExit({
        type: 'text',
        message: 'Enter a directory to save.',
        initial: process.cwd(),
        validate: isValidPath
    }))

    const crawler = await withMsgOrExit('Attempting to login..', Crawler.login())
    const courseIds = isAll
        ? await withMsgOrExit('Scanning Course ID ..', crawler.getCourseIds())
        : input.map(s => s.match(COURSE_ID_RE)[1])

    const limit = pLimit(6)
    const cnt = { video: 0, course: 0 }
    const log = kax.task('')
    const updateDownLog = _ => (log.text = `downloading.. [${cnt.course}/${courseIds.length}, videos: ${cnt.video}]`)
    updateDownLog()

    for (const id of courseIds) {
        const saveDir = path.join(rootDir, id)
        if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true })

        const infos = await crawler.getLessonInfos(id)
        await Promise.all(infos.map(info => {
            const baseDest = path.join(saveDir, `${String(info.index).padStart(3, '0')}_${info.slug}`)
            return Promise.all([
                limit(async () => {
                    const videoUrl = await crawler.getLessonVideoUrl(info.src, { format, resolution })
                    await downVideo(videoUrl, baseDest + `.${format}`)
                    updateDownLog(cnt.video++)
                }),
                info.vtt && limit(() => downFile(info.vtt, baseDest + '.vtt'))
            ])
        }))
        updateDownLog(cnt.course++)
    }
    log.succeed('Download Complete!')
}

/**
 * @param {string} msg
 */
function panic (msg) {
    console.log('\u001B[1K')
    kax.error(msg)
    process.exit(1)
}

/**
 * @param {Omit<import('prompts').PromptObject, 'name'>} question
 */
async function askOrExit (question) {
    const res = await prompts({ name: 'value', ...question }, { onCancel: () => process.exit(1) })
    return res.value
}

/**
 * @template T
 * @param {string} msg
 * @param {Promise<T>} promise
 * @returns {Promise<T>}
 */
async function withMsgOrExit (msg, promise) {
    const [res, err] = await of(kax.task(msg).run(promise))
    if (err) process.exit(1)
    return res
}
