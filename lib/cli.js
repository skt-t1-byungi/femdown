#!/usr/bin/env node
// @ts-check
const meow = require('meow')
const kax = require('kax').default
const prompts = require('prompts')
const isValidPath = require('is-valid-path')
const path = require('path')
const fs = require('fs')
const { Crawler, downFile, downVideo } = require('.')
const pRetry = require('@byungi/p-retry').pRetry
const pDelay = require('@byungi/p-delay').pDelay

const cli = meow(`
    Usage
      $ femdown <?courseUrl>

    Options
      --all, -a
      --format, -f  mp4|webm
      --resolution, -r  row|medium|high

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
            alias: 'f'
        },
        resolution: {
            type: 'string',
            alias: 'r'
        }
    }
})

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
            validate: str => !!str.match(COURSE_ID_RE)
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

    const crawler = await kax.task('Attempting to login..').run(Crawler.login())
    const courseIds = isAll
        ? await kax.task('Scanning Course ID ..').run(crawler.getCourseIds())
        : input.map(s => s.match(COURSE_ID_RE)[1])

    /** @type {<T>(fn:()=>Promise<T>)=> Promise<T>} */
    // @ts-ignore
    const run = runner => Promise.all([pRetry(runner, { retries: Infinity, interval: 60000 }), pDelay(10000)]).then(r => r[0])

    const cnt = { video: 0, course: 0 }
    const log = kax.task('')
    const updateLog = _ => (log.text = `downloading.. [${cnt.course}/${courseIds.length}, videos: ${cnt.video}]`)

    updateLog()

    for (const id of courseIds) {
        const infos = await run(() => crawler.getLessonInfos(id))
        const saveDir = path.join(rootDir, id)
        if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true })

        for (const info of infos) {
            const baseDest = path.join(saveDir, `${String(info.index).padStart(3, '0')}_${info.slug}`)
            await Promise.all([
                run(async () => {
                    const videoUrl = await crawler.getLessonVideoUrl(info.src, { format, resolution })
                    await downVideo(videoUrl, baseDest + `.${format}`)
                    updateLog(cnt.video++)
                }),
                info.vtt && downFile(info.vtt, baseDest + '.vtt')
            ])
        }
        updateLog(cnt.course++)
    }

    log.succeed('Download Complete!')
}

main().catch(err => panic(String(err)))

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
