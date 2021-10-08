const Instance = require("..")

; (async() => {
    const janus = new Instance({
        host: "95.217.162.126:8088",
        secret: "da39a3ee5e6b4b0d3255bfef95601890afd80709",
    })
    await janus.init()

    const result = await janus.create({
        metadata: "metadata dummy",
        audio: true,
        audiopt: 111,
        audiortpmap: "opus/48000/2",
        audioport: 9854,
        video: true,
        videopt: 100,
        videortpmap: "VP8/90000",
        videoport: 9954
    })
    console.log(result)
})()
