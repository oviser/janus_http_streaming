const Instance = require("..")

; (async() => {
    const janus = new Instance({
        host: "95.216.8.90:8088",
        secret: "da39a3ee5e6b4b0d3255bfef95601890afd80709",
    })
    await janus.init()

    const result = await janus.mount({
        metadata: "metadata dummy",
        audio: true,
        audiopt: 111,
        audiortpmap: "opus/48000/2",
        audioport: 9856,
        audiortcpport: 9994,
        video: true,
        videopt: 100,
        videortpmap: "VP8/90000",
        videoport: 9956,
        videortcpport: 9984
    })
    console.log(result)

    if (result.stream) {
        await janus.destroy(result.stream.id)
    }
})()
